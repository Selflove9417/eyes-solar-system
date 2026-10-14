// Assembles a loadable extension folder from extension/ + the shared data/ dictionaries,
// so the site and the extension never carry two copies of the glossary.
//   node tools/pack-extension.mjs        -> dist/eyes-zh-extension/
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

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

try {
  execSync(`tar -a -c -f "${join(root, 'dist', 'eyes-zh-extension.zip')}" -C "${join(root, 'dist')}" eyes-zh-extension`);
  console.log('zipped -> ' + join(root, 'dist', 'eyes-zh-extension.zip'));
} catch (e) {
  console.warn('Zip creation failed:', e.message);
}
