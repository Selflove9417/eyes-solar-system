// tools/test-edge-e2e.mjs
// Real Microsoft Edge browser automation test for Phase 18.1:
// 1. Verifies website extension.html in real Microsoft Edge
// 2. Extracts real Edge store ZIP (dist/eyes-zh-extension-edge-store.zip)
// 3. Loads the unpacked extension in real Microsoft Edge (--load-extension)
// 4. Verifies genuine Manifest V3 installation:
//    - Manifest version 0.2.0
//    - Automatic content script injection into eyes.nasa.gov (NO manual evaluation, NO mocking)
//    - Real chrome.runtime.getURL() loading of data/more.zh.json (92 entities)
//    - 3D scene celestial labels localized to Chinese
//    - Continuous SPA navigation across 5 focus entities:
//      * sc_iss (国际空间站)
//      * sc_parker_solar_probe (帕克太阳探测器)
//      * sc_dart (双小行星重定向测试 / DART)
//      * sc_hubble_space_telescope (哈勃空间望远镜)
//      * sun (太阳)
//    - Strict title matching (no loose fallback)
//    - DART inline link href and target="_blank" verification
//    - More expand/collapse interaction, exact paragraph counts, and zero English residue
//    - High-resolution screenshot capture and console error auditing.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { extractZipToDir } from './zip-util.mjs';
import {
  moreData,
  namesData,
  verifyMoreExpansion,
} from './test-more-e2e.mjs';

const root = path.resolve('.');
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CDP_PORT = 9622;
const HTTP_PORT = 8994;
const storeZip = path.join(root, 'dist', 'eyes-zh-extension-edge-store.zip');
const unpackedExtensionDir = path.join(root, '.edge-store-unpacked-live');
const userDataDir = path.join(root, '.edge-user-data-live');
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

// 1. Verify Microsoft Edge executable
if (!fs.existsSync(EDGE_PATH)) {
  console.error(`❌ Microsoft Edge not found at: ${EDGE_PATH}`);
  process.exit(1);
}

// 2. Unpack actual Edge store ZIP package
console.log('=== Phase 18.1: Truly Installed Edge Extension Verification ===\n');
console.log(`Unpacking Edge store ZIP: ${storeZip}`);
if (!fs.existsSync(storeZip)) {
  console.error(`❌ Store ZIP not found: ${storeZip}. Run node tools/pack-extension.mjs first.`);
  process.exit(1);
}

fs.rmSync(unpackedExtensionDir, { recursive: true, force: true });
fs.rmSync(userDataDir, { recursive: true, force: true });
extractZipToDir(fs.readFileSync(storeZip), unpackedExtensionDir);

const unpackedManifestPath = path.join(unpackedExtensionDir, 'manifest.json');
const unpackedManifest = JSON.parse(fs.readFileSync(unpackedManifestPath, 'utf8'));
console.log(`Unpacked manifest version: ${unpackedManifest.version}`);

// 3. Static HTTP Server for website testing
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

// 4. Launch real Microsoft Edge with the extension installed
fs.mkdirSync(userDataDir, { recursive: true });
const edgeProc = spawn(EDGE_PATH, [
  `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${userDataDir}`,
  `--disable-extensions-except=${unpackedExtensionDir}`,
  `--load-extension=${unpackedExtensionDir}`,
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
    console.log(`  ✅ [EDGE REAL EXT] ${msg}`);
    passCount++;
  } else {
    console.error(`  ❌ [EDGE REAL EXT FAIL] ${msg}`);
    failCount++;
  }
}

let ws = null;
const consoleErrors = [];

