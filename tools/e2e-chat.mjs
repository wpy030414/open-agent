// E2E：用系统 Edge 跑真实前端对话链路
import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// ENV=dev 直接进主界面，应能找到输入框
const textarea = page.locator('.message-input').first();
const exists = await textarea.count();
console.log('找到输入框:', exists > 0);
if (!exists) { console.log('FAIL: 没进主界面'); await browser.close(); process.exit(1); }

// 填入并发送
await textarea.fill('say hi in 3 words');
await page.locator('.send-btn').first().click();

// 等待 token 流 + done（最多 60s）
let gotToken = false, gotDone = false, reply = '';
try {
  await page.waitForFunction(() => {
    const m = document.querySelector('.message.assistant .message-content');
    return m && m.textContent.length > 5;
  }, { timeout: 60000 });
  gotToken = true;
  reply = await page.locator('.message.assistant .message-content').last().textContent();
} catch (e) {
  console.log('等待回答超时/失败:', e.message);
}

console.log('流式 token 渲染:', gotToken);
console.log('回答内容:', JSON.stringify(reply.trim().slice(0, 80)));
console.log('页面错误数:', errors.length);
errors.slice(0,3).forEach(e => console.log('  ✗', e));

const ok = gotToken && reply.trim().length > 0;
console.log(ok ? 'PASS ✅ 前端对话链路跑通' : 'FAIL ❌');
await browser.close();
process.exit(ok ? 0 : 1);
