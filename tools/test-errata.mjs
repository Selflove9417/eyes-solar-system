/**
 * 官方事实勘误与校验例外单元测试套件 (test-errata.mjs)
 * 严格覆盖正向与反向用例，确保单项例外不退化、不泛化、不漏检。
 */

import { APPROVED_ERRATA, applyApprovedErrata } from './more-errata.mjs';
import { verifyQuantitiesEquivalence } from './quantity-parser.mjs';

console.log('==================================================');
console.log('🧪 官方源文事实勘误与校准注册表单元测试');
console.log('==================================================\n');

const validEn = 'NASA is participating in a mission of the European Space Agency and the Italian Space Agency called Mars Express, which has been exploring the atmosphere and surface of Mars from polar orbit since arriving at the red planet on December 26, 2003. The mission\'s main objective is to search for sub-surface water from orbit. Seven scientific instruments on the orbiting spacecraft have conducted rigorous investigations to help answer fundamental questions about the geology, atmosphere, surface environment, history of water, and potential for life on Mars. Examples of discoveries - still debated by scientists -- by Mars Express are evidence of recent glacial activity, explosive volcanism, and methane gas.';

const validZh = 'NASA 参与了欧洲空间局与意大利航天局名为火星快车号的联合任务，该探测器自 2003 年 12 月 25 日抵达这颗红色星球以来（译注：NASA Eyes 英文原文所列抵达日期有误；此处依据 ESA 与 NASA 官方任务记录订正。），一直在极轨道上探测火星的大气与地表。该任务的主要目标是从轨道上搜寻地表下水资源。轨道器上的七台科学仪器开展了严密的勘测，以协助解答关于火星地质、大气、地表环境、水的历史以及潜在生命可能性的基本问题。火星快车号的发现成果（在科学界仍存有争议）包括近期冰川活动、爆发性火山活动以及甲烷气体的证据。';

const validClementineEn = 'Clementine was launched in 1994 and The lunar observations included imaging at various wavelengths in the visible as well as in ultraviolet and infrared, laser ranging altimetry, gravimetry, and charged particle measurements. Clementine successfully entered an elliptical polar orbit (about 270 × 1,830 miles or 430 × 2,950 kilometers) around the Moon on Feb. 19, 1994, with a period of five days. In two months during 1994, it transmitted about 1.6 million digital images of the lunar surface, many of them with resolutions down to about 330-660 feet (100-200 meters). In the process, it provided scientists with their first look at the total lunar landscape including polar regions.';

const validClementineZh = '克莱门汀号于 1994 年发射升空，其月球观测项目包括可见光、紫外与红外波段的多波长成像、激光测高、重力测量以及带电粒子测量。克莱门汀号于 1994 年 2 月 19 日成功切入环绕月球的椭圆极轨道（初始周期约八小时），两天后调整为周期约五小时的测绘轨道（约为 270 × 1,830 英里，即 430 × 2,950 千米）（译注：NASA Eyes 英文原文误将轨道周期记为五天；依据 NASA 官方任务记录与研究论文，探测器初始入轨周期约八小时，经调整后的测绘轨道周期实际约为五小时。）在 1994 年的两个月内，它传回了约 160 万幅月球表面数字图像，其中许多图像的分辨率高达约 330 至 660 英尺（100 至 200 米）。在此过程中，它为科学家首次提供了包含极地地区在内的全月球地貌全貌。';

const validDartEn = "An on-orbit demonstration of asteroid deflection was a key test that NASA and other agencies wished to perform before any actual need is present. The DART mission was NASA's demonstration of kinetic impactor technology, impacting an asteroid to adjust its speed and path. The targeted system is composed of two asteroids: the larger asteroid Didymos (diameter: 780 meters, 0.48 miles), and the smaller moonlet asteroid, Dimorphos (diameter: 160 meters, 525 feet), which orbits Didymos. On September 26th, 2022, the DART spacecraft impacted Dimorphos nearly head-on, shortening the time it takes the small asteroid moonlet to orbit Didymos by several minutes.";

const validDartZh = '在实际面临天体撞击威胁前开展小行星偏转的在轨验证，是 NASA 及其他航天机构期望完成的关键试验。DART（双小行星重定向测试）任务是 NASA 对动能撞击技术的演示验证，通过撞击小行星来调整其运行速度与轨道路径。该任务的目标系统由两颗小行星组成：较大的主小行星迪迪莫斯（直径：780 米，即 0.48 英里），以及绕其运行的较小卫星小行星迪莫弗斯（直径：160 米，即 525 英尺）。2022 年 9 月 26 日，DART 探测器以近乎迎头相撞的方式撞击了迪莫弗斯，将这颗小行星卫星绕转迪迪莫斯的轨道周期缩短了约 33 分钟。（译注：NASA Eyes 英文原文采用“数分钟”的笼统表述；此处依据 NASA 官方后续精密观测结果提供量化数据。）';

