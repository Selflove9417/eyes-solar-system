import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const CDP_PORT = 9477;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const root = path.resolve('.');

const pages = [
  'index.html', 'explore.html', 'bodies.html', 'missions.html',
  'glossary.html', 'guide.html', 'extension.html', 'about.html',
  'mars.html', 'jwst.html', 'saturn.html', 'voyager-1.html'
];

async function waitForDeployment() {
  console.log('Polling GitHub Pages for deployment of version 20261015p6...');
  const maxAttempts = 30;
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const url = `https://selflove9417.github.io/eyes-solar-system/index.html?cachebust=${Date.now()}`;
      const res = await fetch(url, { cache: 'no-store' });
      const text = await res.text();
      if (text.includes('20261015p6')) {
        console.log(`✅ GitHub Pages deployment succeeded (attempt ${i}/${maxAttempts})! Version 20261015p6 is LIVE.`);
        return true;
      }
      console.log(`[Attempt ${i}/${maxAttempts}] Not deployed yet, waiting 5s...`);
    } catch (e) {
      console.log(`[Attempt ${i}/${maxAttempts}] Fetch error: ${e.message}, waiting 5s...`);
    }
    await sleep(5000);
  }
  console.error('❌ Deployment timeout: 20261015p6 not detected within 150 seconds.');
  return false;
}

async function verifyAll12PagesLive() {
  console.log('\n=== Verifying All 12 Live Online Pages via HTTP ===');
  const results = {};
  for (const p of pages) {
    const url = `https://selflove9417.github.io/eyes-solar-system/${p}?t=${Date.now()}`;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      const html = await res.text();
      const ok = res.status === 200 && html.includes('20261015p6');
      results[p] = {
        status: res.status,
        hasV6: html.includes('20261015p6'),
        hasCanonical: html.includes('rel="canonical"'),
        hasOgUrl: html.includes('property="og:url"'),
        hasFavicon: html.includes('favicon.svg'),
        pass: ok
      };
      console.log(`  ${p.padEnd(16)}: Status ${res.status}, v=20261015p6: ${html.includes('20261015p6') ? 'YES' : 'NO'}, canonical: ${html.includes('rel="canonical"') ? 'YES' : 'NO'}, pass: ${ok ? 'PASS' : 'FAIL'}`);
    } catch (err) {
      results[p] = { error: err.message, pass: false };
      console.error(`  ${p.padEnd(16)}: ERROR ${err.message}`);
    }
  }
  return results;
}

class LiveCDP {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 0;
    this.callbacks = new Map();
  }
  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    return new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const { resolve, reject } = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) reject(msg.error);
          else resolve(msg.result);
        }
      };
    });
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expr) {
    const res = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return res.result?.value;
  }
  async setViewport(width, height, isMobile = false) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: isMobile
    });
  }
  async captureScreenshot(filePath) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
    const stat = fs.statSync(filePath);
    console.log(`📸 Captured screenshot: ${filePath} (${(stat.size / 1024).toFixed(1)} KB)`);
  }
  close() {
    this.ws.close();
  }
}

async function captureLiveScreenshots() {
  console.log('\n=== Capturing Online Live Screenshots via Headless Chrome ===');
  const tempProfile = path.join(root, '.chrome-temp-live-shots-' + Date.now());
  fs.mkdirSync(tempProfile, { recursive: true });

  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${CDP_PORT}`,
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--user-data-dir=' + tempProfile,
    'about:blank'
  ]);

  let wsUrl = null;
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
      const targets = await res.json();
      const page = targets.find((t) => t.type === 'page');
      if (page && page.webSocketDebuggerUrl) {
        wsUrl = page.webSocketDebuggerUrl;
        break;
      }
    } catch {}
    await sleep(250);
  }

  const cdp = new LiveCDP(wsUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  const shotsDir = path.join(root, 'shots');
  fs.mkdirSync(shotsDir, { recursive: true });

  const tasks = [
    { page: 'guide.html', width: 1440, height: 900, mobile: false, file: 'shots/phase6-guide-1440-live.png' },
    { page: 'extension.html', width: 1440, height: 900, mobile: false, file: 'shots/phase6-extension-1440-live.png' },
    { page: 'about.html', width: 1440, height: 900, mobile: false, file: 'shots/phase6-about-1440-live.png' },
    { page: 'extension.html', width: 375, height: 812, mobile: true, file: 'shots/phase6-extension-375-live.png' },
    { page: 'explore.html', width: 1440, height: 900, mobile: false, file: 'shots/phase6-explore-1440-live.png' }
  ];

  for (const t of tasks) {
    await cdp.setViewport(t.width, t.height, t.mobile);
    const liveUrl = `https://selflove9417.github.io/eyes-solar-system/${t.page}?bust=${Date.now()}`;
    await cdp.send('Page.navigate', { url: liveUrl });
    await sleep(2500);

    const metrics = await cdp.evaluate(`
      (() => {
        return {
          title: document.title,
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          hasHScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          h1: document.querySelector('h1')?.innerText?.trim() || 'NO H1'
        };
      })()
    `);
    console.log(`Page ${t.page} (${t.width}px): ${metrics.title} - scroll=${metrics.scrollWidth}, client=${metrics.clientWidth}, hScroll=${metrics.hasHScroll ? 'YES' : 'NO'}`);
    await cdp.captureScreenshot(path.join(root, t.file));
  }

  cdp.close();
  chromeProc.kill();
  try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch {}
}

async function run() {
  const deployed = await waitForDeployment();
  if (!deployed) {
    console.error('Aborting screenshot capture due to deployment failure.');
    process.exit(1);
  }
  const httpResults = await verifyAll12PagesLive();
  await captureLiveScreenshots();
  console.log('\n🎉 Phase 6 Live Verification & Screenshot Capture Complete!');
}

run();
