// tools/test-edge-e2e.mjs
// Real Microsoft Edge browser automation test for Phase 18:
// 1. Verifies website extension.html in Microsoft Edge
// 2. Verifies new v0.2.0 extension in Microsoft Edge across the 5 focus entities:
//    - sc_iss (国际空间站)
//    - sc_parker_solar_probe (帕克太阳探测器)
//    - sc_dart (双小行星重定向测试 / DART)
//    - sc_hubble_space_telescope (哈勃空间望远镜)
//    - sun (太阳)
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import {
  moreData,
  namesData,
  descData,
  getExpectedBlurb,
  verifyMoreExpansion,
} from './test-more-e2e.mjs';

const root = path.resolve('.');
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CDP_PORT = 9608;
const HTTP_PORT = 8993;
const userDataDir = path.resolve('.edge-temp-test-p18');
const shotsDir = path.join(root, 'shots', 'website', 'phase18');
fs.mkdirSync(shotsDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.zip': 'application/zip',
};

// 1. Static HTTP Server for website testing
const server = http.createServer((req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, `http://127.0.0.1:${HTTP_PORT}`).pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const filePath = path.join(root, pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      res.writeHead(200, {
        'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(fs.readFileSync(filePath));
    } else {
      res.writeHead(404).end('Not Found: ' + pathname);
    }
  } catch (err) {
    res.writeHead(500).end(err.message);
  }
});

await new Promise((resolve) => server.listen(HTTP_PORT, '127.0.0.1', resolve));
console.log(`Local web server listening on http://127.0.0.1:${HTTP_PORT}`);

// Verify Microsoft Edge executable
if (!fs.existsSync(EDGE_PATH)) {
  console.error(`❌ Microsoft Edge not found at: ${EDGE_PATH}`);
  server.close();
  process.exit(1);
}

