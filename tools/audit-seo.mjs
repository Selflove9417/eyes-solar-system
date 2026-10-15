import fs from 'node:fs';
import path from 'node:path';

const files = [
  'index.html', 'explore.html', 'bodies.html', 'missions.html',
  'glossary.html', 'guide.html', 'extension.html', 'about.html',
  'mars.html', 'jwst.html', 'saturn.html', 'voyager-1.html'
];

console.log('=== SEO & Social Sharing Audit ===\n');

for (const f of files) {
  const content = fs.readFileSync(f, 'utf8');
  const title = content.match(/<title>([^<]+)<\/title>/)?.[1] || 'MISSING';
  const desc = content.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)?.[1] || 'MISSING';
  const canonical = content.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i)?.[1] || 'MISSING';
  const ogTitle = content.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i)?.[1] || 'MISSING';
  const ogDesc = content.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i)?.[1] || 'MISSING';
  const ogType = content.match(/<meta\s+property=["']og:type["']\s+content=["']([^"']+)["']/i)?.[1] || 'MISSING';
  const ogImg = content.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i)?.[1] || 'MISSING';
  const ogUrl = content.match(/<meta\s+property=["']og:url["']\s+content=["']([^"']+)["']/i)?.[1] || 'MISSING';
  const twCard = content.match(/<meta\s+name=["']twitter:card["']\s+content=["']([^"']+)["']/i)?.[1] || 'MISSING';
  const twTitle = content.match(/<meta\s+name=["']twitter:title["']\s+content=["']([^"']+)["']/i)?.[1] || 'MISSING';
  const twDesc = content.match(/<meta\s+name=["']twitter:description["']\s+content=["']([^"']+)["']/i)?.[1] || 'MISSING';
  const twImg = content.match(/<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i)?.[1] || 'MISSING';

  console.log(`Page: ${f}`);
  console.log(`  title: ${title}`);
  console.log(`  description: ${desc !== 'MISSING' ? 'OK (' + desc.length + ' chars)' : 'MISSING'}`);
  console.log(`  canonical: ${canonical}`);
  console.log(`  og:title: ${ogTitle !== 'MISSING' ? 'OK' : 'MISSING'}`);
  console.log(`  og:description: ${ogDesc !== 'MISSING' ? 'OK' : 'MISSING'}`);
  console.log(`  og:type: ${ogType}`);
  console.log(`  og:image: ${ogImg}`);
  console.log(`  og:url: ${ogUrl}`);
  console.log(`  twitter:card: ${twCard}`);
  console.log(`  twitter:title: ${twTitle !== 'MISSING' ? 'OK' : 'MISSING'}`);
  console.log(`  twitter:description: ${twDesc !== 'MISSING' ? 'OK' : 'MISSING'}`);
  console.log(`  twitter:image: ${twImg}`);

  if (ogImg !== 'MISSING') {
    const cleanImg = ogImg.replace(/^\//, '');
    const exists = fs.existsSync(cleanImg);
    console.log(`  og:image on disk: ${exists ? 'EXISTS (' + cleanImg + ')' : 'NOT FOUND (' + cleanImg + ')'}`);
  }
  console.log('');
}
