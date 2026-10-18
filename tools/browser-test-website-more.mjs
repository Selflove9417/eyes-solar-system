// tools/browser-test-website-more.mjs
// Real-browser verification for Phase 17.1: Website More Content Integration & Regression
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

// Source Data for verification
const moreJson = JSON.parse(fs.readFileSync(path.join(root, 'data', 'more.zh.json'), 'utf8'));
const missionsJson = JSON.parse(fs.readFileSync(path.join(root, 'data', 'missions.zh.json'), 'utf8'));
const bodiesJson = JSON.parse(fs.readFileSync(path.join(root, 'data', 'bodies.zh.json'), 'utf8'));

const moreEntries = moreJson.entries || {};
const missionsList = missionsJson.missions || [];
const bodiesList = bodiesJson.bodies || [];

// Prepare expected mappings
const expectedMissionMore = {};
for (const m of missionsList) {
  if (moreEntries[m.id]?.paragraphs) {
    expectedMissionMore[m.id] = moreEntries[m.id].paragraphs.map((p) => p.zh);
  }
}

const expectedBodiesMore = {};
for (const b of bodiesList) {
  if (moreEntries[b.id]?.paragraphs) {
    expectedBodiesMore[b.id] = moreEntries[b.id].paragraphs.map((p) => p.zh);
  }
}

// 1. Static HTTP Server with failure simulation capability
let failMore = false;

