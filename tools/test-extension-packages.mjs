// tools/test-extension-packages.mjs
// Verifies packaging integrity, version consistency, and security boundaries
// for both the website offline package and the Edge Add-ons store package.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = path.resolve('.');
const offlineZip = path.join(root, 'dist', 'eyes-zh-extension.zip');
const storeZip = path.join(root, 'dist', 'eyes-zh-extension-edge-store.zip');

console.log('=== Extension Packaging & Security Verification ===\n');

let pass = 0;
let fail = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    pass++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    fail++;
  }
}

function sha256(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

// 1. Files existence & non-empty
assert(fs.existsSync(offlineZip) && fs.statSync(offlineZip).size > 10000, 'Offline package exists and > 10KB');
assert(fs.existsSync(storeZip) && fs.statSync(storeZip).size > 10000, 'Edge store package exists and > 10KB');

const offlineSha = sha256(offlineZip);
const storeSha = sha256(storeZip);
console.log(`\n  Offline Package SHA256 : ${offlineSha} (${fs.statSync(offlineZip).size} bytes)`);
console.log(`  Edge Store Package SHA256: ${storeSha} (${fs.statSync(storeZip).size} bytes)\n`);

// 2. Inspect ZIP contents via tar -tf
const offlineEntries = execSync(`tar -tf "${offlineZip}"`).toString().trim().split(/\r?\n/).map(s => s.replace(/\\/g, '/'));
const storeEntries = execSync(`tar -tf "${storeZip}"`).toString().trim().split(/\r?\n/).map(s => s.replace(/\\/g, '/'));

// Check offline zip structure
assert(offlineEntries.some(e => e.startsWith('eyes-zh-extension/')), 'Offline ZIP contains eyes-zh-extension/ root folder');
assert(offlineEntries.includes('eyes-zh-extension/manifest.json'), 'Offline ZIP contains manifest.json');
assert(offlineEntries.includes('eyes-zh-extension/content.js'), 'Offline ZIP contains content.js');
assert(offlineEntries.includes('eyes-zh-extension/README.txt'), 'Offline ZIP contains README.txt');

// Check store zip structure
assert(!storeEntries.some(e => e.startsWith('eyes-zh-extension/')), 'Store ZIP does NOT have nested eyes-zh-extension/ directory');
assert(storeEntries.includes('manifest.json'), 'Store ZIP root directly contains manifest.json');
assert(storeEntries.includes('content.js'), 'Store ZIP root directly contains content.js');
assert(!storeEntries.includes('README.txt'), 'Store ZIP omits README.txt (clean for store upload)');

// Check data files presence in both
const requiredData = [
  'bodies.zh.json',
  'events.zh.json',
  'missions.zh.json',
  'more.zh.json',
  'names.zh.json',
  'ui.zh.json'
];

for (const d of requiredData) {
  assert(offlineEntries.includes(`eyes-zh-extension/data/${d}`), `Offline ZIP contains data/${d}`);
  assert(storeEntries.includes(`data/${d}`), `Store ZIP contains data/${d}`);
}

// 3. Unpack and compare contents
const tempExtract = path.join(root, '.temp-unpack-test-' + Date.now());
fs.mkdirSync(tempExtract, { recursive: true });

try {
  const offlineDir = path.join(tempExtract, 'offline');
  const storeDir = path.join(tempExtract, 'store');
  fs.mkdirSync(offlineDir, { recursive: true });
  fs.mkdirSync(storeDir, { recursive: true });

  execSync(`tar -xf "${offlineZip}" -C "${offlineDir}"`);
  execSync(`tar -xf "${storeZip}" -C "${storeDir}"`);

  const offlineManifest = JSON.parse(fs.readFileSync(path.join(offlineDir, 'eyes-zh-extension', 'manifest.json'), 'utf8'));
  const storeManifest = JSON.parse(fs.readFileSync(path.join(storeDir, 'manifest.json'), 'utf8'));

  // Manifest version
  assert(offlineManifest.version === '0.2.0', `Offline manifest version is 0.2.0 (got ${offlineManifest.version})`);
  assert(storeManifest.version === '0.2.0', `Store manifest version is 0.2.0 (got ${storeManifest.version})`);
  assert(offlineManifest.version === storeManifest.version, 'Manifest versions match exactly between packages');
  assert(offlineManifest.manifest_version === 3, 'Manifest version is V3');

  // Security: No extra permissions
  assert(!offlineManifest.permissions || offlineManifest.permissions.length === 0, 'No extra permissions in offline manifest');
  assert(!storeManifest.permissions || storeManifest.permissions.length === 0, 'No extra permissions in store manifest');

  // Security: content_scripts matches only eyes.nasa.gov
  const storeMatches = storeManifest.content_scripts?.[0]?.matches || [];
  assert(storeMatches.length === 1 && storeMatches[0] === 'https://eyes.nasa.gov/apps/solar-system/*', 'Content script matches strictly eyes.nasa.gov/apps/solar-system/*');

  // Content.js matches
  const offlineContent = fs.readFileSync(path.join(offlineDir, 'eyes-zh-extension', 'content.js'), 'utf8');
  const storeContent = fs.readFileSync(path.join(storeDir, 'content.js'), 'utf8');
  const sourceContent = fs.readFileSync(path.join(root, 'extension', 'content.js'), 'utf8');
  assert(offlineContent === storeContent && offlineContent === sourceContent, 'content.js is 100% byte-for-byte identical across source and both ZIPs');

  // Data files match source data/
  for (const d of requiredData) {
    const src = fs.readFileSync(path.join(root, 'data', d), 'utf8');
    const off = fs.readFileSync(path.join(offlineDir, 'eyes-zh-extension', 'data', d), 'utf8');
    const sto = fs.readFileSync(path.join(storeDir, 'data', d), 'utf8');
    assert(src === off && src === sto, `data/${d} is 100% identical between source and both packages`);
  }

  // Security: No remote executable code or external eval
  const allCode = storeContent;
  assert(!allCode.includes('eval('), 'content.js contains zero eval() calls');
  assert(!allCode.includes('new Function('), 'content.js contains zero new Function() calls');
  assert(!allCode.includes('http://'), 'content.js contains zero unencrypted http:// links');

  // No temp or log files inside
  const forbiddenExts = ['.log', '.tmp', '.DS_Store', '.git', '.bak'];
  const hasBadFiles = storeEntries.some(e => forbiddenExts.some(ext => e.endsWith(ext)));
  assert(!hasBadFiles, 'Store ZIP contains zero temporary, log, or git files');

} finally {
  fs.rmSync(tempExtract, { recursive: true, force: true });
}

console.log(`\n========================================`);
console.log(`Packaging & Security: ${pass} passed, ${fail} failed.`);
if (fail > 0) process.exit(1);
