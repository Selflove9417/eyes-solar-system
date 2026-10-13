// Merges Chinese Wikipedia satellite ordinals (土卫三十六 = Aegir) into data/names.zh.json.
//
// Source of truth is the "编号 / 名称" column of each planet's satellite article,
// fetched by research/probe_wiki_moons.mjs. Only entries whose Latin name matches an
// id in the NASA entity export are written; everything else is reported, not guessed.
//   node tools/merge-moons.mjs research/wiki_saturn.json ... --write
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const args = process.argv.slice(2).filter((a) => a !== '--write');
const doWrite = process.argv.includes('--write');

const PREFIX = {
  木: '木星', 土: '土星', 天: '天王星', 海: '海王星', 火: '火星', 冥: '冥王星',
};

const entities = JSON.parse(readFileSync(root + 'data/source/entities.en.json', 'utf8'));
const glossary = JSON.parse(readFileSync(root + 'data/names.zh.json', 'utf8'));
// Match on the exact string the site renders: displayName || iauName.
const labelToId = new Map();
for (const e of entities) {
  if (e.category !== 'Moon') continue;
  const label = e.displayName || e.iauName;
  if (label) labelToId.set(label.toLowerCase(), e.id);
}

const added = [];
const already = [];
const unmatched = [];
const ambiguous = [];

for (const file of args) {
  const doc = JSON.parse(readFileSync(root + file, 'utf8'));
  // Jupiter-style rows carry the prefix inline ("木卫十六"); Saturn-style rows are
  // bare numerals ("十八") and take their prefix from the article title.
  const titlePrefix = Object.keys(PREFIX).find((p) => (doc.title || '').startsWith(PREFIX[p] + '的卫星'));
  if (!titlePrefix) { console.log(`跳过 ${file}: 无法从标题 "${doc.title}" 判定行星前缀`); continue; }
  for (const { prefix, numeral, latin } of doc.pairs || []) {
    const zh = `${prefix || titlePrefix}卫${numeral}`;
    const id = labelToId.get(latin.toLowerCase());
    if (!id) { unmatched.push(`${zh} = ${latin}`); continue; }
    const cur = glossary.entities[id];
    if (cur?.zh === zh) { already.push(id); continue; }
    if (cur?.zh && cur.zh !== zh) { ambiguous.push(`${id}: 现有 "${cur.zh}" vs 维基 "${zh}" (${latin})`); continue; }
    if (cur) { cur.zh = zh; cur.status = 'std'; cur.source = `zh.wikipedia.org ${doc.title}`; }
    else glossary.entities[id] = { zh, en: latin, status: 'std', cat: 'Moon', source: `zh.wikipedia.org ${doc.title}` };
    added.push(`${id} -> ${zh} (${latin})`);
  }
}

console.log(`新增/更新 ${added.length} · 已正确 ${already.length} · 冲突 ${ambiguous.length} · 站内无此卫星 ${unmatched.length}`);
if (ambiguous.length) console.log('冲突（需人工判定，未改动）:\n  ' + ambiguous.join('\n  '));
if (added.length) console.log('新增:\n  ' + added.slice(0, 80).join('\n  '));
if (unmatched.length) console.log('维基有但 NASA 实体库无对应（跳过）:\n  ' + unmatched.slice(0, 25).join('\n  '));

if (doWrite && added.length) {
  glossary.meta.coveredEntities = Object.keys(glossary.entities).length;
  writeFileSync(root + 'data/names.zh.json', JSON.stringify(glossary, null, 2) + '\n');
  console.log('written: data/names.zh.json');
}
