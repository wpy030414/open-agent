// E2E 冒烟测试：加载前端，验证 Vue + MWC + Material You 配色生效
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

await page.goto('http://localhost:5174/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// 1. 检查 Vue 挂载：#root 下应有内容
const rootHtml = await page.locator('#root').innerHTML();
const mounted = rootHtml.includes('login-page') || rootHtml.includes('AI 秘书');

// 2. 检查 MWC 组件定义：md-icon 应是 custom element
const mdIconDefined = await page.evaluate(() => !!customElements.get('md-icon'));

// 3. 检查 md-icon 渲染出文字 ligature
const iconText = await page.locator('md-icon').first().textContent().catch(() => '');

// 4. 检查 Material You 动态令牌写入 :root
const primaryToken = await page.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-primary').trim()
);
const surfaceToken = await page.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-surface').trim()
);

// 5. 检查 data-theme
const dataTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));

// 6. 钉钉登录按钮存在（loginMode 默认 local，应显示「本机免登登录」或按钮）
const loginBtn = await page.locator('.dingtalk-login-btn').count();

console.log('=== 结果 ===');
console.log('Vue 挂载:', mounted);
console.log('md-icon 组件已定义:', mdIconDefined);
console.log('首个图标 ligature:', JSON.stringify(iconText?.trim()));
console.log('--md-sys-color-primary:', primaryToken);
console.log('--md-sys-color-surface:', surfaceToken);
console.log('data-theme:', dataTheme);
console.log('登录按钮存在:', loginBtn > 0);
console.log('控制台错误数:', errors.length);
if (errors.length) console.log('  首个错误:', errors[0]);

const ok = mounted && mdIconDefined && primaryToken && loginBtn > 0 && errors.length === 0;
console.log(ok ? 'PASS ✅' : 'FAIL ❌');

await browser.close();
process.exit(ok ? 0 : 1);
