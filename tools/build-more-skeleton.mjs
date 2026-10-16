import fs from 'node:fs';
import path from 'node:path';

const sourcePath = path.resolve('data/source/descriptions.en.json');
const targetPath = path.resolve('data/more.zh.json');

const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));

// 如果已经存在目标文件，则读取现有已翻译的 zh，防止覆盖已有翻译
let existingData = null;
if (fs.existsSync(targetPath)) {
  try {
    existingData = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
  } catch {}
}

const entries = {};
let count = 0;
let totalParagraphs = 0;

for (const [slug, item] of Object.entries(source)) {
  const more = item.description?.more;
  if (!more || !more.trim()) continue;

  const rawParagraphs = more.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  if (!rawParagraphs.length) continue;

  count++;
  totalParagraphs += rawParagraphs.length;

  const existingEntry = existingData?.entries?.[slug];
  const paragraphs = rawParagraphs.map((enPara, idx) => {
    let zh = '';
    // 若已有翻译，优先保留
    if (existingEntry?.paragraphs?.[idx]?.en === enPara) {
      zh = existingEntry.paragraphs[idx].zh || '';
    }
    return { en: enPara, zh };
  });

  entries[slug] = {
    en: more,
    paragraphs
  };
}

const out = {
  meta: {
    version: '1.0.0',
    updated: '2026-10-16',
    totalEntities: count,
    totalParagraphs,
    description: 'NASA Eyes 太阳系中文汉化 - 天体详情面板展开长文 (More) 翻译词库'
  },
  entries
};

fs.writeFileSync(targetPath, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log(`✅ 已生成 ${targetPath}`);
console.log(`- 包含实体数: ${count} / 92`);
console.log(`- 总段落数: ${totalParagraphs}`);
