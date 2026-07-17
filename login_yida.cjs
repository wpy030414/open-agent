const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('正在打开宜搭登录页面...');
  await page.goto('https://www.aliwork.com/workPlatform');

  console.log('请在浏览器中扫码登录...');
  console.log('等待登录完成（最长 2 分钟）...');

  // 等待登录完成（检测 URL 变化或特定元素）
  try {
    await page.waitForURL('**/workPlatform**', { timeout: 120000 });
    // 等待额外时间确保 cookies 写入
    await page.waitForTimeout(3000);
  } catch (e) {
    console.log('等待超时，继续获取 cookies...');
  }

  // 获取 cookies
  const cookies = await context.cookies();
  console.log(`获取到 ${cookies.length} 个 cookies`);

  // 保存 cookies
  const cookiesData = {
    base_url: 'https://www.aliwork.com',
    cookies: cookies.map(c => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path
    }))
  };

  const outputPath = path.join(__dirname, '.cache', 'cookies-public.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(cookiesData, null, 2));
  console.log(`Cookies 已保存到: ${outputPath}`);

  await browser.close();
  console.log('完成！');
})();
