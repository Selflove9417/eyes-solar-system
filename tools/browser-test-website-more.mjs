// tools/browser-test-website-more.mjs
// Real-browser verification for Phase 17: Website More Content Integration
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve('.');
const HTTP_PORT = 8991;
const CDP_PORT = 9488;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// 1. Static HTTP Server
const server = http.createServer((req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, `http://127.0.0.1:${HTTP_PORT}`).pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const filePath = path.join(root, pathname);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      res.writeHead(200, {
        'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(fs.readFileSync(filePath));
    } else {
      res.writeHead(404).end('Not Found: ' + pathname);
    }
  } catch (err) {
    res.writeHead(500).end(err.message);
  }
});

await new Promise((resolve) => server.listen(HTTP_PORT, '127.0.0.1', resolve));
console.log(`Server listening on http://127.0.0.1:${HTTP_PORT}`);

// 2. Launch Chrome
const tempProfile = path.join(root, '.chrome-temp-phase17-' + Date.now());
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
    const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
    targets = await res.json();
    if (targets && targets.length > 0) break;
  } catch {}
}

if (!targets || targets.length === 0) {
  console.error('Failed to connect to Chrome CDP');
  server.close();
  process.exit(1);
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

async function screenshot(filePath) {
  const res = await send('Page.captureScreenshot', { format: 'png' });
  if (res && res.data) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
    console.log(`  📸 Screenshot saved: ${path.relative(root, filePath)}`);
  }
}

await send('Page.enable');
await send('Runtime.enable');

const shotsDir = path.join(root, 'shots', 'website', 'phase17');
fs.mkdirSync(shotsDir, { recursive: true });

let browserPass = 0;
let browserFail = 0;

function check(cond, msg) {
  if (cond) {
    browserPass++;
    console.log(`  ✅ [BROWSER] ${msg}`);
  } else {
    browserFail++;
    console.error(`  ❌ [BROWSER FAIL] ${msg}`);
  }
}

