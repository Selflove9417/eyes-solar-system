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

  // 3. 英文月份匹配：如 "Jan. 7, 1610"
  const MONTHS = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
  };
  const monthRegex = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/gi;
  for (const match of text.matchAll(monthRegex)) {
    const mNum = MONTHS[match[1].toLowerCase()];
    results.push(mNum);
    // 日份在后续纯数字中也会被提取，但月份作为数值计入
  }

  // 4. 普通数值提取（含千分位、小数，如 "262,000", "400,000", "330"）
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
