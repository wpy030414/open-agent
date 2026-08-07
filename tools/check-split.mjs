import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto('http://localhost:5196/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

const sidebar = page.locator('.sidebar').first();
const main = page.locator('.main-area').first();
const layout = page.locator('.app-layout').first();

const sRect = await sidebar.boundingBox();
const mRect = await main.boundingBox();
const lRect = await layout.boundingBox();

console.log('=== 结果 ===');
console.log('视口高 800');
console.log('layout:', { w: lRect.width, h: lRect.height });
console.log('sidebar:', { x: sRect.x, y: sRect.y, w: sRect.width, h: sRect.height });
console.log('main:   ', { x: mRect.x, y: mRect.y, w: mRect.width, h: mRect.height });

const checks = {
  'sidebar 顶满视窗高度(800)': sRect.y === 0 && sRect.height === 800,
  'main 顶满视窗高度(800)': mRect.y === 0 && mRect.height === 800,
  'sidebar 左贴边(x=0)': sRect.x === 0,
  'sidebar 在左 main 在右(mRect.x > sRect.x+10)': mRect.x > sRect.x + 10,
  'sidebar+main 合占满宽度(sRect.w + mRect.w ≈ 1280)': Math.abs(sRect.width + mRect.width + (mRect.x - (sRect.x + sRect.width)) - 1280) < 5,
};
Object.entries(checks).forEach(([k,v]) => console.log(v ? '✅' : '❌', k));

const ok = Object.values(checks).every(Boolean);
console.log(ok ? 'PASS ✅ 侧边栏与 main 分庭抗礼' : 'FAIL ❌');
await browser.close();
process.exit(ok ? 0 : 1);
