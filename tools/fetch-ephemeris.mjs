// Refreshes data/live/*.json from the JPL Horizons API.
//
// Why this runs at build time and not in the browser: ssd.jpl.nasa.gov sends no
// Access-Control-Allow-Origin header, so a static site cannot query it from a page
// (measured 2026-10-12: mode:'no-cors' reaches the server, mode:'cors' rejects).
// Run this from CI on a schedule and commit the result.
//
//   node tools/fetch-ephemeris.mjs                 # refresh all targets
//   node tools/fetch-ephemeris.mjs sc_voyager_1    # refresh one
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const AU_KM = 149597870.7;
const C_KMS = 299792.458;

// Only ids whose target line has been checked against the Horizons response go here.
// Adding a spacecraft means verifying its "Target description" line first — a wrong
// id silently returns a plausible number for a different object.
const TARGETS = {
  sc_voyager_1: { horizons: '-31', out: 'voyager-1.json', expect: 'Voyager 1 Spacecraft' },
};

const hms = (s) => `${Math.floor(s / 3600)} 小时 ${Math.floor((s % 3600) / 60)} 分 ${Math.round(s % 60)} 秒`;

async function query({ horizons, expect }) {
  const now = new Date();
  const stamp = now.toISOString().slice(0, 16).replace('T', ' ');
  const q = new URLSearchParams({
    format: 'text', COMMAND: `'${horizons}'`, CENTER: '500@399', QUANTITIES: '19',
    CAL_FORMAT: 'JD', START_TIME: stamp, STOP_TIME: stamp, STEP_SIZE: '1 m',
  });
  const res = await fetch('https://ssd.jpl.nasa.gov/api/horizons.api?' + q, {
    headers: { 'User-Agent': 'nasa-eyes-zh/1.0 (unofficial Chinese science site)' },
  });
  if (!res.ok) throw new Error(`Horizons HTTP ${res.status}`);
  const text = await res.text();
  if (!text.includes(expect)) throw new Error(`target mismatch: expected "${expect}" in the Horizons header for ${horizons}`);
  const row = text.split('$$SOE')[1]?.split('$$EOE')[0]?.trim().split(/\s+/);
  if (!row || row.length < 2) throw new Error('could not parse $$SOE table');
  const targetLine = (text.match(/.*/g).find((l) => l.includes(expect)) || '').trim();
  return {
    rangeAU: Number(row[1]),
    rangeRateKmS: Number(row[2]),
    julianDateUT: row[0],
    asOf: now.toISOString().replace(/\.\d+Z$/, 'Z'),
    targetLine,
  };
}

const only = process.argv.slice(2);
mkdirSync(join(root, 'data', 'live'), { recursive: true });
let done = 0;
for (const [id, t] of Object.entries(TARGETS)) {
  if (only.length && !only.includes(id)) continue;
  const r = await query(t);
  const km = r.rangeAU * AU_KM;
  const lt = km / C_KMS;
  const doc = {
    meta: {
      asOf: r.asOf, julianDateUT: r.julianDateUT,
      source: 'NASA/JPL Solar System Dynamics Horizons API',
      sourceUrl: 'https://ssd.jpl.nasa.gov/api/horizons.api',
      horizonsCommand: t.horizons, horizonsTargetLine: r.targetLine,
      observer: '500@399 (Earth geocenter)', quantities: '19 (target range and range rate)',
      retrievedAt: r.asOf.slice(0, 10),
      provenance: 'r_AU 与 range rate 为 Horizons 原样返回值；km / 光时由 r_AU 乘以定义常数换算，见 derived。',
      constants: { auKm: AU_KM, cKmS: C_KMS },
      refresh: '由 tools/fetch-ephemeris.mjs 生成；Horizons 不提供跨域头，静态站无法在浏览器里直接查询，只能在构建期或定时任务中抓取。',
    },
    raw: { rangeAU: r.rangeAU, rangeRateKmS: r.rangeRateKmS },
    derived: {
      rangeKm: Math.round(km),
      rangeKmText: `约 ${(km / 1e8).toFixed(2)} 亿公里`,
      oneWayLightTimeS: Math.round(lt),
      oneWayLightTimeText: hms(lt),
      roundTripLightTimeText: hms(lt * 2),
      rangeAuPerYear: Number((r.rangeRateKmS * 86400 * 365.25 / AU_KM).toFixed(3)),
      kmPerSecond: Number(r.rangeRateKmS.toFixed(2)),
    },
  };
  writeFileSync(join(root, 'data', 'live', t.out), JSON.stringify(doc, null, 2) + '\n');
  console.log(`${id}: ${r.rangeAU.toFixed(4)} AU · ${hms(lt)} one-way  -> data/live/${t.out}`);
  done++;
}
if (!done) console.log('nothing to do — check TARGETS and the id argument');
