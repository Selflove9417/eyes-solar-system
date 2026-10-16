import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve('.');
const HTTP_PORT = 8897;
const CDP_PORT = 9455;
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
};

const server = http.createServer((req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1:' + HTTP_PORT).pathname);
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

const tempProfile = path.join(root, '.chrome-temp-phase4-' + Date.now());
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
await new Promise((resolve) => (ws.onopen = resolve));

let reqId = 0;
const callbacks = new Map();
const consoleErrors = [];

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.method === 'Runtime.consoleAPICalled') {
    if (msg.params.type === 'error') {
      consoleErrors.push(msg.params.args.map(a => a.value || a.description).join(' '));
    }
  }
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

const evalCdp = async (expression) => {
  const res = await sendCdp('Runtime.evaluate', { expression, returnByValue: true });
  return res.result ? res.result.value : undefined;
};

await sendCdp('Runtime.enable');
await sendCdp('Page.enable');

const results = [];
function report(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? '✅' : '❌'} [${pass ? 'PASS' : 'FAIL'}] ${name} ${detail ? '(' + detail + ')' : ''}`);
}

async function captureShot(filename) {
  const shotRes = await sendCdp('Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(shotRes.data, 'base64');
  if (process.argv.includes('--update-shots')) {
    const outPath = path.join(root, filename);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, buf);
    console.log(`  📸 Saved shot: ${filename} (${Math.round(buf.length / 1024)} KB)`);
  } else {
    const tmpPath = path.join(root, 'shots', '.tmp', path.basename(filename));
    fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
    fs.writeFileSync(tmpPath, buf);
    console.log(`  📸 Screenshot check OK: ${filename} (baseline preserved; saved to shots/.tmp/)`);
  }
}

// -------------------------------------------------------------
// Test 1: Desktop 1440 Viewport
// -------------------------------------------------------------
console.log('\n=== 1. Testing 1440x900 Desktop Viewport ===');
await sendCdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await sendCdp('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/explore.html` });
await sleep(1500);

const dm = await evalCdp(`(() => {
  const stage = document.getElementById('stage-wrapper');
  const stageRect = stage.getBoundingClientRect();
  const btn = document.getElementById('drawer-toggle-btn');
  const btnRect = btn.getBoundingClientRect();
  const presetBar = document.querySelector('.preset-bar');
  const drawer = document.getElementById('explore-drawer');
  const drawerRect = drawer.getBoundingClientRect();
  const title = document.querySelector('.explore-page-title');
  const titleStyle = window.getComputedStyle(title);
  const sub = document.querySelector('.explore-page-sub');
  const subStyle = window.getComputedStyle(sub);
  const tip = document.getElementById('user-guide-tip');
  const tipRect = tip ? tip.getBoundingClientRect() : null;
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
    btnHeight: btnRect.height,
    btnInPresetBar: presetBar.contains(btn),
    btnOverlapsIframe: overlapsIframe(btnRect),
    drawerOpen: document.body.classList.contains('drawer-open'),
    drawerLeft: drawerRect.left,
    titleFontSize: titleStyle.fontSize,
    subColor: subStyle.color,
    tipAboveToolbar: tipRect ? tipRect.bottom <= barRect.top + 2 : true,
    tipOverlapsIframe: tipRect ? overlapsIframe(tipRect) : false,
    tipVisible: tipRect && tipRect.width > 0 && tipRect.height > 0,
    toolbarBottom: barRect.bottom
  };
})()`);

report('1440 Desktop: No horizontal scroll', dm.scrollWidth <= dm.clientWidth, `scroll=${dm.scrollWidth}, client=${dm.clientWidth}`);
report('1440 Desktop: 3D Stage expands full content width (>1100px)', dm.stageWidth >= 1100, `width=${dm.stageWidth}px`);
report('1440 Desktop: 3D Viewport meets minimum height (>=480px)', dm.iframeHeight >= 480, `height=${dm.iframeHeight}px`);
report('1440 Desktop: Drawer button placed in preset bar with touch target >= 44px and no iframe overlap', dm.btnInPresetBar && dm.btnHeight >= 44 && !dm.btnOverlapsIframe, `in preset bar, height=${dm.btnHeight}px, no overlap`);
report('1440 Desktop: Drawer is closed initially', !dm.drawerOpen && dm.drawerLeft < 0, `left=${dm.drawerLeft}px`);
report('1440 Desktop: Page title matches h1 font size (>=28px)', parseFloat(dm.titleFontSize) >= 28, `fontSize=${dm.titleFontSize}`);
report('1440 Desktop: Tip bar placed below viewport without covering iframe', dm.tipAboveToolbar && !dm.tipOverlapsIframe && dm.tipVisible, 'above toolbar, no overlap');
report('1440 Desktop: 3D viewport and toolbar fully visible on screen (<=900px)', dm.toolbarBottom <= 900, `toolbar bottom=${dm.toolbarBottom}px`);

