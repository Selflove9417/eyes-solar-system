// Debug harness: run the shipped content.js in the live page and report any error.
import { readFileSync } from 'node:fs';
const PORT = process.env.CDP_PORT || '9444';
const root = new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const content = readFileSync(root + 'extension/content.js', 'utf8');
const names = readFileSync(root + 'data/names.zh.json', 'utf8');
const ui = readFileSync(root + 'data/ui.zh.json', 'utf8');

const bundle = `
window.__eyesZh = false;
window.chrome = { runtime: { getURL: (p) => 'data:application/json;charset=utf-8,' + encodeURIComponent(
  p.endsWith('names.zh.json') ? ${JSON.stringify(names)} : ${JSON.stringify(ui)}) } };
window.__diag = {};
(async () => {
  try {
    const r = await fetch(chrome.runtime.getURL('data/ui.zh.json'));
    const t = await r.text();
    window.__diag.fetch = [r.ok, t.length];
  } catch (e) { window.__diag.fetchErr = String(e); }
  try { ${content} window.__diag.ran = true; }
  catch (e) { window.__diag.runErr = String(e); window.__diag.stack = (e.stack || '').split('\\n').slice(0, 4).join(' | '); }
})();
'diagnostics started'`;

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, (m) => (m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result))); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result.value; };

await send('Runtime.enable');
console.log(await ev(bundle));
await sleep(4000);
console.log(JSON.stringify(await ev('window.__diag'), null, 2));
console.log(JSON.stringify(await ev(`(async()=>{const c=s=>(s||'').replace(/\\s+/g,' ').trim();const han=/[\\u4e00-\\u9fff]/;const l=[...document.querySelectorAll('.pioneer-label-div .text')].map(e=>c(e.textContent));return {zh:l.filter(t=>han.test(t)),en:l.filter(t=>!han.test(t)),title:document.title}})()`), null, 2));
ws.close();
