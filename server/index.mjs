import express from 'express';
import cors from 'cors';
import fs from 'fs';

import { config } from 'dotenv';

// 加载 .env 文件（优先级：系统环境变量 > .env 文件）
config();

// 宜搭数据客户端（cookie 认证 + 应用/表单/数据查询 + 工具执行 + 定时缓存）
import { yida, CACHE, COOKIES_FILE, startPrecompute, executeTool } from './yida-client.mjs';

const app = express();
app.use(cors());
app.use(express.json());

// ==================== 配置 ====================

const API_BASE = process.env.ANTHROPIC_BASE_URL || 'http://127.0.0.1:15721';
const API_KEY = process.env.ANTHROPIC_AUTH_TOKEN || '';
const DEFAULT_MODEL = process.env.AI_MODEL || 'deepseek-v4-pro';

// 登录方式配置
const LOGIN_MODE = (process.env.LOGIN_MODE || 'dingtalk').toLowerCase();
const DINGTALK_CLIENT_ID = process.env.DINGTALK_CLIENT_ID || '';
const DINGTALK_CLIENT_SECRET = process.env.DINGTALK_CLIENT_SECRET || '';
const DINGTALK_REDIRECT_URI = process.env.DINGTALK_REDIRECT_URI || '';

// ==================== API 路由 ====================

