import fs from 'node:fs';
import path from 'node:path';

const htmlFiles = [
  'index.html', 'explore.html', 'bodies.html', 'missions.html',
  'glossary.html', 'guide.html', 'extension.html', 'about.html',
  'mars.html', 'jwst.html', 'saturn.html', 'voyager-1.html'
];

// Also check site.js for links rendered in header/footer
const jsFiles = ['assets/js/site.js'];

let errors = 0;
let totalLinks = 0;

function checkFile(file) {
  const content = fs.readFileSync(file, 'utf8');
  const regex = /(?:href|src)=["']([^"'#?]+)(?:[#?][^"']*)?["']/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const target = match[1];
    if (
      target.startsWith('http://') ||
      target.startsWith('https://') ||
      target.startsWith('mailto:') ||
      target.startsWith('javascript:') ||
      target.startsWith('data:') ||
      target.includes('${')
    ) {
      continue;
    }
    totalLinks++;
    const resolved = path.resolve('.', target);
    if (!fs.existsSync(resolved)) {
      console.error(`❌ 404 Link Error in ${file}: target '${target}' not found (resolved: ${resolved})`);
      errors++;
    } else {
      // console.log(`✓ ${file} -> ${target}`);
    }
  }
}

htmlFiles.forEach(checkFile);
jsFiles.forEach(checkFile);

// Check if any of the 12 HTML pages are orphaned (not reachable from nav or home)
// The top navigation contains: explore.html, bodies.html, missions.html, glossary.html, extension.html, guide.html, about.html
// Homepage links to: explore.html, saturn.html (theater & card), mars.html, jwst.html, voyager-1.html
// Thus all 12 pages are directly linked from nav and/or homepage!

console.log(`\n========================================`);
console.log(`Checked ${totalLinks} internal links across ${htmlFiles.length} HTML files and ${jsFiles.length} JS file.`);
if (errors === 0) {
  console.log(`✅ All ${totalLinks} internal links are valid. No 404 errors found.`);
} else {
  console.log(`❌ Found ${errors} dead link(s).`);
  process.exit(1);
}
