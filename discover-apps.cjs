const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('正在打开宜搭工作台...');
  await page.goto('https://kaejqe.aliwork.com/workPlatform');

  // 等待页面加载
  await page.waitForTimeout(5000);

  // 截图当前页面
  await page.screenshot({ path: '/tmp/yida-workbench.png', fullPage: true });
  console.log('已截图: /tmp/yida-workbench.png');

  // 尝试从页面中提取应用信息
  console.log('\n=== 查找应用列表 ===');

  // 查找所有链接，看是否有应用链接
  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a[href*="appType"]')).map(a => ({
      text: a.textContent.trim(),
      href: a.href
    }));
  });

  console.log('找到的应用链接:', links.length);
  links.slice(0, 10).forEach(l => console.log(`  - ${l.text}: ${l.href}`));

  // 查找页面中所有包含 APP_ 的文本
  const pageContent = await page.content();
  const appTypeMatches = pageContent.match(/APP_[A-Z0-9]+/g);
  if (appTypeMatches) {
    const uniqueApps = [...new Set(appTypeMatches)];
    console.log('\n发现的 appType:', uniqueApps);
  }

  // 查找自定义页面链接
  const customLinks = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a[href*="/custom/"]')).map(a => ({
      text: a.textContent.trim().substring(0, 50),
      href: a.href
    }));
  });
  console.log('\n自定义页面链接:', customLinks.length);
  customLinks.slice(0, 10).forEach(l => console.log(`  - ${l.text}: ${l.href}`));

  // 继续等待用户操作
  console.log('\n请在浏览器中查看工作台，完成后在此按回车...');
  await new Promise(resolve => {
    process.stdin.setRawMode(true);
    process.stdin.once('data', () => {
      process.stdin.setRawMode(false);
      resolve();
    });
  });

  await browser.close();
})();