const server = http.createServer((req, res) => {
  try {
    if (failMore && req.url.includes('more.zh.json')) {
      res.writeHead(500, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      });
      res.end('Simulated Internal Server Error: More JSON unavailable');
      return;
    }

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
  // =========================================================================
  // SECTION 1: missions.html Normal Operation & All 47 Entities Live DOM Test
  // =========================================================================
  console.log('\n--- 1. Testing missions.html in Real Browser (Desktop 1440px) ---');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/missions.html` });
  await sleep(1500);

  const initialCount = await evalCode(`document.querySelectorAll('.entry-card').length`);
  check(initialCount === 47, `Initial missions card count is 47 (got ${initialCount})`);

  const summaryCount = await evalCode(`document.querySelectorAll('.entry-more-summary').length`);
  check(summaryCount === 47, `All 47 missions have .entry-more-summary buttons (got ${summaryCount})`);

  // Touch target min-height >= 44
  const minTargetPass = await evalCode(`(() => {
    const summaries = Array.from(document.querySelectorAll('.entry-more-summary'));
    return summaries.every(s => s.getBoundingClientRect().height >= 43.5);
  })()`);
  check(minTargetPass, `All .entry-more-summary touch target heights >= 44px`);

  // Task 4: Complete Live DOM Consistency for ALL 47 Mission Entities
  console.log('\n--- Task 4: Verifying all 47 Missions Live DOM Consistency ---');
  const missionDomCheck = await evalCode(`(() => {
    const expected = ${JSON.stringify(expectedMissionMore)};
    const results = [];
    for (const [id, exp] of Object.entries(expected)) {
      const card = document.getElementById('card-' + id);
      if (!card) {
        results.push({ id, ok: false, error: 'card element missing' });
        continue;
      }
      const details = card.querySelector('.entry-more-details');
      if (!details) {
        results.push({ id, ok: false, error: 'details element missing' });
        continue;
      }
      if (details.open !== false) {
        results.push({ id, ok: false, error: 'details not collapsed by default' });
        continue;
      }
      const summary = details.querySelector('.entry-more-summary');
      if (!summary || summary.textContent.trim() !== '阅读详细介绍') {
        results.push({ id, ok: false, error: 'summary text invalid: ' + summary?.textContent });
        continue;
      }
      const pEls = Array.from(details.querySelectorAll('.entry-more-p'));
      if (pEls.length !== exp.length) {
        results.push({ id, ok: false, error: 'para count mismatch: expected ' + exp.length + ' got ' + pEls.length });
        continue;
      }
      let textMismatch = false;
      for (let i = 0; i < exp.length; i++) {
        if (pEls[i].textContent.trim() !== exp[i].trim()) {
          textMismatch = true;
          results.push({ id, ok: false, error: 'para ' + i + ' text mismatch' });
          break;
        }
      }
      if (!textMismatch) {
        results.push({ id, ok: true, paraCount: pEls.length });
      }
    }
    return results;
  })()`);

  const passedMissions = missionDomCheck.filter((r) => r.ok).length;
  check(missionDomCheck.length === 47 && passedMissions === 47,
    `All 47 missions in live DOM have exact ID, <details>, default collapsed, and exact textContent (${passedMissions}/47)`);

  let totalMissionDomParas = missionDomCheck.filter((r) => r.ok).reduce((s, r) => s + r.paraCount, 0);
  check(totalMissionDomParas === 70, `All 47 missions live DOM paragraph sum is exactly 70 (got ${totalMissionDomParas})`);

  // Interactive toggle check on Parker Solar Probe
  const pspTest = await evalCode(`(async () => {
    const pspCard = document.getElementById('card-sc_parker_solar_probe');
    if (!pspCard) return { found: false };
    const details = pspCard.querySelector('.entry-more-details');
    const summary = pspCard.querySelector('.entry-more-summary');
    const initialText = summary.textContent.trim();
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

  // Search in missions.html
  console.log('\n--- Testing Search in missions.html ---');
  await evalCode(`(() => {
    const input = document.getElementById('filter');
    input.value = '日震学';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await sleep(400);

  const searchSohoResult = await evalCode(`(() => {
    const visibleCards = Array.from(document.querySelectorAll('.entry-card'));
    const countText = document.getElementById('count').textContent;
    return {
      count: visibleCards.length,
      countText,
      hasSoho: visibleCards.some(c => c.id === 'card-sc_soho')
    };
  })()`);

  check(searchSohoResult.count === 1 && searchSohoResult.hasSoho, `Search '日震学' returns exactly SOHO (count=${searchSohoResult.count}, text=${searchSohoResult.countText})`);

  // Reset search
  await evalCode(`(() => {
    const input = document.getElementById('filter');
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await sleep(200);

  // Card Action links in missions.html
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

  // Viewport Responsiveness on missions.html
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

  // =========================================================================
  // SECTION 2: bodies.html Normal Operation & All 47 Entities Live DOM Test
  // =========================================================================
  console.log('\n--- 2. Testing bodies.html in Real Browser ---');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/bodies.html` });
  await sleep(1500);

  const initialBodiesCount = await evalCode(`document.querySelectorAll('.entry-card').length`);
  check(initialBodiesCount === 47, `Initial bodies card count is 47 (got ${initialBodiesCount})`);

  const bodiesSummaryCount = await evalCode(`document.querySelectorAll('.entry-more-summary').length`);
  check(bodiesSummaryCount === 45, `Exactly 45 bodies have .entry-more-summary buttons (got ${bodiesSummaryCount})`);

  // Task 4: Complete Live DOM Consistency for ALL 45 Body Entities with More
  console.log('\n--- Task 4: Verifying all 45 Bodies Live DOM Consistency ---');
  const bodiesDomCheck = await evalCode(`(() => {
    const expected = ${JSON.stringify(expectedBodiesMore)};
    const results = [];
    for (const [id, exp] of Object.entries(expected)) {
      const card = document.getElementById('card-' + id);
      if (!card) {
        results.push({ id, ok: false, error: 'card element missing' });
        continue;
      }
      const details = card.querySelector('.entry-more-details');
      if (!details) {
        results.push({ id, ok: false, error: 'details element missing' });
        continue;
      }
      if (details.open !== false) {
        results.push({ id, ok: false, error: 'details not collapsed by default' });
        continue;
      }
      const summary = details.querySelector('.entry-more-summary');
      if (!summary || summary.textContent.trim() !== '阅读详细介绍') {
        results.push({ id, ok: false, error: 'summary text invalid: ' + summary?.textContent });
        continue;
      }
      const pEls = Array.from(details.querySelectorAll('.entry-more-p'));
      if (pEls.length !== exp.length) {
        results.push({ id, ok: false, error: 'para count mismatch: expected ' + exp.length + ' got ' + pEls.length });
        continue;
      }
      let textMismatch = false;
      for (let i = 0; i < exp.length; i++) {
        if (pEls[i].textContent.trim() !== exp[i].trim()) {
          textMismatch = true;
          results.push({ id, ok: false, error: 'para ' + i + ' text mismatch' });
          break;
        }
      }
      if (!textMismatch) {
        results.push({ id, ok: true, paraCount: pEls.length });
      }
    }
    return results;
  })()`);

  const passedBodies = bodiesDomCheck.filter((r) => r.ok).length;
  check(bodiesDomCheck.length === 45 && passedBodies === 45,
    `All 45 bodies in live DOM have exact ID, <details>, default collapsed, and exact textContent (${passedBodies}/45)`);

  let totalBodyDomParas = bodiesDomCheck.filter((r) => r.ok).reduce((s, r) => s + r.paraCount, 0);
  check(totalBodyDomParas === 80, `All 45 bodies live DOM paragraph sum is exactly 80 (got ${totalBodyDomParas})`);
  check(totalMissionDomParas + totalBodyDomParas === 150,
    `Sum of live DOM paragraphs across all 92 entities is exactly 150 (${totalMissionDomParas} + ${totalBodyDomParas})`);

  // Verify missing More entries: milky_way and 90377_sedna
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

  await screenshot(path.join(shotsDir, 'bodies-desktop-1440.png'));

  // Task 1: Search tests in bodies.html
  console.log('\n--- Task 1: Testing Search in bodies.html ---');
  // 1. Search '轨道极为细长' -> matches 90377_sedna via b.zhl
  await evalCode(`(() => {
    const input = document.getElementById('filter');
    input.value = '轨道极为细长';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await sleep(400);

  const searchSednaResult = await evalCode(`(() => {
    const visibleCards = Array.from(document.querySelectorAll('.entry-card'));
    const countText = document.getElementById('count').textContent;
    return {
      count: visibleCards.length,
      countText,
      hasSedna: visibleCards.some(c => c.id === 'card-90377_sedna')
    };
  })()`);

  check(searchSednaResult.count === 1 && searchSednaResult.hasSedna,
    `Search '轨道极为细长' returns exactly 90377_sedna via b.zhl (count=${searchSednaResult.count}, text=${searchSednaResult.countText})`);

  // 2. Search '咸水海洋' -> matches Europa via More
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

  // Action links in bodies.html
  const bodyActionLinksTest = await evalCode(`(() => {
    const cards = Array.from(document.querySelectorAll('.entry-card'));
    let validExplore = 0;
    let validSource = 0;
    for (const c of cards) {
      const exploreBtn = c.querySelector('.entry-action-primary');
      const sourceLink = c.querySelector('.entry-action-source');
      if (exploreBtn && exploreBtn.getAttribute('href')?.startsWith('explore.html#')) validExplore++;
      const hasSrc = c.querySelector('.entry-details') !== null;
      if (!hasSrc || (sourceLink && sourceLink.getAttribute('href')?.startsWith('https://eyes.nasa.gov/apps/solar-system/'))) validSource++;
    }
    return { total: cards.length, validExplore, validSource };
  })()`);

  check(bodyActionLinksTest.validExplore === 47, `All 47 bodies have valid 3D Explore links (got ${bodyActionLinksTest.validExplore})`);
  check(bodyActionLinksTest.validSource === 47, `All 47 bodies have valid NASA Source links (got ${bodyActionLinksTest.validSource})`);

  // =========================================================================
  // SECTION 3: Task 3 - More JSON Load Failure Degradation Testing
  // =========================================================================
  console.log('\n--- Task 3: Testing More JSON Load Failure Degradation ---');
  failMore = true;

  // Desktop viewport for degradation verification
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  // A. Test missions.html degradation
  await send('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/missions.html?nocache=${Date.now()}` });
  await sleep(1500);

  const missionDegradation = await evalCode(`(() => {
    const notice = document.querySelector('.more-fallback-notice');
    const cards = Array.from(document.querySelectorAll('.entry-card'));
    const details = document.querySelectorAll('.entry-more-details');
    const summaries = document.querySelectorAll('.entry-more-summary');
    let validDesc = 0;
    let validActions = 0;
    for (const c of cards) {
      if (c.querySelector('.entry-desc')?.textContent.trim()) validDesc++;
      if (c.querySelector('.entry-action-primary')) validActions++;
    }
    return {
      hasNotice: !!notice,
      noticeText: notice?.textContent.trim(),
      cardCount: cards.length,
      detailsCount: details.length,
      summaryCount: summaries.length,
      validDesc,
      validActions
    };
  })()`);

  check(missionDegradation.hasNotice && missionDegradation.noticeText.includes('详细介绍暂时无法加载，请刷新页面重试。'),
    `missions.html displays fallback notice: '${missionDegradation.noticeText}'`);
  check(missionDegradation.cardCount === 47, `missions.html preserves all 47 cards on failure`);
  check(missionDegradation.detailsCount === 0 && missionDegradation.summaryCount === 0,
    `missions.html renders 0 details and 0 summary buttons on failure (no empty buttons)`);
  check(missionDegradation.validDesc === 47 && missionDegradation.validActions === 47,
    `missions.html preserves original blurbs and 3D action links on failure`);
  await screenshot(path.join(shotsDir, 'missions-fallback-degradation.png'));

  // B. Test bodies.html degradation
  await send('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/bodies.html?nocache=${Date.now()}` });
  await sleep(1500);

  const bodiesDegradation = await evalCode(`(() => {
    const notice = document.querySelector('.more-fallback-notice');
    const cards = Array.from(document.querySelectorAll('.entry-card'));
    const details = document.querySelectorAll('.entry-more-details');
    const summaries = document.querySelectorAll('.entry-more-summary');
    let validDesc = 0;
    let validActions = 0;
    for (const c of cards) {
      if (c.querySelector('.entry-desc')?.textContent.trim()) validDesc++;
      if (c.querySelector('.entry-action-primary')) validActions++;
    }
    return {
      hasNotice: !!notice,
      noticeText: notice?.textContent.trim(),
      cardCount: cards.length,
      detailsCount: details.length,
      summaryCount: summaries.length,
      validDesc,
      validActions
    };
  })()`);

  check(bodiesDegradation.hasNotice && bodiesDegradation.noticeText.includes('详细介绍暂时无法加载，请刷新页面重试。'),
    `bodies.html displays fallback notice: '${bodiesDegradation.noticeText}'`);
  check(bodiesDegradation.cardCount === 47, `bodies.html preserves all 47 cards on failure`);
  check(bodiesDegradation.detailsCount === 0 && bodiesDegradation.summaryCount === 0,
    `bodies.html renders 0 details and 0 summary buttons on failure (no empty buttons)`);
  check(bodiesDegradation.validDesc === 47 && bodiesDegradation.validActions === 47,
    `bodies.html preserves original blurbs and 3D action links on failure`);
  await screenshot(path.join(shotsDir, 'bodies-fallback-degradation.png'));

  failMore = false;

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
console.log(`Phase 17.1 Real Browser Acceptance Results: ${browserPass} passed, ${browserFail} failed.`);
if (browserFail === 0) {
  console.log('🎉 ALL REAL BROWSER ACCEPTANCE CHECKS PASSED!');
  process.exit(0);
} else {
  console.error('💥 BROWSER CHECKS FAILED!');
  process.exit(1);
}
