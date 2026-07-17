import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());

// ==================== 配置 ====================

const API_BASE = process.env.ANTHROPIC_BASE_URL || 'http://127.0.0.1:15721';
const API_KEY = process.env.ANTHROPIC_AUTH_TOKEN || '';
const DEFAULT_MODEL = process.env.AI_MODEL || 'deepseek-v4-pro';

// 宜搭配置
const COOKIES_FILE = path.join(__dirname, '.cache', 'cookies-public.json');

// ==================== 宜搭 API 客户端 ====================

class YidaAPI {
  constructor() {
    this.cookies = null;
    this.baseUrl = null;
    this.loadCookies();
  }

  loadCookies() {
    try {
      if (fs.existsSync(COOKIES_FILE)) {
        const data = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
        this.baseUrl = data.base_url;
        this.cookies = data.cookies.map(c => `${c.name}=${c.value}`).join('; ');
        const find = (name) => data.cookies.find(c => c.name === name)?.value;
        this.csrfToken = find('tianshu_csrf_token') || find('c_csrf') || '';
        const corpUser = find('tianshu_corp_user') || '';
        this.userId = corpUser.includes('_') ? corpUser.split('_').pop() : (find('userId') || '');
        this.orgId = find('corp_id') || find('tianshu_corp_id') || '';
        return true;
      }
    } catch (e) {
      console.error('加载 cookies 失败:', e.message);
    }
    return false;
  }

  isAvailable() {
    return this.cookies && this.baseUrl && this.csrfToken;
  }

  async request(apiPath, options = {}) {
    if (!this.isAvailable()) {
      throw new Error('宜搭未登录');
    }

    const url = new URL(apiPath, this.baseUrl);
    const searchParams = new URLSearchParams(options.params || {});
    if (options._csrf !== false) {
      searchParams.set('_csrf_token', this.csrfToken);
      searchParams.set('_stamp', String(Date.now()));
    }
    url.search = searchParams.toString();

    const response = await fetch(url.toString(), {
      method: options.method || 'GET',
      headers: {
        'Cookie': this.cookies,
        'Accept': 'application/json, text/plain, */*',
        'Origin': this.baseUrl,
        'Referer': this.baseUrl + '/',
        'X-Requested-With': 'XMLHttpRequest',
        'global_csrf_token': this.csrfToken,
        ...options.headers
      },
      body: options.body
    });

    return response.json();
  }

  // 获取应用列表
  async getApps() {
    return this.request('/query/app/getAppList.json', {
      params: {
        _api: 'nattyFetch',
        _mock: 'false',
        pageIndex: 1,
        pageSize: 50
      }
    });
  }

  // 获取表单列表
  async getForms(appType) {
    return this.request(`/dingtalk/web/${appType}/query/formnav/getFormNavigationListByOrder.json`, {
      params: { _api: 'Nav.queryList', _mock: 'false' },
      _csrf: false
    });
  }

  // 查询表单数据（列表，非流程表单）
  async queryFormData(appType, formUuid, pageNo = 1, pageSize = 100) {
    return this.request(`/dingtalk/web/${appType}/v1/form/searchFormDatas.json`, {
      params: {
        formUuid,
        appType,
        currentPage: pageNo,
        pageSize
      }
    });
  }
  async queryProcessData(appType, formUuid, pageNo = 1, pageSize = 100) {
    return this.request(`/dingtalk/web/${appType}/v1/process/getInstances.json`, {
      params: {
        formUuid,
        currentPage: pageNo,
        pageSize
      }
    });
  }

  // 获取表单 Schema
  async getFormSchema(appType, formUuid) {
    return this.request(`/alibaba/web/${appType}/_view/query/formdesign/getFormSchema.json`, {
      params: { formUuid, schemaVersion: 'V5' },
      _csrf: false
    });
  }
}

const yida = new YidaAPI();

// ==================== 业务模块配置 ====================

const BUSINESS_MODULES = {
  sales: {
    name: '销售管理',
    keywords: ['销售', '业绩', '订单', '客户', '签约', '漏斗', '商机', '回款', '营收']
  },
  finance: {
    name: '财务模块',
    keywords: ['财务', '利润', '成本', '收入', '支出', '发票', '预算', '报表', '毛利', '净利']
  },
  hr: {
    name: '人力资源',
    keywords: ['员工', '人效', '绩效', '薪资', '考勤', '出勤', '团队', '人员', '招聘']
  },
  project: {
    name: '项目交付',
    keywords: ['项目', '进度', '延期', '任务', '里程碑', '交付', '风险', '开发']
  }
};

let CACHE = { lastUpdated: null, modules: {}, dataSource: 'yida' };

