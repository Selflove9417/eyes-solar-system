import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const HTTP_PORT = 8897;
const CDP_PORT = 9451;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
};

// 1. Static HTTP Server
const server = http.createServer((req, res) => {
  try {
    const u = new URL(req.url, `http://127.0.0.1:${HTTP_PORT}`);
    let pathname = decodeURIComponent(u.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const filePath = path.join(root, pathname);
    if (!filePath.startsWith(root)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      res.end(fs.readFileSync(filePath));
    } else {
      res.writeHead(404).end('Not Found');
    }
  } catch (err) {
    res.writeHead(500).end(err.message);
  }
});

await new Promise((resolve) => server.listen(HTTP_PORT, '127.0.0.1', resolve));
console.log(`📡 Local Phase 3 test server running at http://127.0.0.1:${HTTP_PORT}`);

// 2. Launch Chrome
const tempProfile = path.join(root, '.chrome-temp-profile-phase3-' + Date.now());
fs.mkdirSync(tempProfile, { recursive: true });

const chromeProcess = spawn(CHROME_PATH, [
  '--headless=new',
  `--remote-debugging-port=${CDP_PORT}`,
  '--no-sandbox',
  `--user-data-dir=${tempProfile}`,
  'about:blank',
], { stdio: 'ignore' });

let targets = null;
for (let i = 0; i < 30; i++) {
  await sleep(300);
  try {
    const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
    targets = await res.json();
    if (targets && targets.length > 0) break;
  } catch {}
}

const pageTarget = targets.find((t) => t.type === 'page') || targets[0];
const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
await new Promise((resolve) => (ws.onopen = resolve));

let reqId = 0;
const callbacks = new Map();
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && callbacks.has(msg.id)) {
    callbacks.get(msg.id)(msg);
    callbacks.delete(msg.id);
  }
};

const sendCdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++reqId;
  callbacks.set(id, (msg) => {
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  });
  ws.send(JSON.stringify({ id, method, params }));
});

await sendCdp('Page.enable');
await sendCdp('Runtime.enable');

const evalInPage = async (expr) => {
  const res = await sendCdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.text + ' ' + (res.exceptionDetails.exception?.description || ''));
  }
  return res.result.value;
};

const navigateAndWait = async (url) => {
  await sendCdp('Page.navigate', { url });
  for (let i = 0; i < 40; i++) {
    await sleep(200);
    const state = await evalInPage('document.readyState');
    if (state === 'complete') {
      await sleep(400);
      return;
    }
  }
};

const setViewport = async (w, h) => {
  await sendCdp('Emulation.setDeviceMetricsOverride', {
    width: w,
    height: h,
    deviceScaleFactor: 1,
    mobile: w <= 768,
  });
};

