// Builds data/events.zh.json from the event titles harvested off the live site.
//
// 163 of the 249 distinct titles are "<body> flyby [#N]" — generated from the
// glossary rather than hand-listed. The rest are translated explicitly below.
// A proper noun with no entry in names.zh.json is deliberately left in English:
// inventing a transliteration is worse than showing the original.
//   node tools/build-events.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const read = (p) => JSON.parse(readFileSync(root + p, 'utf8'));

const titles = Object.keys(read('research/event_titles.json')).sort();
const names = read('data/names.zh.json').entities;
// Reverse index: English rendered name -> Chinese, only where it is unambiguous.
const enToZh = new Map();
const clash = new Set();
for (const e of Object.values(names)) {
  if (!e.en || !e.zh || e.zh === e.en) continue;
  if (enToZh.has(e.en)) clash.add(e.en);
  else enToZh.set(e.en, e.zh);
}
for (const c of clash) enToZh.delete(c);

const MANUAL = {
  'A Flyby of Ida': '飞掠艾达星',
  'A Visit to Comet 103P/Hartley': '造访哈特雷 2 号彗星',
  'A Visit to Comet 19P/Borrelly': '造访博雷利彗星',
  'A Visit to Gaspra': '造访加斯普拉',
  'Arrival at Bennu': '抵达贝努小行星',
  'Arrival at Ceres': '抵达谷神星',
  'Arrival at Jupiter and Orbit Insertion': '抵达木星并进入环木轨道',
  'Atmospheric Probe Deployment': '大气探测器释放',
  'Atmospheric Probe Released': '大气探测器已释放',
  'Backlit Saturn': '逆光中的土星',
  'Cassini Launch': '卡西尼号发射',
  'Closest Enceladus Flyby': '最近距离飞掠土卫二',
  'DART Launch': 'DART 发射',
  'Dawn Arrives at Vesta': '黎明号抵达灶神星',
  'Dawn Launch': '黎明号发射',
  'Dawn Orbits Ceres': '黎明号进入环谷神星轨道',
  'Dawn Orbits Vesta': '黎明号进入环灶神星轨道',
  'Deep Impact Launch': '深度撞击号发射',
  'Deep Space Maneuvers': '深空机动',
  'Departure from Vesta': '离开灶神星',
  'Deployment Complete': '展开完成',
  'Descent into Jupiter': '下降进入木星',
  'Descent to Titan': '下降进入土卫六',
  'Discovery at Enceladus': '在土卫二的发现',
  'Dust Collector Deployment': '尘埃收集器展开',
  'Earth Flyby': '飞掠地球',
  'Europa Clipper Launch': '欧罗巴快船发射',
  'First Ring Plane Crossing': '首次穿越环面',
  'First Venus Flyby': '首次飞掠金星',
  'Flyby and Sampling of Comet Wild 2': '飞掠维尔特 2 号彗星并采样',
  'Flyby of Arrokoth': '飞掠阿罗科思',
  'Flyby of Asteroid Lutetia': '飞掠小行星鲁特西亚',
  'Flyby of Asteroid Mathilde': '飞掠小行星玛蒂尔德',
  'Flyby of Comet Tempel 1': '飞掠坦普尔 1 号彗星',
  'Flyby of Dinkinesh': '飞掠丁金尼什',
  'Flyby of Donaldjohanson': '飞掠 Donaldjohanson',
  'Flyby of Eurybates': '飞掠 Eurybates',
  'Flyby of Leucus': '飞掠留科斯',
  'Flyby of Orus': '飞掠 Orus',
  'Flyby of Patroclus and Menoetius': '飞掠 Patroclus 与 Menoetius',
  'Flyby of Pluto': '飞掠冥王星',
  'Flyby of Polymele': '飞掠波吕墨勒',
  'Galileo Launch': '伽利略号发射',
  "Galileo enters Jupiter's Atmosphere": '伽利略号进入木星大气',
  'Huygens Deployment': '惠更斯号释放',
  'Impact on Tempel 1': '撞击坦普尔 1 号',
  'Impact with Dimorphos': '撞击迪莫弗斯',
  'Impactor Probe Separation': '撞击器分离',
  'JWST Launch': '韦布空间望远镜发射',
  'Juno Launch': '朱诺号发射',
  'Jupiter Flyby': '飞掠木星',
  'Jupiter flyby': '飞掠木星',
  'Jupiter Orbit Insertion': '进入木星轨道',
  'Jupiter Orbit Insertion Burn': '木星轨道切入点火',
  'LCROSS Approaches the South Pole Impact Site': 'LCROSS 接近南极撞击点',
  'Landing on Asteroid Eros': '着陆于爱神星',
  'Landing on Comet 67P': '着陆于 67P 彗星',
  'Mars Flyby': '飞掠火星',
  'Mars flyby': '飞掠火星',
  'NEAR Shoemaker Enters Orbit Around Eros': '近地小行星会合-舒梅克号进入环爱神星轨道',
  'NEO Surveyor Begins to Orbit the Sun at Lagrange Point L1': 'NEO Surveyor 开始在日地 L1 拉格朗日点绕太阳运行',
  'NEO Surveyor Launch': 'NEO Surveyor 发射',
  'OSIRIS-REx Launch': 'OSIRIS-REx 发射',
  "OSIRIS-REx Samples Bennu's Surface": 'OSIRIS-REx 采集贝努小行星表面样本',
  'Philae Leaves Rosetta': '菲莱离开罗塞塔号',
  'Psyche arrives at 16 Psyche Asteroid': '灵神星号抵达灵神星',
  'Rosetta Enters Orbit Around Comet 67P': '罗塞塔号进入环 67P 彗星轨道',
  'Sample Return Capsule Returns to Earth': '样品返回舱返回地球',
  'Sample Return Capsule Separation at Earth': '样品返回舱在近地分离',
  'Saturn Orbit Insertion': '进入土星轨道',
  'Saturn flyby': '飞掠土星',
  'The Final Transmission': '最后一次传输',
  'The Grand Finale': '大结局',
  'The Wave at Saturn': '土星上的波浪',
  'Titan Northern Lakes': '土卫六的北方湖泊',
  'Voyager 1 Launch': '旅行者 1 号发射',
  'Voyager 1 Leaves the Heliosphere': '旅行者 1 号离开日球层',
  'Voyager 1 at Jupiter': '旅行者 1 号抵达木星',
  'Voyager 1 at Saturn': '旅行者 1 号抵达土星',
  'Voyager 2 Launch': '旅行者 2 号发射',
  'Voyager 2 at Jupiter': '旅行者 2 号抵达木星',
  'Voyager 2 at Neptune': '旅行者 2 号抵达海王星',
  'Voyager 2 at Saturn': '旅行者 2 号抵达土星',
  'Voyager 2 at Uranus': '旅行者 2 号抵达天王星',
  'Voyager 2 leaves the Heliosphere': '旅行者 2 号离开日球层',
  'Webb Begins to Orbit the Sun at Lagrange Point L2': '韦布空间望远镜开始在日地 L2 拉格朗日点绕太阳运行',
};

