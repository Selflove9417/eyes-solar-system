// Appends new description entries, pulling the English source verbatim from the
// archived official JSON so a hand-typed quote can never drift.
//   node tools/add-descriptions.mjs <patch.json>
// patch.json: { "bodies": { "<id>": "<chinese>" }, "missions": { "<id>": "<chinese>" } }
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const read = (p) => JSON.parse(readFileSync(root + p, 'utf8'));
const SRC = 'https://eyes.nasa.gov/apps/solar-system/descriptions/';

const patchPath = process.argv[2];
if (!patchPath) { console.error('usage: node tools/add-descriptions.mjs <patch.json>'); process.exit(1); }
const patch = JSON.parse(readFileSync(patchPath, 'utf8'));
const official = read('data/source/descriptions.en.json');
const entities = read('data/source/entities.en.json');
const names = read('data/names.zh.json');
// `zh` in the content files is the Chinese display name, taken from the glossary;
// `en`/`label` is what the site renders. Never invent either one here.
const zhName = (id) => names.entities[id]?.zh || null;
const enName = (id) => names.entities[id]?.en || null;

const targets = [
  ['data/bodies.zh.json', 'bodies', patch.bodies, (id, zh) => ({ id, zh, cat: (entities.find((e) => e.id === id) || {}).category, en: '', zhl: zh })],
  ['data/missions.zh.json', 'missions', patch.missions, (id, zh) => ({ id, zh, en: enName(id) || '', src: '', enBlurb: '', zhBlurb: zh })],
];

let added = 0;
for (const [file, key, map, make] of targets) {
  if (!map) continue;
  const doc = read(file);
  const have = new Set(doc[key].map((e) => e.id));
  for (const [id, blurbZh] of Object.entries(map)) {
    if (have.has(id)) { console.log(`skip ${id}: already present`); continue; }
    const src = official[id];
    if (!src) { console.log(`SKIP ${id}: no archived official description — refusing to invent one`); continue; }
    const zh = zhName(id);
    if (!zh) { console.log(`SKIP ${id}: not in names.zh.json — add the Chinese name first`); continue; }
    const entry = make(id, zh);
    entry[key === 'bodies' ? 'zhl' : 'zhBlurb'] = blurbZh;
    entry.src = SRC + id + '.json';
    entry[key === 'bodies' ? 'en' : 'enBlurb'] = src.description?.blurb || '';
    doc[key].push(entry);
    added++;
  }
  writeFileSync(root + file, JSON.stringify(doc, null, 2) + '\n');
}
console.log(`added ${added} entries`);
