import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');

// 匹配所有包含 name="google-site-verification" 的 meta 标签
const matches = [...html.matchAll(/<meta\b[^>]*\bname\s*=\s*["']google-site-verification["'][^>]*>/gi)];
const tagCount = matches.length;
const rawTag = matches[0]?.[0] || '';

// 提取 content 属性值
const contentMatch = rawTag.match(/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
const extractedContent = contentMatch ? (contentMatch[1] ?? contentMatch[2] ?? contentMatch[3] ?? '') : '';

const EXPECTED = 'YUYEsF8jkU0GAS--tGDJwTFVTmY7NQhGHpycRHyFO6c';
const hasIllegalChars = /[<>"'\s]/.test(extractedContent);
const isStrictMatch = extractedContent === EXPECTED;
const isValid = tagCount === 1 && isStrictMatch && !hasIllegalChars;

console.log('=== 本地 index.html Search Console 标签解析结果 ===');
console.log(`标签出现次数 : ${tagCount} (${tagCount === 1 ? 'PASS' : 'FAIL'})`);
console.log(`完整标签源码 : ${rawTag}`);
console.log(`提取 content : ${extractedContent}`);
console.log(`严格值匹配   : ${isStrictMatch ? 'PASS' : 'FAIL'}`);
console.log(`非法字符检查 : ${hasIllegalChars ? 'FAIL (包含 < > 引号或空白)' : 'PASS (无非法字符)'}`);
console.log(`综合解析判定 : ${isValid ? 'PASS' : 'FAIL'}`);

if (!isValid) process.exit(1);
