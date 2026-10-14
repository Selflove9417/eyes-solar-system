// End-to-end Browser Acceptance Test for Story Theater
// Tests:
// Test A: Scene 2 Timeline Continuity (Runs at 1x for 25+ seconds, verifies 10:32:06 auto-freeze & NO clock regression into Scene 3)
// Test B: Homepage Direct Entry to Story Theater (?story=cassini, Scene 1 -> 2 -> 3 transitions, iframe URLs, clock, buttons, exit)

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const runAll = args.includes('--all');
const runAB = args.includes('--ab') || runAll;
const runHotfix = args.includes('--hotfix') || !args.includes('--ab');

const HTTP_PORT = 8899;
const CDP_PORT = 9444;
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

// 1. Start local static HTTP server
const server = http.createServer((req, res) => {
  try {
    const u = new URL(req.url, `http://127.0.0.1:${HTTP_PORT}`);
    let pathname = decodeURIComponent(u.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const filePath = path.join(root, pathname);
    if (!filePath.startsWith(root)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      res.end(fs.readFileSync(filePath));
    } else {
      res.writeHead(404).end('Not Found');
    }
  } catch (err) {
    res.writeHead(500).end(err.message);
  }
});

await new Promise((resolve) => server.listen(HTTP_PORT, '127.0.0.1', resolve));
console.log(`🌐 Local HTTP Server running on http://127.0.0.1:${HTTP_PORT}`);

// 2. Launch real Headless Chrome with remote debugging
const tempProfile = path.join(root, '.chrome-temp-profile-' + Date.now());
fs.mkdirSync(tempProfile, { recursive: true });

console.log(`🚀 Launching Headless Chrome: ${CHROME_PATH}`);
const chromeProcess = spawn(CHROME_PATH, [
  '--headless=new',
  `--remote-debugging-port=${CDP_PORT}`,
  '--disable-gpu',
  '--no-sandbox',
  `--user-data-dir=${tempProfile}`,
  'about:blank',
], { stdio: 'ignore' });

// Wait for CDP endpoint to be ready
let targets = null;
for (let i = 0; i < 30; i++) {
  await sleep(300);
  try {
    const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
    targets = await res.json();
    if (targets && targets.length > 0) break;
  } catch {}
}

if (!targets || !targets.length) {
  throw new Error('Failed to connect to Chrome CDP endpoint.');
}

const pageTarget = targets.find((t) => t.type === 'page') || targets[0];
console.log(`🔌 Connected to CDP target: ${pageTarget.title} (${pageTarget.id})`);

const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
await new Promise((resolve) => (ws.onopen = resolve));

let reqId = 0;
const callbacks = new Map();
const consoleErrors = [];

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.method === 'Runtime.consoleAPICalled') {
    if (msg.params.type === 'error') {
      consoleErrors.push(msg.params.args.map((a) => a.value || a.description).join(' '));
    }
  } else if (msg.method === 'Runtime.exceptionThrown') {
    consoleErrors.push(msg.params.exceptionDetails.text + ' ' + (msg.params.exceptionDetails.exception?.description || ''));
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

const evaluate = async (expression) => {
  const res = await sendCdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) {
    throw new Error('CDP Evaluate Exception: ' + JSON.stringify(res.exceptionDetails));
  }
  return res.result.value;
};

await sendCdp('Runtime.enable');
await sendCdp('Page.enable');
await sendCdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

