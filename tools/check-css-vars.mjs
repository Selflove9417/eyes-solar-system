import fs from 'node:fs';

const css = fs.readFileSync('assets/css/main.css', 'utf8');

// 1. Extract declared custom properties
const declaredVars = new Set();
const varDeclRegex = /(--[a-zA-Z0-9_-]+)\s*:/g;
let match;
while ((match = varDeclRegex.exec(css)) !== null) {
  declaredVars.add(match[1]);
}

// 2. Extract referenced custom properties
const varRefRegex = /var\(\s*(--[a-zA-Z0-9_-]+)/g;
const missing = new Set();
const usages = [];

while ((match = varRefRegex.exec(css)) !== null) {
  const varName = match[1];
  usages.push(varName);
  if (!declaredVars.has(varName)) {
    missing.add(varName);
  }
}

console.log(`=== CSS 自定义属性健康检查 (check-css-vars) ===`);
console.log(`已声明变量: ${declaredVars.size} 个`);
console.log(`引用的变量: ${usages.length} 次`);

if (missing.size > 0) {
  console.error(`❌ 发现 ${missing.size} 个未定义的悬空变量引用:`, Array.from(missing));
  process.exit(1);
} else {
  console.log(`✅ 检查通过: 0 个悬空变量引用，所有 var() 均已正确定义。`);
  process.exit(0);
}
