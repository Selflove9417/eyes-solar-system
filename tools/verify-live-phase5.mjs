import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const CDP_PORT = 9477;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const root = path.resolve('.');

async function waitForLiveDeployment() {
  console.log('Polling GitHub Pages for Phase 5 deployment (?v=20261015p5)...');
  const checkUrl = `https://selflove9417.github.io/eyes-solar-system/saturn.html?_t=${Date.now()}`;
  for (let attempt = 1; attempt <= 40; attempt++) {
    try {
      const resp = await fetch(checkUrl, { cache: 'no-store' });
      if (resp.ok) {
        const text = await resp.text();
        if (text.includes('20261015p5') && text.includes('feature-page')) {
          console.log(`✅ GitHub Pages deployment live! (Detected on attempt ${attempt})`);
          return true;
        }
      }
    } catch (e) {
      // ignore network errors during poll
    }
    console.log(`  Waiting for deployment (attempt ${attempt}/40)...`);
    await sleep(6000);
  }
  throw new Error('Deployment timed out after 4 minutes');
}

async function verifyLive() {
  await waitForLiveDeployment();

  const pages = [
    { file: 'saturn.html', name: '土星' },
    { file: 'mars.html', name: '火星' },
    { file: 'jwst.html', name: '韦伯' },
    { file: 'voyager-1.html', name: '旅行者 1 号' },
  ];

  console.log('\n--- Checking Live HTML Text for all 4 Feature Pages ---');
  for (const p of pages) {
    const liveUrl = `https://selflove9417.github.io/eyes-solar-system/${p.file}?_t=${Date.now()}`;
    const res = await fetch(liveUrl, { cache: 'no-store' });
    const text = await res.text();
    const hasP5 = text.includes('20261015p5');
    const hasFeaturePage = text.includes('class="feature-page"');
    const hasStatRow = text.includes('class="stat-row"');
    const hasFeatureStage = text.includes('class="stage feature-stage"');
    console.log(`  ${p.name} (${p.file}): HTTP ${res.status}, v=20261015p5=${hasP5}, feature-page=${hasFeaturePage}, stat-row=${hasStatRow}, feature-stage=${hasFeatureStage}`);
    if (!hasP5 || !hasFeaturePage || !hasStatRow || !hasFeatureStage) {
      throw new Error(`Live page ${p.file} does not have new classes!`);
    }
  }

  console.log('\n--- Verifying Live Pages with Headless Chrome ---');
  const tempProfile = path.join(root, '.chrome-temp-live-p5-' + Date.now());
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
  const consoleErrors = [];

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && callbacks.has(data.id)) {
      const cb = callbacks.get(data.id);
      callbacks.delete(data.id);
      if (data.error) cb.reject(new Error(JSON.stringify(data.error)));
      else cb.resolve(data.result);
    } else if (data.method === 'Runtime.consoleAPICalled') {
      if (data.params.type === 'error') {
        consoleErrors.push(data.params.args.map((a) => a.value || a.description).join(' '));
      }
    } else if (data.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(data.params.exceptionDetails?.text || 'Uncaught exception');
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

  // Verify saturn live on 1440 and 375
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const liveSaturnUrl = `https://selflove9417.github.io/eyes-solar-system/saturn.html?_t=${Date.now()}`;
  await send('Page.navigate', { url: liveSaturnUrl });
  await sleep(2500);

  const saturnMetrics = await evalCode(`(() => {
    const stage = document.querySelector('.stage-viewport');
    const stageH = stage ? Math.round(stage.getBoundingClientRect().height) : 0;
    const statCols = document.querySelectorAll('.stat-col').length;
    const tabBtns = document.querySelectorAll('.view-tab-btn').length;
    const docW = document.documentElement.clientWidth;
    const scrollW = document.documentElement.scrollWidth;
    return { stageH, statCols, tabBtns, docW, scrollW, hasHScroll: scrollW > docW };
  })()`);

  console.log('  Live Saturn (1440x900):', saturnMetrics);

  const shotRes = await send('Page.captureScreenshot', { format: 'png' });
  const liveShotPath = path.join(root, 'shots', 'phase5-saturn-live-1440.png');
  fs.writeFileSync(liveShotPath, Buffer.from(shotRes.data, 'base64'));
  console.log(`  📸 Saved live screenshot: shots/phase5-saturn-live-1440.png`);

  ws.close();
  chromeProcess.kill();
  await sleep(600);
  try {
    fs.rmSync(tempProfile, { recursive: true, force: true });
  } catch {}

  console.log('\n🎉 Phase 5 线上实测部署验证全部通过！');
}

verifyLive().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
