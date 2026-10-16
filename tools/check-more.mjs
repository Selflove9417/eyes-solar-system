import fs from 'node:fs';
import path from 'node:path';
import { verifyQuantitiesEquivalence } from './quantity-parser.mjs';

const sourcePath = path.resolve('data/source/descriptions.en.json');
const moreZhPath = path.resolve('data/more.zh.json');

if (!fs.existsSync(sourcePath)) {
  console.error(`❌ 找不到源文件: ${sourcePath}`);
  process.exit(1);
}
if (!fs.existsSync(moreZhPath)) {
  console.error(`❌ 找不到词库文件: ${moreZhPath}`);
  process.exit(1);
}

const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const moreZh = JSON.parse(fs.readFileSync(moreZhPath, 'utf8'));

let exitCode = 0;
let mismatchEnCount = 0;
let translatedCount = 0;
let untranslatedCount = 0;
let totalParagraphsChecked = 0;
const errors = [];
const warnings = [];

// 1. 检查每个 entry 的 en 与 descriptions.en.json 的 more 是否完全一致（逐字比对）
for (const [slug, item] of Object.entries(source)) {
  const sourceMore = item.description?.more;
  if (!sourceMore || !sourceMore.trim()) continue;

  const entry = moreZh.entries?.[slug];
  if (!entry) {
    mismatchEnCount++;
    errors.push(`[Rule 1] 缺失 entry: ${slug}`);
    continue;
  }

  // 逐字对比 entry.en 与 sourceMore
  if (entry.en !== sourceMore) {
    mismatchEnCount++;
    errors.push(`[Rule 1] ${slug} 的 entry.en 与 descriptions.en.json 不一致`);
  }

  // 检查段落拆分是否与 sourceMore 对应
  const expectedParts = sourceMore.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  if (!entry.paragraphs || entry.paragraphs.length !== expectedParts.length) {
    mismatchEnCount++;
    errors.push(`[Rule 1] ${slug} 段落数量不一致: 预期 ${expectedParts.length}, 实际 ${entry.paragraphs?.length}`);
  } else {
    for (let i = 0; i < expectedParts.length; i++) {
      if (entry.paragraphs[i].en !== expectedParts[i]) {
        mismatchEnCount++;
        errors.push(`[Rule 1] ${slug} 段落 ${i + 1} 的 en 与源文件不一致`);
      }
    }
  }
}

// 辅助函数：提取字符串中的数字（支持千分位格式与小数）
function extractNumbers(text) {
  if (!text) return [];
  const matches = text.match(/(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g) || [];
  return matches.map((m) => m.replace(/,/g, ''));
}

// 2-5 校验已翻译的 entry
for (const [slug, entry] of Object.entries(moreZh.entries || {})) {
  const paragraphs = entry.paragraphs || [];
  const hasAnyZh = paragraphs.some((p) => p.zh && p.zh.trim());
  if (!hasAnyZh) {
    untranslatedCount++;
    continue;
  }

  translatedCount++;

  for (let idx = 0; idx < paragraphs.length; idx++) {
    const p = paragraphs[idx];
    const en = p.en || '';
    const zh = p.zh || '';
    totalParagraphsChecked++;

    // Rule 2: 每个段落 zh 非空、含汉字
    if (!zh.trim()) {
      errors.push(`[Rule 2] ${slug} 第 ${idx + 1} 段已启动翻译但 zh 为空`);
      continue;
    }
    if (!/[\u4e00-\u9fa5]/.test(zh)) {
      errors.push(`[Rule 2] ${slug} 第 ${idx + 1} 段 zh 未包含任何汉字: "${zh.slice(0, 30)}..."`);
    }

    // Rule 3: en 与 zh 中出现的数值与量级必须完全对应（支持 million/billion/thousand 与 万/亿/千/百万 等价换算）
    const qCheck = verifyQuantitiesEquivalence(en, zh);
    if (!qCheck.ok) {
      errors.push(`[Rule 3] ${slug} 第 ${idx + 1} 段数值不一致: en 缺失于 zh [${qCheck.missingInZh.join(', ')}], zh 多余 [${qCheck.extraInZh.join(', ')}]`);
    }

    // Rule 4: zh 与 en 长度比异常 (<0.25 或 >1.2)
    const ratio = zh.length / Math.max(1, en.length);
    if (ratio < 0.25 || ratio > 1.2) {
      warnings.push(`[Rule 4 警告] ${slug} 第 ${idx + 1} 段长度比异常: ${ratio.toFixed(2)} (en: ${en.length}, zh: ${zh.length})`);
    }

    // Rule 5: zh 里残留的连续 6 个以上英文单词的句子
    const consecutiveEnMatch = zh.match(/[a-zA-Z0-9]+(?:\s+[a-zA-Z0-9]+){5,}/);
    if (consecutiveEnMatch) {
      errors.push(`[Rule 5] ${slug} 第 ${idx + 1} 段残留连续 6 个以上英文单词: "${consecutiveEnMatch[0]}"`);
    }
  }
}

console.log('==================================================');
console.log('📋 NASA Eyes More 长文词库自动化校验 (check-more)');
console.log('==================================================');
console.log(`- 总实体数: ${Object.keys(moreZh.entries || {}).length} / 92`);
console.log(`- en 与源文件逐字不一致数: ${mismatchEnCount}`);
console.log(`- 已翻译实体: ${translatedCount} / 92`);
console.log(`- 未翻译实体: ${untranslatedCount} / 92`);
console.log(`- 校验已翻译段落数: ${totalParagraphsChecked}`);

if (warnings.length > 0) {
  console.log(`\n⚠️ 发现 ${warnings.length} 条长度比警告（供人工复核）:`);
  for (const w of warnings) console.log(`  ${w}`);
}

if (errors.length > 0) {
  console.log(`\n❌ 发现 ${errors.length} 项错误:`);
  for (const err of errors) console.log(`  ${err}`);
  process.exit(1);
} else {
  console.log('\n✅ 校验通过！0 错误！');
}
