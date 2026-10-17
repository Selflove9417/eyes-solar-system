/**
 * 数值与量级换算解析器
 * 正确处理 million / billion / thousand 与 万 / 亿 / 千 / 百万 的等价换算
 */

export function parseEnglishQuantities(text) {
  if (!text) return [];
  const results = [];
  const matchedSpans = [];

  const recordSpan = (start, end) => {
    matchedSpans.push([start, end]);
  };
  const isCovered = (start, end) => {
    return matchedSpans.some(([s, e]) => Math.max(s, start) < Math.min(e, end));
  };

  const MULTIPLIERS = {
    thousand: 1e3,
    million: 1e6,
    billion: 1e9,
    trillion: 1e12
  };

  // 1. 处理范围 + 量级：如 "40 to 90 million", "10-15 thousand"
  const rangeRegex = /\b(\d+(?:\.\d+)?)\s*(?:to|-)\s*(\d+(?:\.\d+)?)\s*(thousand|million|billion|trillion)\b/gi;
  for (const match of text.matchAll(rangeRegex)) {
    const mult = MULTIPLIERS[match[3].toLowerCase()];
    const v1 = parseFloat(match[1].replace(/,/g, '')) * mult;
    const v2 = parseFloat(match[2].replace(/,/g, '')) * mult;
    results.push(v1, v2);
    recordSpan(match.index, match.index + match[0].length);
  }

  // 2. 处理单值 + 量级：如 "3 million", "4.5 billion"
  const singleMagnitudeRegex = /\b(\d+(?:\.\d+)?)\s*(thousand|million|billion|trillion)\b/gi;
  for (const match of text.matchAll(singleMagnitudeRegex)) {
    if (isCovered(match.index, match.index + match[0].length)) continue;
    const mult = MULTIPLIERS[match[2].toLowerCase()];
    const val = parseFloat(match[1].replace(/,/g, '')) * mult;
    results.push(val);
    recordSpan(match.index, match.index + match[0].length);
  }

  // 3. 英文月份匹配：如 "Jan. 7, 1610", "Dec. 14, 1962"
  const MONTHS = {
    january: 1, jan: 1,
    february: 2, feb: 2,
    march: 3, mar: 3,
    april: 4, apr: 4,
    may: 5,
    june: 6, jun: 6,
    july: 7, jul: 7,
    august: 8, aug: 8,
    september: 9, sept: 9, sep: 9,
    october: 10, oct: 10,
    november: 11, nov: 11,
    december: 12, dec: 12
  };
  const monthRegex = /\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)\.?\s+(?:of\s+)?(\d{1,2}(?:st|nd|rd|th)?|\d{4})\b/gi;
  for (const match of text.matchAll(monthRegex)) {
    const mNum = MONTHS[match[1].toLowerCase()];
    results.push(mNum);
    // 日份或年份在后续纯数字中也会被提取，但月份作为数值计入
  }

  // 4. 任务罗马数字编号匹配：如 "Voyager I", "Voyager II" -> 1, 2
  const ROMAN_NUMERALS = {
    i: 1, ii: 2, iii: 3, iv: 4, v: 5,
    vi: 6, vii: 7, viii: 8, ix: 9, x: 10
  };
  const romanMissionRegex = /\b(voyager|pioneer|mariner|apollo|viking)\s+(i|ii|iii|iv|v|vi|vii|viii|ix|x)\b/gi;
  for (const match of text.matchAll(romanMissionRegex)) {
    const rNum = ROMAN_NUMERALS[match[2].toLowerCase()];
    if (rNum) {
      results.push(rNum);
      recordSpan(match.index, match.index + match[0].length);
    }
  }

  // 5. 普通数值提取（含千分位、小数，如 "262,000", "400,000", "330"）
  const plainNumRegex = /(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g;
  for (const match of text.matchAll(plainNumRegex)) {
    if (isCovered(match.index, match.index + match[0].length)) continue;
    const val = parseFloat(match[0].replace(/,/g, ''));
    results.push(val);
  }

  return results.sort((a, b) => a - b);
}

export function parseChineseQuantities(text) {
  if (!text) return [];
  const results = [];
  const matchedSpans = [];

  const recordSpan = (start, end) => {
    matchedSpans.push([start, end]);
  };
  const isCovered = (start, end) => {
    return matchedSpans.some(([s, e]) => Math.max(s, start) < Math.min(e, end));
  };

  const ZH_MULTIPLIERS = {
    '千': 1e3,
    '万': 1e4,
    '百万': 1e6,
    '千万': 1e7,
    '亿': 1e8
  };

  // 1. 中文数值 + 汉字量级：如 "300万", "45 亿", "3百万", "4000万" (排除单位 "千米/千克/千瓦" 等)
  const zhMagRegex = /((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*(百万|千万|万|亿|千(?![米克瓦卡]))/g;
  for (const match of text.matchAll(zhMagRegex)) {
    const mult = ZH_MULTIPLIERS[match[2]];
    const val = parseFloat(match[1].replace(/,/g, '')) * mult;
    results.push(val);
    recordSpan(match.index, match.index + match[0].length);
  }

  // 2. 中文普通数字（含千分位与日期，如 "262,000", "1990", "1610", "7"）
  const plainNumRegex = /(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g;
  for (const match of text.matchAll(plainNumRegex)) {
    if (isCovered(match.index, match.index + match[0].length)) continue;
    const val = parseFloat(match[0].replace(/,/g, ''));
    results.push(val);
  }

  return results.sort((a, b) => a - b);
}

/**
 * 校验 en 与 zh 中数量值是否完全一致
 */
export function verifyQuantitiesEquivalence(enText, zhText) {
  const enVals = parseEnglishQuantities(enText);
  const zhVals = parseChineseQuantities(zhText);

  const missingInZh = [];
  const matchedZhIndices = new Set();

  for (const enV of enVals) {
    let foundIdx = -1;
    for (let i = 0; i < zhVals.length; i++) {
      if (matchedZhIndices.has(i)) continue;
      // 允许极其微小的浮点数误差
      if (Math.abs(zhVals[i] - enV) < 1e-4) {
        foundIdx = i;
        break;
      }
    }
    if (foundIdx >= 0) {
      matchedZhIndices.add(foundIdx);
    } else {
      missingInZh.push(enV);
    }
  }

  const extraInZh = [];
  for (let i = 0; i < zhVals.length; i++) {
    if (!matchedZhIndices.has(i)) {
      extraInZh.push(zhVals[i]);
    }
  }

  return {
    ok: missingInZh.length === 0 && extraInZh.length === 0,
    enVals,
    zhVals,
    missingInZh,
    extraInZh
  };
}
