import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage();
const vp = page.setViewportSize ? null : null;
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto('http://localhost:5195/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

// 菜单按钮位置：绝对定位，不占行
const menuBtn = page.locator('.main-topbar .menu-btn').first();
const menuRect = await menuBtn.boundingBox();
const menuPos = await menuBtn.evaluate(el => getComputedStyle(el.closest('.main-topbar')).position);

// main-area 高度 vs content-area 高度：内容应顶满（menu 按钮浮在上不占行）
const mainArea = page.locator('.main-area').first();
const contentArea = page.locator('.content-area').first();
const mainRect = await mainArea.boundingBox();
const contentRect = await contentArea.boundingBox();

// home-view 顶部应贴近 main 顶部（内容顶满，不被 menu 按钮挤下）
const homeView = page.locator('.home-view').first();
const homeRect = await homeView.boundingBox();

console.log('=== 结果 ===');
console.log('菜单按钮 position:', menuPos, '(应 absolute)');
console.log('菜单按钮 top:', menuRect?.y, 'left:', menuRect?.x);
console.log('main-area 高:', mainRect?.height, 'content-area 高:', contentRect?.height);
console.log('content-area 顶 y:', contentRect?.y, 'main 顶 y:', mainRect?.y, '差:', (contentRect?.y - mainRect?.y));
console.log('home-view 顶 y:', homeRect?.y);

// 菜单按钮绝对定位 + content-area 顶部 ≈ main 顶部（内容顶满，不预留行）
const noRow = menuPos === 'absolute' && (contentRect.y - mainRect.y) < 5;
console.log(noRow ? 'PASS ✅ 菜单按钮不独占行，内容顶满' : 'FAIL ❌');

await browser.close();
process.exit(noRow ? 0 : 1);
