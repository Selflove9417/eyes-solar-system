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

  // 1. 若提供了 sourceEn，必须验证原始 en 字段未被篡改，保持逐字一致
  if (sourceEn !== undefined && en !== sourceEn) {
    return {
      isErrata: true,
      ok: false,
      normalizedEn: en,
      error: `[Errata 校验失败] ${key}: 英文 en 字段已被修改，禁止通过修改 en 绕过勘误机制`
    };
  }

  // 2. 英文原文必须精确包含原错误表述
  if (!en.includes(errata.originalEnDate)) {
    return {
      isErrata: true,
      ok: false,
      normalizedEn: en,
      error: `[Errata 校验失败] ${key}: 英文原文未包含预期的官方错误日期 "${errata.originalEnDate}"`
    };
  }

  // 3. 中文译文必须精确包含更正后的中文日期
  if (!zh.includes(errata.expectedZhDate)) {
    return {
      isErrata: true,
      ok: false,
      normalizedEn: en,
      error: `[Errata 校验失败] ${key}: 中文译文未包含核准的更正日期 "${errata.expectedZhDate}"`
    };
  }

  // 4. 中文译文必须包含指定的译注说明
  if (!zh.includes(errata.requiredNote)) {
    return {
      isErrata: true,
      ok: false,
      normalizedEn: en,
      error: `[Errata 校验失败] ${key}: 中文译文缺少必需的订正依据译注 "${errata.requiredNote}"`
    };
  }

  // 满足全部条件，生成仅供 Rule 3 数值比对的临时规范化英文副本
  const normalizedEn = en.replace(errata.originalEnDate, errata.correctedEnDate);
  return {
    isErrata: true,
    ok: true,
    normalizedEn
  };
}
