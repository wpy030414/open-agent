const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('正在打开宜搭页面...');
  await page.goto('https://kaejqe.aliwork.com/workPlatform', { waitUntil: 'networkidle' });

  console.log('等待页面加载完成（检测到登录后的元素）...');

  // 等待登录完成 - 检测页面上的特定元素
  try {
    // 等待页面中出现登录后的特征（比如用户头像、工作台等）
    await page.waitForSelector('.user-avatar, .workbench, [class*="user"]', { timeout: 180000 });
    console.log('检测到登录状态！');
  } catch (e) {
    // 超时也继续，可能是已登录
    console.log('继续获取 cookies...');
  }

  // 额外等待确保 cookies 写入
  await page.waitForTimeout(5000);

  // 获取所有 cookies
  const allCookies = await context.cookies();
  console.log(`获取到 ${allCookies.length} 个 cookies`);

  // 筛选 aliwork.com 相关的 cookies
  const yidaCookies = allCookies.filter(c =>
    c.domain.includes('aliwork.com') || c.domain.includes('dingtalk.com')
  );
  console.log(`其中宜搭/dingtalk cookies: ${yidaCookies.length} 个`);

  // 获取当前 URL
  const currentUrl = new URL(page.url());
  const baseUrl = `${currentUrl.protocol}//${currentUrl.hostname}`;

  // 构建 cookies 文件
  const cookiesData = {
    base_url: baseUrl,
    cookies: yidaCookies.map(c => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path
    }))
  };

  // 保存到项目根目录的 .cache/（脚本在 tools/ 子目录，需往上跳一级）
  const outputPath = path.join(__dirname, '..', '.cache', 'cookies-public.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(cookiesData, null, 2));
  console.log(`\nCookies 已保存到: ${outputPath}`);

  // 尝试用 cookies 调用 API
  console.log('\n测试 API 调用...');
  const cookieString = yidaCookies.map(c => `${c.name}=${c.value}`).join('; ');

  try {
    const response = await page.evaluate(async ({ baseUrl, cookieString }) => {
      try {
        const res = await fetch(`${baseUrl}/api/app/list`, {
          credentials: 'include',
          headers: {
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          }
        });
        const text = await res.text();
        return { status: res.status, body: text.substring(0, 3000) };
      } catch (e) {
        return { error: e.message };
      }
    }, { baseUrl, cookieString });

    console.log('API 响应状态:', response.status);
    console.log('API 响应内容:', response.body || response.error);
  } catch (e) {
    console.log('API 测试失败:', e.message);
  }

  await browser.close();
  console.log('\n完成！');
  process.exit(0);
})();
