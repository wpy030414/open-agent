import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

// 1. 侧边栏顶部品牌区
const brandName = await page.locator('.sidebar-header .brand-name').first().textContent().catch(()=>null);
const brandIcon = await page.locator('.sidebar-header .brand-icon').count();

// 2. 选色区应已删除
const colorPicker = await page.locator('.color-picker').count();
const colorSwatch = await page.locator('.color-swatch').count();

// 3. 底部用户区 + 设置 cog
const sidebarUser = await page.locator('.sidebar-user').count();
const userName = await page.locator('.sidebar-user .user-name').first().textContent().catch(()=>null);
const settingsBtn = await page.locator('.sidebar-user .settings-btn').count();

// 4. main 左上角菜单按钮
const menuBtn = await page.locator('.main-topbar .menu-btn').count();
// 5. TopBar 应已删除
const oldTopBar = await page.locator('.top-bar').count();

// 6. 点设置 → 弹窗
await page.locator('.sidebar-user .settings-btn').first().click();
await page.waitForTimeout(800);
const dialogOpen = await page.locator('md-dialog').first().evaluate(d => d.open).catch(()=>false);
const themeOptions = await page.locator('.theme-option').count();
const logoutBtn = await page.locator('.settings-actions .logout-btn').count();

// 7. 切主题到 dark
await page.locator('.theme-option', { hasText: '黑夜' }).click();
await page.waitForTimeout(500);
const darkTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));

// 切回跟随系统
await page.locator('.theme-option', { hasText: '跟随系统' }).click();
await page.waitForTimeout(500);

console.log('=== 结果 ===');
console.log('品牌名:', JSON.stringify(brandName?.trim()), '品牌图标:', brandIcon);
console.log('选色区(应0):', colorPicker, '色板(应0):', colorSwatch);
console.log('用户区:', sidebarUser, '用户名:', JSON.stringify(userName?.trim()), '设置按钮:', settingsBtn);
console.log('main 菜单按钮:', menuBtn, '旧 TopBar(应0):', oldTopBar);
console.log('设置弹窗打开:', dialogOpen, '主题选项数:', themeOptions, '退出按钮:', logoutBtn);
console.log('切黑夜 → data-theme:', darkTheme);
console.log('页面错误:', errors.length);
errors.slice(0,3).forEach(e=>console.log('  ✗',e));

const ok = brandName?.trim()==='AI 秘书' && brandIcon===1 &&
  colorPicker===0 && colorSwatch===0 &&
  sidebarUser===1 && settingsBtn===1 &&
  menuBtn===1 && oldTopBar===0 &&
  dialogOpen===true && themeOptions===3 && logoutBtn===1 &&
  darkTheme==='dark' && errors.length===0;
console.log(ok ? 'PASS ✅' : 'FAIL ❌');
await browser.close();
process.exit(ok?0:1);
