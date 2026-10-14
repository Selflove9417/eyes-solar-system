import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const HTTP_PORT = 8896;
const CDP_PORT = 9450;
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
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream' });
      res.end(fs.readFileSync(filePath));
    } else {
      res.writeHead(404).end('Not Found');
    }
  } catch (err) {
    res.writeHead(500).end(err.message);
  }
});

await new Promise((resolve) => server.listen(HTTP_PORT, '127.0.0.1', resolve));

const tempProfile = path.join(root, '.chrome-temp-profile-probe-theater-' + Date.now());
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

await sendCdp('Runtime.enable');
await sendCdp('Page.enable');
await sendCdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await sendCdp('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/explore.html?story=cassini` });
await sleep(1500);

const details = await sendCdp('Runtime.evaluate', {
  expression: `(() => {
    const panel = document.getElementById('story-theater-panel');
    const header = panel.querySelector('.theater-header');
    const titleGroup = panel.querySelector('.theater-title-group');
    const statusStrip = panel.querySelector('.theater-status-strip');
    const exitBtn = document.getElementById('theater-exit-btn');
    const toolbar = panel.querySelector('.theater-toolbar-row');
    const stepper = document.getElementById('theater-stepper');
    const controls = panel.querySelector('.theater-controls-bar');
    const metaBar = document.getElementById('theater-meta-bar');

    const toRect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { width: Math.round(r.width), height: Math.round(r.height), top: Math.round(r.top) };
    };

    return {
      panel: toRect(panel),
      header: toRect(header),
      titleGroup: toRect(titleGroup),
      statusStrip: toRect(statusStrip),
      exitBtn: toRect(exitBtn),
      toolbar: toRect(toolbar),
      stepper: toRect(stepper),
      controls: toRect(controls),
      metaBar: toRect(metaBar),
    };
  })()`,
  returnByValue: true
});

console.log('Mobile 390 Theater DOM Breakdown:');
console.log(JSON.stringify(details.result.value, null, 2));

ws.close();
chromeProcess.kill();
server.close();
try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch {}
process.exit(0);