try {
  console.log('\n--- 1. Testing missions.html in Real Browser ---');
  // Desktop 1440
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/missions.html` });
  await sleep(1500);

  const initialCount = await evalCode(`document.querySelectorAll('.entry-card').length`);
  check(initialCount === 47, `Initial missions card count is 47 (got ${initialCount})`);

  const summaryCount = await evalCode(`document.querySelectorAll('.entry-more-summary').length`);
  check(summaryCount === 47, `All 47 missions have .entry-more-summary buttons (got ${summaryCount})`);

  // Check touch target min-height >= 44
  const minTargetPass = await evalCode(`(() => {
    const summaries = Array.from(document.querySelectorAll('.entry-more-summary'));
    return summaries.every(s => s.getBoundingClientRect().height >= 43.5);
  })()`);
  check(minTargetPass, `All .entry-more-summary touch target heights >= 44px`);

  // Test expanding Parker Solar Probe
  const pspTest = await evalCode(`(async () => {
    const pspCard = document.getElementById('card-sc_parker_solar_probe');
    if (!pspCard) return { found: false };
    const details = pspCard.querySelector('.entry-more-details');
    const summary = pspCard.querySelector('.entry-more-summary');
    const initialText = summary.textContent.trim();
    // click summary
    summary.click();
    await new Promise(r => setTimeout(r, 80));
    const opened = details.open;
    const afterText = summary.textContent.trim();
    const paras = Array.from(details.querySelectorAll('.entry-more-p')).map(p => p.textContent.trim());
    return { found: true, initialText, opened, afterText, paraCount: paras.length, firstPara: paras[0] };
  })()`);

  check(pspTest.found, 'Parker Solar Probe card found');
  check(pspTest.initialText === '阅读详细介绍', `PSP initial button is '阅读详细介绍' (got '${pspTest.initialText}')`);
  check(pspTest.opened === true, 'PSP details expanded after click');
  check(pspTest.afterText === '收起详细介绍', `PSP button changed to '收起详细介绍' (got '${pspTest.afterText}')`);
  check(pspTest.paraCount === 8, `PSP expanded 8 paragraphs (got ${pspTest.paraCount})`);

  // Capture Desktop Screenshot with PSP expanded
  await screenshot(path.join(shotsDir, 'missions-desktop-1440.png'));

  // Test expanding ISS, Hubble, DART
  const otherMissionsTest = await evalCode(`(async () => {
    async function testCard(id) {
      const card = document.getElementById('card-' + id);
      if (!card) return null;
      const details = card.querySelector('.entry-more-details');
      const summary = card.querySelector('.entry-more-summary');
      summary.click();
      await new Promise(r => setTimeout(r, 80));
      return {
        opened: details.open,
        afterText: summary.textContent.trim(),
        paraCount: details.querySelectorAll('.entry-more-p').length
      };
    }
    return {
      iss: await testCard('sc_iss'),
      hubble: await testCard('sc_hubble_space_telescope'),
      dart: await testCard('sc_dart')
    };
  })()`);

  check(otherMissionsTest.iss?.opened && otherMissionsTest.iss?.paraCount === 1, `ISS expanded 1 paragraph (got ${otherMissionsTest.iss?.paraCount})`);
  check(otherMissionsTest.hubble?.opened && otherMissionsTest.hubble?.paraCount === 4, `Hubble expanded 4 paragraphs (got ${otherMissionsTest.hubble?.paraCount})`);
  check(otherMissionsTest.dart?.opened && otherMissionsTest.dart?.paraCount === 1, `DART expanded 1 paragraph (got ${otherMissionsTest.dart?.paraCount})`);

  // Test Search functionality in missions.html
  console.log('\n--- Testing Search in missions.html ---');
  await evalCode(`(() => {
    const input = document.getElementById('filter');
    input.value = '日震学';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await sleep(400);

  const searchSdoResult = await evalCode(`(() => {
    const visibleCards = Array.from(document.querySelectorAll('.entry-card'));
    const countText = document.getElementById('count').textContent;
    return {
      count: visibleCards.length,
      countText,
      hasSoho: visibleCards.some(c => c.id === 'card-sc_soho')
    };
  })()`);

  check(searchSdoResult.count === 1 && searchSdoResult.hasSoho, `Search '日震学' returns exactly SOHO (count=${searchSdoResult.count}, text=${searchSdoResult.countText})`);

  // Reset search
  await evalCode(`(() => {
    const input = document.getElementById('filter');
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await sleep(200);

  // Test Action links in missions.html
  const missionActionLinksTest = await evalCode(`(() => {
    const cards = Array.from(document.querySelectorAll('.entry-card'));
    let validExplore = 0;
    let validSource = 0;
    for (const c of cards) {
      const exploreBtn = c.querySelector('.entry-action-primary');
      const sourceLink = c.querySelector('.entry-action-source');
      if (exploreBtn && exploreBtn.getAttribute('href')?.startsWith('explore.html#')) validExplore++;
      if (sourceLink && sourceLink.getAttribute('href')?.startsWith('https://eyes.nasa.gov/apps/solar-system/')) validSource++;
    }
    return { total: cards.length, validExplore, validSource };
  })()`);

  check(missionActionLinksTest.validExplore === 47, `All 47 missions have valid 3D Explore links (got ${missionActionLinksTest.validExplore})`);
  check(missionActionLinksTest.validSource === 47, `All 47 missions have valid NASA Source links (got ${missionActionLinksTest.validSource})`);

  // Test Tablet (768px) and Mobile (375px) on missions.html
  console.log('\n--- Testing Viewport Responsiveness on missions.html ---');
  await send('Emulation.setDeviceMetricsOverride', { width: 768, height: 1024, deviceScaleFactor: 2, mobile: true });
  await sleep(400);
  const tabletOverflow = await evalCode(`document.documentElement.scrollWidth <= 768`);
  check(tabletOverflow, 'Tablet 768px: no horizontal overflow');
  await screenshot(path.join(shotsDir, 'missions-tablet-768.png'));

  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 3, mobile: true });
  await sleep(400);
  const mobileOverflow = await evalCode(`document.documentElement.scrollWidth <= 375`);
  check(mobileOverflow, 'Mobile 375px: no horizontal overflow');
  await screenshot(path.join(shotsDir, 'missions-mobile-375.png'));

  // --- 2. Testing bodies.html in Real Browser ---
  console.log('\n--- 2. Testing bodies.html in Real Browser ---');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/bodies.html` });
  await sleep(1500);

  const initialBodiesCount = await evalCode(`document.querySelectorAll('.entry-card').length`);
  check(initialBodiesCount === 47, `Initial bodies card count is 47 (got ${initialBodiesCount})`);

  const bodiesSummaryCount = await evalCode(`document.querySelectorAll('.entry-more-summary').length`);
  check(bodiesSummaryCount === 45, `Exactly 45 bodies have .entry-more-summary buttons (got ${bodiesSummaryCount})`);

  // Test missing More entries: milky_way and 90377_sedna
  const missingMoreCheck = await evalCode(`(() => {
    function inspectCard(id) {
      const card = document.getElementById('card-' + id);
      if (!card) return { found: false };
      const hasDetails = !!card.querySelector('.entry-more-details');
      const hasSummary = !!card.querySelector('.entry-more-summary');
      return { found: true, hasDetails, hasSummary };
    }
    return {
      milkyWay: inspectCard('milky_way'),
      sedna: inspectCard('90377_sedna')
    };
  })()`);

  check(missingMoreCheck.milkyWay.found && !missingMoreCheck.milkyWay.hasDetails && !missingMoreCheck.milkyWay.hasSummary,
    'milky_way (银河系) card has NO More details and NO summary button');
  check(missingMoreCheck.sedna.found && !missingMoreCheck.sedna.hasDetails && !missingMoreCheck.sedna.hasSummary,
    '90377_sedna (塞德娜) card has NO More details and NO summary button');

  // Test expanding Sun and Europa
  const bodiesExpandTest = await evalCode(`(async () => {
    async function expand(id) {
      const card = document.getElementById('card-' + id);
      if (!card) return null;
      const details = card.querySelector('.entry-more-details');
      const summary = card.querySelector('.entry-more-summary');
      if (!details || !summary) return null;
      summary.click();
      await new Promise(r => setTimeout(r, 80));
      return {
        opened: details.open,
        afterText: summary.textContent.trim(),
        paraCount: details.querySelectorAll('.entry-more-p').length
      };
    }
    return {
      sun: await expand('sun'),
      europa: await expand('europa')
    };
  })()`);

  check(bodiesExpandTest.sun?.opened && bodiesExpandTest.sun?.paraCount === 3,
    `Sun (太阳) expanded 3 paragraphs (got ${bodiesExpandTest.sun?.paraCount})`);
  check(bodiesExpandTest.europa?.opened && bodiesExpandTest.europa?.paraCount === 1,
    `Europa (木卫二) expanded 1 paragraph (got ${bodiesExpandTest.europa?.paraCount})`);

  // Capture Desktop Bodies Screenshot
  await screenshot(path.join(shotsDir, 'bodies-desktop-1440.png'));

  // Test Search in bodies.html
  console.log('\n--- Testing Search in bodies.html ---');
  await evalCode(`(() => {
    const input = document.getElementById('filter');
    input.value = '咸水海洋';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await sleep(400);

  const searchEuropaResult = await evalCode(`(() => {
    const visibleCards = Array.from(document.querySelectorAll('.entry-card'));
    const countText = document.getElementById('count').textContent;
    return {
      count: visibleCards.length,
      countText,
      hasEuropa: visibleCards.some(c => c.id === 'card-europa')
    };
  })()`);

  check(searchEuropaResult.hasEuropa, `Search '咸水海洋' matches Europa card (count=${searchEuropaResult.count}, text=${searchEuropaResult.countText})`);

  // Reset search
  await evalCode(`(() => {
    const input = document.getElementById('filter');
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await sleep(200);

  // Responsiveness on bodies.html
  await send('Emulation.setDeviceMetricsOverride', { width: 768, height: 1024, deviceScaleFactor: 2, mobile: true });
  await sleep(400);
  const bodiesTabletOverflow = await evalCode(`document.documentElement.scrollWidth <= 768`);
  check(bodiesTabletOverflow, 'Bodies Tablet 768px: no horizontal overflow');
  await screenshot(path.join(shotsDir, 'bodies-tablet-768.png'));

  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 3, mobile: true });
  await sleep(400);
  const bodiesMobileOverflow = await evalCode(`document.documentElement.scrollWidth <= 375`);
  check(bodiesMobileOverflow, 'Bodies Mobile 375px: no horizontal overflow');
  await screenshot(path.join(shotsDir, 'bodies-mobile-375.png'));

  // --- 3. Testing Links Integrity on Card Actions in bodies.html ---
  console.log('\n--- 3. Testing Card Action Links on bodies.html ---');
  const actionLinksTest = await evalCode(`(() => {
    const cards = Array.from(document.querySelectorAll('.entry-card'));
    let validExplore = 0;
    let validSource = 0;
    for (const c of cards) {
      const exploreBtn = c.querySelector('.entry-action-primary');
      const sourceLink = c.querySelector('.entry-action-source');
      if (exploreBtn && exploreBtn.getAttribute('href')?.startsWith('explore.html#')) validExplore++;
      // Sedna and Milky Way do not have NASA descriptions/<id>.json src, so check those with src
      const hasSrc = c.querySelector('.entry-details') !== null;
      if (!hasSrc || (sourceLink && sourceLink.getAttribute('href')?.startsWith('https://eyes.nasa.gov/apps/solar-system/'))) validSource++;
    }
    return { total: cards.length, validExplore, validSource };
  })()`);

  check(actionLinksTest.validExplore === 47, `All 47 bodies have valid 3D Explore links (got ${actionLinksTest.validExplore})`);
  check(actionLinksTest.validSource === 47, `All 47 bodies have valid NASA Source links (got ${actionLinksTest.validSource})`);

} finally {
  ws.close();
  chromeProcess.kill();
  server.close();
  await sleep(500);
  try {
    fs.rmSync(tempProfile, { recursive: true, force: true });
  } catch {}
}

console.log('\n========================================');
console.log(`Browser Acceptance Results: ${browserPass} passed, ${browserFail} failed.`);
if (browserFail === 0) {
  console.log('🎉 ALL BROWSER CHECKS PASSED!');
  process.exit(0);
} else {
  console.error('💥 BROWSER CHECKS FAILED!');
  process.exit(1);
}
