import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const HTTP_PORT = 8898;
const CDP_PORT = 9452;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
};

const server = http.createServer((req, res) => {
  try {
    const u = new URL(req.url, `http://127.0.0.1:${HTTP_PORT}`);
    let pathname = decodeURIComponent(u.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const filePath = path.join(root, pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream' });
      res.end(fs.readFileSync(filePath));
    } else {
      res.writeHead(404).end('Not Found');
    }
  } catch (err) {
    res.writeHead(500).end(err.message);
  }
});

await new Promise((resolve) => server.listen(HTTP_PORT, '127.0.0.1', resolve));

const tempProfile = path.join(root, '.chrome-temp-profile-test-interactions-' + Date.now());
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

const evaluate = async (expression) => {
  const res = await sendCdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) {
    throw new Error('Eval failed: ' + JSON.stringify(res.exceptionDetails));
  }
  return res.result.value;
};

await sendCdp('Runtime.enable');
await sendCdp('Page.enable');

console.log('🧪 ==============================================================');
console.log('🧪 PHASE 2 DEDICATED INTERACTION & REGRESSION TEST SUITE');
console.log('🧪 ==============================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  ❌ [FAIL] ${testName} - ${details}`);
  }
}

try {
  // -------------------------------------------------------------
  // Test Suite 1: Desktop Sidebar Progressive Collapse & Expand
  // -------------------------------------------------------------
  console.log('--- Test Suite 1: Desktop Sidebar Progressive Collapse & Expand (1280x800) ---');
  await sendCdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await sendCdp('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/explore.html` });
  await sleep(1500);

  // 1.1 Initial Desktop Layout
  const initialLayout = await evaluate(`(() => {
    const layout = document.getElementById('explore-layout');
    const side = document.querySelector('.side');
    const stage = document.getElementById('stage-wrapper');
    const reopenBtn = document.getElementById('sidebar-reopen-btn');
    return {
      collapsed: layout.classList.contains('sidebar-collapsed'),
      sideWidth: Math.round(side.getBoundingClientRect().width),
      stageWidth: Math.round(stage.getBoundingClientRect().width),
      reopenVisible: reopenBtn ? getComputedStyle(reopenBtn).display !== 'none' : false
    };
  })()`);
  assert(!initialLayout.collapsed, 'Initial layout: sidebar is not collapsed', JSON.stringify(initialLayout));
  assert(initialLayout.sideWidth > 200, 'Initial sidebar is visible with width > 200px', `sideWidth: ${initialLayout.sideWidth}px`);
  assert(!initialLayout.reopenVisible, 'Initial reopen button is not displayed');

  // 1.2 Click Sidebar Collapse Button
  await evaluate(`document.getElementById('sidebar-collapse-btn').click()`);
  await sleep(300);

  const collapsedLayout = await evaluate(`(() => {
    const layout = document.getElementById('explore-layout');
    const side = document.querySelector('.side');
    const stage = document.getElementById('stage-wrapper');
    const reopenBtn = document.getElementById('sidebar-reopen-btn');
    return {
      collapsed: layout.classList.contains('sidebar-collapsed'),
      sideWidth: Math.round(side.getBoundingClientRect().width),
      stageWidth: Math.round(stage.getBoundingClientRect().width),
      reopenVisible: reopenBtn ? getComputedStyle(reopenBtn).display !== 'none' : false
    };
  })()`);
  assert(collapsedLayout.collapsed, 'After click collapse btn: layout has .sidebar-collapsed class');
  assert(collapsedLayout.sideWidth === 0, 'Sidebar width is 0 when collapsed', `actual: ${collapsedLayout.sideWidth}px`);
  assert(collapsedLayout.stageWidth > initialLayout.stageWidth + 250, 'Stage width expanded significantly (> +250px)', `new width: ${collapsedLayout.stageWidth}px`);
  assert(collapsedLayout.reopenVisible, 'Sidebar reopen button is visible after collapse');

  // 1.3 Click Reopen Button
  await evaluate(`document.getElementById('sidebar-reopen-btn').click()`);
  await sleep(300);

  const restoredLayout = await evaluate(`(() => {
    const layout = document.getElementById('explore-layout');
    const side = document.querySelector('.side');
    const stage = document.getElementById('stage-wrapper');
    const reopenBtn = document.getElementById('sidebar-reopen-btn');
    return {
      collapsed: layout.classList.contains('sidebar-collapsed'),
      sideWidth: Math.round(side.getBoundingClientRect().width),
      stageWidth: Math.round(stage.getBoundingClientRect().width),
      reopenVisible: reopenBtn ? getComputedStyle(reopenBtn).display !== 'none' : false
    };
  })()`);
  assert(!restoredLayout.collapsed, 'After click reopen btn: .sidebar-collapsed removed');
  assert(restoredLayout.sideWidth > 200, 'Sidebar restored and visible with width > 200px');
  assert(restoredLayout.stageWidth === initialLayout.stageWidth, 'Stage width restored to original width');

  // 1.4 Keyboard Shortcut 'S' Toggle
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', code: 'KeyS', bubbles: true }))`);
  await sleep(200);
  const keyCollapsed = await evaluate(`document.getElementById('explore-layout').classList.contains('sidebar-collapsed')`);
  assert(keyCollapsed, "Pressing key 's' collapses sidebar");

  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', code: 'KeyS', bubbles: true }))`);
  await sleep(200);
  const keyRestored = await evaluate(`!document.getElementById('explore-layout').classList.contains('sidebar-collapsed')`);
  assert(keyRestored, "Pressing key 's' again restores sidebar");

  // 1.5 Input Focus Protection (typing 's' in search does not collapse sidebar)
  const inputProtection = await evaluate(`(() => {
    const searchInput = document.getElementById('jump-search');
    searchInput.focus();
    const evt = new KeyboardEvent('keydown', { key: 's', code: 'KeyS', bubbles: true });
    searchInput.dispatchEvent(evt);
    const layout = document.getElementById('explore-layout');
    return layout.classList.contains('sidebar-collapsed');
  })()`);
  assert(!inputProtection, "Typing 's' inside search input does NOT trigger sidebar collapse");

  // -------------------------------------------------------------
  // Test Suite 2: In-Page Immersive Mode Entry & Exit
  // -------------------------------------------------------------
  console.log('\n--- Test Suite 2: In-Page Immersive Mode Entry & Exit (1280x800) ---');

  // 2.1 Click Immersive Mode Button in stage bar
  await evaluate(`document.getElementById('immersive-mode-btn').click()`);
  await sleep(300);

  const immersiveState = await evaluate(`(() => {
    const isImmersive = document.body.classList.contains('stage-immersive-mode');
    const exitBanner = document.getElementById('immersive-exit-banner');
    const bannerDisplay = exitBanner ? getComputedStyle(exitBanner).display : 'none';
    const stage = document.getElementById('stage-wrapper');
    const sRect = stage ? stage.getBoundingClientRect() : null;
    const header = document.querySelector('.explore-header');
    const headerDisplay = header ? getComputedStyle(header).display : 'none';
    return {
      isImmersive,
      bannerDisplay,
      headerDisplay,
      stageTop: sRect ? sRect.top : null,
      stageWidth: sRect ? Math.round(sRect.width) : null,
      stageHeight: sRect ? Math.round(sRect.height) : null
    };
  })()`);
  assert(immersiveState.isImmersive, 'body has .stage-immersive-mode class');
  assert(immersiveState.bannerDisplay !== 'none', 'Floating exit banner is visible');
  assert(immersiveState.headerDisplay === 'none', 'Page header is hidden in immersive mode');
  assert(immersiveState.stageTop === 0, 'Stage top aligned at 0px in immersive mode');
  assert(immersiveState.stageWidth === 1280 && immersiveState.stageHeight === 800, 'Stage expands to full viewport 1280x800', `Actual: ${immersiveState.stageWidth}x${immersiveState.stageHeight}`);

  // 2.2 Click Exit Button on Banner
  await evaluate(`document.getElementById('exit-immersive-btn').click()`);
  await sleep(300);

  const exitState = await evaluate(`(() => {
    const isImmersive = document.body.classList.contains('stage-immersive-mode');
    const exitBanner = document.getElementById('immersive-exit-banner');
    const bannerDisplay = exitBanner ? getComputedStyle(exitBanner).display : 'none';
    return { isImmersive, bannerDisplay };
  })()`);
  assert(!exitState.isImmersive, 'Clicking exit banner button leaves immersive mode');
  assert(exitState.bannerDisplay === 'none', 'Floating exit banner hidden after exit');

  // 2.3 Keyboard Shortcut 'I' enters immersive mode
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', code: 'KeyI', bubbles: true }))`);
  await sleep(200);
  const keyImmersive = await evaluate(`document.body.classList.contains('stage-immersive-mode')`);
  assert(keyImmersive, "Pressing key 'i' enters immersive mode");

  // 2.4 Keyboard Shortcut 'Escape' exits immersive mode
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }))`);
  await sleep(200);
  const keyEscape = await evaluate(`!document.body.classList.contains('stage-immersive-mode')`);
  assert(keyEscape, "Pressing key 'Escape' exits immersive mode");

  // -------------------------------------------------------------
  // Test Suite 3: Mobile Drawer & Touch Interactions (390x844)
  // -------------------------------------------------------------
  console.log('\n--- Test Suite 3: Mobile Drawer & Touch Interactions (390x844) ---');
  await sendCdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sendCdp('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/explore.html` });
  await sleep(1500);

  // 3.1 Mobile Drawer Toggle
  const mobileDrawerInitial = await evaluate(`(() => {
    const side = document.querySelector('.side');
    const toggleBtn = document.getElementById('side-toggle-btn');
    return {
      sideDisplay: getComputedStyle(side).display,
      expanded: toggleBtn.getAttribute('aria-expanded')
    };
  })()`);
  assert(mobileDrawerInitial.sideDisplay === 'none', 'Mobile: sidebar drawer is hidden by default');
  assert(mobileDrawerInitial.expanded === 'false', 'Mobile: drawer toggle button has aria-expanded="false"');

  await evaluate(`document.getElementById('side-toggle-btn').click()`);
  await sleep(200);
  const mobileDrawerOpened = await evaluate(`(() => {
    const side = document.querySelector('.side');
    const toggleBtn = document.getElementById('side-toggle-btn');
    const toggleText = document.getElementById('side-toggle-text');
    return {
      sideDisplay: getComputedStyle(side).display,
      expanded: toggleBtn.getAttribute('aria-expanded'),
      text: toggleText ? toggleText.textContent : ''
    };
  })()`);
  assert(mobileDrawerOpened.sideDisplay === 'block', 'Mobile: sidebar drawer opens on toggle click');
  assert(mobileDrawerOpened.expanded === 'true', 'Mobile: drawer toggle button has aria-expanded="true"');
  assert(mobileDrawerOpened.text.includes('收起'), 'Mobile: drawer text updates to show collapse hint');

  await evaluate(`document.getElementById('side-toggle-btn').click()`);
  await sleep(200);
  const mobileDrawerClosed = await evaluate(`(() => {
    const side = document.querySelector('.side');
    const toggleBtn = document.getElementById('side-toggle-btn');
    return {
      sideDisplay: getComputedStyle(side).display,
      expanded: toggleBtn.getAttribute('aria-expanded')
    };
  })()`);
  assert(mobileDrawerClosed.sideDisplay === 'none', 'Mobile: sidebar drawer closes on second toggle click');
  assert(mobileDrawerClosed.expanded === 'false', 'Mobile: drawer toggle button has aria-expanded="false"');

  // 3.2 Mobile Story Theater Panel & Touch Targets
  console.log('\n--- Test Suite 4: Mobile Story Theater Panel Touch Targets (390x844) ---');
  await sendCdp('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/explore.html?story=cassini` });
  await sleep(2000);

  const theaterTouchMetrics = await evaluate(`(() => {
    const panel = document.getElementById('story-theater-panel');
    const prevBtn = document.getElementById('theater-prev-btn');
    const pauseBtn = document.getElementById('theater-pause-toggle-btn');
    const nextBtn = document.getElementById('theater-next-btn');
    const replayBtn = document.getElementById('theater-replay-btn');
    const exitBtn = document.getElementById('theater-exit-btn');
    const stepBtns = Array.from(document.querySelectorAll('.theater-step-btn'));
    const telemetrySummary = document.getElementById('theater-telemetry-summary');

    const getMetrics = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { width: Math.round(r.width), height: Math.round(r.height) };
    };

    return {
      panelHeight: Math.round(panel.getBoundingClientRect().height),
      prevBtn: getMetrics(prevBtn),
      pauseBtn: getMetrics(pauseBtn),
      nextBtn: getMetrics(nextBtn),
      replayBtn: getMetrics(replayBtn),
      exitBtn: getMetrics(exitBtn),
      stepperHeights: stepBtns.map((b) => Math.round(b.getBoundingClientRect().height)),
      telemetrySummary: getMetrics(telemetrySummary)
    };
  })()`);

  assert(theaterTouchMetrics.panelHeight <= 220, `Mobile theater panel height <= 220px (actual: ${theaterTouchMetrics.panelHeight}px)`);
  assert(theaterTouchMetrics.prevBtn.height >= 40, `Prev button touch height >= 40px (actual: ${theaterTouchMetrics.prevBtn.height}px)`);
  assert(theaterTouchMetrics.pauseBtn.height >= 40, `Pause button touch height >= 40px (actual: ${theaterTouchMetrics.pauseBtn.height}px)`);
  assert(theaterTouchMetrics.nextBtn.height >= 40, `Next button touch height >= 40px (actual: ${theaterTouchMetrics.nextBtn.height}px)`);
  assert(theaterTouchMetrics.replayBtn.height >= 40, `Replay button touch height >= 40px (actual: ${theaterTouchMetrics.replayBtn.height}px)`);
  assert(theaterTouchMetrics.exitBtn.height >= 30, `Exit button touch height >= 30px (actual: ${theaterTouchMetrics.exitBtn.height}px)`);
  assert(theaterTouchMetrics.stepperHeights.every((h) => h >= 36), `All stepper buttons height >= 36px (actual: ${theaterTouchMetrics.stepperHeights.join(', ')}px)`);

  // 3.3 Telemetry details expand & collapse
  const initialOpen = await evaluate(`document.getElementById('theater-meta-bar').open`);
  assert(!initialOpen, 'Theater telemetry details is collapsed by default on mobile');

  await evaluate(`document.getElementById('theater-telemetry-summary').click()`);
  await sleep(200);
  const expandedOpen = await evaluate(`document.getElementById('theater-meta-bar').open`);
  assert(expandedOpen, 'Clicking telemetry summary expands telemetry details');

  await evaluate(`document.getElementById('theater-telemetry-summary').click()`);
  await sleep(200);
  const collapsedAgain = await evaluate(`!document.getElementById('theater-meta-bar').open`);
  assert(collapsedAgain, 'Clicking telemetry summary again collapses telemetry details');

} catch (err) {
  console.error('Unhandled error during test run:', err);
  failedTests++;
} finally {
  ws.close();
  chromeProcess.kill();
  server.close();
  try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch {}
}

console.log('\n==============================================================');
console.log(`SUMMARY: Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
console.log('==============================================================\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
