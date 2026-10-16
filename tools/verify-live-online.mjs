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
  // 3. robots.txt、sitemap.xml 与 404 响应真实状态校验
  // -------------------------------------------------------------
  console.log(`[步骤 3/6] 检查 /robots.txt、/sitemap.xml 与 404 响应...`);
  const robotsUrl = `${SITE_ORIGIN}/robots.txt?_t=${Date.now()}`;
  const sitemapUrl = `${SITE_ORIGIN}/sitemap.xml?_t=${Date.now()}`;
  const notFoundUrl = `${SITE_ORIGIN}/__no_such_page__.html?_t=${Date.now()}`;

  let step3Failed = false;

  // 3.1 robots.txt
  try {
    const rRobots = await fetch(robotsUrl, { cache: 'no-store' });
    const robotsCt = rRobots.headers.get('content-type') || '(none)';
    const robotsText = await rRobots.text();
    const isTextPlain = robotsCt.toLowerCase().includes('text/plain');
    const hasSitemapRef = robotsText.includes('Sitemap:');
    const robotsOk = rRobots.status === 200 && isTextPlain && hasSitemapRef;

    console.log(`  /robots.txt            : HTTP ${rRobots.status}, Content-Type: "${robotsCt}", 包含 "Sitemap:": ${hasSitemapRef ? 'YES' : 'NO'} (${robotsOk ? 'PASS' : 'FAIL'})`);
    if (!robotsOk) {
      step3Failed = true;
      allChecksPassed = false;
    }
  } catch (err) {
    console.error(`  ❌ /robots.txt 请求异常:`, err.message);
    step3Failed = true;
    allChecksPassed = false;
  }

  // 3.2 sitemap.xml
  try {
    const rSitemap = await fetch(sitemapUrl, { cache: 'no-store' });
    const sitemapCt = rSitemap.headers.get('content-type') || '(none)';
    const sitemapText = await rSitemap.text();
    const isXml = sitemapCt.toLowerCase().includes('xml');
    const locMatches = sitemapText.match(/<loc>/g) || [];
    const locCount = locMatches.length;
    const sitemapOk = rSitemap.status === 200 && isXml && locCount === 12;

    console.log(`  /sitemap.xml           : HTTP ${rSitemap.status}, Content-Type: "${sitemapCt}", 包含 <loc> 数量: ${locCount} (${sitemapOk ? 'PASS' : 'FAIL'})`);
    if (!sitemapOk) {
      step3Failed = true;
      allChecksPassed = false;
    }
  } catch (err) {
    console.error(`  ❌ /sitemap.xml 请求异常:`, err.message);
    step3Failed = true;
    allChecksPassed = false;
  }

  // 3.3 不存在页面 404 检测
  try {
    const rNotFound = await fetch(notFoundUrl, { cache: 'no-store' });
    const notFoundCt = rNotFound.headers.get('content-type') || '(none)';
    const notFoundOk = rNotFound.status === 404;

    console.log(`  /__no_such_page__.html : HTTP ${rNotFound.status}, Content-Type: "${notFoundCt}" (${notFoundOk ? 'PASS' : 'FAIL'})`);
    if (!notFoundOk) {
      step3Failed = true;
      allChecksPassed = false;
    }
  } catch (err) {
    console.error(`  ❌ /__no_such_page__.html 请求异常:`, err.message);
    step3Failed = true;
    allChecksPassed = false;
  }

  if (step3Failed) {
    console.error(`\n❌ [步骤 3 失败退出] /robots.txt、/sitemap.xml 或 404 检测未满足要求。`);
    process.exit(1);
  }
  console.log('');

  // -------------------------------------------------------------
  // 4. Cloudflare Pages 响应头与缓存控制标头 (_headers 生效验证)
  // -------------------------------------------------------------
  console.log(`[步骤 4/6] 检查 Cloudflare Pages 响应头缓存策略...`);
  let step4Failed = false;

  const validateCacheControl = (cc, isAsset = true) => {
    if (!cc) return { ok: false, reason: 'Cache-Control 标头缺失' };
    const tokens = cc.trim().split(',').map((s) => s.trim().toLowerCase());
    const seen = new Set();
    for (const t of tokens) {
      if (seen.has(t)) {
        return { ok: false, reason: `出现重复指令 "${t}"` };
      }
      seen.add(t);
    }
    if (isAsset) {
      const hasPublic = tokens.includes('public');
      const hasMaxAge = tokens.includes('max-age=31536000');
      const hasImmutable = tokens.includes('immutable');
      if (!hasPublic || !hasMaxAge || !hasImmutable) {
        return { ok: false, reason: `缺少必要强缓存指令: "${cc}"` };
      }
    } else {
      const hasMustRevalidate = tokens.includes('must-revalidate');
      if (!hasMustRevalidate) {
        return { ok: false, reason: `缺少协商缓存指令 must-revalidate: "${cc}"` };
      }
    }
    return { ok: true, formatted: cc.trim() };
  };

  try {
    // 4.1 HTML 首页
    const htmlRes = await fetch(`${SITE_ORIGIN}/?_t=${Date.now()}`, { cache: 'no-store' });
    const htmlCc = htmlRes.headers.get('cache-control') || '';
    const htmlCheck = validateCacheControl(htmlCc, false);
    console.log(`  HTML 首页 Cache-Control : "${htmlCc}" (${htmlCheck.ok ? 'PASS' : 'FAIL: ' + htmlCheck.reason})`);
    if (!htmlCheck.ok) {
      step4Failed = true;
      allChecksPassed = false;
    }

    // 4.2 静态 CSS
    const cssRes = await fetch(`${SITE_ORIGIN}/assets/css/main.css?v=20261016p6final`, { cache: 'no-store' });
    const cssCc = cssRes.headers.get('cache-control') || '';
    const cssCheck = validateCacheControl(cssCc, true);
    console.log(`  静态 CSS Cache-Control  : "${cssCc}" (${cssCheck.ok ? 'PASS' : 'FAIL: ' + cssCheck.reason})`);
    if (!cssCheck.ok) {
      step4Failed = true;
      allChecksPassed = false;
    }

    // 4.3 静态 JS
    const jsRes = await fetch(`${SITE_ORIGIN}/assets/js/site.js?v=20261016p6final`, { cache: 'no-store' });
    const jsCc = jsRes.headers.get('cache-control') || '';
    const jsCheck = validateCacheControl(jsCc, true);
    console.log(`  静态 JS  Cache-Control  : "${jsCc}" (${jsCheck.ok ? 'PASS' : 'FAIL: ' + jsCheck.reason})`);
    if (!jsCheck.ok) {
      step4Failed = true;
      allChecksPassed = false;
    }
  } catch (err) {
    console.error(`  ❌ 标头检查异常:`, err.message);
    step4Failed = true;
    allChecksPassed = false;
  }

  if (step4Failed) {
    console.error(`\n❌ [步骤 4 失败退出] Cache-Control 标头未满足要求或出现重复值。`);
    process.exit(1);
  }
  console.log('');

  // -------------------------------------------------------------
  // 5. 无头浏览器真实交互验收 (JSON 数据加载、探索页抽屉、特写页视角)
  // -------------------------------------------------------------
  console.log(`[步骤 5/6] 运行 Headless Chrome 对线上站点进行功能验收...`);

  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${CDP_PORT}`,
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--window-size=1440,900'
  ]);

  let ws = null;
  try {
    for (let i = 0; i < 30; i++) {
      await sleep(200);
      try {
        const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
        const targets = await res.json();
        const page = targets.find((t) => t.type === 'page');
        if (page && page.webSocketDebuggerUrl) {
          ws = new WebSocket(page.webSocketDebuggerUrl);
          break;
        }
      } catch {}
    }
    if (!ws) throw new Error('未能连接到 Chrome CDP WebSocket 目标');
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
    const pollEval = async (expr, maxMs = 6000, stepMs = 250) => {
      const start = Date.now();
      while (Date.now() - start < maxMs) {
        try {
          const val = await evalInPage(expr);
          if (val) return val;
        } catch {}
        await sleep(stepMs);
      }
      return await evalInPage(expr);
    };

    await send('Page.enable');
    await send('Runtime.enable');

    // 5.1 天体页 JSON 数据加载验收
    await send('Page.navigate', { url: `${SITE_ORIGIN}/bodies.html` });
    const bodiesCheck = await pollEval(`(() => {
      const countEl = document.getElementById('count');
      const cards = document.querySelectorAll('.entry-card');
      if (cards.length > 5) {
        return { countText: countEl?.innerText?.trim(), cardCount: cards.length };
      }
      return null;
    })()`);
    console.log(`  天体页 (bodies.html) 数据加载: 统计文案 "${bodiesCheck?.countText}", 卡片数量 ${bodiesCheck?.cardCount} (${bodiesCheck?.cardCount > 0 ? 'PASS' : 'FAIL'})`);
    if (!bodiesCheck?.cardCount) allChecksPassed = false;

    // 5.2 术语页 JSON 数据加载验收
    await send('Page.navigate', { url: `${SITE_ORIGIN}/glossary.html` });
    const glossaryCheck = await pollEval(`(() => {
      const coverage = document.getElementById('coverage-core')?.innerText?.trim();
      const rows = document.querySelectorAll('#t-ent tr').length;
      if (rows > 5) {
        return { coverage, rows };
      }
      return null;
    })()`);
    console.log(`  术语页 (glossary.html) 数据加载: 统计文案 "${glossaryCheck?.coverage}", 数据行数 ${glossaryCheck?.rows} (${glossaryCheck?.rows > 0 ? 'PASS' : 'FAIL'})`);
    if (!glossaryCheck?.rows) allChecksPassed = false;

    // 5.3 探索页天体抽屉交互验收
    await send('Page.navigate', { url: `${SITE_ORIGIN}/explore.html` });
    await sleep(2000);
    const drawerOpenCheck = await pollEval(`(() => {
      const btn = document.getElementById('drawer-toggle-btn');
      if (btn) btn.click();
      return document.body.classList.contains('drawer-open') ? true : null;
    })()`, 5000, 300);

    await sleep(200);
    const drawerCloseCheck = await evalInPage(`(() => {
      const closeBtn = document.getElementById('drawer-close-btn');
      if (closeBtn) closeBtn.click();
      return !document.body.classList.contains('drawer-open');
    })()`);
    console.log(`  探索页 (explore.html) 抽屉交互: 展开成功: ${drawerOpenCheck ? 'YES' : 'NO'}, 关闭成功: ${drawerCloseCheck ? 'YES' : 'NO'} (${drawerOpenCheck && drawerCloseCheck ? 'PASS' : 'FAIL'})`);
    if (!drawerOpenCheck || !drawerCloseCheck) allChecksPassed = false;

    // 5.4 土星特写页视角切换交互验收
    await send('Page.navigate', { url: `${SITE_ORIGIN}/saturn.html` });
    await sleep(2000);
    const saturnTabCheck = await pollEval(`(() => {
      const tabs = Array.from(document.querySelectorAll('.view-tab-btn'));
      if (tabs.length < 2) return null;
      const secondTab = tabs[1];
      secondTab.click();
      if (secondTab.getAttribute('aria-pressed') === 'true') {
        return {
          ok: true,
          activeTab: secondTab.innerText.trim(),
          isPressed: true
        };
      }
      return null;
    })()`, 5000, 300);
    console.log(`  土星特写页 (saturn.html) 视角切换: 激活标签 "${saturnTabCheck?.activeTab}", aria-pressed=${saturnTabCheck?.isPressed} (${saturnTabCheck?.isPressed ? 'PASS' : 'FAIL'})`);
    if (!saturnTabCheck?.isPressed) allChecksPassed = false;

  } catch (err) {
    console.error(`  ❌ 浏览器功能验收失败:`, err.message);
    allChecksPassed = false;
  } finally {
    if (ws) ws.close();
    chromeProc.kill();
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
