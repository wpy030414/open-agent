// 集成测试：mock OpenAI 兼容服务端，验证 yida-agent 的 function calling 循环
// 用 Node 内置模块，不依赖项目 node_modules
import http from 'http';

// ---- mock OpenAI 服务端：第一轮返回 tool_calls，第二轮返回最终回答 ----
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    const reqJson = JSON.parse(body);

    if (req.url === '/v1/chat/completions' && req.method === 'POST') {
      // 校验 Authorization header
      if (req.headers.authorization !== 'Bearer test-key') {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'bad auth' }));
        return;
      }

      // 检查是否有 tool 消息 → 第二轮
      const hasToolMsg = reqJson.messages.some(m => m.role === 'tool');

      if (hasToolMsg) {
        // 第二轮：纯文本回答
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write('data: {"choices":[{"delta":{"content":"你好，"},"finish_reason":null}]}\n\n');
        res.write('data: {"choices":[{"delta":{"content":"世界！"},"finish_reason":null}]}\n\n');
        res.write('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n');
        res.write('data: [DONE]\n\n');
        res.end();
      } else {
        // 第一轮：请求工具调用
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write('data: {"choices":[{"delta":{"role":"assistant","content":""},"finish_reason":null}]}\n\n');
        res.write('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"yida_app_list","arguments":""}}]},"finish_reason":null}]}\n\n');
        res.write('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{}"}}]},"finish_reason":null}]}\n\n');
        res.write('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n');
        res.write('data: [DONE]\n\n');
        res.end();
      }
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
    }
  });
});

// 启动 mock 服务端
await new Promise(r => server.listen(0, r));
const port = server.address().port;

// 环境变量指向 mock
process.env.OPENAI_BASE_URL = `http://127.0.0.1:${port}/v1`;
process.env.OPENAI_API_KEY = 'test-key';
process.env.OPENAI_MODEL = 'mock-model';
process.env.LOGIN_MODE = 'local';

// 避免真实宜搭调用：tool 会失败（未登录），但循环逻辑应仍走通
// 加载被测模块
const mod = await import('../server/index.mjs');
await new Promise(r => setTimeout(r, 300)); // 等 startPrecompute 跑完

// 直接调用 HTTP
const chatReq = await fetch('http://127.0.0.1:3001/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: '有哪些应用？', user: { name: '测试' } })
});

const text = await chatReq.text();
console.log('=== SSE 输出 ===');
console.log(text);

// 校验
const events = text.split('\n\n').filter(l => l.startsWith('data: ')).map(l => JSON.parse(l.slice(6)));
const types = events.map(e => e.type);
console.log('=== 事件类型 ===');
console.log(types.join(' → '));

const ok =
  types.includes('meta') &&
  types.includes('tool_call') &&
  types.includes('tool_result') &&
  types.includes('done');

// tool_call 应携带 yida_app_list
const toolCall = events.find(e => e.type === 'tool_call');
const toolCallOk = toolCall && toolCall.name === 'yida_app_list';

// done 事件应含 reply
const done = events.find(e => e.type === 'done');
const doneOk = done && done.reply.includes('你好');

console.log('=== 结果 ===');
console.log('tool_call 名称正确:', toolCallOk);
console.log('done.reply 正确:', doneOk);
console.log('总体:', ok && toolCallOk && doneOk ? 'PASS ✅' : 'FAIL ❌');

process.exit(ok && toolCallOk && doneOk ? 0 : 1);