function precomputeCache() {
  const now = new Date();
  console.log(`[${now.toISOString()}] 开始预计算缓存...`);

  // 从宜搭获取真实数据
  if (yida.isAvailable()) {
    fetchYidaData()
      .then(data => {
        console.log(`[预计算] fetchYidaData 返回 ${Object.keys(data).length} 个模块`);
        // 用 Object.assign 而不是重新赋值，避免闭包问题
        Object.assign(CACHE, {
          lastUpdated: new Date().toISOString(),
          modules: data,
          dataSource: 'yida'
        });
        console.log(`[预计算] CACHE.modules 现在共 ${Object.keys(CACHE.modules).length} 个模块`);
        console.log(`[${new Date().toISOString()}] 缓存更新完成（宜搭数据）`);
      })
      .catch(e => {
        console.error('宜搭数据获取失败:', e.message);
        CACHE.lastUpdated = new Date().toISOString();
      });
  } else {
    console.log('宜搭未连接，等待登录...');
  }

  return CACHE;
}

// 异步获取宜搭数据
async function fetchYidaData() {
  const result = {};

  try {
    // 获取应用列表
    const apps = await yida.getApps();
    const appList = apps?.content?.data || apps?.apps || [];
    console.log('获取到应用数:', appList.length);

    if (appList.length > 0) {
      // 遍历所有应用
      for (const app of appList) {
        const appType = app.appType;
        const appName = app.appName?.zh_CN || app.appName;
        try {
          const forms = await yida.getForms(appType);
          const formList = forms?.content || forms?.data || [];
          // 过滤出真实表单（不是导航节点）
          const realForms = formList.filter(f => f && f.formUuid && f.formType);
          console.log(`应用 ${appName} 的真实表单:`, realForms.length);

          if (realForms.length > 0) {
            // 遍历所有表单，收集有数据的
            const appModules = {};
            for (const form of realForms) {
              const formUuid = form.formUuid;
              const formName = form.title?.zh_CN || form.formName || form.title;
              const isProcess = form.formType === 'process';
              try {
                // 流程表单用流程 API，普通表单用表单 API
                let formData;
                if (isProcess) {
                  formData = await yida.queryProcessData(appType, formUuid);
                } else {
                  formData = await yida.queryFormData(appType, formUuid);
                }
                const records = formData?.content?.data || formData?.data || [];
                const totalCount = formData?.content?.totalCount || formData?.totalCount || 0;

                if (records.length > 0) {
                  const moduleName = matchModule(formName) || `${appType}_${formUuid.slice(-8)}`;
                  appModules[moduleName] = {
                    appName,
                    appType,
                    formName,
                    formUuid,
                    records,
                    totalCount,
                    lastUpdated: new Date().toISOString()
                  };
                  console.log(`  ✓ ${formName}: ${records.length} 条`);
                }
              } catch (e) {
                console.log(`  ✗ ${formName}: 查询失败 - ${e.message}`);
              }
            }

            // 把这个应用的所有模块合并到结果
            Object.assign(result, appModules);
            console.log(`应用 ${appName} 合并后，result 共 ${Object.keys(result).length} 个模块`);
          }
        } catch (e) {
          console.error(`获取应用 ${appName} 数据失败:`, e.message);
        }
      }
    }
  } catch (e) {
    console.error('获取宜搭数据失败:', e.message);
  }

  return result;
}

// 根据表单名称匹配业务模块
function matchModule(formName) {
  const moduleMap = {
    '销售': 'sales',
    '订单': 'sales',
    '客户': 'sales',
    '财务': 'finance',
    '预算': 'finance',
    '员工': 'hr',
    '人事': 'hr',
    '考勤': 'hr',
    '项目': 'project',
    '任务': 'project'
  };

  for (const [keyword, module] of Object.entries(moduleMap)) {
    if (formName.includes(keyword)) {
      return module;
    }
  }
  return null;
}

// 初始计算
precomputeCache();

// 每 6 小时刷新
setInterval(precomputeCache, 6 * 60 * 60 * 1000);

// ==================== 意图识别 ====================

