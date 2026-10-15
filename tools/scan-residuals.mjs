import fs from 'node:fs';
import path from 'node:path';

const htmlFiles = [
  'index.html', 'explore.html', 'bodies.html', 'missions.html',
  'glossary.html', 'guide.html', 'extension.html', 'about.html',
  'mars.html', 'jwst.html', 'saturn.html', 'voyager-1.html'
];

// Emoji regex covering emoji characters
const emojiRegex = /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/u;
const uiGlyphsRegex = /[☰✕➔↗▶◀]/gu;

console.log('=== 全站残留扫描 (Residuals Scan) ===\n');

let totalViolations = 0;

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
    const cleanLine = line.replace(uiGlyphsRegex, '');
    if (emojiRegex.test(cleanLine)) {
      emojiMatches.push(`L${idx + 1}: ${line.trim()}`);
      totalViolations++;
    }
  });
  console.log(`  Emoji: ${emojiMatches.length === 0 ? 'None (Clean)' : '❌ ' + emojiMatches.join('; ')}`);

  // 2. "3天前" or relative time pollution
  const timeMatches = [];
  const timeRegex = /\d+\s*(?:天|小时|分钟|秒|周|月|年)前/g;
  let match;
  while ((match = timeRegex.exec(stripped)) !== null) {
    timeMatches.push(match[0]);
    totalViolations++;
  }
  console.log(`  相对时间污染: ${timeMatches.length === 0 ? 'None (Clean)' : '❌ ' + timeMatches.join(', ')}`);

  // 3. Dev terms in user visible text: descriptions/, blurb, slug, .json
  // Exclude about.html data schema & compliance documentation where entity format is explicitly documented
  const devTerms = ['descriptions/', 'blurb', 'slug', '.json'];
  const devMatches = [];
  if (file !== 'about.html') {
    const visibleTextOnly = stripped.replace(/<[^>]+>/g, ' ');
    for (const term of devTerms) {
      if (visibleTextOnly.includes(term)) {
        devMatches.push(term);
        totalViolations++;
      }
    }
  }
  console.log(`  开发术语残留: ${devMatches.length === 0 ? 'None (Clean)' : '❌ ' + devMatches.join(', ')}`);

  // 4. Inline <style> tags
  const styleTags = content.match(/<style[\s\S]*?<\/style>/gi) || [];
  if (styleTags.length > 0) {
    totalViolations++;
  }
  console.log(`  内联 <style> 标签: ${styleTags.length === 0 ? 'None (Clean)' : '❌ ' + styleTags.length + ' tags found'}`);

  console.log('');
}

if (totalViolations > 0) {
  console.error(`❌ Residuals scan failed with ${totalViolations} violation(s).`);
  process.exit(1);
} else {
  console.log('✅ All 12 pages passed residuals scan with 0 violations!');
  process.exit(0);
}
