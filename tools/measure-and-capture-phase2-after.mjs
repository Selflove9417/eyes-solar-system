import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const HTTP_PORT = 8894;
const CDP_PORT = 9448;
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

const tempProfile = path.join(root, '.chrome-temp-profile-phase2-after-' + Date.now());
fs.mkdirSync(tempProfile, { recursive: true });

const chromeProcess = spawn(CHROME_PATH, [
  '--headless=new',
  `--remote-debugging-port=${CDP_PORT}`,
  '--disable-gpu',
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

const evaluate = async (expression) => {
  const res = await sendCdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.text || 'Evaluate failed');
  }
  return res.result.value;
};

await sendCdp('Runtime.enable');
await sendCdp('Page.enable');

const outDir = path.join(root, 'artifacts/ui_phase2/after');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const brainDir = 'C:\\Users\\lenovo\\.gemini\\antigravity\\brain\\b1b8a890-db19-4087-bc0d-51de747efbad\\after';
if (!fs.existsSync(brainDir)) fs.mkdirSync(brainDir, { recursive: true });

const metricsReport = [];

async function captureShot(filename) {
  const shot = await sendCdp('Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(shot.data, 'base64');
  fs.writeFileSync(path.join(outDir, filename), buf);
  fs.writeFileSync(path.join(brainDir, filename), buf);
  console.log(`  📸 Saved screenshot: ${filename} (${Math.round(buf.length / 1024)} KB)`);
}

async function measurePage(name, action = null) {
  if (action) {
    await evaluate(action);
    await sleep(400);
  }

  const m = await evaluate(`(() => {
    const stage = document.getElementById('stage-wrapper');
    const iframe = document.getElementById('stage');
    const header = document.querySelector('.explore-header') || document.querySelector('header');
    const tip = document.getElementById('user-guide-tip');
    const theater = document.getElementById('story-theater-panel');
    const sidebar = document.querySelector('.side');
    const layout = document.getElementById('explore-layout');
    const isImmersive = document.body.classList.contains('stage-immersive-mode');
    const isSidebarCollapsed = layout ? layout.classList.contains('sidebar-collapsed') : false;
    const sRect = stage ? stage.getBoundingClientRect() : null;
    const ifRect = iframe ? iframe.getBoundingClientRect() : null;
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const scrollW = document.documentElement.scrollWidth;
    const hasHorizontalOverflow = scrollW > vw;

    return {
      name,
      viewport: { w: vw, h: vh },
      hasHorizontalOverflow,
      scrollWidth: scrollW,
      isSidebarCollapsed,
      isImmersive,
      stageTop: sRect ? Math.round(sRect.top + window.scrollY) : null,
      stageHeight: sRect ? Math.round(sRect.height) : null,
      stageWidth: sRect ? Math.round(sRect.width) : null,
      stageVisibleHeight: sRect ? Math.round(Math.min(vh, sRect.bottom) - Math.max(0, sRect.top)) : null,
      stageVisibleWidth: sRect ? Math.round(Math.min(vw, sRect.right) - Math.max(0, sRect.left)) : null,
      iframeHeight: ifRect ? Math.round(ifRect.height) : null,
      iframeWidth: ifRect ? Math.round(ifRect.width) : null,
      theaterDisplay: theater ? getComputedStyle(theater).display : 'none',
      theaterHeight: theater && getComputedStyle(theater).display !== 'none' ? Math.round(theater.getBoundingClientRect().height) : 0,
      tipDisplay: tip ? getComputedStyle(tip).display : 'none',
      tipHeight: tip && getComputedStyle(tip).display !== 'none' ? Math.round(tip.getBoundingClientRect().height) : 0,
      headerHeight: header ? Math.round(header.getBoundingClientRect().height) : null,
      sidebarWidth: sidebar && getComputedStyle(sidebar).display !== 'none' ? Math.round(sidebar.getBoundingClientRect().width) : 0
    };
  })()`);

  metricsReport.push(m);
  console.log(`  Metrics for ${name}:`, m);
  return m;
}

// -------------------------------------------------------------
// 1. Desktop Tests (1280 x 800)
// -------------------------------------------------------------
console.log('\n=============================================');
console.log('🖥️ DESKTOP 1280x800 TESTING & MEASUREMENTS');
console.log('=============================================');

await sendCdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

// 1.1 Home
await sendCdp('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/index.html` });
await sleep(1500);
await measurePage('home-1280');
await captureShot('phase2-after-home-1280.png');

// 1.2 Explore Roam (Default: Sidebar Expanded)
await sendCdp('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/explore.html` });
await sleep(1500);
await measurePage('explore-roam-default-1280');
await captureShot('phase2-after-explore-roam-1280.png');

// 1.3 Explore Roam (Sidebar Collapsed via Toggle Button)
await measurePage('explore-roam-sidebar-collapsed-1280', `(() => {
  document.getElementById('sidebar-toggle-btn').click();
})()`);
await captureShot('phase2-after-explore-sidebar-collapsed-1280.png');

// Test reopening sidebar
await evaluate(`(() => {
  document.getElementById('sidebar-reopen-btn').click();
})()`);
await sleep(300);

// 1.4 Explore In-Page Immersive Mode
await measurePage('explore-roam-immersive-1280', `(() => {
  document.getElementById('immersive-mode-btn').click();
})()`);
await captureShot('phase2-after-explore-immersive-1280.png');

// Exit immersive mode
await evaluate(`(() => {
  document.getElementById('exit-immersive-btn').click();
})()`);
await sleep(300);

// 1.5 Explore Cassini Theater
await sendCdp('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/explore.html?story=cassini` });
await sleep(2000);
await measurePage('explore-theater-1280');
await captureShot('phase2-after-explore-theater-1280.png');

// -------------------------------------------------------------
// 2. Mobile Tests (390 x 844)
// -------------------------------------------------------------
console.log('\n=============================================');
console.log('📱 MOBILE 390x844 TESTING & MEASUREMENTS');
console.log('=============================================');

await sendCdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

// 2.1 Home 390
await sendCdp('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/index.html` });
await sleep(1500);
await measurePage('home-390');
await captureShot('phase2-after-home-390.png');

// 2.2 Explore Roam 390
await sendCdp('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/explore.html` });
await sleep(1500);
await measurePage('explore-roam-390');
await captureShot('phase2-after-explore-roam-390.png');

// 2.3 Explore Cassini Theater 390
await sendCdp('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/explore.html?story=cassini` });
await sleep(2000);
await measurePage('explore-theater-390');
await captureShot('phase2-after-explore-theater-390.png');

// -------------------------------------------------------------
// Summary & Output
// -------------------------------------------------------------
console.log('\n=============================================');
console.log('📊 PHASE 2 OPTIMIZED MEASUREMENT SUMMARY:');
console.log('=============================================');
console.table(metricsReport);

fs.writeFileSync(path.join(outDir, 'phase2-after-metrics.json'), JSON.stringify(metricsReport, null, 2), 'utf8');
fs.writeFileSync(path.join(brainDir, 'phase2-after-metrics.json'), JSON.stringify(metricsReport, null, 2), 'utf8');

ws.close();
chromeProcess.kill();
server.close();
try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch {}
console.log('\n✅ Phase 2 After measurements and screenshots completed.');
process.exit(0);
