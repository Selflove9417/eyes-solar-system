// Diagnoses why the embedded NASA app stalls: watches Network + console for the
// iframe while the host page loads.   node tools/diagnose-embed.mjs <url> [seconds]
const PORT = process.env.CDP_PORT || '9333';
const target = process.argv[2] || 'http://127.0.0.1:8890/explore.html';
const seconds = Number(process.argv[3] || 130);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
const reqs = new Map();
const errors = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Network.requestWillBeSent') {
    reqs.set(m.params.requestId, { url: m.params.request.url, t: Date.now(), type: m.params.type });
  }
  if (m.method === 'Network.loadingFinished') {
    const r = reqs.get(m.params.requestId); if (r) r.done = Date.now();
  }
  if (m.method === 'Network.loadingFailed') {
    const r = reqs.get(m.params.requestId); if (r) r.fail = m.params.errorText || m.params.blockedReason;
  }
  if (m.method === 'Log.entryAdded' && ['error', 'warning'].includes(m.params.entry.level)) {
    errors.push(`${m.params.entry.source} ${m.params.entry.text}`.slice(0, 220));
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    errors.push('console: ' + (m.params.args[0]?.description || m.params.args[0]?.value || '').toString().slice(0, 220));
  }
};
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const i = ++id;
    pending.set(i, (m) => (m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result)));
    ws.send(JSON.stringify({ id: i, method, params }));
  });

await send('Network.enable');
await send('Log.enable');
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: target });
await sleep(seconds * 1000);

const all = [...reqs.values()];
const eyes = all.filter((r) => /eyes\.nasa\.gov/.test(r.url));
const pendingReqs = eyes.filter((r) => !r.done && !r.fail);
const failed = eyes.filter((r) => r.fail);
const slowest = eyes.filter((r) => r.done).sort((a, b) => b.done - b.t - (a.done - a.t)).slice(0, 5);
console.log(JSON.stringify({
  totalRequests: all.length,
  eyesRequests: eyes.length,
  stillPending: pendingReqs.length,
  pendingSample: pendingReqs.slice(0, 12).map((r) => r.url.replace(/^https:\/\/eyes\.nasa\.gov/, '')),
  failed: failed.slice(0, 12).map((r) => r.url.slice(0, 120) + ' -> ' + r.fail),
  slowestMs: slowest.map((r) => [r.done - r.t, r.url.replace(/^https:\/\/eyes\.nasa\.gov/, '').slice(0, 80)]),
  errors: [...new Set(errors)].slice(0, 20),
}, null, 2));
ws.close();
