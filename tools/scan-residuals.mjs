import fs from 'node:fs';
import path from 'node:path';

const htmlFiles = [
  'index.html', 'explore.html', 'bodies.html', 'missions.html',
  'glossary.html', 'guide.html', 'extension.html', 'about.html',
  'mars.html', 'jwst.html', 'saturn.html', 'voyager-1.html'
];

// Emoji regex covering emoji characters
const emojiRegex = /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/u;

console.log('=== 全站残留扫描 (Residuals Scan) ===\n');

for (const file of htmlFiles) {
  const content = fs.readFileSync(file, 'utf8');
  console.log(`Checking ${file}:`);

  // 1. Emoji check in visible text (outside <script> and <style>)
  const stripped = content.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  const lines = stripped.split('\n');
  const emojiMatches = [];
  lines.forEach((line, idx) => {
    // ignore html comments
    if (line.includes('<!--') && line.includes('-->')) return;
    if (emojiRegex.test(line)) {
      emojiMatches.push(`L${idx + 1}: ${line.trim()}`);
    }
  });
  console.log(`  Emoji: ${emojiMatches.length === 0 ? 'None (Clean)' : emojiMatches.join('; ')}`);

  // 2. "3天前" or relative time pollution
  const timeMatches = [];
  const timeRegex = /\d+\s*(?:天|小时|分钟|秒|周|月|年)前/g;
  let match;
  while ((match = timeRegex.exec(stripped)) !== null) {
    timeMatches.push(match[0]);
  }
  console.log(`  相对时间污染: ${timeMatches.length === 0 ? 'None (Clean)' : timeMatches.join(', ')}`);

  // 3. Dev terms in user visible text: descriptions/, blurb, slug, .json
  const devTerms = ['descriptions/', 'blurb', 'slug', '.json'];
  const devMatches = [];
  // strip tags to inspect visible text
  const visibleTextOnly = stripped.replace(/<[^>]+>/g, ' ');
  for (const term of devTerms) {
    if (visibleTextOnly.includes(term)) {
      devMatches.push(term);
    }
  }
  console.log(`  开发术语残留: ${devMatches.length === 0 ? 'None (Clean)' : devMatches.join(', ')}`);

  // 4. Inline <style> tags
  const styleTags = content.match(/<style[\s\S]*?<\/style>/gi) || [];
  console.log(`  内联 <style> 标签: ${styleTags.length === 0 ? 'None (Clean)' : styleTags.length + ' tags found'}`);

  // 5. Inline color values (style="..." with color, background, #xxx, rgb, etc.)
  // Except for --page-tint or --bg, --fg
  const inlineStyleAttrs = content.match(/style=["'][^"']*["']/gi) || [];
  const colorAttrMatches = [];
  for (const s of inlineStyleAttrs) {
    if (/#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(|color:|background-color:/i.test(s)) {
      // allow if it's only setting --page-tint: #...
      if (/^style=["']\s*--page-tint:\s*#[0-9a-fA-F]{3,8}\s*;?\s*["']$/.test(s)) {
        continue;
      }
      colorAttrMatches.push(s);
    }
  }
  console.log(`  非规范内联颜色样式: ${colorAttrMatches.length === 0 ? 'None (Clean)' : colorAttrMatches.join('; ')}`);

  console.log('');
}