if (runAB) {
console.log('\n======================================================');
console.log('🧪 TEST B: Homepage Direct Entry to Story Theater');
console.log('======================================================\n');

// Navigate to Home Page
await sendCdp('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/index.html` });
await sleep(1500);

const homeInfo = await evaluate(`(() => {
  const heroBtn = document.querySelector('a.btn-hero-primary');
  const showcase = document.querySelector('section.theater-showcase');
  const showcaseLink = showcase?.querySelector('a.btn-primary');
  return {
    title: document.title,
    heroBtnText: heroBtn?.textContent?.replace(/\\s+/g, ' ').trim(),
    heroBtnHref: heroBtn?.getAttribute('href'),
    hasShowcase: !!showcase,
    showcaseTitle: showcase?.querySelector('.theater-showcase-title')?.textContent?.trim(),
    showcaseHref: showcaseLink?.getAttribute('href'),
  };
})()`);

console.log('1. Homepage Loaded:', homeInfo);
if (!homeInfo.heroBtnHref?.includes('story=cassini')) {
  throw new Error('Hero action button does not link to ?story=cassini');
}
if (!homeInfo.hasShowcase) {
  throw new Error('Story theater showcase not found on homepage');
}

// Navigate to explore.html?story=cassini
console.log('\n2. Navigating to explore.html?story=cassini...');
await sendCdp('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/explore.html?story=cassini` });
await sleep(2500);

// Check if Story Theater automatically activated Scene 1
const scene1State = await evaluate(`(() => {
  const panel = document.getElementById('story-theater-panel');
  const iframe = document.getElementById('stage');
  const t = window.__theater;
  return {
    theaterActive: t?.theaterState?.active,
    currentScene: t?.theaterState?.currentScene,
    panelDisplay: getComputedStyle(panel).display,
    iframeSrc: iframe?.src,
    stateRoute: t?.state?.route,
    stateTime: t?.state?.time,
    stateRate: t?.state?.rate,
    sceneIdxText: document.getElementById('theater-scene-idx-text')?.textContent,
    scetText: document.getElementById('theater-scet-text')?.textContent,
    prevDisabled: document.getElementById('theater-prev-btn')?.disabled,
    nextDisabled: document.getElementById('theater-next-btn')?.disabled,
  };
})()`);

console.log('3. Scene 1 Auto-Activation State:', scene1State);
if (!scene1State.theaterActive || scene1State.currentScene !== 0) {
  throw new Error('Story theater failed to activate Scene 1 automatically from ?story=cassini URL');
}
if (scene1State.panelDisplay !== 'block') {
  throw new Error('Story theater panel is not visible (display != block)');
}
if (!scene1State.iframeSrc.includes('sc_cassini') || !scene1State.iframeSrc.includes('rate=60')) {
  throw new Error(`Scene 1 iframe URL incorrect: ${scene1State.iframeSrc}`);
}

// Click Next Scene -> Scene 2
console.log('\n4. Clicking 【下一幕 ⏩】 to enter Scene 2 (高层大气切入)...');
await evaluate(`document.getElementById('theater-next-btn').click()`);
await sleep(1500);

const scene2State = await evaluate(`(() => {
  const t = window.__theater;
  const iframe = document.getElementById('stage');
  return {
    theaterActive: t?.theaterState?.active,
    currentScene: t?.theaterState?.currentScene,
    stateTime: t?.state?.time,
    stateRate: t?.state?.rate,
    iframeSrc: iframe?.src,
    sceneIdxText: document.getElementById('theater-scene-idx-text')?.textContent,
    scetText: document.getElementById('theater-scet-text')?.textContent,
    rateBadge: document.getElementById('theater-rate-badge')?.textContent,
  };
})()`);

console.log('5. Scene 2 Initial State:', scene2State);
if (scene2State.currentScene !== 1) throw new Error('Failed to transition to Scene 2');
if (scene2State.stateRate !== 1 || !scene2State.stateTime.startsWith('2017-09-15T10:31:48')) {
  throw new Error(`Scene 2 time/rate mismatch: time=${scene2State.stateTime}, rate=${scene2State.stateRate}`);
}

// Click Next Scene -> Scene 3
console.log('\n6. Clicking 【下一幕 ⏩】 to enter Scene 3 (终曲与通信中断历史定格)...');
await evaluate(`document.getElementById('theater-next-btn').click()`);
await sleep(1500);

const scene3State = await evaluate(`(() => {
  const t = window.__theater;
  const iframe = document.getElementById('stage');
  const img = document.getElementById('theater-historic-img');
  return {
    theaterActive: t?.theaterState?.active,
    currentScene: t?.theaterState?.currentScene,
    stateTime: t?.state?.time,
    stateRate: t?.state?.rate,
    iframeSrc: iframe?.src,
    sceneIdxText: document.getElementById('theater-scene-idx-text')?.textContent,
    rateBadge: document.getElementById('theater-rate-badge')?.textContent,
    nextDisabled: document.getElementById('theater-next-btn')?.disabled,
    hasArchiveImage: !!img && img.naturalWidth > 0,
    imgSrc: img?.src,
  };
})()`);

console.log('7. Scene 3 State:', scene3State);
if (scene3State.currentScene !== 2) throw new Error('Failed to transition to Scene 3');
if (scene3State.stateRate !== 0 || !scene3State.stateTime.startsWith('2017-09-15T10:32:06')) {
  throw new Error(`Scene 3 time/rate mismatch: time=${scene3State.stateTime}, rate=${scene3State.stateRate}`);
}
if (!scene3State.nextDisabled) {
  throw new Error('Next button must be disabled on the final scene (Scene 3)');
}

// Click Exit Theater
console.log('\n8. Clicking 【✕ 退出剧场】...');
await evaluate(`document.getElementById('theater-exit-btn').click()`);
await sleep(800);

const exitState = await evaluate(`(() => {
  const panel = document.getElementById('story-theater-panel');
  const t = window.__theater;
  return {
    theaterActive: t?.theaterState?.active,
    panelDisplay: getComputedStyle(panel).display,
    stateRoute: t?.state?.route,
  };
})()`);

console.log('9. Post-Exit State:', exitState);
if (exitState.theaterActive !== false || exitState.panelDisplay !== 'none') {
  throw new Error('Failed to exit theater cleanly');
}
console.log('✅ TEST B PASSED: Homepage direct link, all scene transitions, iframe params, buttons, and exit verified successfully!\n');


console.log('======================================================');
console.log('🧪 TEST A: Scene 2 Timeline Continuity (25+ Seconds)');
console.log('======================================================\n');

// Activate Scene 2 directly and run for 25+ seconds
console.log('1. Starting Scene 2 at 10:31:48 UTC (rate = 1x)...');
await evaluate(`window.__theater.activateTheater(1)`);
await sleep(1000);

const s2Initial = await evaluate(`(() => {
  const t = window.__theater;
  return {
    scene: t.theaterState.currentScene,
    time: t.state.time,
    rate: t.state.rate,
    isPaused: t.theaterState.isPaused,
    accumulatedMs: t.theaterState.sceneAccumulatedSimMs,
    wallStart: t.theaterState.scenePlayStartWallMs,
  };
})()`);

console.log('Initial Scene 2 Launch Snapshot:', s2Initial);
if (!s2Initial.time.startsWith('2017-09-15T10:31:48')) {
  throw new Error('Scene 2 did not start at 10:31:48 UTC');
}

// Sample progress over 26 seconds (every 5 seconds)
const samples = [];
console.log('Observing real-time simulation progress for 26 seconds...');

for (let s = 5; s <= 25; s += 5) {
  await sleep(5000);
  const sample = await evaluate(`(() => {
    const t = window.__theater;
    const clockText = document.getElementById('theater-sim-clock-val')?.textContent;
    const rateBadge = document.getElementById('theater-rate-badge')?.textContent;
    const pauseBtnText = document.getElementById('theater-pause-toggle-btn')?.textContent?.trim();
    const elapsedWallMs = Math.max(0, Date.now() - t.theaterState.scenePlayStartWallMs);
    return {
      elapsedWallSeconds: (elapsedWallMs / 1000).toFixed(1),
      isPaused: t.theaterState.isPaused,
      stateTime: t.state.time,
      stateRate: t.state.rate,
      accumulatedMs: t.theaterState.sceneAccumulatedSimMs,
      clockText,
      rateBadge,
      pauseBtnText,
    };
  })()`);
  samples.push(sample);
  console.log(`  ⏱️ [${sample.elapsedWallSeconds}s elapsed]:`, {
    isPaused: sample.isPaused,
    simTime: sample.stateTime,
    simRate: sample.stateRate,
    clockText: sample.clockText,
    badge: sample.rateBadge,
    pauseBtn: sample.pauseBtnText,
  });
}

// Sleep an extra 2 seconds to exceed 25 seconds definitely
await sleep(2000);

const s2FinalBeforeNext = await evaluate(`(() => {
  const t = window.__theater;
  return {
    accumulatedMs: t.theaterState.sceneAccumulatedSimMs,
    stateTime: t.state.time,
    stateRate: t.state.rate,
    isPaused: t.theaterState.isPaused,
    clockText: document.getElementById('theater-sim-clock-val')?.textContent,
    badgeText: document.getElementById('theater-rate-badge')?.textContent,
    btnText: document.getElementById('theater-pause-toggle-btn')?.textContent?.trim(),
  };
})()`);

console.log('\nScene 2 Final State After 27s Observation:', s2FinalBeforeNext);

// Verify auto-pause at boundary
if (!s2FinalBeforeNext.isPaused) {
  throw new Error('Scene 2 did not auto-pause after reaching boundary (18s / 10:32:06 UTC)');
}
if (s2FinalBeforeNext.accumulatedMs > 18000) {
  throw new Error(`Scene 2 accumulated ms exceeded 18000ms boundary cap: ${s2FinalBeforeNext.accumulatedMs}`);
}
if (!s2FinalBeforeNext.stateTime.startsWith('2017-09-15T10:32:06')) {
  throw new Error(`Scene 2 state time did not freeze at 10:32:06 UTC: ${s2FinalBeforeNext.stateTime}`);
}

// Now click Next Scene to enter Scene 3!
console.log('\n2. Clicking 【下一幕 ⏩】 to transition from Scene 2 boundary into Scene 3...');
await evaluate(`document.getElementById('theater-next-btn').click()`);
await sleep(1200);

const s3TransitionState = await evaluate(`(() => {
  const t = window.__theater;
  return {
    scene: t.theaterState.currentScene,
    stateTime: t.state.time,
    stateRate: t.state.rate,
    timeEpoch: new Date(t.state.time).getTime(),
  };
})()`);

const s2EndTimeEpoch = new Date(s2FinalBeforeNext.stateTime).getTime();
const s3StartTimeEpoch = s3TransitionState.timeEpoch;
const deltaMs = s3StartTimeEpoch - s2EndTimeEpoch;

console.log('Scene 3 Transition Timestamp Analysis:');
console.log(`  Scene 2 Frozen Time : ${s2FinalBeforeNext.stateTime} (${s2EndTimeEpoch})`);
console.log(`  Scene 3 Initial Time: ${s3TransitionState.stateTime} (${s3StartTimeEpoch})`);
console.log(`  Clock Delta         : ${deltaMs} ms (${deltaMs / 1000} seconds)`);

if (deltaMs < 0) {
  throw new Error(`❌ CLOCK REGRESSION DETECTED! Clock jumped backwards by ${Math.abs(deltaMs) / 1000}s!`);
} else if (deltaMs === 0) {
  console.log('  🎯 PERFECT SEAMLESS CONTINUITY: 0ms delta, strictly continuous with zero backwards jumping!');
} else {
  console.log(`  ➡️ Time progressed forward by ${deltaMs / 1000}s.`);
}
} // end if (runAB)

if (runHotfix) {
  console.log('\n======================================================');
  console.log('🧪 TEST C: Mid-scene Detach to Mars & Old Timer Neutralization');
  console.log('======================================================\n');

  // 1. Navigate to explore.html?story=cassini
  await sendCdp('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/explore.html?story=cassini` });
  await sleep(2500);

  // 2. Activate Scene 2 directly
  console.log('1. Starting Scene 2 at 10:31:48 UTC (rate = 1x)...');
  await evaluate(`window.__theater.activateTheater(1)`);
  await sleep(1000);

  // 3. Wait ~5 seconds
  console.log('2. Allowing Scene 2 to run for ~5 seconds...');
  await sleep(4000);

  const midSceneSnapshot = await evaluate(`(() => {
    const t = window.__theater;
    return {
      scene: t?.theaterState?.currentScene,
      mode: t?.theaterState?.mode,
      route: t?.state?.route,
      time: t?.state?.time,
      rate: t?.state?.rate,
    };
  })()`);
  console.log('3. Mid-Scene 2 Snapshot (at ~5s):', midSceneSnapshot);
  if (midSceneSnapshot.route !== 'sc_cassini' || midSceneSnapshot.mode !== 'following') {
    throw new Error('Scene 2 did not initialize properly in following mode');
  }

  // 4. Switch to Mars via sidebar navigation button
  console.log('4. Clicking Mars navigation button (detach into free exploration)...');
  await evaluate(`(() => {
    const marsBtn = document.querySelector('[data-route="mars"]');
    if (!marsBtn) throw new Error('Mars nav button [data-route="mars"] not found');
    marsBtn.click();
  })()`);
  await sleep(1000);

  const postSwitchSnapshot = await evaluate(`(() => {
    const t = window.__theater;
    const iframe = document.getElementById('stage');
    const detachedBanner = document.getElementById('theater-detached-banner');
    return {
      route: t?.state?.route,
      mode: t?.theaterState?.mode,
      time: t?.state?.time,
      rate: t?.state?.rate,
      timeInput: document.getElementById('time-input')?.value,
      rateInput: document.getElementById('rate-input')?.value,
      detachedBannerDisplay: detachedBanner ? getComputedStyle(detachedBanner).display : 'none',
      iframeSrc: iframe?.src,
    };
  })()`);
  console.log('5. Immediate State after Switching to Mars:', postSwitchSnapshot);

  if (postSwitchSnapshot.route !== 'mars' || postSwitchSnapshot.mode !== 'detached') {
    throw new Error('Switching to Mars failed to detach theater mode');
  }
  if (postSwitchSnapshot.time !== '' || postSwitchSnapshot.rate !== '') {
    throw new Error(`State time/rate not reset upon detaching: time=${postSwitchSnapshot.time}, rate=${postSwitchSnapshot.rate}`);
  }

  // 5. Wait for 15 more seconds (total ~20s since Scene 2 start, exceeding the 18s boundary)
  console.log('6. Waiting 15s to elapse beyond original 18s boundary (total ~20s elapsed)...');
  await sleep(15000);

  // 6. Verify state at 20s
  const pastBoundarySnapshot = await evaluate(`(() => {
    const t = window.__theater;
    const iframe = document.getElementById('stage');
    const detachedBanner = document.getElementById('theater-detached-banner');
    return {
      route: t?.state?.route,
      mode: t?.theaterState?.mode,
      time: t?.state?.time,
      rate: t?.state?.rate,
      timeInput: document.getElementById('time-input')?.value,
      rateInput: document.getElementById('rate-input')?.value,
      detachedBannerDisplay: detachedBanner ? getComputedStyle(detachedBanner).display : 'none',
      iframeSrc: iframe?.src,
    };
  })()`);

  console.log('\n7. Snapshot Past the 18s Boundary (>20s total elapsed):', pastBoundarySnapshot);

  // Verify Parent Page Clock & State Isolation
  console.log('\n--- [Clock & State Isolation Verification: Parent Page] ---');
  if (pastBoundarySnapshot.route !== 'mars') {
    throw new Error(`❌ PARENT STATE OVERWRITTEN: Route reverted to '${pastBoundarySnapshot.route}' (expected 'mars')`);
  }
  if (pastBoundarySnapshot.time !== '') {
    throw new Error(`❌ PARENT TIME OVERWRITTEN: Time was set to '${pastBoundarySnapshot.time}' by old boundary timer!`);
  }
  if (pastBoundarySnapshot.rate !== '') {
    throw new Error(`❌ PARENT RATE OVERWRITTEN: Rate was set to '${pastBoundarySnapshot.rate}' by old boundary timer!`);
  }
  if (pastBoundarySnapshot.mode !== 'detached') {
    throw new Error(`❌ THEATER MODE CORRUPTED: Mode is '${pastBoundarySnapshot.mode}' (expected 'detached')`);
  }
  if (pastBoundarySnapshot.timeInput !== '' || pastBoundarySnapshot.rateInput !== '') {
    throw new Error('❌ Input boxes were overwritten by old boundary timer!');
  }
  console.log('  ✅ Parent Page State: Route is strictly "mars", time/rate remain empty, detached banner active.');

  // Verify NASA iframe Communication & Clock Boundary
  console.log('--- [NASA iframe Parameter & Clock Boundary Verification] ---');
  if (pastBoundarySnapshot.iframeSrc.includes('sc_cassini')) {
    throw new Error(`❌ IFRAME OVERWRITTEN: iframe URL reverted to Cassini: ${pastBoundarySnapshot.iframeSrc}`);
  }
  if (pastBoundarySnapshot.iframeSrc.includes('10%3A32%3A06') || pastBoundarySnapshot.iframeSrc.includes('10:32:06')) {
    throw new Error(`❌ IFRAME TIME OVERWRITTEN: Cassini freeze-frame timestamp sent to iframe: ${pastBoundarySnapshot.iframeSrc}`);
  }
  if (pastBoundarySnapshot.iframeSrc.includes('rate=0')) {
    throw new Error(`❌ IFRAME RATE OVERWRITTEN: rate=0 sent to iframe: ${pastBoundarySnapshot.iframeSrc}`);
  }
  console.log('  ✅ NASA iframe URL: Strictly points to Mars without Cassini timestamps or rate=0 overrides.');
  console.log('  ℹ️ Clock Boundary Distinction: Parent page acts as authoritative control surface. Under browser SOP, cross-origin NASA Eyes iframe DOM is sandbox-isolated; iframe.src verifies that no rogue Cassini commands were dispatched.');
  console.log('✅ TEST C PASSED: Mid-scene detach to Mars successfully cleared boundary timer with ZERO timer overwrite!\n');

  console.log('======================================================');
  console.log('🧪 TEST D: Manual Time Machine Setting During Scene 2');
  console.log('======================================================\n');

  // 1. Activate Scene 2 again
  console.log('1. Starting Scene 2 at 10:31:48 UTC (rate = 1x)...');
  await evaluate(`window.__theater.activateTheater(1)`);
  await sleep(1000);

  // 2. Allow to run for ~3 seconds
  console.log('2. Allowing Scene 2 to run for ~3 seconds...');
  await sleep(3000);

  // 3. User manually inputs custom time & rate into Time Machine
  const customTimeInput = '2020-01-01T00:00';
  const expectedIso = '2020-01-01T00:00:00.000Z';
  const customRateInput = '60';

  console.log(`3. User sets Time Machine: time=${customTimeInput}, rate=${customRateInput} and clicks 【前往指定时空】...`);
  await evaluate(`(() => {
    const timeInput = document.getElementById('time-input');
    const rateInput = document.getElementById('rate-input');
    const applyBtn = document.getElementById('apply-time');
    if (!timeInput || !rateInput || !applyBtn) throw new Error('Time machine controls not found');
    timeInput.value = '${customTimeInput}';
    rateInput.value = '${customRateInput}';
    applyBtn.click();
  })()`);
  await sleep(1000);

  const immediateManualSnapshot = await evaluate(`(() => {
    const t = window.__theater;
    const iframe = document.getElementById('stage');
    return {
      mode: t?.theaterState?.mode,
      time: t?.state?.time,
      rate: t?.state?.rate,
      timeInput: document.getElementById('time-input')?.value,
      rateInput: document.getElementById('rate-input')?.value,
      iframeSrc: iframe?.src,
    };
  })()`);

  console.log('4. Immediate State After Manual Time Machine Apply:', immediateManualSnapshot);
  if (immediateManualSnapshot.mode !== 'detached') {
    throw new Error('Manual time apply failed to detach theater mode');
  }
  if (immediateManualSnapshot.time !== expectedIso || String(immediateManualSnapshot.rate) !== customRateInput) {
    throw new Error(`Custom time/rate not applied correctly: time=${immediateManualSnapshot.time}, rate=${immediateManualSnapshot.rate}`);
  }

  // 4. Wait 16 seconds (exceeding original 18s boundary)
  console.log('5. Waiting 16s past original 18s boundary (total ~19s elapsed)...');
  await sleep(16000);

  const pastManualSnapshot = await evaluate(`(() => {
    const t = window.__theater;
    const iframe = document.getElementById('stage');
    return {
      mode: t?.theaterState?.mode,
      time: t?.state?.time,
      rate: t?.state?.rate,
      timeInput: document.getElementById('time-input')?.value,
      rateInput: document.getElementById('rate-input')?.value,
      iframeSrc: iframe?.src,
    };
  })()`);

  console.log('\n6. Snapshot Past the 18s Boundary (>19s total elapsed):', pastManualSnapshot);

  // Verify Parent Page State & Time Machine
  console.log('\n--- [Clock & State Isolation Verification: Parent Page] ---');
  if (pastManualSnapshot.time !== expectedIso) {
    throw new Error(`❌ USER TIME OVERWRITTEN! Expected '${expectedIso}', got '${pastManualSnapshot.time}'`);
  }
  if (String(pastManualSnapshot.rate) !== customRateInput) {
    throw new Error(`❌ USER RATE OVERWRITTEN! Expected '${customRateInput}', got '${pastManualSnapshot.rate}'`);
  }
  if (pastManualSnapshot.timeInput !== customTimeInput || pastManualSnapshot.rateInput !== customRateInput) {
    throw new Error('❌ Time Machine inputs were overwritten by old boundary timer!');
  }
  console.log(`  ✅ Parent Page State: Time strictly preserved at ${expectedIso}, rate strictly preserved at ${customRateInput}.`);

  // Verify NASA iframe Communication
  console.log('--- [NASA iframe Parameter Verification] ---');
  if (!pastManualSnapshot.iframeSrc.includes('2020-01-01T00%3A00%3A00.000Z') || !pastManualSnapshot.iframeSrc.includes('rate=60')) {
    throw new Error(`❌ IFRAME DOES NOT REFLECT USER SETTINGS: ${pastManualSnapshot.iframeSrc}`);
  }
  if (pastManualSnapshot.iframeSrc.includes('2017-09-15T10%3A32%3A06.000Z') || pastManualSnapshot.iframeSrc.includes('rate=0')) {
    throw new Error(`❌ IFRAME OVERWRITTEN BY CASSINI BOUNDARY: ${pastManualSnapshot.iframeSrc}`);
  }
  console.log('  ✅ NASA iframe URL: Accurately loaded with user custom timestamp & rate (2020-01-01 / rate=60).');
  console.log('✅ TEST D PASSED: Manual Time Machine inputs are completely immune to old timer overrides!\n');
}

console.log('======================================================');
console.log('📊 Browser Acceptance Test Summary');
console.log('======================================================');
console.log(`Executed Suites: ${[runAB ? 'A/B (Baseline E2E)' : null, runHotfix ? 'C/D (Detach & Hotfix)' : null].filter(Boolean).join(', ')}`);
console.log(`Total Console / Page Errors: ${consoleErrors.length}`);
if (consoleErrors.length > 0) {
  console.error('Console Errors encountered:', consoleErrors);
  throw new Error('Browser console had errors during run');
} else {
  console.log('✅ Clean Console: Zero ReferenceErrors, zero unhandled rejections.');
}

console.log('\n🎉 ALL EXECUTED BROWSER-LEVEL ACCEPTANCE SUITES PASSED!\n');

ws.close();
chromeProcess.kill();
server.close();

// Clean temp directory
try {
  fs.rmSync(tempProfile, { recursive: true, force: true });
} catch {}
