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

const tempProfile = path.join(root, '.chrome-temp-audit-' + Date.now());
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

const pages = [
  'index.html', 'explore.html', 'saturn.html', 'mars.html',
  'jwst.html', 'voyager-1.html', 'bodies.html', 'missions.html',
  'glossary.html', 'guide.html', 'extension.html', 'about.html'
];

const viewports = [
  { name: '375', width: 375, height: 812 },
  { name: '768', width: 768, height: 1024 },
  { name: '1440', width: 1440, height: 900 }
];

const auditResults = {};

for (const p of pages) {
  auditResults[p] = {};
  for (const vp of viewports) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 1,
      mobile: vp.width <= 768,
    });

    await send('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/${p}` });
    await sleep(600);

    const check = await evalCode(`(() => {
      const scrollWidth = document.documentElement.scrollWidth;
      const clientWidth = document.documentElement.clientWidth;
      const hasHScroll = scrollWidth > clientWidth;

      // Check text overflow
      const docW = window.innerWidth;
      const overflowingElements = [];
      document.querySelectorAll('*').forEach((el) => {
        if (['SCRIPT', 'STYLE', 'HEAD', 'META', 'LINK', 'TITLE'].includes(el.tagName)) return;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > docW + 1 && el.id !== 'cosmic-canvas') {
          // Check if parent has overflow-x auto/hidden
          let parent = el.parentElement;
          let handled = false;
          while (parent && parent !== document.body) {
            const style = window.getComputedStyle(parent);
            if (['auto', 'scroll', 'hidden'].includes(style.overflowX)) {
              handled = true;
              break;
            }
            parent = parent.parentElement;
          }
          if (!handled) {
            overflowingElements.push({
              tag: el.tagName,
              id: el.id,
              cls: el.className,
              right: Math.round(r.right),
              docW
            });
          }
        }
      });

      // Check orphan line / trailing characters in title and lede
      const orphanIssues = [];
      const titlesAndLedes = document.querySelectorAll('h1, .hero-title, .feature-title, .lede, .feature-lede, .explore-page-sub');
      titlesAndLedes.forEach((el) => {
        const text = el.innerText.trim();
        if (!text) return;
        // Approximate last line length using range bounding rects if multi-line
        const range = document.createRange();
        range.selectNodeContents(el);
        const rects = Array.from(range.getClientRects());
        if (rects.length > 1) {
          const lastRect = rects[rects.length - 1];
          const prevRect = rects[rects.length - 2];
          // If the last line is less than 35px wide or contains <= 2 chars
          if (lastRect.width < 35 && lastRect.width > 0) {
            orphanIssues.push({ tag: el.tagName, text: text.slice(-8), width: Math.round(lastRect.width) });
          }
        }
      });

      // Check touch targets (< 44px)
      // Check buttons, links, inputs, selects, summaries
      const smallTargets = [];
      const interactives = document.querySelectorAll('a, button, input, select, summary, [role="button"]');
      interactives.forEach((el) => {
        // skip hidden elements
        if (el.offsetParent === null && window.getComputedStyle(el).position !== 'fixed') return;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        
        // Inline text links inside long paragraphs are exempted by WCAG 2.5.5 if inline with text,
        // but let's measure standalone buttons/links and interactive controls
        const isInlineTextLink = el.tagName === 'A' && el.closest('p, li, td') && window.getComputedStyle(el).display === 'inline';

        if ((r.height < 44 || r.width < 44)) {
          smallTargets.push({
            tag: el.tagName,
            text: (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 20),
            id: el.id,
            cls: el.className,
            w: Math.round(r.width),
            h: Math.round(r.height),
            isInline: !!isInlineTextLink
          });
        }
      });

      return {
        scrollWidth,
        clientWidth,
        hasHScroll,
        overflowCount: overflowingElements.length,
        overflowingElements: overflowingElements.slice(0, 5),
        orphanIssues,
        smallTargetsCount: smallTargets.length,
        smallControls: smallTargets.filter(t => !t.isInline).slice(0, 5),
        smallInlineCount: smallTargets.filter(t => t.isInline).length
      };
    })()`);

    auditResults[p][vp.name] = check;
  }
}

console.log(JSON.stringify(auditResults, null, 2));

ws.close();
chromeProcess.kill();
server.close();
try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch {}

let totalViolations = 0;
for (const [page, viewports] of Object.entries(auditResults)) {
  for (const [vpName, check] of Object.entries(viewports)) {
    if (check.hasHScroll) {
      console.error(`❌ [${page} @ ${vpName}] Horizontal scroll detected: scrollWidth=${check.scrollWidth}, clientWidth=${check.clientWidth}`);
      totalViolations++;
    }
    if (check.overflowCount > 0) {
      console.error(`❌ [${page} @ ${vpName}] ${check.overflowCount} overflowing element(s) detected:`, check.overflowingElements);
      totalViolations++;
    }
    if (check.orphanIssues && check.orphanIssues.length > 0) {
      console.error(`❌ [${page} @ ${vpName}] Single-character orphan line wrap(s) detected:`, check.orphanIssues);
      totalViolations++;
    }
    if (check.smallControls && check.smallControls.length > 0) {
      console.error(`❌ [${page} @ ${vpName}] Standalone interactive controls smaller than 44px:`, check.smallControls);
      totalViolations++;
    }
  }
}

if (totalViolations > 0) {
  console.error(`\n❌ Full 12-page audit failed with ${totalViolations} layout/target violation(s).`);
  process.exit(1);
} else {
  console.log('\n✅ All 12 pages across 375/768/1440 passed all layout, overflow, orphan, and touch target checks!');
  process.exit(0);
}