// 用 AI 做意图识别：从缓存的应用列表中选择最相关的
async function detectModuleWithAI(message) {
  if (!API_KEY || !message) return null;

  // 如果没有缓存数据，直接返回 null
  const availableModules = Object.keys(CACHE.modules);
  if (availableModules.length === 0) return null;

  // 构造模块描述列表给 AI，按数据量排序
  const moduleList = availableModules
    .map(key => {
      const m = CACHE.modules[key];
      return { key, ...m };
    })
    .sort((a, b) => (b.totalCount || 0) - (a.totalCount || 0))
    .slice(0, 10) // 只给 AI 看数据量最大的 10 个模块
    .map(m => `- ${m.key}: ${m.appName} / ${m.formName} (共 ${m.totalCount} 条记录)`)
    .join('\n');

  const prompt = `你是一个意图分类器。用户的问题是关于企业数据的。

可用的业务模块：
${moduleList}

用户问题：${message}

请从上述模块中选择最相关的一个。必须以 JSON 格式返回，格式为 {"module": "模块key"} 或 {"module": "none"}。不要返回其他内容。`;

  try {
    const response = await fetch(`${API_BASE}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        max_tokens: 100,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      console.error('意图识别 AI 调用失败:', response.status);
      return null;
    }

    const data = await response.json();
    const result = data.content
      .filter(c => c.type === 'text' || c.type === 'thinking')
      .map(c => c.text || c.thinking || '')
      .join('')
      .trim();

    console.log(`[意图识别] AI 原始返回: "${result}"`);

    // 尝试解析 JSON
    let moduleKey = null;
    try {
      // 提取 JSON 部分（可能前后有 thinking 内容）
      const jsonMatch = result.match(/\{[^}]*"module"[^}]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        moduleKey = parsed.module;
      }
    } catch (e) {
      console.log('[意图识别] JSON 解析失败，尝试直接匹配:', e.message);
    }

    // 如果 JSON 解析失败，尝试从文本中提取模块 key
    if (!moduleKey) {
      for (const key of availableModules) {
        if (result.includes(key)) {
          moduleKey = key;
          break;
        }
      }
    }

    console.log(`[意图识别] 最终模块: ${moduleKey}`);

    // 验证返回的 key 是否有效
    if (moduleKey && availableModules.includes(moduleKey)) {
      return moduleKey;
    }

    // 尝试模糊匹配
    if (moduleKey) {
      const fuzzy = availableModules.find(k => k.toLowerCase() === moduleKey.toLowerCase());
      if (fuzzy) return fuzzy;
    }

    return null;
  } catch (e) {
    console.error('意图识别失败:', e.message);
    return null;
  }
}

// 兜底：关键词匹配（保留作为 fallback）
function detectModuleByKeyword(message) {
  const msg = message.toLowerCase();
  let bestModule = null;
  let bestScore = 0;

  for (const [key, config] of Object.entries(BUSINESS_MODULES)) {
    let score = 0;
    for (const kw of config.keywords) {
      if (msg.includes(kw)) {
        score += 1;
        if (msg.indexOf(kw) < 10) score += 0.5;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestModule = key;
    }
  }

  return bestScore > 0 ? bestModule : null;
}

// ==================== API 路由 ====================

app.get('/api/whoami', async (req, res) => {
  // 从 cookies 缓存中读取本机已登录的宜搭身份
  const cookiesFile = path.join(__dirname, '.cache', 'cookies-public.json');
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
      orgName: '合肥一六八玫瑰园学校东校',
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
  const cache = precomputeCache();
  res.json({ success: true, cache });
});

// ==================== 核心：AI 问答 ====================

app.post('/api/chat', async (req, res) => {
  const { message, history = [], user = {} } = req.body;

  if (!message) {
    return res.status(400).json({ error: '消息不能为空' });
  }

  if (!API_KEY) {
    return res.status(500).json({
      error: '未配置 API Key',
      hint: '请确保 ANTHROPIC_AUTH_TOKEN 环境变量已设置'
    });
  }

  // 2️⃣ 意图识别 + 构造系统 prompt
  // 只在首轮对话时做意图识别，后续轮复用之前的模块
  let detectedModule = null;
  let intentMethod = 'context';

  // 从 history 的最后一条 assistant 消息推断是否已有模块上下文
  const lastAssistantMsg = [...history].reverse().find(h => h.role === 'assistant');
  if (lastAssistantMsg && lastAssistantMsg.module) {
    // 复用上一轮的模块
    detectedModule = lastAssistantMsg.module;
    intentMethod = 'context-cached';
  } else {
    // 首轮：AI 意图识别
    detectedModule = await detectModuleWithAI(message);
    intentMethod = 'ai';
    if (!detectedModule) {
      detectedModule = detectModuleByKeyword(message);
      intentMethod = 'keyword';
    }
  }

  console.log(`[Chat] 用户问题: "${message.slice(0, 30)}..." → 识别模块: ${detectedModule || '未识别'} (${intentMethod})`);

  const systemPrompt = buildSystemPrompt(user, detectedModule);

  // 3️⃣ 构造对话历史（包含之前的所有 user/assistant 消息）
  const conversationHistory = history
    .filter(h => h.role === 'user' || h.role === 'assistant')
    .map(h => {
      let content = h.content;
      // 去掉之前注入的模块数据标记，保持对话干净
      const dataMarker = '\n\n## 当前调取的业务模块：';
      const idx = content.indexOf(dataMarker);
      if (idx > -1) content = content.substring(0, idx);
      return { role: h.role, content };
    });

  try {
    // 4️⃣ 调用 DeepSeek
    const response = await fetch(`${API_BASE}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [
          ...conversationHistory.slice(-10),
          { role: 'user', content: message }
        ]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('API error:', err);
      return res.status(response.status).json({ error: 'AI 调用失败', detail: err });
    }

    const data = await response.json();
    const reply = data.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('');

    res.json({
      reply,
      module: detectedModule,
      cacheHit: !!detectedModule,
      model: data.model,
      dataSource: CACHE.dataSource
    });
  } catch (e) {
    console.error('Chat error:', e);
    res.status(500).json({ error: e.message });
  }
});

