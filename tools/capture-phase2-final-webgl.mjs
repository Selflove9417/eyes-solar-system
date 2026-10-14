import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const HTTP_PORT = 8895;
const CDP_PORT = 9449;
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

const tempProfile = path.join(root, '.chrome-temp-profile-phase2-webgl-' + Date.now());
fs.mkdirSync(tempProfile, { recursive: true });

const chromeProcess = spawn(CHROME_PATH, [
  '--headless=new',
  `--remote-debugging-port=${CDP_PORT}`,
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-webgl',
  '--ignore-gpu-blocklist',
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

const outDir = path.join(root, 'artifacts/ui_phase2/final_webgl');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const brainDir = 'C:\\Users\\lenovo\\.gemini\\antigravity\\brain\\b1b8a890-db19-4087-bc0d-51de747efbad\\final_webgl';
if (!fs.existsSync(brainDir)) fs.mkdirSync(brainDir, { recursive: true });

async function captureShot(filename) {
  const shot = await sendCdp('Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(shot.data, 'base64');
  fs.writeFileSync(path.join(outDir, filename), buf);
  fs.writeFileSync(path.join(brainDir, filename), buf);
  console.log(`  📸 Saved WebGL shot: ${filename} (${Math.round(buf.length / 1024)} KB)`);
}

// 1. Home 1280
console.log('\n📸 Capturing Home 1280...');
await sendCdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await sendCdp('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/index.html` });
await sleep(2500);
await captureShot('phase2-webgl-home-1280.png');

// 2. Explore Roam Default 1280 (Wait 18s for WebGL)
console.log('\n📸 Capturing Explore Roam Default 1280 (waiting 18s for 3D shaders)...');
await sendCdp('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/explore.html` });
await sleep(18000);
await captureShot('phase2-webgl-explore-roam-1280.png');

// 3. Explore Sidebar Collapsed 1280
console.log('\n📸 Capturing Explore Sidebar Collapsed 1280 (Full Stage Width)...');
await evaluate(`(() => {
  document.getElementById('sidebar-toggle-btn').click();
})()`);
await sleep(1500);
await captureShot('phase2-webgl-explore-sidebar-collapsed-1280.png');

// Reopen sidebar
await evaluate(`(() => {
  document.getElementById('sidebar-reopen-btn').click();
})()`);
await sleep(500);

// 4. Explore In-Page Immersive Mode 1280
console.log('\n📸 Capturing Explore Immersive Mode 1280 (100vw x 100vh)...');
await evaluate(`(() => {
  document.getElementById('immersive-mode-btn').click();
})()`);
await sleep(1500);
await captureShot('phase2-webgl-explore-immersive-1280.png');

// Exit immersive
await evaluate(`(() => {
  document.getElementById('exit-immersive-btn').click();
})()`);
await sleep(500);

// 5. Explore Cassini Theater 1280 (Wait 20s for Cassini spacecraft & Saturn shaders)
console.log('\n📸 Capturing Cassini Theater 1280 (waiting 20s for Saturn and Cassini 3D assets)...');
await sendCdp('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/explore.html?story=cassini` });
await sleep(20000);
await captureShot('phase2-webgl-explore-theater-1280.png');

// 6. Home 390
console.log('\n📸 Capturing Home 390...');
await sendCdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await sendCdp('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/index.html` });
await sleep(2500);
await captureShot('phase2-webgl-home-390.png');

// 7. Explore Roam 390
console.log('\n📸 Capturing Explore Roam 390 (waiting 18s for WebGL)...');
await sendCdp('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/explore.html` });
await sleep(18000);
await captureShot('phase2-webgl-explore-roam-390.png');

// 8. Explore Cassini Theater 390
console.log('\n📸 Capturing Cassini Theater 390 (waiting 20s for WebGL)...');
await sendCdp('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/explore.html?story=cassini` });
await sleep(20000);
await captureShot('phase2-webgl-explore-theater-390.png');

ws.close();
chromeProcess.kill();
server.close();
try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch {}
console.log('\n✅ All 8 WebGL shots captured with real 3D solar system assets!');
process.exit(0);
