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

const tempProfile = path.join(root, '.chrome-temp-lede-' + Date.now());
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
const viewports = [1440, 768, 375];

const results = [];

for (const p of pages) {
  for (const vp of viewports) {
    await send('Emulation.setDeviceMetricsOverride', { width: vp, height: 900, deviceScaleFactor: 1, mobile: vp < 768 });
    await send('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/${p}` });
    await sleep(600);

    const ledeStats = await evalCode(`(() => {
      const lede = document.querySelector('.feature-lede');
      if (!lede) return { count: 0, text: '', lines: 0, lastLine: '' };
      
      const range = document.createRange();
      range.selectNodeContents(lede);
      const rects = range.getClientRects();
      if (rects.length === 0) return { count: 0, text: '', lines: 0, lastLine: '' };
      
      // Group characters by line rect top
      const lineMap = new Map();
      const text = lede.textContent.trim();
      let nodeOffset = 0;
      
      for (let i = 0; i < lede.childNodes.length; i++) {
        const node = lede.childNodes[i];
        if (node.nodeType === 3) {
          const str = node.textContent;
          for (let j = 0; j < str.length; j++) {
            const char = str[j];
            if (/\\s/.test(char) && lineMap.size === 0) continue;
            const r = document.createRange();
            r.setStart(node, j);
            r.setEnd(node, j + 1);
            const cr = r.getClientRects()[0];
            if (cr) {
              const topKey = Math.round(cr.top);
              // find existing key within 4px
              let matchedKey = null;
              for (const k of lineMap.keys()) {
                if (Math.abs(k - topKey) <= 4) {
                  matchedKey = k;
                  break;
                }
              }
              const targetKey = matchedKey !== null ? matchedKey : topKey;
              if (!lineMap.has(targetKey)) lineMap.set(targetKey, []);
              lineMap.get(targetKey).push(char);
            }
          }
        }
      }

      const lines = Array.from(lineMap.values()).map(chars => chars.join(''));
      const lastLine = lines.length > 0 ? lines[lines.length - 1] : '';
      return {
        linesCount: lines.length,
        lines,
        lastLineChars: lastLine.length,
        lastLine,
      };
    })()`);

    results.push({
      page: p,
      vp,
      linesCount: ledeStats.linesCount,
      lastLineChars: ledeStats.lastLineChars,
      lastLine: ledeStats.lastLine,
      pass: ledeStats.lastLineChars >= 4,
    });
  }
}

console.table(results);

ws.close();
chromeProcess.kill();
server.close();
await sleep(500);
try {
  fs.rmSync(tempProfile, { recursive: true, force: true });
} catch {}
