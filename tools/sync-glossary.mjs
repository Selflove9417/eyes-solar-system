// Keeps data/names.zh.json honest: every key must exist in the entity export,
// and the recorded English name must equal what the site actually renders
// (verified: label text === displayName || iauName, 28/28 against the live DOM).
//
//   node tools/sync-glossary.mjs <entities.json> <names.zh.json> [--write]
import { readFileSync, writeFileSync } from 'node:fs';

const [entitiesPath, namesPath, writeFlag] = process.argv.slice(2);
if (!entitiesPath || !namesPath) {
  console.error('usage: node tools/sync-glossary.mjs <entities.json> <names.zh.json> [--write]');
  process.exit(1);
}

const entities = JSON.parse(readFileSync(entitiesPath, 'utf8'));
const byId = new Map(entities.map((e) => [e.id, e]));
const glossary = JSON.parse(readFileSync(namesPath, 'utf8'));
const label = (e) => e.displayName || e.iauName || null;

const dropped = [];
const fixed = [];
const next = {};

for (const [id, entry] of Object.entries(glossary.entities)) {
  const real = byId.get(id);
  if (!real || !entry.zh) {
    dropped.push(id);
    continue;
  }
  const en = label(real);
  if (entry.en !== en) fixed.push(`${id}: "${entry.en}" -> "${en}"`);
  next[id] = { ...entry, en, cat: real.category };
}

glossary.entities = next;
glossary.meta.totalEntities = entities.length;
glossary.meta.coveredEntities = Object.keys(next).length;
glossary.meta.nameFormula = 'displayName || iauName（与站点渲染标签实测一致）';

console.log(`covered ${Object.keys(next).length} of ${entities.length} entities`);
if (dropped.length) console.log('dropped:\n  ' + dropped.join('\n  '));
if (fixed.length) console.log('corrected:\n  ' + fixed.join('\n  '));
if (writeFlag === '--write') {
  writeFileSync(namesPath, JSON.stringify(glossary, null, 2) + '\n');
  console.log('written: ' + namesPath);
}
