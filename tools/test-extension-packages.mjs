// tools/test-extension-packages.mjs
// Verifies packaging integrity, true PKZip format validation, version consistency,
// and security boundaries for both the website offline package and the Edge Add-ons store package.
// Compatible with both Windows and Ubuntu (Linux) environments with zero external dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readZip } from './zip-util.mjs';

const root = path.resolve('.');
const offlineZip = path.join(root, 'dist', 'eyes-zh-extension.zip');
const storeZip = path.join(root, 'dist', 'eyes-zh-extension-edge-store.zip');

console.log('=== Extension Packaging & True ZIP Format Verification ===\n');

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

const offlineBuffer = fs.readFileSync(offlineZip);
const storeBuffer = fs.readFileSync(storeZip);

const offlineSha = sha256(offlineZip);
const storeSha = sha256(storeZip);
console.log(`\n  Offline Package SHA256 : ${offlineSha} (${offlineBuffer.length} bytes)`);
console.log(`  Edge Store Package SHA256: ${storeSha} (${storeBuffer.length} bytes)\n`);

// 2. Validate TRUE PKZip format (magic header + central directory, NOT TAR disguised as ZIP)
function checkZipMagic(buf, name) {
  const headerMagic = buf.subarray(0, 4).toString('hex');
  const isZipHeader = headerMagic === '504b0304';
  assert(isZipHeader, `${name} has true PKZip magic header 0x04034B50 (got 0x${headerMagic})`);

  // Verify it is NOT a TAR file (TAR files typically have 'ustar' at byte 257)
  const isTar = buf.length > 262 && buf.subarray(257, 262).toString('ascii') === 'ustar';
  assert(!isTar, `${name} is verified NOT to be a TAR archive disguised as ZIP`);

  // Verify EOCD record signature at end of file
  const eocdSig = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert(eocdSig !== -1 && eocdSig >= buf.length - 100, `${name} contains valid End-of-Central-Directory (EOCD) record`);
}

checkZipMagic(offlineBuffer, 'Offline Package (eyes-zh-extension.zip)');
checkZipMagic(storeBuffer, 'Edge Store Package (eyes-zh-extension-edge-store.zip)');

// 3. Decompress archives using true ZIP reader (verifies inflate and CRC-32)
let offlineEntries;
let storeEntries;
try {
  offlineEntries = readZip(offlineBuffer);
  assert(true, `Offline ZIP successfully inflated with zero CRC-32 errors (${offlineEntries.length} entries)`);
} catch (err) {
  assert(false, `Offline ZIP inflate failed: ${err.message}`);
  process.exit(1);
}

try {
  storeEntries = readZip(storeBuffer);
  assert(true, `Store ZIP successfully inflated with zero CRC-32 errors (${storeEntries.length} entries)`);
} catch (err) {
  assert(false, `Store ZIP inflate failed: ${err.message}`);
  process.exit(1);
}

const offlinePaths = offlineEntries.map((e) => e.path);
const storePaths = storeEntries.map((e) => e.path);

// 4. Verify directory structures
assert(offlinePaths.every((p) => p.startsWith('eyes-zh-extension/')), 'Offline ZIP strictly contains eyes-zh-extension/ parent folder for all entries');
assert(!storePaths.some((p) => p.startsWith('eyes-zh-extension/')), 'Store ZIP has NO outer eyes-zh-extension/ directory');
assert(storePaths.includes('manifest.json'), 'Store ZIP root directly contains manifest.json');
assert(storePaths.includes('content.js'), 'Store ZIP root directly contains content.js');
assert(!storePaths.includes('README.txt'), 'Store ZIP omits README.txt (clean for Edge Add-ons upload)');
assert(offlinePaths.includes('eyes-zh-extension/README.txt'), 'Offline ZIP includes README.txt with user instructions');

// 5. Verify exact required files in both archives
const expectedDataFiles = [
  'bodies.zh.json',
  'events.zh.json',
  'missions.zh.json',
  'more.zh.json',
  'names.zh.json',
  'ui.zh.json',
];

