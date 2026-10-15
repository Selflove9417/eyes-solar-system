import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const CDP_PORT = 9454;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tempProfile = path.join(root, '.chrome-temp-profile-phase3b-' + Date.now());
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
    await sleep(250);
    const state = await evalInPage('document.readyState');
    if (state === 'complete') {
      await sleep(500);
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
  console.log(`Saved shot: ${path.relative(root, outPath)} (${Math.round(buf.length / 1024)} KB)`);
};

const ts = Date.now();
console.log(`Navigating to LIVE site with timestamp ${ts}...`);

// 1. Check bodies.html at 1440x900
await setViewport(1440, 900);
const bodiesUrl = `https://selflove9417.github.io/eyes-solar-system/bodies.html?v=${ts}`;
await navigateAndWait(bodiesUrl);
for (let i = 0; i < 30; i++) {
  const count = await evalInPage("document.querySelectorAll('.entry-card').length");
  if (count > 0) break;
  await sleep(300);
}

const bodiesLiveResult = await evalInPage(`(() => {
  const summary = document.querySelector('.entry-details summary');
  const summaryRect = summary?.getBoundingClientRect();
  const summaryBefore = summary ? window.getComputedStyle(summary, '::before') : null;
  const actions = document.querySelector('.entry-actions');
  const actionRect = actions?.getBoundingClientRect();
  const css = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(l => l.href);
  return {
    entryCards: document.querySelectorAll('.entry-card').length,
    summaryHeight: summaryRect?.height,
    chevronTransform: summaryBefore?.transform,
    actionsTop: actionRect?.top,
    cssVersion: css
  };
})()`);
console.log('LIVE bodies 1440 result:', bodiesLiveResult);
await captureShot(path.join(root, 'shots', 'phase3b-bodies-1440-live.png'));

// 2. Check glossary.html at 375x812
await setViewport(375, 812);
const glossaryUrl = `https://selflove9417.github.io/eyes-solar-system/glossary.html?v=${ts}`;
await navigateAndWait(glossaryUrl);
for (let i = 0; i < 30; i++) {
  const count = await evalInPage("document.querySelectorAll('#t-ent tr').length");
  if (count > 0) break;
  await sleep(300);
}

const glossaryLiveResult = await evalInPage(`(() => {
  const colIdTh = document.querySelector('th.col-id');
  const colIdTd = document.querySelector('td.col-id');
  const table = document.querySelector('.table-container table');
  const tableContainer = document.querySelector('.table-container');
  const mono = document.querySelector('td.mono');
  return {
    colIdThDisplay: colIdTh ? window.getComputedStyle(colIdTh).display : null,
    colIdTdDisplay: colIdTd ? window.getComputedStyle(colIdTd).display : null,
    monoColor: mono ? window.getComputedStyle(mono).color : null,
    monoFontSize: mono ? window.getComputedStyle(mono).fontSize : null,
    containerClientWidth: tableContainer?.clientWidth,
    pageClientWidth: document.documentElement.clientWidth,
    pageScrollWidth: document.documentElement.scrollWidth,
    entitiesRows: document.querySelectorAll('#t-ent tr').length
  };
})()`);
console.log('LIVE glossary 375 result:', glossaryLiveResult);
await captureShot(path.join(root, 'shots', 'phase3b-glossary-375-live.png'));

ws.close();
chromeProcess.kill();
console.log('Live phase3b verification completed successfully.');
