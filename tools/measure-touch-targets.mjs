import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve('.');
const HTTP_PORT = 8899;
const CDP_PORT = 9456;
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
};

const server = http.createServer((req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1:' + HTTP_PORT).pathname);
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

const tempProfile = path.join(root, '.chrome-temp-measure-' + Date.now());
fs.mkdirSync(tempProfile, { recursive: true });

const chromeProcess = spawn(CHROME_PATH, [
  '--headless=new',
  '--remote-debugging-port=' + CDP_PORT,
  '--no-sandbox',
  '--user-data-dir=' + tempProfile,
  'about:blank',
], { stdio: 'ignore' });

let targets = null;
for (let i = 0; i < 30; i++) {
  await sleep(300);
  try {
    const res = await fetch('http://127.0.0.1:' + CDP_PORT + '/json/list');
    targets = await res.json();
    if (targets && targets.length > 0) break;
  } catch {}
}

const pageTarget = targets.find((t) => t.type === 'page') || targets[0];
const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
await new Promise((resolve) => ws.onopen = resolve);

let idCounter = 1;
const callbacks = new Map();

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.id && callbacks.has(data.id)) {
    const cb = callbacks.get(data.id);
    callbacks.delete(data.id);
    if (data.error) cb.reject(new Error(JSON.stringify(data.error)));
    else cb.resolve(data.result);
  }
};

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = idCounter++;
    callbacks.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evalCode(expression) {
  const res = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  return res.result?.value;
}

await send('Page.enable');
await send('Runtime.enable');

const pages = ['saturn.html', 'mars.html', 'jwst.html', 'voyager-1.html'];

for (const p of pages) {
  console.log(`\n================ ${p} (1440x900) ================`);
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/${p}` });
  await sleep(1200);

  const breakdown = await evalCode(`(() => {
    function inspect(selector, category) {
      return Array.from(document.querySelectorAll(selector)).map(el => {
        const r = el.getBoundingClientRect();
        return {
          category,
          text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 30),
          w: Math.round(r.width * 10) / 10,
          h: Math.round(r.height * 10) / 10,
          pass44: r.height >= 43.5,
        };
      });
    }

    return [
      ...inspect('.site-header .brand', '导航:品牌Logo'),
      ...inspect('.site-header .nav-link', '导航:菜单项'),
      ...inspect('.site-header .nav-toggle', '导航:移动切换按钮'),
      ...inspect('.view-tab-btn', '视角标签'),
      ...inspect('.feature-stage-bar a', '视窗工具链接(官方站点)'),
      ...inspect('.btn-theater-primary', '剧场/漫游主按钮'),
      ...inspect('.feature-more-grid .flagship-card', '旗舰互链卡片'),
      ...inspect('.feature-source a', '数据出处署名链接'),
    ];
  })()`);

  console.table(breakdown);
}

ws.close();
chromeProcess.kill();
server.close();
await sleep(500);
try {
  fs.rmSync(tempProfile, { recursive: true, force: true });
} catch {}
