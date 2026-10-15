import fs from 'node:fs';
import path from 'node:path';

const pages = [
  'index.html', 'explore.html', 'bodies.html', 'missions.html',
  'glossary.html', 'guide.html', 'extension.html', 'about.html',
  'mars.html', 'jwst.html', 'saturn.html', 'voyager-1.html'
];

for (const p of pages) {
  let content = fs.readFileSync(p, 'utf8');
  const canonicalUrl = `https://selflove9417.github.io/eyes-solar-system/${p === 'index.html' ? '' : p}`;

  // 1. Ensure canonical
  if (!content.includes('rel="canonical"') && !content.includes("rel='canonical'")) {
    content = content.replace(
      /(<meta\s+name=["']description["'][^>]*>)/i,
      `$1\n<link rel="canonical" href="${canonicalUrl}">`
    );
  }

  // 2. Ensure og:url
  if (!content.includes('property="og:url"') && !content.includes("property='og:url'")) {
    content = content.replace(
      /(<meta\s+property=["']og:type["'][^>]*>)/i,
      `$1\n<meta property="og:url" content="${canonicalUrl}">`
    );
  }

  // 3. Ensure favicon
  if (!content.includes('rel="icon"') && !content.includes("rel='icon'")) {
    content = content.replace(
      /(<link\s+rel=["']stylesheet["'])/i,
      `<link rel="icon" type="image/svg+xml" href="favicon.svg">\n<link rel="alternate icon" href="favicon.ico">\n$1`
    );
  }

  fs.writeFileSync(p, content, 'utf8');
  console.log(`Updated SEO & Favicon in ${p}`);
}