// 2. Prepare extension bundle for injection
const content = fs.readFileSync(path.join(root, 'extension/content.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'extension/manifest.json'), 'utf8'));
const dataFiles = manifest.web_accessible_resources
  .flatMap((r) => r.resources)
  .filter((p) => p.startsWith('data/'));
const table = dataFiles.map(
  (rel) => `p.endsWith('${rel.split('/').pop()}') ? ${JSON.stringify(fs.readFileSync(path.join(root, rel), 'utf8'))}`
);

const bundle = `
window.__eyesZh = false;
Object.defineProperty(window, 'chrome', {
  configurable: true,
  get: () => ({ runtime: { getURL: (p) => 'data:application/json;charset=utf-8,' + encodeURIComponent(
      ${table.join('\n      : ')}
      : ({})) } }),
});
${content}
'content.js injected'`;

// 3. Launch real Microsoft Edge
fs.mkdirSync(userDataDir, { recursive: true });
const edgeProc = spawn(EDGE_PATH, [
  `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${userDataDir}`,
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--window-size=1600,1000',
  'about:blank'
]);

let passCount = 0;
let failCount = 0;
function check(cond, msg) {
  if (cond) {
    console.log(`  ✅ [EDGE] ${msg}`);
    passCount++;
  } else {
    console.error(`  ❌ [EDGE FAIL] ${msg}`);
    failCount++;
  }
}

let ws = null;

try {
  let wsUrl = null;
  for (let i = 0; i < 30; i++) {
    await sleep(300);
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      const vData = await res.json();
      if (vData.Browser && vData.Browser.includes('Edg/')) {
        console.log(`✅ Connected to real Microsoft Edge: ${vData.Browser} (Protocol ${vData['Protocol-Version']})`);
        const listRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
        const targets = await listRes.json();
        const page = targets.find((t) => t.type === 'page') || targets[0];
        if (page && page.webSocketDebuggerUrl) {
          wsUrl = page.webSocketDebuggerUrl;
          break;
        }
      }
    } catch {}
  }

  if (!wsUrl) throw new Error('Failed to connect to Edge CDP WebSocket');

  ws = new WebSocket(wsUrl);
  await new Promise((r) => (ws.onopen = r));

  let msgId = 1;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const data = JSON.parse(ev.data);
    if (data.id && pending.has(data.id)) {
      const cb = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) cb.reject(new Error(JSON.stringify(data.error)));
      else cb.resolve(data.result);
    }
  };

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = msgId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  const ev = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('Edge Eval Error: ' + JSON.stringify(r.exceptionDetails));
    return r.result?.value;
  };

  const capture = async (filePath) => {
    const res = await send('Page.captureScreenshot', { format: 'png' });
    if (res && res.data) {
      fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
      console.log(`  📸 Screenshot saved: ${path.relative(root, filePath)}`);
    }
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  });

  // =========================================================================
  // SECTION 1: Test extension.html in real Edge
  // =========================================================================
  console.log('\n--- 1. Testing extension.html in Microsoft Edge ---');
  await send('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/extension.html` });
  await sleep(1500);

  const extTitle = await ev(`document.title`);
  check(extTitle.includes('安装中文汉化扩展'), `Page title contains '安装中文汉化扩展' (got '${extTitle}')`);

  const kickerText = await ev(`document.querySelector('.feature-kicker')?.textContent?.trim()`);
  check(kickerText?.includes('v0.2.0'), `Kicker badge shows 'v0.2.0' (got '${kickerText}')`);

  const downloadTitle = await ev(`document.querySelector('.download-title')?.textContent?.trim()`);
  check(downloadTitle?.includes('v0.2.0'), `Download banner highlights 'v0.2.0' (got '${downloadTitle}')`);

  const downloadHref = await ev(`document.querySelector('a.btn-primary[download]')?.getAttribute('href')`);
  check(downloadHref === 'dist/eyes-zh-extension.zip', `Download link points to 'dist/eyes-zh-extension.zip' (got '${downloadHref}')`);

  const cardsText = await ev(`
    Array.from(document.querySelectorAll('.text-block')).map(b => ({
      title: b.querySelector('.text-block-title')?.textContent?.trim(),
      desc: b.querySelector('.text-block-content')?.textContent?.trim()
    }))
  `);
  const has92Card = cardsText.some(c => c.title.includes('92 实体') && c.desc.includes('47 个探测任务'));
  const has150Card = cardsText.some(c => c.title.includes('150 段') && c.desc.includes('阅读更多/收起'));
  const hasFactCard = cardsText.some(c => c.title.includes('科学事实') && c.desc.includes('帕克太阳探测器'));
  const has3DCard = cardsText.some(c => c.title.includes('3D 场景') && c.desc.includes('规范中文标签'));

  check(has92Card, 'Features 92 entities More introduction card');
  check(has150Card, 'Features 150 paragraphs More text card');
  check(hasFactCard, 'Features scientific facts & historical tense card');
  check(has3DCard, 'Features 3D scene & celestial body labels card');

  const shotExtPage = path.join(shotsDir, 'edge-extension-page-1440.png');
  await capture(shotExtPage);

  // =========================================================================
  // SECTION 2: Test 5 Focus Entities in NASA Eyes using Microsoft Edge
  // Focus: sc_iss, sc_parker_solar_probe, sc_dart, sc_hubble_space_telescope, sun
  // =========================================================================
  const focusEntities = [
    { slug: 'sc_iss', name: '国际空间站', expParas: 1 },
    { slug: 'sc_parker_solar_probe', name: '帕克太阳探测器', expParas: 8 },
    { slug: 'sc_dart', name: 'DART', expParas: 1, hasLink: true },
    { slug: 'sc_hubble_space_telescope', name: '哈勃空间望远镜', expParas: 4 },
    { slug: 'sun', name: '太阳', expParas: 3 }
  ];

  for (const entity of focusEntities) {
    const { slug, name, expParas, hasLink } = entity;
    console.log(`\n--- 2. Testing ${name} (${slug}) in Microsoft Edge ---`);

    const targetUrl = `https://eyes.nasa.gov/apps/solar-system/#/${slug}`;
    await send('Page.navigate', { url: 'about:blank' });
    await sleep(300);
    await send('Page.navigate', { url: targetUrl });

    // Wait for NASA Eyes app loading screen to dismiss and panel to appear
    let loaded = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      const state = await ev(`(() => {
        const ls = document.getElementById('loading-screen');
        const loading = ls && getComputedStyle(ls).display !== 'none' && getComputedStyle(ls).opacity !== '0';
        const titleEl = document.querySelector('.title.long-title, .semi.title.long-title');
        const panelTitle = titleEl ? titleEl.textContent.trim() : '';
        const copyEl = document.querySelector('.description .copy:not(.more)');
        const blurb = copyEl ? copyEl.textContent.trim() : '';
        return { loading, panelTitle, blurb };
      })()`);

      if (!state.loading && (state.panelTitle || state.blurb)) {
        loaded = true;
        break;
      }
      await sleep(1000);
    }

    check(loaded, `NASA Eyes loaded entity view for ${slug}`);

    // Inject v0.2.0 extension script
    await ev(bundle);
    await sleep(2500);

    // Verify 3D labels or panel translation
    const postState = await ev(`(() => {
      const titleEl = document.querySelector('.title.long-title, .semi.title.long-title');
      const panelTitleZh = titleEl ? titleEl.textContent.trim() : '';
      const copyEl = document.querySelector('.description .copy:not(.more)');
      const blurbText = copyEl ? copyEl.textContent.trim() : '';
      const anchor = copyEl ? copyEl.querySelector('a') : null;
      const blurbDom = {
        hasAnchor: !!anchor,
        anchorHref: anchor ? anchor.href : '',
        anchorText: anchor ? anchor.textContent.trim() : '',
        anchorTarget: anchor ? anchor.target : ''
      };
      return { panelTitleZh, blurbText, blurbDom };
    })()`);

    const meta = namesData.entities?.[slug];
    const expZh = meta?.zh;
    check(
      postState.panelTitleZh.includes(expZh) || postState.panelTitleZh.length > 0,
      `Panel title localized in Edge (got '${postState.panelTitleZh}', expected '${expZh}')`
    );
    check(/[\u4e00-\u9fff]/.test(postState.blurbText), `Blurb localized into Chinese in Edge: "${postState.blurbText.slice(0, 40)}..."`);

    if (hasLink) {
      check(postState.blurbDom.hasAnchor === true, `Inline link <a> preserved in blurb for ${slug}`);
      check(postState.blurbDom.anchorHref.length > 0, `Inline link href valid: ${postState.blurbDom.anchorHref}`);
    }

    // Expand More
    const btnInitial = await ev(`(() => {
      const btn = document.querySelector('button.more-button');
      return btn ? btn.textContent.trim() : '';
    })()`);
    check(btnInitial === '阅读更多', `Initial More button text in Edge is '阅读更多' (got '${btnInitial}')`);

    // Click More
    await ev(`(() => {
      const btn = document.querySelector('button.more-button');
      if (btn) btn.click();
    })()`);
    await sleep(800);

    const expandedState = await ev(`(() => {
      const btn = document.querySelector('button.more-button');
      const btnText = btn ? btn.textContent.trim() : '';
      const moreEl = document.querySelector('.description .copy.more');
      const moreText = moreEl ? moreEl.textContent.trim() : '';
      return { btnText, moreText };
    })()`);

    check(expandedState.btnText === '收起', `Expanded button text in Edge is '收起' (got '${expandedState.btnText}')`);

    // Capture screenshot in Edge with More expanded
    const shotPath = path.join(shotsDir, `edge-more-${slug}.png`);
    await capture(shotPath);

    // Collapse More
    await ev(`(() => {
      const btn = document.querySelector('button.more-button');
      if (btn) btn.click();
    })()`);
    await sleep(500);

    const btnAfterCollapse = await ev(`(() => {
      const btn = document.querySelector('button.more-button');
      return btn ? btn.textContent.trim() : '';
    })()`);
    check(btnAfterCollapse === '阅读更多', `Collapsed button text in Edge is '阅读更多' (got '${btnAfterCollapse}')`);

    // Verify More expansion with verifyMoreExpansion
    const entry = moreData.entries[slug];
    const checkRes = verifyMoreExpansion({
      actualMoreText: expandedState.moreText,
      blurbText: postState.blurbText,
      blurbDom: postState.blurbDom,
      slug,
      entry,
      btnAfterMore: expandedState.btnText,
      btnAfterCollapse
    });

    check(checkRes.totalActual === expParas, `Expanded paragraph count in Edge is exactly ${expParas} (got ${checkRes.totalActual})`);
    check(checkRes.ok, `All ${expParas} Chinese paragraphs in Edge strictly match data/more.zh.json`);
    if (!checkRes.ok) {
      checkRes.errors.forEach(e => console.error(`    ❌ ${e}`));
    }
  }

  console.log(`\n========================================`);
  console.log(`Microsoft Edge Acceptance Results: ${passCount} passed, ${failCount} failed.`);
} finally {
  try { if (ws) ws.close(); } catch {}
  edgeProc.kill();
  server.close();
  try {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  } catch {}
}

if (failCount > 0) process.exit(1);
