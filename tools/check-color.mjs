// 用系统 Edge 验证页面实际渲染（无需下载 playwright 浏览器）
import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

await page.goto('http://localhost:5180/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

const rootHtml = await page.locator('#root').innerHTML();
const mounted = rootHtml.length > 50;
const hasLoginOrMain = rootHtml.includes('login-page') || rootHtml.includes('app-layout');

// 关键：检查 :root 是否真写入了动态颜色令牌
const primary = await page.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-primary').trim());
const surface = await page.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-surface').trim());
const onSurface = await page.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-on-surface').trim());

// body 实际背景色
const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

// md-icon 是否定义
const mdIconDefined = await page.evaluate(() => !!customElements.get('md-icon'));

// ENV=dev 下应直接进主界面（无登录页）
const inMain = rootHtml.includes('app-layout');

console.log('=== 诊断 ===');
console.log('#root 有内容:', mounted, '(长度', rootHtml.length, ')');
console.log('有 login/main 结构:', hasLoginOrMain);
console.log('--md-sys-color-primary:', JSON.stringify(primary));
console.log('--md-sys-color-surface:', JSON.stringify(surface));
console.log('--md-sys-color-on-surface:', JSON.stringify(onSurface));
console.log('body 背景:', bodyBg);
console.log('md-icon 已定义:', mdIconDefined);
console.log('直接进主界面(ENV=dev):', inMain);
console.log('控制台错误数:', errors.length);
if (errors.length) errors.slice(0,5).forEach(e => console.log('  ✗', e));

const ok = mounted && primary && surface && errors.length === 0;
console.log(ok ? 'PASS ✅ 有颜色' : 'FAIL ❌ 仍纯白');
await browser.close();
process.exit(ok ? 0 : 1);