// 构造系统提示词
function buildSystemPrompt(user, detectedModule) {
  let moduleData = '';
  let moduleContext = '';

  if (detectedModule && CACHE.modules[detectedModule]) {
    const moduleInfo = CACHE.modules[detectedModule];
    const moduleName = moduleInfo.formName || moduleInfo.appName || detectedModule;

    // 只给 AI 看摘要数据，避免 records 数组太大
    const totalCount = moduleInfo.totalCount;

    // 提取流程状态统计（如果有）
    let processSummary = '';
    const firstRecord = moduleInfo.records?.[0];
    if (firstRecord && firstRecord.instanceStatus !== undefined) {
      const statusCounts = {};
      moduleInfo.records.forEach(r => {
        const s = r.instanceStatus || 'UNKNOWN';
        statusCounts[s] = (statusCounts[s] || 0) + 1;
      });
      // 统计总数需要所有记录，但我们只缓存了前 100 条
      const sampleSize = moduleInfo.records.length;
      processSummary = `
### 流程状态分布（基于 ${sampleSize} 条样本，共 ${totalCount} 条记录）
${Object.entries(statusCounts).map(([k, v]) => `- ${k}：${v} 条`).join('\n')}
`;
    }

    const summary = {
      appName: moduleInfo.appName,
      formName: moduleInfo.formName,
      totalCount: moduleInfo.totalCount,
      lastUpdated: moduleInfo.lastUpdated,
      sampleRecords: moduleInfo.records?.slice(0, 3).map(r => ({
        ...r,
        // 只保留关键字段
        formData: r.formData || r.data,
        title: r.title,
        instanceStatus: r.instanceStatus,
        approvedResult: r.approvedResult,
        originator: r.originator?.name?.zh_CN || r.originator?.name,
        gmtCreate: r.gmtCreate
      })) || []
    };
    moduleData = JSON.stringify(summary, null, 2);
    moduleContext = `
## 当前调取的业务模块：${moduleName}

数据来自: ${CACHE.dataSource === 'yida' ? '宜搭真实数据' : '模拟数据'}
### ${moduleName} 数据摘要（共 ${totalCount} 条记录）
${processSummary}
${moduleData}

请基于以上数据回答用户问题，给出专业、简洁的分析。
`;
  } else {
    // 动态生成可用模块摘要
    const availableModules = Object.entries(CACHE.modules).map(([key, m]) => {
      const name = m.formName || m.appName || key;
      return `- ${name}：${m.totalCount || 0} 条记录`;
    }).join('\n');

    moduleContext = `
## 可用业务模块
用户问题未明确指向特定模块，你可以：
1. 根据问题推断最相关的模块
2. 或提供跨模块的综合分析
3. 或询问用户想具体了解哪个模块

当前已缓存的业务模块：
${availableModules || '暂无缓存数据'}
`;
  }

  return `你是企业 AI 秘书，为高层管理人员提供数据分析和业务决策支持。

## 当前用户
- 姓名: ${user?.name || '张总'}
- 职位: ${user?.role || 'CEO'}
- 部门: ${user?.dept || '总裁办'}

## 数据更新时间
缓存最后更新时间: ${CACHE.lastUpdated || '未更新'}
数据源: ${CACHE.dataSource === 'yida' ? '宜搭真实数据' : '模拟数据'}
（系统每 6 小时自动预计算一次中间结果）

${moduleContext}

## 回答要求
1. 中文回答，简洁专业，避免使用 emoji
2. 重要数据加粗显示
3. 复杂分析用要点列出
4. 必要时给出行动建议
5. 如需可视化，使用 mermaid 图表（放在 \`\`\`mermaid 代码块中）
6. 数据均来自公司真实业务系统，无需脱敏`;
}

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
  console.log(`定时任务: 每 6 小时自动刷新缓存\n`);
});