const FLYBY = /^(Titan|Enceladus|Dione|Rhea|Iapetus|Mimas|Hyperion|Tethys|Phoebe|Telesto|Calypso|Atlas|Pandora|Prometheus|Pan|Janus|Epimetheus|Lapetus) flyby( #(\d+))?$/;

const out = {};
const unresolved = [];
for (const t of titles) {
  if (MANUAL[t]) { out[t] = MANUAL[t]; continue; }
  const m = t.match(FLYBY);
  if (m) {
    const zh = enToZh.get(m[1]);
    if (zh) { out[t] = `飞掠${zh}${m[3] ? ` 第 ${m[3]} 次` : ''}`; continue; }
  }
  unresolved.push(t);
}

if (unresolved.length) {
  console.log('未解析，需补进 MANUAL 或术语表：');
  unresolved.forEach((t) => console.log('  ' + t));
  process.exit(1);
}

const doc = {
  meta: {
    source: 'NASA/JPL Eyes on the Solar System 公开的 events/<id>/all_events.json 中 title 字段',
    note: '仅 27/169 个航天器提供事件文件；其余返回 403。标题取自 2026-10-11 的实际抓取结果。',
    harvestedAt: '2026-10-11',
    distinctTitles: titles.length,
  },
  events: out,
};
writeFileSync(root + 'data/events.zh.json', JSON.stringify(doc, null, 2) + '\n');
console.log(`wrote data/events.zh.json — ${Object.keys(out).length}/${titles.length} titles`);
