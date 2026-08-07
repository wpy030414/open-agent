import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto('http://localhost:5197/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

// 1. HomeView 招呼内容下移：hero 顶部 y 应 > 菜单按钮底部(约 12+40=52)
const hero = page.locator('.home-hero').first();
const heroRect = await hero.boundingBox();
const menuBtn = page.locator('.main-topbar .menu-btn').first();
const menuRect = await menuBtn.boundingBox();
console.log('hero 顶 y:', heroRect.y, '菜单按钮底:', menuRect.y + menuRect.height);
console.log('hero 在菜单按钮下方:', heroRect.y > menuRect.y + menuRect.height);

// 2. 打开 dialog
await page.locator('.sidebar-user .settings-btn').first().click();
await page.waitForTimeout(1000);

const dialog = page.locator('dialog.settings-dialog').first();
const dialogOpen = await dialog.evaluate(d => d.open);
const dialogRect = await dialog.evaluate(d => {
  const r = d.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});
const vp = { w: 1280, h: 800 };

// dialog 应大致居中
const centerX = vp.w / 2;
const centerY = vp.h / 2;
const dialogCenterX = dialogRect.x + dialogRect.width / 2;
const dialogCenterY = dialogRect.y + dialogRect.height / 2;
const centeredX = Math.abs(dialogCenterX - centerX) < 20;
const centeredY = Math.abs(dialogCenterY - centerY) < 60;

// content padding：检查 .settings-content 实际 padding
const contentPad = await page.locator('.settings-content').first().evaluate(el => {
  const cs = getComputedStyle(el);
  return { top: cs.paddingTop, right: cs.paddingRight, bottom: cs.paddingBottom, left: cs.paddingLeft };
});

// theme-option 有内边距
const optPad = await page.locator('.theme-option').first().evaluate(el => getComputedStyle(el).padding);

console.log('=== Dialog ===');
console.log('dialog open:', dialogOpen);
console.log('=== Dialog ===');
console.log('dialog open:', dialogOpen);
console.log('dialog rect:', dialogRect);
console.log('水平居中:', centeredX, '(中心x', dialogCenterX, '≈', centerX, ')');
console.log('垂直居中:', centeredY, '(中心y', dialogCenterY, '≈', centerY, ')');
console.log('content padding:', contentPad);
console.log('theme-option padding:', optPad);

const ok = heroRect.y > menuRect.y + menuRect.height &&
  dialogOpen && centeredX && centeredY &&
  contentPad.top !== '0px';
console.log(ok ? 'PASS ✅' : 'FAIL ❌');