try {
  let wsUrl = null;
  for (let i = 0; i < 30; i++) {
    await sleep(300);
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      const vData = await res.json();
      if (vData.Browser && vData.Browser.includes('Edg/')) {
        console.log(`Connected to real Microsoft Edge: ${vData.Browser}`);
        const listRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
        const targets = await listRes.json();
        const page = targets.find((t) => t.type === 'page') || targets[0];
        if (page?.webSocketDebuggerUrl) {
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
  const extContexts = [];

  ws.onmessage = (ev) => {
    const data = JSON.parse(ev.data);
    if (data.method === 'Runtime.executionContextCreated') {
      const ctx = data.params.context;
      if (ctx.origin?.startsWith('chrome-extension://')) {
        extContexts.push(ctx.id);
      }
    }
    if (data.method === 'Runtime.consoleAPICalled') {
      const type = data.params.type;
      if (type === 'error') {
        const text = data.params.args?.map(a => a.value || a.description || '').join(' ') || '';
        consoleErrors.push(text);
      }
    }
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

  const ev = async (expression, contextId = null) => {
    const opts = { expression, returnByValue: true, awaitPromise: true };
    if (contextId) opts.contextId = contextId;
    const r = await send('Runtime.evaluate', opts);
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
  // STEP 1: Verify Manifest Version
  // =========================================================================
  console.log('\n--- 1. Verifying Unpacked Store Manifest ---');
  check(unpackedManifest.version === '0.2.0', `Store manifest version is exactly 0.2.0 (got '${unpackedManifest.version}')`);
  check(unpackedManifest.manifest_version === 3, 'Store manifest version is Manifest V3');
  check(!unpackedManifest.permissions || unpackedManifest.permissions.length === 0, 'Store manifest declares zero permissions');

  // =========================================================================
  // STEP 2: Test extension.html in real Edge
  // =========================================================================
  console.log('\n--- 2. Testing extension.html in Microsoft Edge ---');
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
  check(cardsText.some(c => c.title.includes('92 实体') && c.desc.includes('47 个探测任务')), 'Features 92 entities More introduction card');
  check(cardsText.some(c => c.title.includes('150 段') && c.desc.includes('阅读更多/收起')), 'Features 150 paragraphs More text card');
  check(cardsText.some(c => c.title.includes('科学事实') && c.desc.includes('帕克太阳探测器')), 'Features scientific facts & historical tense card');
  check(cardsText.some(c => c.title.includes('3D 场景') && c.desc.includes('规范中文标签')), 'Features 3D scene & celestial body labels card');

  await capture(path.join(shotsDir, 'edge-extension-page-1440.png'));

  // =========================================================================
  // STEP 3: Navigate to NASA Eyes & Verify Real Extension Auto-Injection
  // =========================================================================
  console.log('\n--- 3. Testing NASA Eyes Real Extension Auto-Injection & Resource Loading ---');
  await send('Page.navigate', { url: 'https://eyes.nasa.gov/apps/solar-system/#/sun' });

  // Wait for extension context to appear
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    if (extContexts.length > 0) break;
  }
  check(extContexts.length > 0, `Real extension isolated context detected in Edge (contexts count: ${extContexts.length})`);

  const extCtxId = extContexts[0];
  const extState = await ev(`(() => ({
    eyesZh: window.__eyesZh,
    hasRuntimeUrl: !!window.chrome?.runtime?.getURL,
    manifestVersion: window.chrome?.runtime?.getManifest?.()?.version
  }))()`, extCtxId);

  check(extState?.eyesZh === true, `Extension content.js automatically executed without manual injection (__eyesZh: ${extState?.eyesZh})`);
  check(extState?.manifestVersion === '0.2.0', `Extension runtime reports manifest version 0.2.0 (got '${extState?.manifestVersion}')`);

  // Verify real chrome.runtime.getURL() resource fetch
  const realResourceCheck = await ev(`(async () => {
    try {
      const url = chrome.runtime.getURL('data/more.zh.json');
      const res = await fetch(url);
      const json = await res.json();
      return {
        ok: res.ok,
        entriesCount: Object.keys(json.entries || {}).length,
        pspParas: json.entries?.sc_parker_solar_probe?.paragraphs?.length
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  })()`, extCtxId);

  check(
    realResourceCheck.ok && realResourceCheck.entriesCount === 92 && realResourceCheck.pspParas === 8,
    `chrome.runtime.getURL() loaded real extension data/more.zh.json (92 entities, PSP 8 paras)`
  );

  // =========================================================================
  // STEP 4: Verify 3D Scene Celestial Body Labels Localization in Real Edge
  // =========================================================================
  console.log('\n--- 4. Testing 3D Scene Celestial Body Labels in Microsoft Edge ---');
  let sceneLabels = [];
  for (let attempt = 0; attempt < 25; attempt++) {
    await sleep(1000);
    sceneLabels = await ev(`
      Array.from(document.querySelectorAll('.pioneer-label-div .text'))
        .map(el => el.textContent.trim())
        .filter(Boolean)
    `);
    const hanLabels = sceneLabels.filter(t => /[\u4e00-\u9fff]/.test(t));
    if (hanLabels.length > 0) break;
  }

  const chineseLabels = sceneLabels.filter(t => /[\u4e00-\u9fff]/.test(t));
  check(chineseLabels.length > 0, `3D scene celestial labels localized into Chinese (found: ${chineseLabels.slice(0, 8).join(', ')})`);
  await capture(path.join(shotsDir, 'edge-real-installed-3d-labels.png'));

  // =========================================================================
  // STEP 5: Continuous Route Transitions Across 5 Focus Entities
  // (sc_iss, sc_parker_solar_probe, sc_dart, sc_hubble_space_telescope, sun)
  // =========================================================================
  const focusEntities = [
    { slug: 'sc_iss', expZhTitle: '国际空间站', expParas: 1 },
    { slug: 'sc_parker_solar_probe', expZhTitle: '帕克太阳探测器', expParas: 8 },
    { slug: 'sc_dart', expZhTitle: '双小行星重定向测试', expParas: 1, hasLink: true, expectedHref: 'https://dart.jhuapl.edu/' },
    { slug: 'sc_hubble_space_telescope', expZhTitle: '哈勃空间望远镜', expParas: 4 },
    { slug: 'sun', expZhTitle: '太阳', expParas: 3 },
  ];

  for (let idx = 0; idx < focusEntities.length; idx++) {
    const entity = focusEntities[idx];
    const { slug, expZhTitle, expParas, hasLink, expectedHref } = entity;
    console.log(`\n--- 5.${idx + 1} Testing ${expZhTitle} (${slug}) via SPA route transition ---`);

    // Change route via location.hash
    await ev(`location.hash = '#/${slug}'`);

    // Wait for route to transition and panel to be rendered & localized
    let panelReady = false;
    let postState = null;

    for (let attempt = 0; attempt < 40; attempt++) {
      await sleep(1000);
      postState = await ev(`(() => {
        const ls = document.getElementById('loading-screen');
        const loading = ls && getComputedStyle(ls).display !== 'none' && getComputedStyle(ls).opacity !== '0';
        const titleEl = document.querySelector('.title.long-title, .semi.title.long-title');
        const panelTitleZh = titleEl ? titleEl.textContent.trim() : '';
        const copyEl = document.querySelector('.description .copy:not(.more)');
        const blurbText = copyEl ? copyEl.textContent.trim() : '';
        const anchor = copyEl ? copyEl.querySelector('a') : null;
        const moreBtn = document.querySelector('button.more-button');
        const moreBtnText = moreBtn ? moreBtn.textContent.trim() : '';
        const blurbDom = {
          hasAnchor: !!anchor,
          anchorHref: anchor ? anchor.href : '',
          anchorText: anchor ? anchor.textContent.trim() : '',
          anchorTarget: anchor ? anchor.target : ''
        };
        return { loading, panelTitleZh, blurbText, blurbDom, moreBtnText };
      })()`);

      // STRICT check: panelTitleZh MUST contain expZhTitle (no empty/fallback bypass)
      if (!postState.loading && postState.panelTitleZh.includes(expZhTitle) && postState.blurbText.length > 0) {
        panelReady = true;
        break;
      }
    }

    check(panelReady, `SPA transitioned to ${slug} and loaded localized panel`);
    check(
      postState.panelTitleZh.includes(expZhTitle),
      `STRICT panel title assertion: "${postState.panelTitleZh}" includes "${expZhTitle}"`
    );
    check(/[\u4e00-\u9fff]/.test(postState.blurbText), `Blurb localized into Chinese: "${postState.blurbText.slice(0, 35)}..."`);

    // DART specific hyperlink checks
    if (hasLink) {
      check(postState.blurbDom.hasAnchor === true, `DART blurb preserves <a> link`);
      check(postState.blurbDom.anchorTarget === '_blank', `DART link target is strictly '_blank' (got '${postState.blurbDom.anchorTarget}')`);
      check(postState.blurbDom.anchorHref.replace(/\/+$/, '') === expectedHref.replace(/\/+$/, ''), `DART link href strictly matches '${expectedHref}' (got '${postState.blurbDom.anchorHref}')`);
    }

    // Expand More
    check(postState.moreBtnText === '阅读更多', `Initial More button text in Edge is '阅读更多' (got '${postState.moreBtnText}')`);

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

    // Screenshot of expanded state
    await capture(path.join(shotsDir, `edge-real-installed-${slug}.png`));

    // Collapse More
    await ev(`(() => {
      const btn = document.querySelector('button.more-button');
      if (btn) btn.click();
    })()`);
    await sleep(600);

    const btnAfterCollapse = await ev(`(() => {
      const btn = document.querySelector('button.more-button');
      return btn ? btn.textContent.trim() : '';
    })()`);
    check(btnAfterCollapse === '阅读更多', `Collapsed button text in Edge is '阅读更多' (got '${btnAfterCollapse}')`);

    // Full text & paragraph verification with verifyMoreExpansion
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
    check(checkRes.ok, `All ${expParas} Chinese paragraphs strictly match data/more.zh.json with zero English sentence residue`);
    if (!checkRes.ok) {
      checkRes.errors.forEach(e => console.error(`    ❌ ${e}`));
    }
  }

  // =========================================================================
  // STEP 6: Console Error Auditing
  // =========================================================================
  console.log('\n--- 6. Console Error Audit ---');
  if (consoleErrors.length > 0) {
    console.log('  Captured console errors:', JSON.stringify(consoleErrors, null, 2));
  }
  const fatalErrors = consoleErrors.filter(e => !e.includes('favicon') && !e.includes('WebGL') && !e.includes('QQBrowser'));
  check(fatalErrors.length === 0, `Zero fatal JavaScript errors during Edge real extension execution (errors: ${fatalErrors.length})`);

  console.log(`\n========================================`);
  console.log(`Real Microsoft Edge Acceptance Results: ${passCount} passed, ${failCount} failed.`);
} finally {
  try { if (ws) ws.close(); } catch {}
  edgeProc.kill();
  server.close();
  await sleep(1000);
  try { fs.rmSync(unpackedExtensionDir, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
}

if (failCount > 0) process.exit(1);
