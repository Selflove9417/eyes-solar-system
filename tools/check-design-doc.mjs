import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const cssPath = path.join(root, 'assets', 'css', 'main.css');
const docPath = path.join(root, 'docs', 'DESIGN_SYSTEM.md');

const css = fs.readFileSync(cssPath, 'utf8');
const doc = fs.readFileSync(docPath, 'utf8');

console.log('=== 设计规范文档与实际 CSS 规则自动化校验 (check-design-doc) ===\n');

// 1. Parse :root in main.css
const rootMatch = css.match(/:root\s*\{([^}]+)\}/);
if (!rootMatch) {
  console.error('❌ 未能在 assets/css/main.css 中定位 :root 代码块');
  process.exit(1);
}

const cssVars = {};
for (const line of rootMatch[1].split('\n')) {
  const m = line.match(/^\s*(--[a-zA-Z0-9_-]+)\s*:\s*([^;]+);/);
  if (m) {
    cssVars[m[1]] = m[2].trim().replace(/\/\*.*?\*\//g, '').trim();
  }
}

// 2. Parse .btn-primary in main.css
const btnMatch = css.match(/\.btn-primary\s*\{([^}]+)\}/);
const btnProps = {};
if (btnMatch) {
  for (const line of btnMatch[1].split('\n')) {
    const m = line.match(/^\s*([a-zA-Z-]+)\s*:\s*([^;]+);/);
    if (m) btnProps[m[1]] = m[2].trim();
  }
}

// 3. Parse .doc-wrap in main.css
const docWrapMatch = css.match(/\.doc-wrap\s*\{([^}]+)\}/);
const docWrapProps = {};
if (docWrapMatch) {
  for (const line of docWrapMatch[1].split('\n')) {
    const m = line.match(/^\s*([a-zA-Z-]+)\s*:\s*([^;]+);/);
    if (m) docWrapProps[m[1]] = m[2].trim();
  }
}

let checksPassed = 0;
let checksFailed = 0;

function assertMatch(category, name, cssVal, docVal) {
  const normCss = (cssVal || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const normDoc = (docVal || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (normCss && normDoc && normCss === normDoc) {
    console.log(`  ✅ [${category}] ${name}: ${cssVal} === ${docVal}`);
    checksPassed++;
  } else {
    console.error(`  ❌ [${category}] ${name} 不一致: CSS="${cssVal}", 文档="${docVal}"`);
    checksFailed++;
  }
}

// --- Check Colors from Table ---
console.log('1. 核心颜色令牌比对 (:root vs 文档表格):');
const colorTokens = [
  '--bg', '--bg-soft', '--panel', '--fg', '--fg-dim', '--fg-muted',
  '--accent', '--accent-hover', '--ok', '--warn', '--line', '--line-subtle', '--line-hover'
];

for (const tok of colorTokens) {
  // Extract from markdown table: `| `--tok` | `val` |`
  const re = new RegExp(`\\|\\s*\`${tok}\`\\s*\\|\\s*\`([^\`]+)\`\\s*\\|`);
  const m = doc.match(re);
  const docVal = m ? m[1].trim() : null;
  assertMatch('Color', tok, cssVars[tok], docVal);
}

// --- Check Spacing Scale ---
console.log('\n2. 间距阶梯比对 (:root vs 文档代码块):');
const spaceTokens = ['--space-1', '--space-2', '--space-3', '--space-4', '--space-5', '--space-6'];
for (const tok of spaceTokens) {
  const re = new RegExp(`${tok}\\s*:\\s*([^;]+);`);
  const m = doc.match(re);
  const docVal = m ? m[1].trim() : null;
  assertMatch('Spacing', tok, cssVars[tok], docVal);
}

// --- Check Radii, Dimensions & Blur ---
console.log('\n3. 尺寸圆角与过渡比对 (:root vs 文档):');
for (const tok of ['--r', '--maxw', '--blur', '--transition']) {
  const re = new RegExp(`${tok}\\s*:\\s*([^;]+);`);
  const m = doc.match(re);
  const docVal = m ? m[1].trim() : null;
  assertMatch('Dimension/Motion', tok, cssVars[tok], docVal);
}

// --- Check .btn-primary properties ---
console.log('\n4. 主按钮 .btn-primary 核心属性比对:');
assertMatch('.btn-primary', 'min-height', btnProps['min-height'], '44px');
assertMatch('.btn-primary', 'padding', btnProps['padding'], '12px 28px');
assertMatch('.btn-primary', 'background', btnProps['background'], 'var(--accent)');
assertMatch('.btn-primary', 'color', btnProps['color'], '#030712');

// --- Check .doc-wrap properties ---
console.log('\n5. 长文排版容器 .doc-wrap 核心属性比对:');
assertMatch('.doc-wrap', 'max-width', docWrapProps['max-width'], '70ch');
assertMatch('.doc-wrap', 'margin', docWrapProps['margin'], '0 auto');
assertMatch('.doc-wrap', 'padding', docWrapProps['padding'], '0 var(--space-4)');

console.log(`\n比对完成: ${checksPassed} 项通过, ${checksFailed} 项失败.`);
if (checksFailed > 0) {
  console.error('\n❌ 设计规范文档与实际 CSS 存在不一致，请核对修正！');
  process.exit(1);
} else {
  console.log('\n✅ 文档与 CSS 规范 100% 逐条一致！');
  process.exit(0);
}