for (const d of expectedDataFiles) {
  assert(offlinePaths.includes(`eyes-zh-extension/data/${d}`), `Offline ZIP contains data/${d}`);
  assert(storePaths.includes(`data/${d}`), `Store ZIP contains data/${d}`);
}

assert(offlinePaths.length === 9, `Offline ZIP contains exactly 9 files (got ${offlinePaths.length})`);
assert(storePaths.length === 8, `Store ZIP contains exactly 8 files (got ${storePaths.length})`);

// 6. Byte-for-byte fidelity with source files
const offlineManifestEntry = offlineEntries.find((e) => e.path === 'eyes-zh-extension/manifest.json');
const storeManifestEntry = storeEntries.find((e) => e.path === 'manifest.json');
const sourceManifestBuf = fs.readFileSync(path.join(root, 'extension', 'manifest.json'));

assert(
  offlineManifestEntry.data.equals(sourceManifestBuf) && storeManifestEntry.data.equals(sourceManifestBuf),
  'manifest.json is byte-for-byte identical across source and both ZIP packages'
);

const offlineManifest = JSON.parse(offlineManifestEntry.data.toString('utf8'));
const storeManifest = JSON.parse(storeManifestEntry.data.toString('utf8'));

assert(offlineManifest.version === '0.2.0', `Offline manifest version is 0.2.0 (got ${offlineManifest.version})`);
assert(storeManifest.version === '0.2.0', `Store manifest version is 0.2.0 (got ${storeManifest.version})`);
assert(storeManifest.manifest_version === 3, 'Manifest version is V3');

const offlineContentEntry = offlineEntries.find((e) => e.path === 'eyes-zh-extension/content.js');
const storeContentEntry = storeEntries.find((e) => e.path === 'content.js');
const sourceContentBuf = fs.readFileSync(path.join(root, 'extension', 'content.js'));

assert(
  offlineContentEntry.data.equals(sourceContentBuf) && storeContentEntry.data.equals(sourceContentBuf),
  'content.js is byte-for-byte identical across source and both ZIP packages'
);

for (const d of expectedDataFiles) {
  const srcBuf = fs.readFileSync(path.join(root, 'data', d));
  const offEntry = offlineEntries.find((e) => e.path === `eyes-zh-extension/data/${d}`);
  const stoEntry = storeEntries.find((e) => e.path === `data/${d}`);
  assert(
    offEntry.data.equals(srcBuf) && stoEntry.data.equals(srcBuf),
    `data/${d} is byte-for-byte identical between repository source and both ZIPs`
  );
}

// 7. Security & permissions boundary
assert(!storeManifest.permissions || storeManifest.permissions.length === 0, 'No extra permissions declared (permissions: [])');
const contentMatches = storeManifest.content_scripts?.[0]?.matches || [];
assert(
  contentMatches.length === 1 && contentMatches[0] === 'https://eyes.nasa.gov/apps/solar-system/*',
  'content_scripts matches strictly https://eyes.nasa.gov/apps/solar-system/*'
);

const contentJsStr = storeContentEntry.data.toString('utf8');
assert(!contentJsStr.includes('eval('), 'content.js contains zero eval() calls');
assert(!contentJsStr.includes('new Function('), 'content.js contains zero new Function() calls');
assert(!contentJsStr.includes('http://'), 'content.js contains zero unencrypted http:// links');

// Check no temp or forbidden files
const forbidden = ['.log', '.tmp', '.DS_Store', '.git', '.bak', '~'];
const hasForbidden = storePaths.some((p) => forbidden.some((f) => p.endsWith(f)));
assert(!hasForbidden, 'Store package contains zero temporary, log, or git files');

console.log(`\n========================================`);
console.log(`True ZIP & Packaging Verification: ${pass} passed, ${fail} failed.`);
if (fail > 0) process.exit(1);
