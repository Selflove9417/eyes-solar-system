// tools/pack-extension.mjs
// Assembles loadable extension folders and creates standard PKZip packages
// for both the website offline package and the Edge Add-ons store package.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createZip } from './zip-util.mjs';

const root = new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const out = join(root, 'dist', 'eyes-zh-extension');

try {
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

  const readmeContent = [
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
  ].join('\n');
  writeFileSync(join(out, 'README.txt'), readmeContent);

  console.log('packed unpacked extension -> ' + out);

  function calcSha256(filePath) {
    return createHash('sha256').update(readFileSync(filePath)).digest('hex');
  }

  // 1. Package A: Website offline installation package (contains eyes-zh-extension/ folder)
  const offlineZip = join(root, 'dist', 'eyes-zh-extension.zip');
  rmSync(offlineZip, { force: true });

  const offlineItems = [
    { path: 'eyes-zh-extension/manifest.json', data: readFileSync(join(out, 'manifest.json')) },
    { path: 'eyes-zh-extension/content.js', data: readFileSync(join(out, 'content.js')) },
    { path: 'eyes-zh-extension/README.txt', data: Buffer.from(readmeContent, 'utf8') },
  ];
  for (const rel of dataFiles) {
    offlineItems.push({
      path: `eyes-zh-extension/${rel}`,
      data: readFileSync(join(root, rel))
    });
  }

  createZip(offlineItems, offlineZip);
  console.log('zipped offline package -> ' + offlineZip);
  console.log('  SHA256: ' + calcSha256(offlineZip));

  // 2. Package B: Edge Add-ons store update package (root directly contains manifest.json, content.js, data/)
  const storeZip = join(root, 'dist', 'eyes-zh-extension-edge-store.zip');
  rmSync(storeZip, { force: true });

  const storeItems = [
    { path: 'manifest.json', data: readFileSync(join(out, 'manifest.json')) },
    { path: 'content.js', data: readFileSync(join(out, 'content.js')) },
  ];
  for (const rel of dataFiles) {
    storeItems.push({
      path: rel,
      data: readFileSync(join(root, rel))
    });
  }

  createZip(storeItems, storeZip);
  console.log('zipped Edge store package -> ' + storeZip);
  console.log('  SHA256: ' + calcSha256(storeZip));

  console.log('✅ All extension packages generated successfully with standard PKZip format.');
} catch (err) {
  console.error('❌ Extension packaging failed fatal error:', err);
  process.exit(1);
}
