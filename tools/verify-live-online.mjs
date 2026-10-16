import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { SITE_ORIGIN, PAGES, getPageUrl } from './site-config.mjs';

const GITHUB_MIRROR_ORIGIN = 'https://selflove9417.github.io/eyes-solar-system';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9588;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`================================================================`);
  console.log(`🌐 深空之眸 生产环境全要素实时审计与验证`);
  console.log(`主站域名 (Cloudflare Pages): ${SITE_ORIGIN}`);
  console.log(`镜像站点 (GitHub Pages)    : ${GITHUB_MIRROR_ORIGIN}`);
  console.log(`时间戳                     : ${new Date().toISOString()}`);
  console.log(`================================================================\n`);

  let allChecksPassed = true;

  // -------------------------------------------------------------
  // 1. 12 个页面元数据实测 (Title, Canonical, OG:URL, OG:Image, Twitter:Card)
  // -------------------------------------------------------------
  console.log(`[步骤 1/6] 抓取主站 12 个页面的真实 Head 元数据...`);
  const metaResults = [];
  for (const p of PAGES) {
    const pageUrl = `${SITE_ORIGIN}/${p === 'index.html' ? '' : p}?_t=${Date.now()}`;
    try {
      const res = await fetch(pageUrl, { cache: 'no-store' });
      const html = await res.text();

      const title = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() || '(缺失)';
      const canonical = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i)?.[1]?.trim() || '(缺失)';
      const ogUrl = html.match(/<meta\s+property=["']og:url["']\s+content=["']([^"']+)["']/i)?.[1]?.trim() || '(缺失)';
      const ogImage = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i)?.[1]?.trim() || '(缺失)';
      const twCard = html.match(/<meta\s+name=["']twitter:card["']\s+content=["']([^"']+)["']/i)?.[1]?.trim() || '(缺失)';

      const canonicalOk = canonical.startsWith(SITE_ORIGIN);
      const ogUrlOk = ogUrl.startsWith(SITE_ORIGIN);
      const ogImageOk = ogImage.startsWith(SITE_ORIGIN);
      const twCardOk = twCard === 'summary';

      if (!canonicalOk || !ogUrlOk || !ogImageOk || !twCardOk) {
        allChecksPassed = false;
      }

      metaResults.push({
        page: p,
        status: res.status,
        title,
        canonical,
        ogUrl,
        ogImage,
        twCard,
        ok: canonicalOk && ogUrlOk && ogImageOk && twCardOk
      });
    } catch (err) {
      metaResults.push({ page: p, error: err.message, ok: false });
      allChecksPassed = false;
    }
  }

  console.log('| 页面 | HTTP | 真实 `<title>` | `canonical` | `og:url` | `og:image` | `twitter:card` |');
  console.log('| :--- | :--- | :--- | :--- | :--- | :--- | :--- |');
  for (const r of metaResults) {
    console.log(`| \`${r.page}\` | ${r.status} | ${r.title} | \`${r.canonical}\` | \`${r.ogUrl}\` | \`${r.ogImage}\` | \`${r.twCard}\` |`);
  }
  console.log('');

  // -------------------------------------------------------------
  // 2. og:image 真实可达性与物理尺寸校验
  // -------------------------------------------------------------
  console.log(`[步骤 2/6] 检查社交分享图 og:image...`);
  const ogImgUrl = `${SITE_ORIGIN}/assets/img/PIA21895_final_image.png?_t=${Date.now()}`;
  try {
    const res = await fetch(ogImgUrl, { cache: 'no-store' });
    const buf = Buffer.from(await res.arrayBuffer());
    // PNG IHDR: width at 16 (4B), height at 20 (4B)
    let width = 0, height = 0;
    if (buf.length > 24 && buf.toString('ascii', 1, 4) === 'PNG') {
      width = buf.readUInt32BE(16);
      height = buf.readUInt32BE(20);
    }
    const imgOk = res.status === 200 && width === 505 && height === 508;
    console.log(`  URL: ${ogImgUrl}`);
    console.log(`  HTTP 状态: ${res.status} (${res.status === 200 ? 'PASS' : 'FAIL'})`);
    console.log(`  Content-Type: ${res.headers.get('content-type')}`);
    console.log(`  解析尺寸: ${width} × ${height} (${imgOk ? 'PASS' : 'FAIL'})`);
    if (!imgOk) allChecksPassed = false;
  } catch (err) {
    console.error(`  ❌ og:image 抓取失败:`, err.message);
    allChecksPassed = false;
  }
  console.log('');

  // -------------------------------------------------------------
  // 3. robots.txt 与 sitemap.xml 线上可达性
  // -------------------------------------------------------------
  console.log(`[步骤 3/6] 检查 robots.txt 与 sitemap.xml...`);
  const robotsUrl = `${SITE_ORIGIN}/robots.txt?_t=${Date.now()}`;
  const sitemapUrl = `${SITE_ORIGIN}/sitemap.xml?_t=${Date.now()}`;

  try {
    const rRobots = await fetch(robotsUrl, { cache: 'no-store' });
    const robotsText = await rRobots.text();
    const hasSitemapRef = robotsText.includes('Sitemap: https://deepspaceeye.pages.dev/sitemap.xml');
    console.log(`  robots.txt : HTTP ${rRobots.status}, Sitemap 指向正常: ${hasSitemapRef ? 'YES' : 'NO'}`);
    if (rRobots.status !== 200 || !hasSitemapRef) allChecksPassed = false;

    const rSitemap = await fetch(sitemapUrl, { cache: 'no-store' });
    const sitemapText = await rSitemap.text();
    const urlCount = (sitemapText.match(/<loc>/g) || []).length;
    const all12InSitemap = PAGES.every(p => {
      const u = p === 'index.html' ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}/${p}`;
      return sitemapText.includes(`<loc>${u}</loc>`);
    });
    console.log(`  sitemap.xml: HTTP ${rSitemap.status}, 包含 URL 数量: ${urlCount}, 12 页面完整收录: ${all12InSitemap ? 'YES' : 'NO'}`);
    if (rSitemap.status !== 200 || !all12InSitemap) allChecksPassed = false;
  } catch (err) {
    console.error(`  ❌ 抓取 robots/sitemap 失败:`, err.message);
    allChecksPassed = false;
  }
  console.log('');

  // -------------------------------------------------------------
  // 4. Cloudflare Pages 响应头与缓存控制标头 (_headers 生效验证)
  // -------------------------------------------------------------
  console.log(`[步骤 4/6] 检查 Cloudflare Pages 响应头缓存策略...`);
  try {
    const htmlRes = await fetch(`${SITE_ORIGIN}/?_t=${Date.now()}`, { cache: 'no-store' });
    const htmlCc = htmlRes.headers.get('cache-control') || '';
    const htmlCcOk = htmlCc.includes('must-revalidate');
    console.log(`  HTML 首页 Cache-Control: "${htmlCc}" (协商缓存: ${htmlCcOk ? 'PASS' : 'FAIL'})`);

    const assetRes = await fetch(`${SITE_ORIGIN}/assets/css/main.css?v=20261016p6final`, { cache: 'no-store' });
    const assetCc = assetRes.headers.get('cache-control') || '';
    const assetCcOk = assetCc.includes('immutable') || assetCc.includes('max-age=31536000');
    console.log(`  静态 CSS Cache-Control  : "${assetCc}" (永久缓存: ${assetCcOk ? 'PASS' : 'FAIL'})`);
  } catch (err) {
    console.error(`  ❌ 标头检查异常:`, err.message);
  }
  console.log('');

  // -------------------------------------------------------------
  // 5. 无头浏览器真实交互验收 (JSON 数据加载、探索页抽屉、特写页视角)
  // -------------------------------------------------------------
  console.log(`[步骤 5/6] 运行 Headless Chrome 对线上站点进行功能验收...`);
  const tempProfile = path.resolve('.chrome-temp-live-verify-' + Date.now());
  fs.mkdirSync(tempProfile, { recursive: true });

  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=' + CDP_PORT,
    '--no-sandbox',
    '--user-data-dir=' + tempProfile,
    'about:blank'
  ], { stdio: 'ignore' });

  let ws = null;
  try {
    for (let i = 0; i < 30; i++) {
      await sleep(200);
      try {
        const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
        const list = await res.json();
        if (list && list.length > 0) {
          ws = new WebSocket(list[0].webSocketDebuggerUrl);
          break;
        }
      } catch {}
    }
    await new Promise(r => ws.onopen = r);

    let id = 1;
    const callbacks = new Map();
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && callbacks.has(msg.id)) {
        const cb = callbacks.get(msg.id);
        callbacks.delete(msg.id);
        cb(msg.result);
      }
    };
    const send = (method, params = {}) => new Promise(r => {
      const curId = id++;
      callbacks.set(curId, r);
      ws.send(JSON.stringify({ id: curId, method, params }));
    });
    const evalInPage = async (expr) => {
      const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      return res.result?.value;
    };

    await send('Page.enable');
    await send('Runtime.enable');

    // 5.1 天体页 JSON 数据加载验收
    await send('Page.navigate', { url: `${SITE_ORIGIN}/bodies.html` });
    await sleep(2500);
    const bodiesCheck = await evalInPage(`(() => {
      const countEl = document.getElementById('count');
      const cards = document.querySelectorAll('.entry-card');
      return { countText: countEl?.innerText?.trim(), cardCount: cards.length };
    })()`);
    console.log(`  天体页 (bodies.html) 数据加载: 统计文案 "${bodiesCheck?.countText}", 卡片数量 ${bodiesCheck?.cardCount} (${bodiesCheck?.cardCount > 0 ? 'PASS' : 'FAIL'})`);
    if (!bodiesCheck?.cardCount) allChecksPassed = false;

    // 5.2 术语页 JSON 数据加载验收
    await send('Page.navigate', { url: `${SITE_ORIGIN}/glossary.html` });
    await sleep(2500);
    const glossaryCheck = await evalInPage(`(() => {
      const coverage = document.getElementById('coverage-core')?.innerText?.trim();
      const rows = document.querySelectorAll('#t-ent tr').length;
      return { coverage, rows };
    })()`);
    console.log(`  术语页 (glossary.html) 数据加载: 统计文案 "${glossaryCheck?.coverage}", 数据行数 ${glossaryCheck?.rows} (${glossaryCheck?.rows > 0 ? 'PASS' : 'FAIL'})`);
    if (!glossaryCheck?.rows) allChecksPassed = false;

    // 5.3 探索页天体抽屉交互验收
    await send('Page.navigate', { url: `${SITE_ORIGIN}/explore.html` });
    await sleep(2500);
    const drawerOpenCheck = await evalInPage(`(() => {
      const btn = document.getElementById('drawer-toggle-btn');
      btn.click();
      return document.body.classList.contains('drawer-open');
    })()`);
    await sleep(150);
    const drawerCloseCheck = await evalInPage(`(() => {
      const closeBtn = document.getElementById('drawer-close-btn');
      if (closeBtn) closeBtn.click();
      return !document.body.classList.contains('drawer-open');
    })()`);
    console.log(`  探索页 (explore.html) 抽屉交互: 展开成功: ${drawerOpenCheck ? 'YES' : 'NO'}, 关闭成功: ${drawerCloseCheck ? 'YES' : 'NO'} (${drawerOpenCheck && drawerCloseCheck ? 'PASS' : 'FAIL'})`);
    if (!drawerOpenCheck || !drawerCloseCheck) allChecksPassed = false;

    // 5.4 土星特写页视角切换交互验收
    await send('Page.navigate', { url: `${SITE_ORIGIN}/saturn.html` });
    await sleep(2500);
    const saturnTabCheck = await evalInPage(`(() => {
      const tabs = Array.from(document.querySelectorAll('.view-tab-btn'));
      if (tabs.length < 2) return { ok: false, reason: 'Tab count < 2' };
      const secondTab = tabs[1];
      secondTab.click();
      return {
        ok: true,
        activeTab: secondTab.innerText.trim(),
        isPressed: secondTab.getAttribute('aria-pressed') === 'true'
      };
    })()`);
    console.log(`  土星特写页 (saturn.html) 视角切换: 激活标签 "${saturnTabCheck?.activeTab}", aria-pressed=${saturnTabCheck?.isPressed} (${saturnTabCheck?.isPressed ? 'PASS' : 'FAIL'})`);
    if (!saturnTabCheck?.isPressed) allChecksPassed = false;

  } catch (err) {
    console.error(`  ❌ 浏览器功能验收失败:`, err.message);
    allChecksPassed = false;
  } finally {
    if (ws) ws.close();
    chromeProc.kill();
    try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch {}
  }
  console.log('');

  // -------------------------------------------------------------
  // 6. 旧 GitHub Pages 镜像站点的 Canonical 指向验证
  // -------------------------------------------------------------
  console.log(`[步骤 6/6] 检查 GitHub Pages 镜像站点的 Canonical 指向...`);
  const mirrorResults = [];
  for (const p of PAGES) {
    const mirrorUrl = `${GITHUB_MIRROR_ORIGIN}/${p === 'index.html' ? '' : p}?_t=${Date.now()}`;
    try {
      const res = await fetch(mirrorUrl, { cache: 'no-store' });
      const html = await res.text();
      const canonical = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i)?.[1]?.trim() || '(缺失)';
      const targetCanonical = p === 'index.html' ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}/${p}`;
      const isTarget = canonical === targetCanonical;

      if (!isTarget) allChecksPassed = false;
      mirrorResults.push({ page: p, status: res.status, canonical, targetCanonical, ok: isTarget });
    } catch (err) {
      mirrorResults.push({ page: p, error: err.message, ok: false });
      allChecksPassed = false;
    }
  }

  console.log('| 镜像页面 (GitHub Pages) | HTTP | 实际 `canonical` | 目标规范 `canonical` | 状态 |');
  console.log('| :--- | :--- | :--- | :--- | :--- |');
  for (const r of mirrorResults) {
    console.log(`| \`${r.page}\` | ${r.status} | \`${r.canonical}\` | \`${r.targetCanonical}\` | ${r.ok ? '✅ 已指向新主站' : '⏳ 等待 Actions 同步'} |`);
  }
  console.log('');

  console.log(`================================================================`);
  if (allChecksPassed) {
    console.log(`🎉 全站线上全要素审计全部通过！主域名切换与镜像同步圆满完成！`);
    process.exit(0);
  } else {
    console.warn(`⚠️ 部分项目尚未生效或仍在等待平台构建，请稍后复测。`);
    process.exit(1);
  }
}

main();
