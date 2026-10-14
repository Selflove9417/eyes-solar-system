// Automated Story Theater & Timeline Continuity Regression Test
// Validates:
// 1. Story JSON schema & completeness
// 2. Scene timeline monotonicity (Scene 1 < Scene 2 < Scene 3; no backwards time travel)
// 3. No unverified "62s auto-end at 10:32:50" claims
// 4. Explore.html initialization order (theaterState must be declared before refresh() execution)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

console.log('🧪 Starting Story Theater Regression Tests...\n');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passCount++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failCount++;
  }
}

// -------------------------------------------------------------
// Test 1: Validate Cassini Story JSON
// -------------------------------------------------------------
const cassiniPath = path.join(root, 'data/stories/cassini.zh.json');
assert(fs.existsSync(cassiniPath), 'data/stories/cassini.zh.json exists');

const cassiniRaw = fs.readFileSync(cassiniPath, 'utf8');
let cassiniData = null;
try {
  cassiniData = JSON.parse(cassiniRaw);
  assert(true, 'cassini.zh.json is valid JSON');
} catch (e) {
  assert(false, `cassini.zh.json JSON parse failed: ${e.message}`);
}

if (cassiniData) {
  assert(Array.isArray(cassiniData.scenes) && cassiniData.scenes.length >= 3, 'Contains 3 scenes');

  // Verify timestamps monotonicity
  const t1 = new Date(cassiniData.scenes[0].time).getTime();
  const t2 = new Date(cassiniData.scenes[1].time).getTime();
  const t3 = new Date(cassiniData.scenes[2].time).getTime();

  assert(!isNaN(t1) && !isNaN(t2) && !isNaN(t3), 'All scene times are valid ISO-8601 timestamps');
  assert(t1 < t2, `Scene 1 (${cassiniData.scenes[0].time}) is earlier than Scene 2 (${cassiniData.scenes[1].time})`);
  assert(t2 < t3, `Scene 2 (${cassiniData.scenes[1].time}) is strictly earlier than Scene 3 (${cassiniData.scenes[2].time}) - NO TIME REGRESSION`);

  const deltaSeconds = (t3 - t2) / 1000;
  assert(deltaSeconds === 18, `Time delta between Scene 2 entry and Scene 3 LOS is 18 seconds (got ${deltaSeconds}s)`);

  // Verify rates
  assert(cassiniData.scenes[0].rate === 60, 'Scene 1 rate is 60x (speed simulation)');
  assert(cassiniData.scenes[1].rate === 1, 'Scene 2 rate is 1x (real-time observation)');
  assert(cassiniData.scenes[2].rate === 0, 'Scene 3 rate is 0 (historic freeze-frame)');

  // Verify unverified 62s claim is removed
  const s2Narrative = cassiniData.scenes[1].narrative;
  const s2Subtitle = cassiniData.scenes[1].subtitle;
  assert(!s2Subtitle.includes('最后的 62 秒真实飞行'), 'Scene 2 subtitle removes unverified 62s claim');
  assert(!s2Narrative.includes('10:32:50'), 'Scene 2 narrative no longer claims 10:32:50 end');
}

// -------------------------------------------------------------
// Test 2: Validate explore.html Initialization Order (TDZ Check)
// -------------------------------------------------------------
const explorePath = path.join(root, 'explore.html');
assert(fs.existsSync(explorePath), 'explore.html exists');

const exploreContent = fs.readFileSync(explorePath, 'utf8');

// Find positions of declarations
const theaterStateIdx = exploreContent.indexOf('const theaterState =');
const firstRefreshCallIdx = exploreContent.indexOf('refresh();');
const refreshDefIdx = exploreContent.indexOf('function refresh()');

assert(theaterStateIdx !== -1, 'theaterState is declared in explore.html');
assert(firstRefreshCallIdx !== -1, 'refresh() is called in explore.html');
assert(theaterStateIdx < firstRefreshCallIdx, `theaterState (${theaterStateIdx}) declared BEFORE first refresh() call (${firstRefreshCallIdx}) to prevent TDZ ReferenceError`);
assert(theaterStateIdx < refreshDefIdx, `theaterState (${theaterStateIdx}) declared BEFORE function refresh() definition (${refreshDefIdx})`);

// Verify 62s hardcoded auto-timer is removed from explore.html
assert(!exploreContent.includes('theaterState.sceneAccumulatedSimMs = 62000'), 'Hardcoded 62000ms end state is removed from controller');
assert(!exploreContent.includes('62000 - theaterState.sceneAccumulatedSimMs'), 'Hardcoded 62s schedule timer is removed');

// Verify direct URL triggers exist
assert(exploreContent.includes('urlParams.get(\'story\')'), 'Supports ?story=cassini URL query parameter');

console.log(`\nResults: ${passCount} Passed, ${failCount} Failed.`);

if (failCount > 0) {
  process.exit(1);
} else {
  console.log('🎉 All Story Theater checks passed successfully!\n');
}