app.get('/api/whoami', async (req, res) => {
  // 从 cookies 缓存中读取本机已登录的宜搭身份
  const cookiesFile = COOKIES_FILE;
  try {
    if (!fs.existsSync(cookiesFile)) {
      return res.status(401).json({ error: '未登录', hint: '宜搭 cookies 不存在' });
    }
    const data = JSON.parse(fs.readFileSync(cookiesFile, 'utf8'));
    const find = (name) => data.cookies.find(c => c.name === name)?.value;

    const userId = (find('tianshu_corp_user') || '').split('_').pop();
    const orgId = find('corp_id') || find('tianshu_corp_id');
    const csrfToken = find('tianshu_csrf_token');

    if (!userId || !orgId) {
      return res.status(401).json({ error: '身份信息不完整' });
    }

    const identity = {
      userId,
      orgId,
      orgName: '未获取',
      userName: userId,
      role: '管理员',
      dept: '管理层',
      dataSource: 'yida',
      baseUrl: data.base_url
    };

    // 尝试调用宜搭接口拿到真实姓名与组织名
    try {
      const resp = await fetch(`${data.base_url}/api/user/info`, {
        headers: {
          'Cookie': data.cookies.map(c => `${c.name}=${c.value}`).join('; '),
          'Accept': 'application/json',
          'x-csrf-token': csrfToken,
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
      if (resp.ok) {
        const info = await resp.json();
        if (info?.data?.userName) identity.userName = info.data.userName;
        if (info?.data?.orgName) identity.orgName = info.data.orgName;
        if (info?.data?.displayName) identity.userName = info.data.displayName;
      }
    } catch (e) {
      console.log('[whoami] 获取用户详情失败，使用默认身份:', e.message);
    }

    res.json(identity);
  } catch (e) {
    res.status(500).json({ error: '身份读取失败', detail: e.message });
  }
});

// ==================== 登录配置 / 钉钉 OAuth ====================

// 下发登录方式 + 钉钉公开参数（绝不暴露 secret）
app.get('/api/auth/config', (req, res) => {
  const dingtalkConfigured = !!(DINGTALK_CLIENT_ID && DINGTALK_CLIENT_SECRET && DINGTALK_REDIRECT_URI);
  res.json({
    loginMode: LOGIN_MODE,
    dingtalk: {
      clientId: DINGTALK_CLIENT_ID,
      redirectUri: DINGTALK_REDIRECT_URI,
      configured: dingtalkConfigured
    }
  });
});

// 钉钉授权码换身份：code → accessToken → 用户信息
app.post('/api/auth/dingtalk/callback', async (req, res) => {
  const { code } = req.body || {};
  if (!code) {
    return res.status(400).json({ error: '缺少授权码 code' });
  }
  if (!DINGTALK_CLIENT_ID || !DINGTALK_CLIENT_SECRET) {
    return res.status(500).json({ error: '钉钉登录未配置：请在 .env 设置 DINGTALK_CLIENT_ID / DINGTALK_CLIENT_SECRET' });
  }

  try {
    // 1. 用授权码换取 accessToken
    const tokenRes = await fetch('https://api.dingtalk.com/v1.0/oauth2/userAccessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: DINGTALK_CLIENT_ID,
        clientSecret: DINGTALK_CLIENT_SECRET,
        code,
        grantType: 'authorization_code'
      })
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.accessToken) {
      throw new Error(tokenData.message || tokenData.errmsg || '换取 accessToken 失败');
    }

    // 2. 用 accessToken 拉取用户信息
    const userRes = await fetch('https://api.dingtalk.com/v1.0/contact/users/me', {
      headers: { 'x-acs-dingtalk-access-token': tokenData.accessToken }
    });
    const me = await userRes.json();
    if (!me.unionId && !me.openId) {
      throw new Error(me.message || '获取用户信息失败');
    }

    res.json({
      userId: me.unionId || me.openId,
      userName: me.nick || '用户',
      orgName: '',
      orgId: '',
      role: '管理员',
      dept: '管理层',
      avatar: me.avatarUrl || null,
      dataSource: 'dingtalk',
      loginTime: new Date().toISOString()
    });
  } catch (e) {
    console.error('钉钉登录失败:', e.message);
    res.status(500).json({ error: '钉钉登录失败: ' + e.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    cache: CACHE.lastUpdated,
    model: DEFAULT_MODEL,
    apiConfigured: !!API_KEY,
    yidaConnected: yida.isAvailable(),
    dataSource: CACHE.dataSource
  });
});

app.get('/api/cache/:module?', (req, res) => {
  const { module } = req.params;
  if (module) {
    if (!CACHE.modules[module]) {
      return res.status(404).json({ error: '模块不存在' });
    }
    return res.json({
      module,
      lastUpdated: CACHE.lastUpdated,
      dataSource: CACHE.dataSource,
      data: CACHE.modules[module]
    });
  }
  res.json({
    lastUpdated: CACHE.lastUpdated,
    dataSource: CACHE.dataSource,
    modules: CACHE.modules
  });
});

app.post('/api/cache/refresh', (req, res) => {
  const fresh = startPrecompute();
  res.json({ success: true, cache: fresh });
});

// ==================== AI 工具定义（Anthropic tool_use 协议） ====================

const TOOLS = [
  {
    name: 'yida_app_list',
    description: '列出当前企业下所有宜搭应用，返回 appType 和 appName。当需要了解有哪些可用业务系统、不确定去哪个应用查数据时调用。',
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'yida_form_list',
    description: '列出指定宜搭应用下的所有表单（含表单名、formUuid、formType）。formType 为 "form" 表示普通表单，"process" 表示流程表单。需要知道某个应用有哪些可查表单时调用。',
    input_schema: {
      type: 'object',
      properties: { appType: { type: 'string', description: '宜搭应用标识，由 yida_app_list 返回' } },
      required: ['appType']
    }
  },
  {
    name: 'yida_form_data',
    description: '查询指定表单的实时业务数据。返回 records 数组（每条含 title/instanceStatus/approvedResult/originator/gmtCreate 等关键字段和完整的 formData）和 total（总记录数）。每次最多返回 50 条；total 更大时可换页续查（改 page 参数）。注意：formType 必须与 yida_form_list 返回的一致（"form" 或 "process"），否则接口会失败。',
    input_schema: {
      type: 'object',
      properties: {
        appType:  { type: 'string', description: '宜搭应用标识' },
        formUuid: { type: 'string', description: '表单唯一标识，由 yida_form_list 返回' },
        formType: { type: 'string', description: '"form" 或 "process"，由 yida_form_list 返回' },
        page:     { type: 'integer', description: '页码，从 1 开始，默认 1' },
        size:     { type: 'integer', description: '每页条数，默认 50，最大 50' }
      },
      required: ['appType', 'formUuid', 'formType']
    }
  },
  {
    name: 'yida_form_schema',
    description: '获取表单的字段定义（组件列表），返回每个字段的 id、类型、标签。当需要理解表单数据结构、确认字段含义时调用。',
    input_schema: {
      type: 'object',
      properties: {
        appType:  { type: 'string', description: '宜搭应用标识' },
        formUuid: { type: 'string', description: '表单唯一标识' }
      },
      required: ['appType', 'formUuid']
    }
  }
];

// ==================== AI 问答：tool_use 循环 ====================

const MAX_TOOL_ROUNDS = 5;

app.post('/api/chat', async (req, res) => {
  const { message, history = [], user = {} } = req.body;
  if (!message) return res.status(400).json({ error: '消息不能为空' });
  if (!API_KEY) return res.json({ reply: 'AI 服务未配置，请联系管理员设置 API Key。' });

  const conversationHistory = history.filter(h => h.role === 'user' || h.role === 'assistant');

  // SSE 响应
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let finalReply = '';
  let toolCalls = [];

  res.write(`data: ${JSON.stringify({ type: 'meta', dataSource: CACHE.dataSource, modulesCount: Object.keys(CACHE.modules).length })}\n\n`);

  try {
    const messages = [
      ...conversationHistory.slice(-20),
      { role: 'user', content: message }
    ];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const systemPrompt = buildSystemPrompt(user);

      const response = await fetch(`${API_BASE}/v1/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          max_tokens: 4096,
          stream: true,
          system: systemPrompt,
          messages,
          tools: TOOLS,
          ...(Number(process.env.AI_THINKING_BUDGET) > 0
            ? { thinking: { type: 'enabled', budget_tokens: Number(process.env.AI_THINKING_BUDGET) } }
            : {})
        })
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`AI 服务返回错误: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let blocks = {};
      let stopReason = null;
      let suggFenceIdx = -1;  // finalReply 中 ```suggestions 的位置
      let emitted = 0;        // 已流给前端的字符数

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const dataStr = line.startsWith('data: ') ? line.slice(6).trim() : '';
          if (!dataStr) continue;

          try {
            const event = JSON.parse(dataStr);

            if (event.type === 'content_block_start') {
              const cb = event.content_block;
              blocks[event.index] = { type: cb.type, id: cb.id, name: cb.name, inputJson: '' };
            }
            else if (event.type === 'content_block_delta') {
              const block = blocks[event.index];
              if (!block) continue;
              const dt = event.delta?.type;
              if (dt === 'text_delta') {
                const text = event.delta.text || '';
                finalReply += text;
                // 追问块实时扣留：检测到 ```suggestions 后不再流 token
                if (suggFenceIdx === -1) suggFenceIdx = finalReply.indexOf(SUGG_FENCE);
                const safeEnd = suggFenceIdx !== -1
                  ? suggFenceIdx
                  : Math.max(emitted, finalReply.length - SUGG_FENCE.length);
                if (safeEnd > emitted) {
                  res.write(`data: ${JSON.stringify({ type: 'token', text: finalReply.slice(emitted, safeEnd) })}\n\n`);
                  emitted = safeEnd;
                }
              } else if (dt === 'thinking_delta') {
                const t = event.delta.thinking || '';
                res.write(`data: ${JSON.stringify({ type: 'thinking', text: t })}\n\n`);
              } else if (dt === 'input_json_delta') {
                block.inputJson += event.delta.partial_json || '';
              }
            }
            else if (event.type === 'content_block_stop') {
              const block = blocks[event.index];
              if (block && block.type === 'tool_use' && block.inputJson) {
                try { block.input = JSON.parse(block.inputJson); delete block.inputJson; } catch {}
              }
            }
            else if (event.type === 'message_delta') {
              stopReason = event.delta?.stop_reason;
            }
          } catch {}
        }
      }

      // 工具调用轮
      if (stopReason === 'tool_use') {
        finalReply = '';
        const toolBlocks = Object.values(blocks).filter(b => b.type === 'tool_use' && b.name);

        for (const tb of toolBlocks) {
          const input = tb.input || {};
          res.write(`data: ${JSON.stringify({ type: 'tool_call', name: tb.name, input })}\n\n`);

          try {
            const result = await executeTool(tb.name, input);
            const resultStr = JSON.stringify(result);
            const summary = calcToolSummary(tb.name, result);
            res.write(`data: ${JSON.stringify({ type: 'tool_result', name: tb.name, summary, total: result.total })}\n\n`);
            toolCalls.push({ name: tb.name, input, result: summary });

            messages.push({
              role: 'assistant',
              content: [{ type: 'tool_use', id: tb.id, name: tb.name, input }]
            });
            messages.push({
              role: 'user',
              content: [{ type: 'tool_result', tool_use_id: tb.id, content: resultStr }]
            });
          } catch (e) {
            const errStr = JSON.stringify({ error: e.message });
            res.write(`data: ${JSON.stringify({ type: 'tool_result', name: tb.name, error: e.message })}\n\n`);
            messages.push({
              role: 'assistant',
              content: [{ type: 'tool_use', id: tb.id, name: tb.name, input }]
            });
            messages.push({
              role: 'user',
              content: [{ type: 'tool_result', tool_use_id: tb.id, content: errStr, is_error: true }]
            });
          }
        }
        continue;
      }

      // 最终回答
      break;
    }

    const { replyBody, suggestions } = parseSuggestions(finalReply);
    res.write(`data: ${JSON.stringify({ type: 'done', reply: replyBody, suggestions, toolCalls })}\n\n`);
    res.end();
  } catch (e) {
    console.error('Chat error:', e.message);
    res.write(`data: ${JSON.stringify({ type: 'error', error: e.message })}\n\n`);
    res.end();
  }
});