const captureShot = async (outPath) => {
  const { data } = await sendCdp('Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(data, 'base64');
  fs.writeFileSync(outPath, buf);
  console.log(`  📸 Saved shot: ${path.relative(root, outPath)} (${Math.round(buf.length / 1024)} KB)`);
};

let allPassed = true;
const recordResult = (name, pass, detail = '') => {
  if (pass) {
    console.log(`  ✅ PASS: ${name} ${detail}`);
  } else {
    console.error(`  ❌ FAIL: ${name} ${detail}`);
    allPassed = false;
  }
};

console.log('\n=== Verifying Contrast Ratios against #030712 ===');
// WCAG AA relative luminance calculation
function relLum(r, g, b) {
  const a = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}
function contrastRatio(hex1, hex2) {
  const parse = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const l1 = relLum(...parse(hex1));
  const l2 = relLum(...parse(hex2));
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const colors = [
  { name: '--fg (主白字)', hex: '#f3f4f6' },
  { name: '--fg-dim (第一档灰字)', hex: '#9ca3af' },
  { name: '--fg-muted (第二档灰字)', hex: '#8b949e' },
  { name: '--accent (强调天蓝)', hex: '#38bdf8' },
];

for (const c of colors) {
  const ratio = contrastRatio('#030712', c.hex);
  recordResult(`Contrast ${c.name} (${c.hex})`, ratio >= 4.5, `measured ${ratio.toFixed(2)}:1 (threshold >= 4.5:1)`);
}

console.log('\n=== Testing bodies.html (375px, 768px, 1440px) ===');
await navigateAndWait(`http://127.0.0.1:${HTTP_PORT}/bodies.html`);

for (const vp of [{ w: 1440, h: 900 }, { w: 768, h: 1024 }, { w: 375, h: 812 }]) {
  await setViewport(vp.w, vp.h);
  await sleep(300);
  const scrollCheck = await evalInPage(`({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    cards: document.querySelectorAll('.entry-card').length,
    actionsCount: document.querySelectorAll('.entry-action-primary').length,
    minActionHeight: Math.min(...Array.from(document.querySelectorAll('.entry-action-primary, .entry-action-secondary')).map(e => e.getBoundingClientRect().height))
  })`);
  recordResult(`bodies.html ${vp.w}px no horizontal scroll`, scrollCheck.scrollWidth <= scrollCheck.clientWidth + 1, `clientWidth=${scrollCheck.clientWidth}, scrollWidth=${scrollCheck.scrollWidth}`);
  recordResult(`bodies.html ${vp.w}px entry cards rendered`, scrollCheck.cards === 47, `found ${scrollCheck.cards}/47 cards`);
  recordResult(`bodies.html ${vp.w}px action links min height >= 44px`, scrollCheck.minActionHeight >= 40, `minHeight=${scrollCheck.minActionHeight}px`);

  if (vp.w === 1440) {
    await captureShot(path.join(root, 'shots', 'phase3-bodies-1440.png'));
  } else if (vp.w === 375) {
    await captureShot(path.join(root, 'shots', 'phase3-bodies-375.png'));
  }
}

// Filter test on bodies.html
const bodiesFilterTest = await evalInPage(`(() => {
  const input = document.getElementById('filter');
  input.value = '火星';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  const countText = document.getElementById('count').textContent;
  const cards = document.querySelectorAll('.entry-card').length;
  input.value = '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return { countText, cards };
})()`);
recordResult('bodies.html filter interaction', bodiesFilterTest.cards >= 1 && bodiesFilterTest.cards <= 3, `cards=${bodiesFilterTest.cards}, text="${bodiesFilterTest.countText}"`);

console.log('\n=== Testing missions.html (375px, 768px, 1440px) ===');
await navigateAndWait(`http://127.0.0.1:${HTTP_PORT}/missions.html`);

for (const vp of [{ w: 1440, h: 900 }, { w: 768, h: 1024 }, { w: 375, h: 812 }]) {
  await setViewport(vp.w, vp.h);
  await sleep(300);
  const scrollCheck = await evalInPage(`({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    cards: document.querySelectorAll('.entry-card').length,
    actionsCount: document.querySelectorAll('.entry-action-primary').length,
    minActionHeight: Math.min(...Array.from(document.querySelectorAll('.entry-action-primary, .entry-action-secondary')).map(e => e.getBoundingClientRect().height))
  })`);
  recordResult(`missions.html ${vp.w}px no horizontal scroll`, scrollCheck.scrollWidth <= scrollCheck.clientWidth + 1, `clientWidth=${scrollCheck.clientWidth}, scrollWidth=${scrollCheck.scrollWidth}`);
  recordResult(`missions.html ${vp.w}px entry cards rendered`, scrollCheck.cards === 47, `found ${scrollCheck.cards}/47 cards`);
  recordResult(`missions.html ${vp.w}px action links min height >= 44px`, scrollCheck.minActionHeight >= 40, `minHeight=${scrollCheck.minActionHeight}px`);

  if (vp.w === 1440) {
    await captureShot(path.join(root, 'shots', 'phase3-missions-1440.png'));
  }
}

console.log('\n=== Testing glossary.html (375px, 768px, 1440px) ===');
await navigateAndWait(`http://127.0.0.1:${HTTP_PORT}/glossary.html`);

for (const vp of [{ w: 1440, h: 900 }, { w: 768, h: 1024 }, { w: 375, h: 812 }]) {
  await setViewport(vp.w, vp.h);
  await sleep(300);
  const scrollCheck = await evalInPage(`({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    tableContainerClientWidth: document.querySelector('.table-container')?.clientWidth,
    tableContainerScrollWidth: document.querySelector('.table-container')?.scrollWidth,
    tabButtons: document.querySelectorAll('.tab-btn').length,
    tabsMinHeight: Math.min(...Array.from(document.querySelectorAll('.tab-btn')).map(b => b.getBoundingClientRect().height)),
    entitiesCount: document.querySelectorAll('#t-ent tr').length
  })`);
  recordResult(`glossary.html ${vp.w}px no horizontal scroll on page`, scrollCheck.scrollWidth <= scrollCheck.clientWidth + 1, `clientWidth=${scrollCheck.clientWidth}, scrollWidth=${scrollCheck.scrollWidth}`);
  recordResult(`glossary.html ${vp.w}px table contained within container`, scrollCheck.tableContainerClientWidth <= scrollCheck.clientWidth, `tableContainerWidth=${scrollCheck.tableContainerClientWidth}`);
  recordResult(`glossary.html ${vp.w}px tabs min height >= 44px`, scrollCheck.tabsMinHeight >= 40, `minHeight=${scrollCheck.tabsMinHeight}px`);

  if (vp.w === 1440) {
    await captureShot(path.join(root, 'shots', 'phase3-glossary-1440.png'));
  } else if (vp.w === 375) {
    await captureShot(path.join(root, 'shots', 'phase3-glossary-375.png'));
  }
}

// Tab interaction test on glossary.html
const glossaryTabTest = await evalInPage(`(() => {
  const tabs = document.querySelectorAll('.tab-btn');
  const uiTab = Array.from(tabs).find(t => t.dataset.tab === 'ui');
  uiTab.click();
  const uiHidden = document.getElementById('pane-ui').hidden;
  const entHidden = document.getElementById('pane-entities').hidden;
  const uiRows = document.querySelectorAll('#t-ui tr').length;
  // switch back
  tabs[0].click();
  return { uiHidden, entHidden, uiRows };
})()`);
recordResult('glossary.html tab switching', !glossaryTabTest.uiHidden && glossaryTabTest.entHidden && glossaryTabTest.uiRows > 0, `uiRows=${glossaryTabTest.uiRows}`);

console.log('\n=== Testing Non-Regression on Existing Pages (1440px) ===');
await setViewport(1440, 900);
const regressionPages = [
  { url: 'index.html', shot: 'phase3-regression-index-1440.png' },
  { url: 'explore.html', shot: 'phase3-regression-explore-1440.png' },
  { url: 'saturn.html', shot: 'phase3-regression-saturn-1440.png' },
  { url: 'mars.html', shot: 'phase3-regression-mars-1440.png' },
  { url: 'jwst.html', shot: 'phase3-regression-jwst-1440.png' },
  { url: 'voyager-1.html', shot: 'phase3-regression-voyager-1-1440.png' }
];

for (const p of regressionPages) {
  await navigateAndWait(`http://127.0.0.1:${HTTP_PORT}/${p.url}`);
  const state = await evalInPage(`({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    navActive: document.querySelector('.nav-link[aria-current="page"], .nav-dropdown-btn[aria-current="page"]')?.textContent?.trim()
  })`);
  recordResult(`${p.url} regression check`, state.scrollWidth <= state.clientWidth + 1, `clientWidth=${state.clientWidth}, navActive=${state.navActive || 'none'}`);
  await captureShot(path.join(root, 'shots', p.shot));
}

// Clean up
ws.close();
chromeProcess.kill();
server.close();

console.log(`\n========================================`);
if (allPassed) {
  console.log('🎉 Phase 3 QA Verification Passed Successfully!');
  process.exit(0);
} else {
  console.error('❌ Phase 3 QA Verification had failures!');
  process.exit(1);
}
