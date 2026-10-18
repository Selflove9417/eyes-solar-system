// tools/test-website-more.mjs
// Phase 17: Website More Content Integration Test (数据与模拟逻辑验证)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ PASS: ${message}`);
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    process.exitCode = 1;
  }
}

console.log('=== Phase 17: Website More Content Integration Test (数据与模拟逻辑验证) ===\n');

// 1. Data sanity
console.log('1. Checking Source Data:');
const morePath = path.join(root, 'data', 'more.zh.json');
const missionsPath = path.join(root, 'data', 'missions.zh.json');
const bodiesPath = path.join(root, 'data', 'bodies.zh.json');

assert(fs.existsSync(morePath), 'data/more.zh.json exists');
assert(fs.existsSync(missionsPath), 'data/missions.zh.json exists');
assert(fs.existsSync(bodiesPath), 'data/bodies.zh.json exists');

const moreJson = JSON.parse(fs.readFileSync(morePath, 'utf8'));
const missionsJson = JSON.parse(fs.readFileSync(missionsPath, 'utf8'));
const bodiesJson = JSON.parse(fs.readFileSync(bodiesPath, 'utf8'));

const moreEntries = moreJson.entries || {};
const missionsList = missionsJson.missions || [];
const bodiesList = bodiesJson.bodies || [];

const moreKeys = Object.keys(moreEntries);
let totalMoreParagraphs = 0;
for (const key of moreKeys) {
  const entry = moreEntries[key];
  if (Array.isArray(entry.paragraphs)) {
    totalMoreParagraphs += entry.paragraphs.length;
  }
}

assert(moreKeys.length === 92, `more.zh.json contains exactly 92 entities (found ${moreKeys.length})`);
assert(totalMoreParagraphs === 150, `more.zh.json contains exactly 150 paragraphs (found ${totalMoreParagraphs})`);

// 2. Mission entities mapping
console.log('\n2. Verifying Missions Mapping (47 items):');
assert(missionsList.length === 47, `missions.zh.json has 47 missions (found ${missionsList.length})`);

let missionMatchCount = 0;
let missionParaCount = 0;
for (const m of missionsList) {
  const entry = moreEntries[m.id];
  if (entry && Array.isArray(entry.paragraphs) && entry.paragraphs.length > 0) {
    missionMatchCount++;
    missionParaCount += entry.paragraphs.length;
    // ensure each paragraph has zh
    const allZh = entry.paragraphs.every(p => typeof p.zh === 'string' && p.zh.trim().length > 0);
    if (!allZh) {
      assert(false, `Mission ${m.id} has empty zh paragraph`);
    }
  } else {
    assert(false, `Mission ${m.id} missing in more.zh.json`);
  }
}
assert(missionMatchCount === 47, `All 47 missions map 100% to more.zh.json (found ${missionMatchCount})`);
console.log(`  Total mission paragraphs: ${missionParaCount}`);

// 3. Bodies entities mapping
console.log('\n3. Verifying Bodies Mapping (47 items total, 45 with More, 2 missing):');
assert(bodiesList.length === 47, `bodies.zh.json has 47 bodies (found ${bodiesList.length})`);

let bodiesMatchCount = 0;
let bodiesParaCount = 0;
const bodiesWithoutMore = [];

for (const b of bodiesList) {
  const entry = moreEntries[b.id];
  if (entry && Array.isArray(entry.paragraphs) && entry.paragraphs.length > 0) {
    bodiesMatchCount++;
    bodiesParaCount += entry.paragraphs.length;
    const allZh = entry.paragraphs.every(p => typeof p.zh === 'string' && p.zh.trim().length > 0);
    if (!allZh) {
      assert(false, `Body ${b.id} has empty zh paragraph`);
    }
  } else {
    bodiesWithoutMore.push(b.id);
  }
}

assert(bodiesMatchCount === 45, `Exactly 45 bodies have More entries (found ${bodiesMatchCount})`);
assert(bodiesWithoutMore.length === 2, `Exactly 2 bodies lack More entries (found ${bodiesWithoutMore.length})`);
assert(bodiesWithoutMore.includes('milky_way'), `Missing list includes 'milky_way'`);
assert(bodiesWithoutMore.includes('90377_sedna'), `Missing list includes '90377_sedna'`);
assert(missionParaCount + bodiesParaCount === 150, `Sum of mission (${missionParaCount}) and bodies (${bodiesParaCount}) paragraphs is 150`);

// 4. Checking DOM rendering implementation in missions.html & bodies.html
console.log('\n4. Checking Source Code and DOM Security:');
const missionsHtml = fs.readFileSync(path.join(root, 'missions.html'), 'utf8');
const bodiesHtml = fs.readFileSync(path.join(root, 'bodies.html'), 'utf8');
const siteJs = fs.readFileSync(path.join(root, 'assets', 'js', 'site.js'), 'utf8');
const mainCss = fs.readFileSync(path.join(root, 'assets', 'css', 'main.css'), 'utf8');