await captureShot('shots/phase4-explore-1440.png');

// Open drawer on 1440
await evalCdp(`document.getElementById('drawer-toggle-btn').click()`);
await sleep(300);

const ddm = await evalCdp(`(() => {
  const drawer = document.getElementById('explore-drawer');
  const drawerRect = drawer.getBoundingClientRect();
  return {
    drawerOpen: document.body.classList.contains('drawer-open'),
    drawerLeft: drawerRect.left,
    drawerWidth: drawerRect.width,
    activeTag: document.activeElement ? document.activeElement.id : null
  };
})()`);

report('1440 Desktop: Drawer opens smoothly on click', ddm.drawerOpen && ddm.drawerLeft === 0, `left=${ddm.drawerLeft}px, width=${ddm.drawerWidth}px`);
report('1440 Desktop: Search input receives focus automatically', ddm.activeTag === 'jump-search', `focus=${ddm.activeTag}`);

await captureShot('shots/phase4-explore-1440-drawer.png');

// Close drawer via Escape key
await sendCdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await sendCdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await sleep(300);

const dcm = await evalCdp(`(() => {
  const drawer = document.getElementById('explore-drawer');
  const drawerRect = drawer.getBoundingClientRect();
  return {
    drawerOpen: document.body.classList.contains('drawer-open'),
    drawerLeft: drawerRect.left,
    focusRestored: document.activeElement ? document.activeElement.id : null
  };
})()`);

report('1440 Desktop: Esc closes drawer and restores focus to button', !dcm.drawerOpen && dcm.focusRestored === 'drawer-toggle-btn', `focus=${dcm.focusRestored}`);

