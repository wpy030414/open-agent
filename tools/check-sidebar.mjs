import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage();
await page.goto('http://localhost:5190/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);

// 1. 色板数量：应为 3 个内置 + 1 个自定义取色器
const swatches = await page.locator('.color-swatch').count();
const presetSwatches = await page.locator('.color-picker .color-swatch:not(.custom)').count();
const customSwatch = await page.locator('.color-swatch.custom').count();

// 2. 主题切换按钮应被移除
const themeBtn = await page.locator('.theme-toggle-btn').count();

// 3. 跟随系统：模拟系统深色
await page.emulateMedia({ colorScheme: 'dark' });
await page.waitForTimeout(800);
const darkTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
const darkPrimary = await page.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-primary').trim());

await page.emulateMedia({ colorScheme: 'light' });
await page.waitForTimeout(800);
const lightTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
const lightPrimary = await page.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-primary').trim());

console.log('=== 结果 ===');
console.log('色板总数(3内置+1自定义=4):', swatches);
console.log('内置色板数:', presetSwatches);
console.log('自定义取色器:', customSwatch);
console.log('主题切换按钮(应0):', themeBtn);
console.log('系统深色 → data-theme:', darkTheme, 'primary:', darkPrimary);
console.log('系统浅色 → data-theme:', lightTheme, 'primary:', lightPrimary);

const ok = presetSwatches === 3 && customSwatch === 1 && themeBtn === 0 &&
  darkTheme === 'dark' && lightTheme === 'light' && darkPrimary !== lightPrimary;
console.log(ok ? 'PASS ✅' : 'FAIL ❌');
await browser.close();
process.exit(ok ? 0 : 1);
