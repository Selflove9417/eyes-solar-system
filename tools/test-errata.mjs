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

  // 5. 反向用例：试图通过修改英文 en 绕过勘误机制
  {
    name: '【反向】英文 en 字段被篡改以迎合中文（必须拦截）',
    run: () => {
      const enAltered = validEn.replace('December 26, 2003', 'December 25, 2003');
      const res = applyApprovedErrata({
        slug: 'sc_mars_express',
        paragraphIndex: 0,
        en: enAltered,
        zh: validZh,
        sourceEn: validEn
      });
      return { pass: !res.ok && res.error.includes('英文 en 字段已被修改') };
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
