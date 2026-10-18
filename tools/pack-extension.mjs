// Assembles a loadable extension folder from extension/ + the shared data/ dictionaries,
// so the site and the extension never carry two copies of the glossary.
//   node tools/pack-extension.mjs        -> dist/eyes-zh-extension/
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const out = join(root, 'dist', 'eyes-zh-extension');

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'data'), { recursive: true });
cpSync(join(root, 'extension', 'manifest.json'), join(out, 'manifest.json'));
cpSync(join(root, 'extension', 'content.js'), join(out, 'content.js'));
// The data file list is read from the manifest, so the two can never drift apart.
const manifest = JSON.parse(readFileSync(join(root, 'extension', 'manifest.json'), 'utf8'));
const dataFiles = manifest.web_accessible_resources.flatMap((r) => r.resources)
  .filter((p) => p.startsWith('data/'));
for (const rel of dataFiles) {
  cpSync(join(root, rel), join(out, rel));
}
writeFileSync(join(out, 'README.txt'), [
  'NASA Eyes 太阳系中文汉化 —— 加载步骤',
  '',
  'Chrome：地址栏打开 chrome://extensions → 右上角开启"开发者模式"',
  '        → 点"加载已解压的扩展程序"→ 选择本文件夹。',
  'Edge：  地址栏打开 edge://extensions → 左下角开启"开发人员模式"',
  '        → 点"加载解压缩的扩展"→ 选择本文件夹。',
  '',
  '然后访问 https://eyes.nasa.gov/apps/solar-system/',
  '本扩展只在 eyes.nasa.gov 上运行，不收集、不上传任何数据。',
  '',
].join('\n'));

console.log('packed -> ' + out);

function calcSha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

// 1. Package A: Website offline installation package (contains eyes-zh-extension folder)
const offlineZip = join(root, 'dist', 'eyes-zh-extension.zip');
rmSync(offlineZip, { force: true });
try {
  execSync(`tar -a -c -f "${offlineZip}" -C "${join(root, 'dist')}" eyes-zh-extension`);
  console.log('zipped offline package -> ' + offlineZip);
  console.log('  SHA256: ' + calcSha256(offlineZip));
} catch (e) {
  console.warn('Offline zip creation failed:', e.message);
}

// 2. Package B: Edge Add-ons store update package (root directly contains manifest.json, content.js, data/)
const storeZip = join(root, 'dist', 'eyes-zh-extension-edge-store.zip');
const storeStaging = join(root, 'dist', '.edge-store-staging');
rmSync(storeZip, { force: true });
rmSync(storeStaging, { recursive: true, force: true });
mkdirSync(join(storeStaging, 'data'), { recursive: true });

cpSync(join(root, 'extension', 'manifest.json'), join(storeStaging, 'manifest.json'));
cpSync(join(root, 'extension', 'content.js'), join(storeStaging, 'content.js'));
for (const rel of dataFiles) {
  cpSync(join(root, rel), join(storeStaging, rel));
}

try {
  execSync(`tar -a -c -f "${storeZip}" -C "${storeStaging}" manifest.json content.js data`);
  console.log('zipped Edge store package -> ' + storeZip);
  console.log('  SHA256: ' + calcSha256(storeZip));
} catch (e) {
  console.warn('Edge store zip creation failed:', e.message);
} finally {
  rmSync(storeStaging, { recursive: true, force: true });
}
