import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const CDP_PORT = 9443;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tempProfile = path.resolve('.chrome-temp-profile-live-' + Date.now());
fs.mkdirSync(tempProfile, { recursive: true });

const chrome = spawn(CHROME_PATH, [
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
await new Promise((r) => (ws.onopen = r));

let id = 0;
const callbacks = new Map();
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && callbacks.has(msg.id)) {
    callbacks.get(msg.id)(msg);
    callbacks.delete(msg.id);
  }
};

const send = (method, params = {}) => new Promise((resolve, reject) => {
  const myId = ++id;
  callbacks.set(myId, (msg) => {
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  });
  ws.send(JSON.stringify({ id: myId, method, params }));
});

await send('Runtime.enable');
await send('Page.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });

await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

import { SITE_ORIGIN } from './site-config.mjs';

const liveUrl = `${SITE_ORIGIN}/index.html?v=${Date.now()}`;
console.log('Navigating to LIVE URL:', liveUrl);
await send('Page.navigate', { url: liveUrl });
await sleep(3500);

const liveData = await send('Runtime.evaluate', {
  expression: `(() => {
    const el = document.querySelector('.hero-lead');
    if (!el) return { error: 'Element .hero-lead not found' };
    const rect = el.getBoundingClientRect();
    const cs = window.getComputedStyle(el);
    const parent = el.parentElement;
    const parentRect = parent ? parent.getBoundingClientRect() : null;

    // Detect actual line breaks rendered on screen
    const range = document.createRange();
    range.selectNodeContents(el);
    const lines = [];
    let currentY = -1;
    let currentLine = '';
    const text = el.textContent;
    for (let i = 0; i < text.length; i++) {
      range.setStart(el.firstChild, i);
      range.setEnd(el.firstChild, i + 1);
      const r = range.getBoundingClientRect();
      if (Math.abs(r.top - currentY) > 4) {
        if (currentLine) lines.push(currentLine);
        currentLine = text[i];
        currentY = r.top;
      } else {
        currentLine += text[i];
      }
    }
    if (currentLine) lines.push(currentLine);

    // CSS href check
    const cssLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(l => l.href);

    return {
      elWidth: rect.width,
      elHeight: rect.height,
      computedMaxWidth: cs.maxWidth,
      computedWidth: cs.width,
      computedWhiteSpace: cs.whiteSpace,
      computedTextWrap: cs.textWrap,
      computedFontSize: cs.fontSize,
      parentWidth: parentRect ? parentRect.width : null,
      fullText: el.textContent,
      lines: lines,
      lineCount: lines.length,
      lastLine: lines[lines.length - 1],
      lastLineLength: (lines[lines.length - 1] || '').length,
      cssLinks
    };
  })()`,
  returnByValue: true
});

console.log('\n--- Live Measurement Results ---');
console.log(JSON.stringify(liveData.result.value, null, 2));

// Save live screenshot
const shot = await send('Page.captureScreenshot', {
  format: 'png',
  clip: { x: 0, y: 0, width: 1440, height: 900, scale: 1 }
});
const buf = Buffer.from(shot.data, 'base64');
fs.writeFileSync(path.resolve('shots/phase25-hero-1440-live.png'), buf);
console.log('Saved shots/phase25-hero-1440-live.png');

ws.close();
chrome.kill('SIGKILL');
try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch {}
