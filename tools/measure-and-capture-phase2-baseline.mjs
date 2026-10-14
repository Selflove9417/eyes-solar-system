import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const HTTP_PORT = 8893;
const CDP_PORT = 9447;
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

const tempProfile = path.join(root, '.chrome-temp-profile-phase2-base-' + Date.now());
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

const outDir = path.join(root, 'artifacts/ui_phase2/baseline');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const brainDir = 'C:\\Users\\lenovo\\.gemini\\antigravity\\brain\\b1b8a890-db19-4087-bc0d-51de747efbad\\baseline';
if (!fs.existsSync(brainDir)) fs.mkdirSync(brainDir, { recursive: true });

const tasks = [
  { name: 'phase2-before-home-1280.png', width: 1280, height: 800, mobile: false, url: `http://127.0.0.1:${HTTP_PORT}/index.html`, waitMs: 1500 },
  { name: 'phase2-before-explore-1280.png', width: 1280, height: 800, mobile: false, url: `http://127.0.0.1:${HTTP_PORT}/explore.html`, waitMs: 1500 },
  { name: 'phase2-before-theater-1280.png', width: 1280, height: 800, mobile: false, url: `http://127.0.0.1:${HTTP_PORT}/explore.html?story=cassini`, waitMs: 2000 },
  { name: 'phase2-before-home-390.png', width: 390, height: 844, mobile: true, url: `http://127.0.0.1:${HTTP_PORT}/index.html`, waitMs: 1500 },
  { name: 'phase2-before-explore-390.png', width: 390, height: 844, mobile: true, url: `http://127.0.0.1:${HTTP_PORT}/explore.html`, waitMs: 1500 },
  { name: 'phase2-before-theater-390.png', width: 390, height: 844, mobile: true, url: `http://127.0.0.1:${HTTP_PORT}/explore.html?story=cassini`, waitMs: 2000 },
];

const baselineMetrics = [];

for (const t of tasks) {
  console.log(`\n📸 Capturing ${t.name} (${t.width}x${t.height}, mobile=${t.mobile})...`);
  await sendCdp('Emulation.setDeviceMetricsOverride', {
    width: t.width,
    height: t.height,
    deviceScaleFactor: 1,
    mobile: t.mobile,
  });

  await sendCdp('Page.navigate', { url: t.url });
  await sleep(t.waitMs);

  const m = await evaluate(`(() => {
    const stage = document.getElementById('stage-wrapper');
    const iframe = document.getElementById('stage');
    const header = document.querySelector('.explore-header') || document.querySelector('header');
    const tip = document.getElementById('user-guide-tip');
    const theater = document.getElementById('story-theater-panel');
    const sidebar = document.querySelector('.side');
    const sRect = stage ? stage.getBoundingClientRect() : null;
    const ifRect = iframe ? iframe.getBoundingClientRect() : null;
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const scrollW = document.documentElement.scrollWidth;
    const hasHorizontalOverflow = scrollW > vw;

    return {
      viewport: { w: vw, h: vh },
      hasHorizontalOverflow,
      scrollWidth: scrollW,
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

  baselineMetrics.push({ file: t.name, ...m });
  console.log('  Metrics:', m);

  const shot = await sendCdp('Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(shot.data, 'base64');
  fs.writeFileSync(path.join(outDir, t.name), buf);
  fs.writeFileSync(path.join(brainDir, t.name), buf);
  console.log(`  Saved to ${t.name} (${Math.round(buf.length / 1024)} KB)`);
}

console.log('\n=============================================');
console.log('📊 PHASE 2 BASELINE METRICS:');
console.log('=============================================');
console.table(baselineMetrics);

fs.writeFileSync(path.join(outDir, 'phase2-baseline-metrics.json'), JSON.stringify(baselineMetrics, null, 2), 'utf8');
fs.writeFileSync(path.join(brainDir, 'phase2-baseline-metrics.json'), JSON.stringify(baselineMetrics, null, 2), 'utf8');

ws.close();
chromeProcess.kill();
server.close();
try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch {}
console.log('\n✅ Phase 2 baseline captured.');
process.exit(0);
