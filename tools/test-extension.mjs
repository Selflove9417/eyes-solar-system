// End-to-end test of extension/content.js against the live NASA page.
//
// Headless Chrome ignores --load-extension, so this injects the shipped script
// verbatim once the page is loaded — the same moment a document_idle content
// script runs — and stubs only chrome.runtime.getURL, which merely resolves the
// extension's own asset paths.
//   node tools/test-extension.mjs [route]
import { readFileSync, writeFileSync } from 'node:fs';

const PORT = process.env.CDP_PORT || '9333';
const route = process.argv[2] || 'mars';
const root = new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const content = readFileSync(root + 'extension/content.js', 'utf8');
// Serve exactly the files the manifest declares, so the harness cannot drift from
// what the real extension loads.
const manifest = JSON.parse(readFileSync(root + 'extension/manifest.json', 'utf8'));
const dataFiles = manifest.web_accessible_resources.flatMap((r) => r.resources)
  .filter((p) => p.startsWith('data/'));
const table = dataFiles.map((rel) =>
  `p.endsWith('${rel.split('/').pop()}') ? ${JSON.stringify(readFileSync(root + rel, 'utf8'))}`);

const bundle = `
window.__eyesZh = false;
Object.defineProperty(window, 'chrome', {
  configurable: true,
  get: () => ({ runtime: { getURL: (p) => 'data:application/json;charset=utf-8,' + encodeURIComponent(
      ${table.join('\n      : ')}
      : ({})) } }),
});
${content}
'content.js injected'`;

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find((t) => t.type === 'page');
if (!page) throw new Error('no page target on port ' + PORT);

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = ++id;
  pending.set(i, (m) => (m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result)));
  ws.send(JSON.stringify({ id: i, method, params }));
});
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('page: ' + JSON.stringify(r.exceptionDetails).slice(0, 400));
  return r.result.value;
};

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `https://eyes.nasa.gov/apps/solar-system/#/${route}` });

const ready = await ev(`(async () => {
  for (let i = 0; i < 160; i++) {
    const ls = document.getElementById('loading-screen');
    const done = !ls || getComputedStyle(ls).display === 'none' || getComputedStyle(ls).opacity === '0';
    if (done && document.querySelectorAll('.pioneer-label-div').length > 3) return true;
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
})()`);
if (!ready) throw new Error('NASA app did not finish loading — use a fresh --user-data-dir');

await ev(bundle);
await sleep(3000);

const probe = await ev(`(async () => {
  const clean = s => (s || '').replace(/\\s+/g, ' ').trim();
  const han = /[\\u4e00-\\u9fff]/;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const labels = () => [...document.querySelectorAll('.pioneer-label-div .text')].map(e => clean(e.textContent));
  const before = labels();
  document.querySelector('button.menu-btn')?.click();
  await wait(2500);
  const menu = [...new Set([...document.querySelectorAll('.menu-container *')]
    .filter(e => !e.children.length).map(e => clean(e.textContent)).filter(Boolean))];
  const rail = [...document.querySelectorAll('[aria-label]')].map(e => clean(e.getAttribute('aria-label'))).filter(Boolean);
  document.querySelector('.close-button')?.click();
  await wait(600);
  return {
    injected: !!window.__eyesZh,
    title: document.title,
    labelsZh: labels().filter(t => han.test(t)),
    labelsEn: labels().filter(t => !han.test(t)),
    railZh: rail.filter(t => han.test(t)),
    railEn: rail.filter(t => !han.test(t) && /[a-z]{4}/.test(t)),
    menuZh: menu.filter(t => han.test(t)),
    menuEn: menu.filter(t => !han.test(t)).slice(0, 12),
    shareBtn: clean(document.querySelector('button.share-button')?.textContent),
    rate: clean(document.querySelector('.rate')?.textContent),
    detailTabs: [...document.querySelectorAll('[class*=tab] *')].filter(e => !e.children.length).map(e => clean(e.textContent)).filter(Boolean).slice(0, 8),
  };
})()`);

const shot = await send('Page.captureScreenshot', { format: 'png' });
const out = root + `shots/extension-${route}.png`;
writeFileSync(out, Buffer.from(shot.data, 'base64'));

const pct = (hit, miss) => `${((hit / Math.max(1, hit + miss)) * 100).toFixed(1)}% (${hit}/${hit + miss})`;
console.log(JSON.stringify(probe, null, 2));
console.log(`\n3D 标签汉化率 ${pct(probe.labelsZh.length, probe.labelsEn.length)}`);
console.log(`工具条/提示汉化率 ${pct(probe.railZh.length, probe.railEn.length)}`);
console.log(`菜单条目汉化率 ${pct(probe.menuZh.length, probe.menuEn.length)}`);
console.log('screenshot -> ' + out);
ws.close();