const testCases = [
  // 1. 正向用例：目标段落正确订正 + 正确译注 + 未改动英文源文
  {
    name: '【正向】sc_mars_express:0 正确订正为 25 日并附带指定译注',
    run: () => {
      const res = applyApprovedErrata({
        slug: 'sc_mars_express',
        paragraphIndex: 0,
        en: validEn,
        zh: validZh,
        sourceEn: validEn
      });
      if (!res.ok) return { pass: false, msg: `预期通过但返回错误: ${res.error}` };
      const qRes = verifyQuantitiesEquivalence(res.normalizedEn, validZh);
      if (!qRes.ok) return { pass: false, msg: `数值比对未通过: missing=${qRes.missingInZh}, extra=${qRes.extraInZh}` };
      return { pass: true };
    }
  },

  // 2. 反向用例：中文仍使用原错误日期 (2003 年 12 月 26 日)
  {
    name: '【反向】中文仍使用原错误日期 26 日（必须拦截）',
    run: () => {
      const zhOldDate = validZh.replace('2003 年 12 月 25 日', '2003 年 12 月 26 日');
      const res = applyApprovedErrata({
        slug: 'sc_mars_express',
        paragraphIndex: 0,
        en: validEn,
        zh: zhOldDate,
        sourceEn: validEn
      });
      return { pass: !res.ok && res.error.includes('未包含核准的更正日期') };
    }
  },

  // 3. 反向用例：中文使用其他错误日期 (如 2003 年 12 月 24 日)
  {
    name: '【反向】中文使用其他错误日期 24 日（必须拦截）',
    run: () => {
      const zhWrongDate = validZh.replace('2003 年 12 月 25 日', '2003 年 12 月 24 日');
      const res = applyApprovedErrata({
        slug: 'sc_mars_express',
        paragraphIndex: 0,
        en: validEn,
        zh: zhWrongDate,
        sourceEn: validEn
      });
      return { pass: !res.ok && res.error.includes('未包含核准的更正日期') };
    }
  },

  // 4. 反向用例：中文缺少必需的译注说明
  {
    name: '【反向】中文缺少订正依据译注（必须拦截）',
    run: () => {
      const zhNoNote = validZh.replace('（译注：NASA Eyes 英文原文所列抵达日期有误；此处依据 ESA 与 NASA 官方任务记录订正。）', '');
      const res = applyApprovedErrata({
        slug: 'sc_mars_express',
        paragraphIndex: 0,
        en: validEn,
        zh: zhNoNote,
        sourceEn: validEn
      });
      return { pass: !res.ok && res.error.includes('缺少必需的订正依据译注') };
    }
  },

  // 5a. 反向用例：sourceEn 未提供（未传该字段）
  {
    name: '【反向】sourceEn 未提供时（必须拦截）',
    run: () => {
      const res = applyApprovedErrata({
        slug: 'sc_mars_express',
        paragraphIndex: 0,
        en: validEn,
        zh: validZh
      });
      return { pass: !res.ok && res.error.includes('原始英文源文缺失或与词库不一致') };
    }
  },

  // 5b. 反向用例：sourceEn 为 undefined
  {
    name: '【反向】sourceEn 为 undefined 时（必须拦截）',
    run: () => {
      const res = applyApprovedErrata({
        slug: 'sc_mars_express',
        paragraphIndex: 0,
        en: validEn,
        zh: validZh,
        sourceEn: undefined
      });
      return { pass: !res.ok && res.error.includes('原始英文源文缺失或与词库不一致') };
    }
  },

  // 5c. 反向用例：sourceEn 与 en 不一致（英文 en 字段被篡改以迎合中文）
  {
    name: '【反向】sourceEn 与 en 不一致时（必须拦截）',
    run: () => {
      const enAltered = validEn.replace('December 26, 2003', 'December 25, 2003');
      const res = applyApprovedErrata({
        slug: 'sc_mars_express',
        paragraphIndex: 0,
        en: enAltered,
        zh: validZh,
        sourceEn: validEn
      });
      return { pass: !res.ok && res.error.includes('原始英文源文缺失或与词库不一致') };
    }
  },

  // 6. 反向用例：其他非注册实体或非注册段落出现日期不一致
  {
    name: '【反向】未注册实体 (如 sc_maven) 出现日期差异（不得豁免）',
    run: () => {
      const res = applyApprovedErrata({
        slug: 'sc_maven',
        paragraphIndex: 0,
        en: 'The last contact with MAVEN was on December 6th, 2025.',
        zh: '与 MAVEN 的最后一次联络是在 2025 年 12 月 7 日。'
      });
      if (res.isErrata) return { pass: false, msg: '未注册实体不应被识别为勘误项' };
      const qRes = verifyQuantitiesEquivalence(res.normalizedEn, '与 MAVEN 的最后一次联络是在 2025 年 12 月 7 日。');
      return { pass: !qRes.ok };
    }
  },

  // 7. 反向用例：目标段落中出现其他额外多出的数字
  {
    name: '【反向】目标段落出现额外数字（必须拦截）',
    run: () => {
      const res = applyApprovedErrata({
        slug: 'sc_mars_express',
        paragraphIndex: 0,
        en: validEn,
        zh: validZh + ' 额外发现了 999 处遗迹。',
        sourceEn: validEn
      });
      if (!res.ok) return { pass: false, msg: 'applyApprovedErrata 不应在此阶段失败' };
      const qRes = verifyQuantitiesEquivalence(res.normalizedEn, validZh + ' 额外发现了 999 处遗迹。');
      return { pass: !qRes.ok && qRes.extraInZh.includes(999) };
    }
  },

  // 8. 反向用例：目标段落遗漏已有年份数字 2003（必须拦截）
  {
    name: '【反向】目标段落遗漏已有年份数字 2003（必须拦截）',
    run: () => {
      const zhNoYear = validZh.replace('2003 年 ', '');
      const res = applyApprovedErrata({
        slug: 'sc_mars_express',
        paragraphIndex: 0,
        en: validEn,
        zh: zhNoYear,
        sourceEn: validEn
      });
      // 遗漏 2003 必然导致缺少预期更正日期而在第一道防线直接被拦截
      if (!res.ok) return { pass: true };
      const qRes = verifyQuantitiesEquivalence(res.normalizedEn, zhNoYear);
      return { pass: !qRes.ok };
    }
  },

  // 9. 正向兼容用例：常规数量级换算不受勘误机制任何负面影响
  {
    name: '【兼容性】已有合法数值换算 (3 million -> 300 万) 持续通过',
    run: () => {
      const qRes = verifyQuantitiesEquivalence('create an electric current of 3 million amperes.', '形成 300 万安培的强电流。');
      return { pass: qRes.ok };
    }
  },

  // 10. 克莱门汀号正向用例：正确区分首次入轨与后续测绘轨道 + 正确更正为测绘轨道约五小时 + 包含必需译注
  {
    name: '【正向】sc_clementine:0 正确更正为测绘轨道周期约五小时并附带指定译注',
    run: () => {
      const res = applyApprovedErrata({
        slug: 'sc_clementine',
        paragraphIndex: 0,
        en: validClementineEn,
        zh: validClementineZh,
        sourceEn: validClementineEn
      });
      if (!res.ok) return { pass: false, msg: `预期通过但返回错误: ${res.error}` };
      const qRes = verifyQuantitiesEquivalence(res.normalizedEn, validClementineZh);
      if (!qRes.ok) return { pass: false, msg: `数值比对未通过: missing=${qRes.missingInZh}, extra=${qRes.extraInZh}` };
      // 验证科学事实关键要求：正确区分首次入轨与后续测绘轨道，且正文不再声称周期为五天
      const distinguishesOrbits = validClementineZh.includes('初始周期约八小时') && validClementineZh.includes('周期约五小时的测绘轨道');
      const noFiveDays = !validClementineZh.includes('周期为五天');
      return { pass: distinguishesOrbits && noFiveDays };
    }
  },

  // 11. 克莱门汀号反向用例：中文正文仍声称“周期为五天”
  {
    name: '【反向】sc_clementine:0 中文正文仍声称“周期为五天”（必须拦截）',
    run: () => {
      const zhWrong = validClementineZh.replace('周期约五小时的测绘轨道', '周期为五天的测绘轨道');
      const res = applyApprovedErrata({
        slug: 'sc_clementine',
        paragraphIndex: 0,
        en: validClementineEn,
        zh: zhWrong,
        sourceEn: validClementineEn
      });
      return { pass: !res.ok && res.error.includes('中文译文仍包含被否决的原错误表述') };
    }
  },

  // 12. 克莱门汀号反向用例：中文缺少“周期约五小时”更正
  {
    name: '【反向】sc_clementine:0 中文缺少“周期约五小时”更正（必须拦截）',
    run: () => {
      const zhMissingCorrection = validClementineZh.replace('周期约五小时', '周期未知');
      const res = applyApprovedErrata({
        slug: 'sc_clementine',
        paragraphIndex: 0,
        en: validClementineEn,
        zh: zhMissingCorrection,
        sourceEn: validClementineEn
      });
      return { pass: !res.ok && res.error.includes('中文译文未包含核准的更正表述') };
    }
  },

  // 13. 克莱门汀号反向用例：中文缺少必需的译注说明
  {
    name: '【反向】sc_clementine:0 中文缺少必需的译注说明（必须拦截）',
    run: () => {
      const zhNoNote = validClementineZh.replace('（译注：NASA Eyes 英文原文误将轨道周期记为五天；依据 NASA 官方任务记录与研究论文，探测器初始入轨周期约八小时，经调整后的测绘轨道周期实际约为五小时。）', '');
      const res = applyApprovedErrata({
        slug: 'sc_clementine',
        paragraphIndex: 0,
        en: validClementineEn,
        zh: zhNoNote,
        sourceEn: validClementineEn
      });
      return { pass: !res.ok && res.error.includes('缺少必需的订正依据译注') };
    }
  },

  // 14. 克莱门汀号反向用例：原始英文 sourceEn 缺失或被篡改
  {
    name: '【反向】sc_clementine:0 原始英文 sourceEn 缺失或被篡改（必须拦截）',
    run: () => {
      const resMissing = applyApprovedErrata({
        slug: 'sc_clementine',
        paragraphIndex: 0,
        en: validClementineEn,
        zh: validClementineZh,
        sourceEn: undefined
      });
      const resAltered = applyApprovedErrata({
        slug: 'sc_clementine',
        paragraphIndex: 0,
        en: validClementineEn.replace('with a period of five days', 'with a period of 5 hours'),
        zh: validClementineZh,
        sourceEn: validClementineEn
      });
      return { pass: !resMissing.ok && !resAltered.ok };
    }
  },

  // 15. 克莱门汀号反向用例：其他轨道数值被篡改或遗漏（如 430 千米被误删或修改）
  {
    name: '【反向】sc_clementine:0 轨道数值被篡改或遗漏（必须拦截）',
    run: () => {
      const zhTampered = validClementineZh.replace('430 × 2,950', '999 × 2,950');
      const res = applyApprovedErrata({
        slug: 'sc_clementine',
        paragraphIndex: 0,
        en: validClementineEn,
        zh: zhTampered,
        sourceEn: validClementineEn
      });
      if (!res.ok) return { pass: false, msg: 'applyApprovedErrata 自身不应失败' };
      const qRes = verifyQuantitiesEquivalence(res.normalizedEn, zhTampered);
      return { pass: !qRes.ok && qRes.missingInZh.includes(430) };
    }
  },

  // 16. DART 正向用例：正确量化更正为 33 分钟 + 包含指定译注 + 原始英文未改动
  {
    name: '【正向】sc_dart:0 正确更正为缩短约 33 分钟并附带指定译注',
    run: () => {
      const res = applyApprovedErrata({
        slug: 'sc_dart',
        paragraphIndex: 0,
        en: validDartEn,
        zh: validDartZh,
        sourceEn: validDartEn
      });
      if (!res.ok) return { pass: false, msg: `预期通过但返回错误: ${res.error}` };
      const qRes = verifyQuantitiesEquivalence(res.normalizedEn, validDartZh);
      if (!qRes.ok) return { pass: false, msg: `数值比对未通过: missing=${qRes.missingInZh}, extra=${qRes.extraInZh}` };
      return { pass: true };
    }
  },

  // 17. DART 反向用例：中文仍使用原笼统表述“缩短了数分钟”（必须拦截）
  {
    name: '【反向】sc_dart:0 中文仍使用原笼统表述“缩短了数分钟”（必须拦截）',
    run: () => {
      const zhOld = validDartZh.replace('缩短了约 33 分钟', '缩短了数分钟');
      const res = applyApprovedErrata({
        slug: 'sc_dart',
        paragraphIndex: 0,
        en: validDartEn,
        zh: zhOld,
        sourceEn: validDartEn
      });
      return { pass: !res.ok && res.error.includes('被否决的原错误表述') };
    }
  },

  // 18. DART 反向用例：33 分钟被修改为其他未核准数值如 35 分钟（必须拦截）
  {
    name: '【反向】sc_dart:0 33 分钟被修改为其他数值如 35 分钟（必须拦截）',
    run: () => {
      const zhWrong = validDartZh.replace('约 33 分钟', '约 35 分钟');
      const res = applyApprovedErrata({
        slug: 'sc_dart',
        paragraphIndex: 0,
        en: validDartEn,
        zh: zhWrong,
        sourceEn: validDartEn
      });
      if (!res.ok && res.error.includes('未包含核准的更正表述')) {
        return { pass: true };
      }
      const qRes = verifyQuantitiesEquivalence(res.normalizedEn, zhWrong);
      return { pass: !qRes.ok && qRes.extraInZh.includes(35) };
    }
  },

  // 19. DART 反向用例：缺少必需的订正依据译注（必须拦截）
  {
    name: '【反向】sc_dart:0 缺少必需的订正依据译注（必须拦截）',
    run: () => {
      const zhNoNote = validDartZh.replace('（译注：NASA Eyes 英文原文采用“数分钟”的笼统表述；此处依据 NASA 官方后续精密观测结果提供量化数据。）', '');
      const res = applyApprovedErrata({
        slug: 'sc_dart',
        paragraphIndex: 0,
        en: validDartEn,
        zh: zhNoNote,
        sourceEn: validDartEn
      });
      return { pass: !res.ok && res.error.includes('缺少必需的订正依据译注') };
    }
  },

  // 20. DART 反向用例：英文源文变动或 sourceEn 不一致（必须拦截）
  {
    name: '【反向】sc_dart:0 英文源文变动或 sourceEn 不一致（必须拦截）',
    run: () => {
      const resMissing = applyApprovedErrata({
        slug: 'sc_dart',
        paragraphIndex: 0,
        en: validDartEn,
        zh: validDartZh,
        sourceEn: undefined
      });
      const resAltered = applyApprovedErrata({
        slug: 'sc_dart',
        paragraphIndex: 0,
        en: validDartEn.replace('by several minutes', 'by 33 minutes'),
        zh: validDartZh,
        sourceEn: validDartEn
      });
      return { pass: !resMissing.ok && !resAltered.ok };
    }
  },

  // 21. 反向用例：其他未注册实体 (如 sc_lucy) 擅自添加未经核准的数字（必须拦截）
  {
    name: '【反向】其他实体添加未经注册的数字时（必须拦截）',
    run: () => {
      const lucyEn = 'Lucy is the first mission to visit the Trojans.';
      const lucyZhWith33 = '露西号是人类首个探访 33 颗特洛伊小行星的任务。';
      const res = applyApprovedErrata({
        slug: 'sc_lucy',
        paragraphIndex: 0,
        en: lucyEn,
        zh: lucyZhWith33,
        sourceEn: lucyEn
      });
      if (res.isErrata) return { pass: false, msg: 'sc_lucy 不得被当作勘误实体' };
      const qRes = verifyQuantitiesEquivalence(res.normalizedEn, lucyZhWith33);
      return { pass: !qRes.ok && qRes.extraInZh.includes(33) };
    }
  },

  // 22. DART 反向用例：原段落其他数字被篡改或遗漏（如 780 米被修改为 999 米，必须拦截）
  {
    name: '【反向】sc_dart:0 原段落其他数字变动时（必须拦截）',
    run: () => {
      const zhTampered = validDartZh.replace('780 米', '999 米');
      const res = applyApprovedErrata({
        slug: 'sc_dart',
        paragraphIndex: 0,
        en: validDartEn,
        zh: zhTampered,
        sourceEn: validDartEn
      });
      if (!res.ok) return { pass: false, msg: 'applyApprovedErrata 自身不应失败' };
      const qRes = verifyQuantitiesEquivalence(res.normalizedEn, zhTampered);
      return { pass: !qRes.ok && qRes.missingInZh.includes(780) && qRes.extraInZh.includes(999) };
    }
  }
];

let passed = 0;
let failed = 0;

for (const tc of testCases) {
  try {
    const outcome = tc.run();
    if (outcome.pass) {
      passed++;
      console.log(`✅ [通过] ${tc.name}`);
    } else {
      failed++;
      console.log(`❌ [失败] ${tc.name}: ${outcome.msg || '条件不符'}`);
    }
  } catch (err) {
    failed++;
    console.log(`❌ [异常] ${tc.name}: ${err.message}`);
  }
}

console.log('\n================ 测试结果汇总 ================');
console.log(`总计: ${testCases.length}，通过: ${passed}，失败: ${failed}`);
console.log('==============================================');

if (failed > 0) process.exit(1);
