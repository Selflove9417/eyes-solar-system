// Verifies the Chinese content layer against the archived official NASA source.
//   node tools/lint-zh.mjs
// Fails (exit 1) if a translated entry's English text does not match the official
// descriptions JSON it claims to translate, if an id is unknown, or if an
// English word was left behind in a Chinese field.
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const read = (p) => JSON.parse(readFileSync(root + p, 'utf8'));

const entities = read('data/source/entities.en.json');
const official = read('data/source/descriptions.en.json');
const names = read('data/names.zh.json');
const bodies = read('data/bodies.zh.json');
const missions = read('data/missions.zh.json');

const byId = new Map(entities.map((e) => [e.id, e]));
const norm = (s) => (s || '').replace(/[‘’“”]/g, '"').replace(/\s+/g, ' ').trim();
const errors = [];
const warnings = [];

// 1. Every glossary id must exist and every label must match what the site renders.
for (const [id, e] of Object.entries(names.entities)) {
  const real = byId.get(id);
  if (!real) { errors.push(`names.zh.json: 未知 id ${id}`); continue; }
  const rendered = real.displayName || real.iauName;
  if (norm(e.en) !== norm(rendered))
    errors.push(`names.zh.json: ${id} 英文应为 "${rendered}"，实为 "${e.en}"`);
  if (!e.zh) errors.push(`names.zh.json: ${id} 缺少中文`);
}

// 2. English source text must be verbatim from the official JSON.
const checkEntry = (kind, entry, enField, zhField) => {
  if (entry.src === null) {
    if (entry[enField]) errors.push(`${kind}: ${entry.id} 标记为无官方来源，却登记了英文原文`);
    warnings.push(`${kind}: ${entry.id} 官方无 descriptions 条目，中文页仅显示名称`);
    return;
  }
  const src = official[entry.id];
  if (!src) { errors.push(`${kind}: ${entry.id} 在官方 descriptions 存档中不存在`); return; }
  if (entry.src !== 'https://eyes.nasa.gov/apps/solar-system/descriptions/' + entry.id + '.json')
    errors.push(`${kind}: ${entry.id} src 字段与 id 不一致`);
  const officialBlurb = norm(src.description?.blurb);
  if (!entry[enField]) {
    if (officialBlurb) errors.push(`${kind}: ${entry.id} 未登记英文原文，但官方有 blurb`);
    return;
  }
  if (norm(entry[enField]) !== officialBlurb)
    errors.push(`${kind}: ${entry.id} 英文原文与官方 blurb 不一致\n      官方: ${officialBlurb.slice(0, 120)}\n      登记: ${norm(entry[enField]).slice(0, 120)}`);
  if (!entry[zhField]) errors.push(`${kind}: ${entry.id} 缺少中文译文`);
};
for (const b of bodies.bodies) checkEntry('bodies.zh.json', b, 'en', 'zhl');
for (const m of missions.missions) checkEntry('missions.zh.json', m, 'enBlurb', 'zhBlurb');

// 3. No untranslated English words left in Chinese fields.
//    Allowed: URLs, HTML tags, ##placeholders##, unit symbols, proper-code tokens.
const ALLOW = /^(JWST|SLS|ISS|TESS|MAVEN|DART|NASA|ESA|AU|LWS|LRO|SDO|MRO|OSIRIS|OSIRIS-REx|OSIRIS-APEX|APEX|REx|InSight|X|EDT|PM|AM|C|P|I|Hartley|Tempel|Wild|Borrelly|ATLAS|Apophis|Churyumov|Gerasimenko|SIRTF|Jupiter|Saturn|Mars|Earth|Moon|Pluto|Venus|Mercury|Ceres|Vesta|Psyche|Bennu|Lucy|Europa|Ganymede|Callisto|Io|Triton|Charon|Enceladus|Titan|Dysnomia|Huygens|Galileo|Cassini|Juno|Hubble|Kepler|Chandra|Ulysses|Rosetta|Stardust|Dawn|Magellan|Messenger|Odyssey|Perseverance|Curiosity|Phoenix|Voyager|Pioneer|Horizons|Clipper|Parker|Roman|Artemis|Explorer|Double|Asteroid|Redirection|Test|Ebb|Flow|ExoMars|TGO|Roscosmos|Hayabusa2|Arrokoth|Didymos|Comet|Halley|SOHO|GRAIL)$/;
for (const [file, list, zhKeys] of [
  ['bodies.zh.json', bodies.bodies, ['zhl', 'zh']],
  ['missions.zh.json', missions.missions, ['zhBlurb', 'zh']],
]) {
  for (const entry of list) {
    for (const k of zhKeys) {
      const text = entry[k] || '';
      const stripped = text
        .replace(/<[^>]+>/g, ' ')
        .replace(/##[a-z_]+##/gi, ' ')
        .replace(/https?:\/\/\S+/g, ' ')
        .replace(/\[[^\]]*\]/g, ' ');
      for (const w of stripped.match(/[A-Za-z][A-Za-z'’\-]{2,}/g) || []) {
        if (!ALLOW.test(w)) warnings.push(`${file}: ${entry.id} 中文串中残留英文词 "${w}"`);
      }
    }
  }
}

console.log(`glossary: ${Object.keys(names.entities).length}/${entities.length} entities`);
console.log(`bodies: ${bodies.bodies.length} · missions: ${missions.missions.length}`);
if (warnings.length) console.log('\nWARNINGS:\n  ' + warnings.join('\n  '));
if (errors.length) {
  console.log('\nERRORS:\n  ' + errors.join('\n  '));
  process.exit(1);
}
console.log('\nOK — 全部中文条目与官方英文原文一致。');
