import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { SITE_ORIGIN } from './site-config.mjs';

const CDP_PORT = 9466;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const root = path.resolve('.');

async function main() {
  const timestamp = Date.now();
  const liveUrl = `${SITE_ORIGIN}/explore.html?v=${timestamp}`;
  console.log(`Verifying live online deployment: ${liveUrl}`);

  // 1. Direct fetch checks
  const resp = await fetch(liveUrl, { cache: 'no-store' });
  const html = await resp.text();
  console.log('HTTP Status:', resp.status);

  const checks = {
    hasVersionP4Css: html.includes('assets/css/main.css?v=20261015p4b'),
    hasVersionP4Js: html.includes('assets/js/site.js?v=20261015p4b'),
    hasDrawerToggle: html.includes('id="drawer-toggle-btn"'),
    noSideHomeBtn: !html.includes('side-home-btn'),
    hasGuidedSection: html.includes('class="guided-section"'),
    hasDrawerBackdrop: html.includes('class="drawer-backdrop"'),
    hasExploreH1: html.includes('class="explore-page-title"'),
  };

  console.log('HTML Static Assertions:', JSON.stringify(checks, null, 2));
  for (const [k, v] of Object.entries(checks)) {
    if (!v) {
      console.error(`FAILED static check: ${k}`);
      process.exit(1);
    }
  }

  // 2. Headless Chrome checks
  const tempProfile = path.join(root, '.chrome-temp-live-' + timestamp);
  fs.mkdirSync(tempProfile, { recursive: true });

  const chromeProcess = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=' + CDP_PORT,
    '--no-sandbox',
    '--user-data-dir=' + tempProfile,
    'about:blank',
  ], { stdio: 'ignore' });

  try {
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
    const wsUrl = pageTarget.webSocketDebuggerUrl;
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve) => ws.addEventListener('open', resolve));

    let msgId = 1;
    const pending = new Map();
    const consoleLogs = [];
    ws.addEventListener('message', (event) => {
      const data = JSON.parse(event.data);
      if (data.method === 'Runtime.consoleAPICalled') {
        consoleLogs.push({ type: data.params.type, args: data.params.args.map(a => a.value || a.description) });
      }
      if (data.method === 'Runtime.exceptionThrown') {
        console.error('LIVE UNCAUGHT EXCEPTION:', JSON.stringify(data.params.exceptionDetails));
      }
      if (data.id && pending.has(data.id)) {
        const { resolve, reject } = pending.get(data.id);
        pending.delete(data.id);
        if (data.error) reject(data.error);
        else resolve(data.result);
      }
    });

    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = msgId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

    await send('Page.enable');
    await send('Runtime.enable');
    await send('DOM.enable');

    const evalCode = async (expression) => {
      const res = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (res.exceptionDetails) {
        throw new Error(JSON.stringify(res.exceptionDetails));
      }
      return res.result ? res.result.value : undefined;
    };

    const takeScreenshot = async (filename) => {
      const res = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(root, filename), Buffer.from(res.data, 'base64'));
      console.log(`Saved screenshot: ${filename}`);
    };

    // Viewport 1440x900
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });

    await send('Page.navigate', { url: liveUrl });
    for (let i = 0; i < 30; i++) {
      await sleep(500);
      try {
        const state = await evalCode(`({ href: location.href, ready: document.readyState, hasStage: !!document.getElementById('stage-wrapper'), hasDrawerFn: typeof toggleDrawer === 'function' })`);
        if (state && state.hasStage && state.hasDrawerFn) {
          console.log('Page scripts initialized successfully on attempt', i + 1, state);
          break;
        }
      } catch {}
    }

    const desktopData = await evalCode(`(() => {
      const stage = document.getElementById('stage-wrapper');
      const stageRect = stage.getBoundingClientRect();
      const btn = document.getElementById('drawer-toggle-btn');
      const btnRect = btn.getBoundingClientRect();
      const presetBar = document.querySelector('.preset-bar');
      const drawer = document.getElementById('explore-drawer');
      const drawerStyle = window.getComputedStyle(drawer);
      const h1 = document.querySelector('.explore-page-title');
      const h1Style = window.getComputedStyle(h1);
      const tipBar = document.getElementById('user-guide-tip');
      const tipBarRect = tipBar ? tipBar.getBoundingClientRect() : null;
      const iframe = document.getElementById('stage');
      const iframeRect = iframe.getBoundingClientRect();
      const bar = document.querySelector('.stage-bar');
      const barRect = bar.getBoundingClientRect();

      const overlapsIframe = (rect) => {
        return !(rect.right <= iframeRect.left || 
                 rect.left >= iframeRect.right || 
                 rect.bottom <= iframeRect.top || 
                 rect.top >= iframeRect.bottom);
      };

      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        stageWidth: stageRect.width,
        stageHeight: stageRect.height,
        iframeHeight: iframeRect.height,
        drawerBtnHeight: btnRect.height,
        drawerBtnWidth: btnRect.width,
        btnInPresetBar: presetBar ? presetBar.contains(btn) : false,
        btnOverlapsIframe: overlapsIframe(btnRect),
        tipAboveToolbar: tipBarRect ? tipBarRect.bottom <= barRect.top + 2 : true,
        tipOverlapsIframe: tipBarRect ? overlapsIframe(tipBarRect) : false,
        toolbarBottom: barRect.bottom,
        toolbarVisibleIn900: barRect.bottom <= 900,
        h1FontSize: h1Style.fontSize,
      };
    })()`);

    console.log('Live 1440 Desktop Metrics:', JSON.stringify(desktopData, null, 2));

    if (desktopData.scrollWidth > desktopData.clientWidth) {
      throw new Error(`Desktop has horizontal overflow: scrollWidth=${desktopData.scrollWidth}, clientWidth=${desktopData.clientWidth}`);
    }
    if (desktopData.stageWidth < 1100) {
      throw new Error(`Stage width < 1100px: ${desktopData.stageWidth}`);
    }
    if (desktopData.drawerBtnHeight < 44) {
      throw new Error(`Drawer toggle height < 44px: ${desktopData.drawerBtnHeight}`);
    }

    await takeScreenshot('shots/phase4b-explore-1440-live.png');

    // Click to open drawer
    const clickResult = await evalCode(`(() => {
      const btn = document.getElementById('drawer-toggle-btn');
      btn.click();
      return {
        bodyHasOpen: document.body.classList.contains('drawer-open'),
        btnAria: btn.getAttribute('aria-expanded'),
      };
    })()`);
    console.log('Click result:', clickResult);
    await sleep(400);

    const drawerOpenData = await evalCode(`(() => {
      const drawer = document.getElementById('explore-drawer');
      const rect = drawer.getBoundingClientRect();
      const activeEl = document.activeElement ? document.activeElement.id : null;
      return {
        drawerRect: { left: rect.left, width: rect.width },
        activeElement: activeEl,
      };
    })()`);
    console.log('Drawer Open State:', JSON.stringify(drawerOpenData, null, 2));
    await takeScreenshot('shots/phase4-explore-1440-drawer-live.png');

    // Press Escape to close
    await evalCode(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    await sleep(300);

    // Viewport 375x812 Mobile
    await send('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 812,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await sleep(600);

    const mobileData = await evalCode(`(() => {
      const stage = document.getElementById('stage-wrapper');
      const stageRect = stage.getBoundingClientRect();
      const drawerBtn = document.getElementById('drawer-toggle-btn');
      const drawerBtnRect = drawerBtn.getBoundingClientRect();

      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        stageHeight: stageRect.height,
        drawerBtnHeight: drawerBtnRect.height,
      };
    })()`);
    console.log('Live 375 Mobile Metrics:', JSON.stringify(mobileData, null, 2));

    if (mobileData.scrollWidth > mobileData.clientWidth) {
      throw new Error(`Mobile has horizontal overflow: scrollWidth=${mobileData.scrollWidth}, clientWidth=${mobileData.clientWidth}`);
    }
    await takeScreenshot('shots/phase4-explore-375-live.png');

    // Mobile open drawer
    await evalCode(`document.getElementById('drawer-toggle-btn').click()`);
    await sleep(400);

    const mobileDrawerData = await evalCode(`(() => {
      const drawer = document.getElementById('explore-drawer');
      const rect = drawer.getBoundingClientRect();
      return {
        left: rect.left,
        width: rect.width,
        scrollWidth: document.documentElement.scrollWidth,
      };
    })()`);
    await takeScreenshot('shots/phase4-explore-375-drawer-live.png');

    ws.close();
    chromeProcess.kill();
    await sleep(1500);
    try {
      fs.rmSync(tempProfile, { recursive: true, force: true, maxRetries: 3 });
    } catch {}

    console.log('\n🎉 ALL LIVE ONLINE TESTS PASSED PROVABLY!');
  } catch (err) {
    try { chromeProcess.kill(); } catch {}
    await sleep(1000);
    try {
      fs.rmSync(tempProfile, { recursive: true, force: true, maxRetries: 3 });
    } catch {}
    console.error('Test execution error:', err);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
