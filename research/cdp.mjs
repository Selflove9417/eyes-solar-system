// Dependency-free CDP driver for headless Chrome (Node >= 21, global WebSocket).
// Usage:
//   node cdp.mjs probe <exprFile> [url]     evaluate expression, print JSON result
//   node cdp.mjs shot  <outPng> [url]       full screenshot
// Chrome must already be listening: see chrome-start.mjs
const [mode, arg, urlArg] = process.argv.slice(2);
const PORT = process.env.CDP_PORT || '9333';
const DEFAULT_URL = 'https://eyes.nasa.gov/apps/solar-system/#/home';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function targetWs() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(500);
  }
  throw new Error('no CDP page target');
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      }
    };
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) =>
      this.pending.set(id, { resolve, reject }),
    );
  }
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails)
      throw new Error('page exception: ' + JSON.stringify(r.exceptionDetails).slice(0, 800));
    return r.result.value;
  }
}

// Probe files are written as `() => {...}`; force async so they may use await.
const wrap = (expr) =>
  `(async () => { const fn = (async ${expr}); return await fn(); })()`;

async function main() {
  const ws = new WebSocket(await targetWs());
  await new Promise((r) => (ws.onopen = r));
  ws.onerror = (e) => console.error('ws error', e.message?.value ?? '');
  const cdp = new Cdp(ws);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1600, height: 900, deviceScaleFactor: 1, mobile: false,
  });

  const url = urlArg || DEFAULT_URL;
  // Reuse the already-loaded NASA Eyes tab when possible; a full reload costs ~90s.
  const here = await cdp.evaluate('location.href');
  if (process.env.KEEP === '1' && here === url) {
    // reuse as-is
  } else {
    const sameApp = here && here.startsWith('https://eyes.nasa.gov/apps/solar-system/');
    const wantsSameHash = sameApp && here.split('#')[1] === (url.split('#')[1] || '');
    if (!(wantsSameHash && process.env.KEEP === '1')) {
      await cdp.send('Page.navigate', { url: 'about:blank' });
      await sleep(1200);
      await cdp.send('Page.navigate', { url });
    }
  }
  // NASA Eyes streams assets for a while; poll until the scene reports ready.
  if (!process.env.SKIP_WAIT)
    await cdp.evaluate(
    `(async () => {
      for (let i = 0; i < 120; i++) {
        const ls = document.getElementById('loading-screen');
        const hidden = !ls || getComputedStyle(ls).display === 'none' || getComputedStyle(ls).opacity === '0';
        if (hidden && document.querySelectorAll('.pioneer-label-div').length > 3) return 'ready';
        await new Promise(r => setTimeout(r, 1000));
      }
      return 'timeout';
    })()`,
  );

  if (mode === 'probe') {
    const { readFileSync } = await import('node:fs');
    const expr = readFileSync(arg, 'utf8');
    console.log(JSON.stringify(await cdp.evaluate(wrap(expr)), null, 2));
  } else if (mode === 'shot') {
    await sleep(Number(process.env.SETTLE || 75000));
    const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const { writeFileSync } = await import('node:fs');
    writeFileSync(arg, Buffer.from(r.data, 'base64'));
    console.log('wrote ' + arg);
  } else {
    throw new Error('unknown mode ' + mode);
  }
  ws.close();
}
main().catch((e) => {
  console.error('FAIL: ' + e.message);
  process.exit(1);
});
