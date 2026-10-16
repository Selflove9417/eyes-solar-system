import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { SITE_ORIGIN } from './site-config.mjs';

const CDP_PORT = 9488;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const root = path.resolve('.');

async function checkGitHubActions(sha) {
  console.log(`Checking GitHub Actions workflow run for SHA ${sha.slice(0, 7)}...`);
  for (let attempt = 1; attempt <= 40; attempt++) {
    try {
      const res = await fetch('https://api.github.com/repos/Selflove9417/eyes-solar-system/actions/runs?per_page=5', {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      const data = await res.json();
      const run = data.workflow_runs?.find((r) => r.head_sha.startsWith(sha.slice(0, 7)));
      if (run) {
        console.log(`  Run ID: ${run.id}, Status: ${run.status}, Conclusion: ${run.conclusion}`);
        if (run.status === 'completed') {
          return run;
        }
      }
    } catch (e) {
      console.log('  Error querying Actions API:', e.message);
    }
    await sleep(6000);
  }
  throw new Error('Actions workflow run timed out');
}

async function waitForLivePages() {
  console.log('Waiting for GitHub Pages to serve ?v=20261015p5c...');
  for (let attempt = 1; attempt <= 30; attempt++) {
    try {
      const res = await fetch(`${SITE_ORIGIN}/saturn.html?_t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const text = await res.text();
        if (text.includes('20261015p5c')) {
          console.log(`✅ GitHub Pages is serving 20261015p5c! (Attempt ${attempt})`);
          return true;
        }
      }
    } catch {}
    await sleep(4000);
  }
  throw new Error('GitHub Pages deployment timed out');
}

async function runVerification() {
  const latestRun = await checkGitHubActions('ab0aeee');
  await waitForLivePages();

  const tempProfile = path.join(root, '.chrome-temp-full-live-' + Date.now());
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
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  const pages = [
    {
      file: 'saturn.html',
      name: '土星 (saturn.html)',
      shotKey: 'saturn',
      tabs: [
        { route: 'saturn', label: '土星全景 (Saturn)' },
        { route: 'sc_cassini', label: '卡西尼号探测器 (Cassini)' },
        { route: 'titan', label: '土卫六泰坦 (Titan)' },
        { route: 'enceladus', label: '土卫二恩克拉多斯 (Enceladus)' },
        { route: 'iapetus', label: '土卫八伊阿珀托斯 (Iapetus)' },
      ],
    },
    {
      file: 'mars.html',
      name: '火星 (mars.html)',
      shotKey: 'mars',
      tabs: [
        { route: 'mars', label: '火星全貌全景观览' },
        { route: 'sc_mars_2020', label: '毅力号火星车 (Perseverance)' },
        { route: 'sc_mars_science_laboratory', label: '好奇号火星车 (Curiosity)' },
        { route: 'sc_mars_2020_landing_site', label: '耶泽罗陨石坑着陆点' },
        { route: 'phobos', label: '火卫一 (Phobos)' },
      ],
    },
    {
      file: 'jwst.html',
      name: '韦伯 (jwst.html)',
      shotKey: 'jwst',
      tabs: [
        { route: 'sc_jwst', label: '韦伯日地 L2 轨道全景观' },
      ],
    },
    {
      file: 'voyager-1.html',
      name: '旅行者 1 号 (voyager-1.html)',
      shotKey: 'voyager',
      tabs: [
        { route: 'sc_voyager_1', label: '旅行者 1 号星际空间运行' },
      ],
    },
  ];

  const viewLoadResults = [];
  const pageMetricsResults = [];

  for (const p of pages) {
    console.log(`\n==================================================`);
    console.log(`Testing Live Page: ${p.name}`);
    console.log(`==================================================`);

    const liveUrl = `${SITE_ORIGIN}/${p.file}?_t=${Date.now()}`;
    await send('Page.navigate', { url: liveUrl });
    await sleep(2000);

    // 1. Overall page metrics
    const metrics = await evalCode(`(() => {
      const docW = document.documentElement.clientWidth;
      const scrollW = document.documentElement.scrollWidth;
      const stage = document.querySelector('.stage-viewport');
      const r = stage ? stage.getBoundingClientRect() : { width: 0, height: 0, x: 0, y: 0 };
      const sub44 = Array.from(document.querySelectorAll('a, button, summary')).filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).display !== 'none' && rect.height < 43.5;
      });
      return {
        docW,
        scrollW,
        hasHorizontalScroll: scrollW > docW,
        stageW: Math.round(r.width),
        stageH: Math.round(r.height),
        stageRect: { x: r.x, y: r.y, width: r.width, height: r.height },
        sub44Count: sub44.length,
      };
    })()`);

    console.log(`  Page 1440 metrics: docW=${metrics.docW}px, scrollW=${metrics.scrollW}px, hasHorizontalScroll=${metrics.hasHorizontalScroll}`);
    console.log(`  Stage dimensions: ${metrics.stageW}x${metrics.stageH}px (requirement: >= 480px / 60vh)`);
    console.log(`  Interactive elements < 44px: ${metrics.sub44Count}`);

    pageMetricsResults.push({
      page: p.name,
      viewport: '1440x900',
      docW: metrics.docW,
      scrollW: metrics.scrollW,
      hasHorizontalScroll: metrics.hasHorizontalScroll ? '有溢出 ❌' : '无横滚 ✅',
      stageSize: `${metrics.stageW}x${metrics.stageH}px`,
      stagePass: metrics.stageH >= 480 ? '达标 (>=480px) ✅' : '不达标 ❌',
      sub44Count: metrics.sub44Count,
    });

    // Save full page 1440 screenshot to shots/phase5-live-*.png
    const fullShot = await send('Page.captureScreenshot', { format: 'png' });
    const shotPath = path.join(root, 'shots', `phase5-live-${p.shotKey}.png`);
    fs.writeFileSync(shotPath, Buffer.from(fullShot.data, 'base64'));
    console.log(`  📸 Saved live screenshot: shots/phase5-live-${p.shotKey}.png`);

    // 2. Test each view tab on this page
    for (const tab of p.tabs) {
      console.log(`\n  --- Testing Tab: [${tab.label}] (route: ${tab.route}) ---`);
      const t0 = Date.now();

      // Click button if tab buttons exist
      const clicked = await evalCode(`(() => {
        const btn = document.querySelector('button[data-route="${tab.route}"]');
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      })()`);

      // Wait for iframe load event or timeout
      await evalCode(`new Promise((resolve) => {
        const frame = document.getElementById('eyes');
        if (frame) {
          let done = false;
          const handler = () => { if (!done) { done = true; resolve(true); } };
          frame.addEventListener('load', handler, { once: true });
          setTimeout(() => { if (!done) { done = true; resolve(false); } }, 4000);
        } else {
          resolve(false);
        }
      })()`);

      // Poll up to 15s for non-black pixels
      let finalRatio = 0;
      let finalElapsed = 0;
      let loadSuccess = false;

      for (let sec = 1; sec <= 15; sec++) {
        await sleep(1000);
        const curElapsed = Math.round((Date.now() - t0) / 100) / 10;

        const stageRect = await evalCode(`(() => {
          const stage = document.querySelector('.stage-viewport');
          const r = stage.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        })()`);

        const clipShot = await send('Page.captureScreenshot', {
          format: 'png',
          clip: {
            x: Math.round(stageRect.x),
            y: Math.round(stageRect.y),
            width: Math.round(stageRect.width),
            height: Math.round(stageRect.height),
            scale: 1,
          },
        });

        const pixelData = await evalCode(`(async (b64) => {
          const img = new Image();
          img.src = 'data:image/png;base64,' + b64;
          await img.decode();
          const c = document.createElement('canvas');
          c.width = img.width;
          c.height = img.height;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const data = ctx.getImageData(0, 0, img.width, img.height).data;
          let nonBlack = 0;
          for (let i = 0; i < data.length; i += 4) {
            if (data[i] > 20 || data[i+1] > 20 || data[i+2] > 20) {
              nonBlack++;
            }
          }
          return {
            total: data.length / 4,
            nonBlack,
            ratio: Math.round((nonBlack / (data.length / 4)) * 10000) / 100,
          };
        })("${clipShot.data}")`);

        finalRatio = pixelData.ratio;
        finalElapsed = curElapsed;
        console.log(`    [+${sec}s / total ${curElapsed}s]: non-black ratio = ${pixelData.ratio}% (${pixelData.nonBlack} pixels)`);

        if (pixelData.ratio >= 2.0) {
          loadSuccess = true;
          break;
        }
      }

      console.log(`    Result: ${loadSuccess ? '✅ 成功' : '❌ 失败'} (耗时 ${finalElapsed}s, 非黑像素占比 ${finalRatio}%)`);
      viewLoadResults.push({
        page: p.name,
        tab: tab.label,
        route: tab.route,
        elapsedSec: `${finalElapsed}s`,
        success: loadSuccess ? '成功 (PASS) ✅' : '失败 (FAIL) ❌',
        ratio: `${finalRatio}%`,
      });
    }
  }

  ws.close();
  chromeProcess.kill();
  await sleep(500);
  try {
    fs.rmSync(tempProfile, { recursive: true, force: true });
  } catch {}

  console.log('\n==================================================');
  console.log('📊 线上实测汇总报告');
  console.log('==================================================');
  console.log(`GitHub Actions Run ID: ${latestRun.id} (${latestRun.conclusion})`);
  console.log('\n1. 视窗与横滚实测表:');
  console.table(pageMetricsResults);
  console.log('\n2. 视角标签真实加载与非黑像素统计表:');
  console.table(viewLoadResults);

  return { latestRun, pageMetricsResults, viewLoadResults };
}

runVerification().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