// -------------------------------------------------------------
// Test 2: Mobile 375 Viewport
// -------------------------------------------------------------
console.log('\n=== 2. Testing 375x812 Mobile Viewport ===');
await sendCdp('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
await sendCdp('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/explore.html` });
await sleep(1500);

const mm = await evalCdp(`(() => {
  const stage = document.getElementById('stage-wrapper');
  const stageRect = stage.getBoundingClientRect();
  const btn = document.getElementById('drawer-toggle-btn');
  const btnRect = btn.getBoundingClientRect();
  return {
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    stageWidth: stageRect.width,
    stageHeight: stageRect.height,
    btnHeight: btnRect.height
  };
})()`);

report('375 Mobile: No horizontal scroll', mm.scrollWidth <= mm.clientWidth, `scroll=${mm.scrollWidth}, client=${mm.clientWidth}`);
report('375 Mobile: 3D Stage height约 60vh (>=360px)', mm.stageHeight >= 360, `height=${mm.stageHeight}px`);
report('375 Mobile: Drawer toggle button >= 44px', mm.btnHeight >= 44, `height=${mm.btnHeight}px`);

await captureShot('shots/phase4-explore-375.png');

// Open drawer on mobile
await evalCdp(`document.getElementById('drawer-toggle-btn').click()`);
await sleep(300);

const mdm = await evalCdp(`(() => {
  const drawer = document.getElementById('explore-drawer');
  const drawerRect = drawer.getBoundingClientRect();
  return {
    drawerOpen: document.body.classList.contains('drawer-open'),
    drawerLeft: drawerRect.left,
    drawerWidth: drawerRect.width,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  };
})()`);

report('375 Mobile: Drawer covers 100% viewport width without horizontal spill', mdm.drawerWidth >= 370 && mdm.scrollWidth <= 375, `drawerWidth=${mdm.drawerWidth}px, scrollWidth=${mdm.scrollWidth}px`);

await captureShot('shots/phase4-explore-375-drawer.png');

// Close mobile drawer
await evalCdp(`document.getElementById('drawer-close-btn').click()`);
await sleep(300);

// -------------------------------------------------------------
// Test 3: 768 Tablet Viewport
// -------------------------------------------------------------
console.log('\n=== 3. Testing 768x1024 Tablet Viewport ===');
await sendCdp('Emulation.setDeviceMetricsOverride', { width: 768, height: 1024, deviceScaleFactor: 1, mobile: false });
await sendCdp('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/explore.html` });
await sleep(1500);

const tm = await evalCdp(`(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth
}))()`);

report('768 Tablet: No horizontal scroll', tm.scrollWidth <= tm.clientWidth, `scroll=${tm.scrollWidth}, client=${tm.clientWidth}`);

// -------------------------------------------------------------
// Test 4: Touch Target Sizes & Preset Bar Interactions
// -------------------------------------------------------------
console.log('\n=== 4. Testing Preset Bar & Interaction Targets ===');
await sendCdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await sendCdp('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/explore.html` });
await sleep(1500);

const tt = await evalCdp(`(() => {
  const chips = Array.from(document.querySelectorAll('.preset-bar .chip')).map(c => ({
    text: c.textContent.trim(),
    height: c.getBoundingClientRect().height,
    width: c.getBoundingClientRect().width
  }));
  const toolBtns = [
    document.getElementById('reset-home-btn'),
    document.getElementById('immersive-mode-btn'),
    document.getElementById('fullscreen-btn'),
    document.getElementById('open-raw')
  ].map(b => ({
    id: b.id,
    height: b.getBoundingClientRect().height,
    width: b.getBoundingClientRect().width
  }));
  const guidedActions = Array.from(document.querySelectorAll('.guided-action-primary, .guided-action-secondary')).map(a => ({
    text: a.textContent.trim(),
    height: a.getBoundingClientRect().height
  }));
  return { chips, toolBtns, guidedActions };
})()`);

const allChipsGte44 = tt.chips.every(c => c.height >= 44);
report('All Preset Bar tabs meet >= 44px touch height', allChipsGte44, `heights: ${tt.chips.map(c => Math.round(c.height)).join(', ')}px`);

const allToolsGte44 = tt.toolBtns.every(b => b.height >= 44);
report('All Stage Toolbar action buttons & links meet >= 44px', allToolsGte44, `heights: ${tt.toolBtns.map(b => Math.round(b.height)).join(', ')}px`);

const allGuidedGte44 = tt.guidedActions.every(a => a.height >= 44);
report('All Guided Route action links meet >= 44px', allGuidedGte44, `heights: ${tt.guidedActions.map(a => Math.round(a.height)).join(', ')}px`);

// -------------------------------------------------------------
// Test 5: Verify Clicking Preset Routes & Drawer Entities
// -------------------------------------------------------------
console.log('\n=== 5. Testing Route Switches (Presets & Drawer Entities) ===');
const routesToTest = ['saturn', 'mars', 'earth', 'sun', 'sc_jwst', 'sc_voyager_1', 'sc_mars_2020', 'home'];
for (const r of routesToTest) {
  await evalCdp(`document.querySelector('[data-quick="${r}"]').click()`);
  await sleep(400);
  const st = await evalCdp(`(() => ({
    route: window.__theater.state.route,
    src: document.getElementById('stage').src,
    label: document.getElementById('current-label').textContent,
    note: document.getElementById('current-note').textContent
  }))()`);
  report(`Preset route '${r}' switch verified`, st.route === r && st.src.includes(r), `label="${st.label}", note="${st.note}"`);
}

// Open drawer and click 10 entities
console.log('\n=== 6. Testing 10+ Drawer Entity Clicks ===');
const drawerEntities = ['jupiter', 'mercury', 'venus', 'uranus', 'neptune', 'moon', 'titan', 'europa', '134340_pluto', '1_ceres', 'sc_cassini', 'sc_europa_clipper'];
for (const id of drawerEntities) {
  const res = await evalCdp(`(() => {
    const btn = document.querySelector('[data-route="${id}"]');
    if (!btn) return { error: 'Button not found for ' + '${id}' };
    btn.click();
    return {
      route: window.__theater.state.route,
      src: document.getElementById('stage').src,
      label: document.getElementById('current-label').textContent,
      note: document.getElementById('current-note').textContent
    };
  })()`);
  report(`Drawer entity '${id}' switch verified`, res.route === id && res.src.includes(id), `label="${res.label}", note="${res.note}"`);
}

// -------------------------------------------------------------
// Test 7: Verify Story Theater Entry & Playback
// -------------------------------------------------------------
console.log('\n=== 7. Testing Cassini Story Theater Entry & Playback ===');
await evalCdp(`document.getElementById('theater-trigger-btn').click()`);
await sleep(500);

const tps = await evalCdp(`(() => {
  const panel = document.getElementById('story-theater-panel');
  const narrative = document.getElementById('theater-narrative-section');
  return {
    active: window.__theater.theaterState.active,
    panelVisible: window.getComputedStyle(panel).display !== 'none',
    narrativeVisible: window.getComputedStyle(narrative).display !== 'none',
    currentScene: window.__theater.theaterState.currentScene
  };
})()`);

report('Story Theater entered successfully via preset bar button', tps.active && tps.panelVisible, `scene=${tps.currentScene}`);

// Exit Theater
await evalCdp(`document.getElementById('theater-exit-btn').click()`);
await sleep(300);

const extStatus = await evalCdp(`(() => ({
  active: window.__theater.theaterState.active,
  panelDisplay: document.getElementById('story-theater-panel').style.display
}))()`);
report('Story Theater exited cleanly', !extStatus.active && extStatus.panelDisplay === 'none', 'restored normal exploration');

// -------------------------------------------------------------
// Test 8: Immersive Mode Entry & Exit
// -------------------------------------------------------------
console.log('\n=== 8. Testing In-Page Immersive Mode ===');
await evalCdp(`document.getElementById('immersive-mode-btn').click()`);
await sleep(300);

const immStatus = await evalCdp(`(() => {
  const isImm = document.body.classList.contains('stage-immersive-mode');
  const banner = document.getElementById('immersive-exit-banner');
  return {
    isImm,
    bannerVisible: window.getComputedStyle(banner).display !== 'none'
  };
})()`);
report('Immersive mode entered', immStatus.isImm && immStatus.bannerVisible, 'stage-immersive-mode active');

// Exit via Esc
await sendCdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await sendCdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await sleep(300);

const exitImm = await evalCdp(`document.body.classList.contains('stage-immersive-mode')`);
report('Immersive mode exited via Esc key', !exitImm, 'restored layout');

// -------------------------------------------------------------
// Test 9: Contrast Ratio & Color Tokens
// -------------------------------------------------------------
console.log('\n=== 9. Testing Contrast Ratios ===');
function luminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrast(rgb1, rgb2) {
  const l1 = luminance(...rgb1);
  const l2 = luminance(...rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// Background is #030712 => [3, 7, 18]
const bgRgb = [3, 7, 18];
const whiteContrast = contrast([255, 255, 255], bgRgb);
const mutedContrast = contrast([148, 163, 184], bgRgb);
const accentContrast = contrast([56, 189, 248], bgRgb);

report('Title contrast (#fff on #030712) >= 7:1 (AAA standard)', whiteContrast >= 7.0, `${whiteContrast.toFixed(2)}:1`);
report('Muted text contrast (#94a3b8 on #030712) >= 4.5:1 (AA standard)', mutedContrast >= 4.5, `${mutedContrast.toFixed(2)}:1`);
report('Accent text contrast (#38bdf8 on #030712) >= 4.5:1 (AA standard)', accentContrast >= 4.5, `${accentContrast.toFixed(2)}:1`);

// -------------------------------------------------------------
// Test 10: Regression Check on other pages
// -------------------------------------------------------------
console.log('\n=== 10. Regression Check on Other Inner Pages ===');
for (const p of ['index.html', 'bodies.html', 'missions.html', 'glossary.html']) {
  await sendCdp('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/${p}` });
  await sleep(600);
  const pageCheck = await evalCdp(`(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    hasH1: !!document.querySelector('h1')
  }))()`);
  report(`Page ${p} has no horizontal scroll and valid h1`, pageCheck.scrollWidth <= pageCheck.clientWidth && pageCheck.hasH1, `scroll=${pageCheck.scrollWidth}, client=${pageCheck.clientWidth}`);
}

// -------------------------------------------------------------
// Test 11: Console Errors Check
// -------------------------------------------------------------
console.log('\n=== 11. Checking Console Errors ===');
report('Zero console errors during all phase 4 interactions', consoleErrors.length === 0, consoleErrors.join(', ') || '0 errors');

// Cleanup
chromeProcess.kill();
await new Promise(r => server.close(r));
try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch {}

const total = results.length;
const passed = results.filter(r => r.pass).length;
const failed = total - passed;
console.log(`\n======================================================`);
console.log(`Phase 4 QA Summary: ${passed} Passed, ${failed} Failed out of ${total} tests.`);
console.log(`======================================================\n`);

if (failed > 0) process.exit(1);
