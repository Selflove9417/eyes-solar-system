// Refills the English source fields of the Chinese content layer straight from the
// archived official JSON, so hand-typed transcription errors cannot creep in.
//   node tools/sync-sources.mjs [--write]
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const read = (p) => JSON.parse(readFileSync(root + p, 'utf8'));
const write = (p, o) => writeFileSync(root + p, JSON.stringify(o, null, 2) + '\n');

const SRC = 'https://eyes.nasa.gov/apps/solar-system/descriptions/';
const official = read('data/source/descriptions.en.json');
const entities = read('data/source/entities.en.json');
const byId = new Map(entities.map((e) => [e.id, e]));
const doWrite = process.argv.includes('--write');

const report = { refilled: 0, noSource: [], labelDiffers: [] };

for (const file of ['data/bodies.zh.json', 'data/missions.zh.json']) {
  const doc = read(file);
  const enKey = file.includes('bodies') ? 'en' : 'enBlurb';
  for (const entry of doc[file.includes('bodies') ? 'bodies' : 'missions']) {
    const src = official[entry.id];
    if (!src) {
      report.noSource.push(entry.id);
      entry[enKey] = '';
      entry.src = null;
      continue;
    }
    entry[enKey] = src.description?.blurb || '';
    entry.src = SRC + entry.id + '.json';
    const real = byId.get(entry.id);
    const label = real ? real.displayName || real.iauName : null;
    if (label && label !== src.title)
      report.labelDiffers.push(`${entry.id}: 官方 title="${src.title}" 站点标签="${label}"`);
    report.refilled++;
  }
  if (doWrite) write(file, doc);
}

console.log(`English source fields refilled: ${report.refilled}`);
if (report.noSource.length) console.log('无官方 descriptions 条目：\n  ' + report.noSource.join('\n  '));
if (report.labelDiffers.length) console.log('官方 title 与站点渲染标签不同：\n  ' + report.labelDiffers.join('\n  '));
if (!doWrite) console.log('(dry run — 加 --write 落盘)');