// ==================== 追问建议解析 ====================

const SUGG_FENCE = '```suggestions';

function parseSuggestions(fullReply) {
  const idx = fullReply.indexOf(SUGG_FENCE);
  if (idx === -1) return { replyBody: fullReply, suggestions: [] };
  const replyBody = fullReply.slice(0, idx);
  const afterFence = fullReply.slice(idx + SUGG_FENCE.length);
  const closeIdx = afterFence.indexOf('```');
  const inner = closeIdx !== -1 ? afterFence.slice(0, closeIdx) : afterFence;
  const suggestions = inner
    .split('\n')
    .map(s => s.trim().replace(/^[-*\d.、\s]+/, '').replace(/["""']/g, '').trim())
    .filter(Boolean)
    .slice(0, 3);
  return { replyBody: replyBody.trim(), suggestions };
}

function calcToolSummary(name, result) {
  switch (name) {
    case 'yida_app_list':      return `查到 ${result.total} 个应用`;
    case 'yida_form_list':     return `查到 ${result.total} 个表单`;
    case 'yida_form_data':     return `查到 ${result.count} 条记录（共 ${result.total} 条）`;
    case 'yida_form_schema':   return `返回 ${result.count} 个字段定义`;
    default:                   return '工具执行完成';
  }
}

// ==================== AI 问答系统提示词 ====================

function buildSystemPrompt(user) {
  const modules = Object.values(CACHE.modules);
  const moduleIndex = modules.length > 0
    ? modules.map(m =>
        `- ${m.formName}（应用: ${m.appName}，formUuid: ${m.formUuid}，类型: ${m.formType === 'process' ? '流程表单' : '普通表单'}）`
      ).join('\n')
    : '暂无可用模块索引。请使用 yida_app_list / yida_form_list 发现可用数据源。';

  return `你是企业 AI 秘书，为高层管理人员提供数据分析和业务决策支持。

## 当前用户
- 姓名: ${user?.name || '用户'}
- 职位: ${user?.role || '管理员'}
- 部门: ${user?.dept || '管理层'}

## 工作流程（重要）
1. 理解用户问题，判断需要哪些数据
2. **主动调用工具**查询宜搭平台获取真实数据——你手上有 yida_app_list / yida_form_list / yida_form_data / yida_form_schema 四个工具
3. 工具返回真实数据后，基于实际数据进行分析和回答——**绝不要猜测、编造或假设不存在的数据**
4. 引用数据时指明来源表单和条数

## 对话规则
- 对话历史在 messages 中完整保留，指代词如"这两条""继续分析""详细说说"要从历史中找到上一轮提到的具体记录
- 数据不足时诚实说明，不要用假设补充

## 已缓存的模块索引（可供快速导航，实时数据必须通过工具查询）
${moduleIndex}

## 数据更新时间
缓存索引最后更新: ${CACHE.lastUpdated || '未更新'}

## 回答要求
1. 中文回答，简洁专业，避免 emoji
2. 重要数据用**加粗**显示，复杂分析用要点列出
3. 如需可视化，使用 mermaid 图表（放在 \`\`\`mermaid 代码块中）
4. 数据基于工具查询结果，明确标注来源

## 追问建议（每次回答必须包含）
回答正文结束后，必须另起一个以 \`\`\`suggestions 开头、\`\`\` 结尾的代码块，给出 3 个用户最可能继续追问的问题：
- 必须与本次回答内容、当前业务主题高度相关
- 每行一个问题，不要加序号、引号或标点符号，简洁明了（建议不超过 20 个字）
格式严格如下：
\`\`\`suggestions
问题一
问题二
问题三
\`\`\``;
}

// 启动定时缓存刷新
startPrecompute();

// ==================== 启动 ====================

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\nAI 秘书后端已启动: http://localhost:${PORT}`);
  console.log(`模型: ${DEFAULT_MODEL}`);
  console.log(`API: ${API_BASE}`);
  console.log(`API Key: ${API_KEY ? '已配置' : '未配置'}`);
  console.log(`宜搭连接: ${yida.isAvailable() ? '已连接 (' + yida.baseUrl + ')' : '未连接'}`);
  console.log(`数据源: ${CACHE.dataSource}`);
  console.log(`缓存最后更新: ${CACHE.lastUpdated}`);
  console.log(`定时任务: 每 6 小时自动刷新元数据索引\n`);
});