// Ensure getMoreData exists in site.js
assert(siteJs.includes('export async function getMoreData()'), 'site.js exports getMoreData()');
assert(siteJs.includes('moreCache'), 'site.js implements in-memory caching for getMoreData()');

// Ensure NO innerHTML used with More content
assert(!missionsHtml.includes('innerHTML = more') && !missionsHtml.includes('innerHTML = p.zh'), 'missions.html does not use innerHTML for More content');
assert(!bodiesHtml.includes('innerHTML = more') && !bodiesHtml.includes('innerHTML = p.zh'), 'bodies.html does not use innerHTML for More content');
assert(missionsHtml.includes('details') && missionsHtml.includes('summary'), 'missions.html creates native details and summary elements');
assert(bodiesHtml.includes('details') && bodiesHtml.includes('summary'), 'bodies.html creates native details and summary elements');

// Ensure milky_way and 90377_sedna guard exists in bodies.html
assert(bodiesHtml.includes('const hasMore = moreEntry'), 'bodies.html checks hasMore condition before rendering details');

// Ensure CSS styles exist
assert(mainCss.includes('.entry-more-details'), 'main.css defines .entry-more-details');
assert(mainCss.includes('.entry-more-summary'), 'main.css defines .entry-more-summary');
assert(mainCss.includes('min-height: 44px') || mainCss.includes('min-height:44px'), 'main.css ensures min-height 44px touch target');
assert(mainCss.includes('.entry-more-body'), 'main.css defines .entry-more-body');
assert(mainCss.includes('.entry-more-p'), 'main.css defines .entry-more-p');
assert(mainCss.includes('.more-fallback-notice'), 'main.css defines .more-fallback-notice');

// Version query checks for cache busting (Task 2)
assert(missionsHtml.includes('href="assets/css/main.css?v=20261018p17"'), 'missions.html loads main.css?v=20261018p17');
assert(missionsHtml.includes("from './assets/js/site.js?v=20261018p17'"), 'missions.html imports site.js?v=20261018p17');
assert(bodiesHtml.includes('href="assets/css/main.css?v=20261018p17"'), 'bodies.html loads main.css?v=20261018p17');
assert(bodiesHtml.includes("from './assets/js/site.js?v=20261018p17'"), 'bodies.html imports site.js?v=20261018p17');

// Fallback degradation checks (Task 3)
assert(missionsHtml.includes('moreLoadFailed') && missionsHtml.includes('详细介绍暂时无法加载，请刷新页面重试。'), 'missions.html implements graceful degradation on More load failure');
assert(bodiesHtml.includes('moreLoadFailed') && bodiesHtml.includes('详细介绍暂时无法加载，请刷新页面重试。'), 'bodies.html implements graceful degradation on More load failure');

// 5. Simulate DOM rendering and verify exact structure
console.log('\n5. Simulating Card Render Logic:');

function simulateMissionCard(m, moreEntry) {
  const card = {
    id: m.id,
    zhTitle: m.zh,
    enTitle: m.en,
    blurb: m.zhBlurb,
    sourceHref: `https://eyes.nasa.gov/apps/solar-system/#/${m.id}`,
    exploreHref: `explore.html?target=${encodeURIComponent(m.id)}`,
    hasDetails: false,
    summaryText: '',
    paragraphs: []
  };

  const hasMore = moreEntry && Array.isArray(moreEntry.paragraphs) && moreEntry.paragraphs.length > 0;
  if (hasMore) {
    card.hasDetails = true;
    card.summaryText = '阅读详细介绍';
    card.paragraphs = moreEntry.paragraphs.map(p => p.zh);
  }
  return card;
}

function simulateBodyCard(b, moreEntry) {
  const card = {
    id: b.id,
    zhTitle: b.zh,
    enTitle: b.en,
    blurb: b.zhl,
    sourceHref: `https://eyes.nasa.gov/apps/solar-system/#/${b.id}`,
    exploreHref: `explore.html?target=${encodeURIComponent(b.id)}`,
    hasDetails: false,
    summaryText: '',
    paragraphs: []
  };

  const hasMore = moreEntry && Array.isArray(moreEntry.paragraphs) && moreEntry.paragraphs.length > 0;
  if (hasMore) {
    card.hasDetails = true;
    card.summaryText = '阅读详细介绍';
    card.paragraphs = moreEntry.paragraphs.map(p => p.zh);
  }
  return card;
}

// Test mission cards
let missionDetailsCount = 0;
for (const m of missionsList) {
  const c = simulateMissionCard(m, moreEntries[m.id]);
  assert(c.hasDetails === true, `Mission card ${m.id} renders details accordion`);
  assert(c.sourceHref.startsWith('https://eyes.nasa.gov/apps/solar-system/#/'), `Mission ${m.id} source href valid`);
  assert(c.exploreHref.startsWith('explore.html?target='), `Mission ${m.id} explore href valid`);
  assert(c.paragraphs.length === moreEntries[m.id].paragraphs.length, `Mission ${m.id} paragraph count (${c.paragraphs.length}) matches data`);
  missionDetailsCount++;
}
assert(missionDetailsCount === 47, `All 47 mission cards have details`);

