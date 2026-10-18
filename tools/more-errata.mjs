/**
 * NASA Eyes More 长文官方源文事实勘误与校准注册表 (more-errata.mjs)
 * 
 * 仅用于处理经权威官方文献证明确凿存在错误的 NASA 英文源数据。
 * 严禁广泛通配或全局忽略数字校验，必须满足精确键控与所有前置约束。
 */

export const APPROVED_ERRATA = {
  'sc_mars_express:0': {
    slug: 'sc_mars_express',
    paragraphIndex: 0,
    originalEnDate: 'December 26, 2003',
    correctedEnDate: 'December 25, 2003',
    expectedZhDate: '2003 年 12 月 25 日',
    requiredNote: '（译注：NASA Eyes 英文原文所列抵达日期有误；此处依据 ESA 与 NASA 官方任务记录订正。）',
    esaSourceUrl: 'https://www.esa.int/Newsroom/Press_Releases/Merry_Christmas_from_Mars',
    nasaSourceUrl: 'https://science.nasa.gov/mission/mars-express/',
    reason: 'ESA 当日官方新闻公报与 NASA 任务主页均记录 Mars Express 于 2003 年 12 月 25 日成功进行轨道切入（Orbit Insertion），NASA Eyes 英文长文记为 26 日确系源文笔误。'
  },
  'sc_clementine:0': {
    slug: 'sc_clementine',
    paragraphIndex: 0,
    originalEnText: 'with a period of five days',
    expectedZhText: '周期约五小时',
    forbiddenZhText: '周期为五天',
    requiredNote: '（译注：NASA Eyes 英文原文误将轨道周期记为五天；依据 NASA 官方任务记录与研究论文，探测器初始入轨周期约八小时，经调整后的测绘轨道周期实际约为五小时。）',
    nasaSourceUrl: 'https://science.nasa.gov/mission/clementine/',
    nasaHistoryUrl: 'https://www.nasa.gov/history/30-years-ago-clementine-changes-our-view-of-the-moon/',
    paperUrl: 'https://spudislunarresources.nss.org/Bibliography/p/86.pdf',
    reason: 'NASA Eyes 原文将轨道周期误记为 five days。官方任务记录与科学论文证实，1994 年 2 月 19 日首次切入环月极轨道周期约 8 小时，两天后经微调进入周期约 5 小时的测绘轨道（430 × 2,950 千米）。原文“five days”确系笔误。'
  },
  'sc_dart:0': {
    slug: 'sc_dart',
    paragraphIndex: 0,
    originalEnText: 'by several minutes',
    correctedEnText: 'by about 33 minutes',
    expectedZhText: '缩短了约 33 分钟',
    forbiddenZhText: '缩短了数分钟',
    requiredNote: '（译注：NASA Eyes 英文原文采用“数分钟”的笼统表述；此处依据 NASA 官方后续精密观测结果提供量化数据。）',
    nasaSourceUrl: 'https://www.nasa.gov/missions/dart/nasa-study-asteroids-orbit-shape-changed-after-dart-impact/',
    reason: 'NASA Eyes 原文采用 "by several minutes" 这一笼统定性表述。NASA 碰撞后精密测绘与后续权威研究证实，撞击将迪莫弗斯的轨道周期缩短了约 33 分钟（具体为 33 分 15 秒）。中文依据官方后续权威精密测量结果提供量化数据，并在临时副本中补充数值 33 供量级比对。'
  }
};

/**
 * 针对已核准勘误段落的严格校验与临时副本规范化纯函数
 *
 * @param {object} params
 * @param {string} params.slug 实体 ID
 * @param {number} params.paragraphIndex 段落下标（0-indexed）
 * @param {string} params.en 英文段落文本（必须为原始未修改文本）
 * @param {string} params.zh 中文段落文本
 * @param {string} [params.sourceEn] descriptions.en.json 中的原始英文（可选）
 * @returns {{ isErrata: boolean, ok: boolean, normalizedEn: string, error?: string }}
 */
export function applyApprovedErrata({ slug, paragraphIndex, en, zh, sourceEn }) {
  const key = `${slug}:${paragraphIndex}`;
  const errata = APPROVED_ERRATA[key];

  if (!errata) {
    return { isErrata: false, ok: true, normalizedEn: en };
  }

  // 1. 强制要求原始英文源文存在且与词库中的 en 保持逐字一致
  if (typeof sourceEn !== 'string' || en !== sourceEn) {
    return {
      isErrata: true,
      ok: false,
      normalizedEn: en,
      error: `[Errata 校验失败] ${key}: 原始英文源文缺失或与词库不一致`
    };
  }

  // 2. 英文原文必须精确包含原错误表述
  if (errata.originalEnDate && !en.includes(errata.originalEnDate)) {
    return {
      isErrata: true,
      ok: false,
      normalizedEn: en,
      error: `[Errata 校验失败] ${key}: 英文原文未包含预期的官方错误日期 "${errata.originalEnDate}"`
    };
  }
  if (errata.originalEnText && !en.includes(errata.originalEnText)) {
    return {
      isErrata: true,
      ok: false,
      normalizedEn: en,
      error: `[Errata 校验失败] ${key}: 英文原文未包含预期的官方错误表述 "${errata.originalEnText}"`
    };
  }

  // 3. 中文译文不得包含被否决的原错误表述（优先拦截原错误）
  if (errata.forbiddenZhText && zh.includes(errata.forbiddenZhText)) {
    return {
      isErrata: true,
      ok: false,
      normalizedEn: en,
      error: `[Errata 校验失败] ${key}: 中文译文仍包含被否决的原错误表述 "${errata.forbiddenZhText}"`
    };
  }

  // 3b. 中文译文必须精确包含更正后的中文表述
  if (errata.expectedZhDate && !zh.includes(errata.expectedZhDate)) {
    return {
      isErrata: true,
      ok: false,
      normalizedEn: en,
      error: `[Errata 校验失败] ${key}: 中文译文未包含核准的更正日期 "${errata.expectedZhDate}"`
    };
  }
  if (errata.expectedZhText && !zh.includes(errata.expectedZhText)) {
    return {
      isErrata: true,
      ok: false,
      normalizedEn: en,
      error: `[Errata 校验失败] ${key}: 中文译文未包含核准的更正表述 "${errata.expectedZhText}"`
    };
  }

  // 4. 中文译文必须包含指定的译注说明
  if (errata.requiredNote && !zh.includes(errata.requiredNote)) {
    return {
      isErrata: true,
      ok: false,
      normalizedEn: en,
      error: `[Errata 校验失败] ${key}: 中文译文缺少必需的订正依据译注 "${errata.requiredNote}"`
    };
  }

  // 满足全部条件，生成仅供 Rule 3 数值比对的临时规范化英文副本
  const origPattern = errata.originalEnText || errata.originalEnDate;
  const replacement = errata.correctedEnText || errata.correctedEnDate;
  const normalizedEn = (origPattern && replacement) ? en.replace(origPattern, replacement) : en;
  return {
    isErrata: true,
    ok: true,
    normalizedEn
  };
}