// Test body cards
let bodyDetailsCount = 0;
let bodyNoDetailsCount = 0;
for (const b of bodiesList) {
  const c = simulateBodyCard(b, moreEntries[b.id]);
  assert(c.sourceHref.startsWith('https://eyes.nasa.gov/apps/solar-system/#/'), `Body ${b.id} source href valid`);
  assert(c.exploreHref.startsWith('explore.html?target='), `Body ${b.id} explore href valid`);
  if (c.hasDetails) {
    bodyDetailsCount++;
    assert(c.paragraphs.length === moreEntries[b.id].paragraphs.length, `Body ${b.id} paragraph count (${c.paragraphs.length}) matches data`);
  } else {
    bodyNoDetailsCount++;
    assert(b.id === 'milky_way' || b.id === '90377_sedna', `Body without details is expected: ${b.id}`);
  }
}
assert(bodyDetailsCount === 45, `Exactly 45 body cards have details`);
assert(bodyNoDetailsCount === 2, `Exactly 2 body cards have NO details`);

// 6. Search filtering verification (Task 1)
console.log('\n6. Verifying Search Filtering with More Content & b.zhl:');

function searchMissions(query) {
  const q = query.trim().toLowerCase();
  const normQ = q.replace(/韦布/g, '韦伯');
  return missionsList.filter(m => {
    const moreEntry = moreEntries[m.id];
    let moreZh = '';
    if (moreEntry && Array.isArray(moreEntry.paragraphs)) {
      moreZh = moreEntry.paragraphs.map(p => p.zh || '').join(' ');
    }
    const haystack = [m.zh, m.en, m.id, m.zhBlurb, moreZh].join(' ').toLowerCase();
    const haystackNorm = haystack.replace(/韦布/g, '韦伯');
    return haystack.includes(q) || haystackNorm.includes(normQ);
  });
}

function searchBodies(query) {
  const q = query.trim().toLowerCase();
  const normQ = q.replace(/韦布/g, '韦伯');
  return bodiesList.filter(b => {
    const moreEntry = moreEntries[b.id];
    let moreZh = '';
    if (moreEntry && Array.isArray(moreEntry.paragraphs)) {
      moreZh = moreEntry.paragraphs.map(p => p.zh || '').join(' ');
    }
    const haystack = [b.zh, b.en, b.id, b.cat, b.zhl, moreZh].join(' ').toLowerCase();
    const haystackNorm = haystack.replace(/韦布/g, '韦伯');
    return haystack.includes(q) || haystackNorm.includes(normQ);
  });
}

// Search test cases:
// A. Keyword in blurb: "木星"
const jupiterMissions = searchMissions('木星');
assert(jupiterMissions.length > 0, `Search missions '木星' found ${jupiterMissions.length} items`);

// B. Keyword unique to Parker Solar Probe More: "光球层"
const coronaMissions = searchMissions('光球层');
assert(coronaMissions.some(m => m.id === 'sc_parker_solar_probe'), `Search '光球层' matches sc_parker_solar_probe via More text`);

// C. Keyword unique to Chandra More: "哥伦比亚号航天飞机"
const chandraMissions = searchMissions('哥伦比亚号航天飞机');
assert(chandraMissions.some(m => m.id === 'sc_chandra'), `Search '哥伦比亚号航天飞机' matches sc_chandra via More text`);

// D. Keyword unique to ISS More: "六名乘组"
const issMissions = searchMissions('六名乘组');
assert(issMissions.some(m => m.id === 'sc_iss'), `Search '六名乘组' matches sc_iss via More text`);

// E. Keyword unique to Europa More: "咸水海洋" (Task 1 validation)
const europaBodies = searchBodies('咸水海洋');
assert(europaBodies.some(b => b.id === 'europa'), `Search '咸水海洋' matches europa via More text`);

// F. Keyword for Sedna by name: "塞德娜"
const sednaBodies = searchBodies('塞德娜');
assert(sednaBodies.length === 1 && sednaBodies[0].id === '90377_sedna', `Search '塞德娜' matches 90377_sedna`);

// G. Keyword in Sedna's Chinese blurb (b.zhl): "轨道极为细长" (Task 1 validation)
const sednaBlurbBodies = searchBodies('轨道极为细长');
assert(sednaBlurbBodies.length === 1 && sednaBlurbBodies[0].id === '90377_sedna', `Search '轨道极为细长' matches 90377_sedna via b.zhl`);

console.log(`\n========================================`);
console.log(`Phase 17.1 Static Verification: ${passedTests}/${totalTests} tests passed.`);
if (passedTests === totalTests) {
  console.log('🎉 ALL STATIC DATA & SIMULATION TESTS PASSED!');
} else {
  console.error('💥 SOME TESTS FAILED!');
  process.exitCode = 1;
}
