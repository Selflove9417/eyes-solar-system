import fs from 'node:fs';

const pages = [
  'index.html', 'explore.html', 'bodies.html', 'missions.html',
  'glossary.html', 'guide.html', 'extension.html', 'about.html',
  'saturn.html', 'mars.html', 'jwst.html', 'voyager-1.html'
];

for (const p of pages) {
  let html = fs.readFileSync(p, 'utf8');

  // 1. twitter:card summary_large_image -> summary
  html = html.replace(
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:card" content="summary">'
  );

  // 2. Add og:image:width, og:image:height, og:image:alt after og:image if not present
  if (!html.includes('og:image:width')) {
    const target = '<meta property="og:image" content="https://selflove9417.github.io/eyes-solar-system/assets/img/PIA21895_final_image.png">';
    const replacement = `${target}\n<meta property="og:image:width" content="505">\n<meta property="og:image:height" content="508">\n<meta property="og:image:alt" content="卡西尼号土星任务艺术概念图 - 深空之眸">`;
    html = html.replace(target, replacement);
  }

  // 3. Add twitter:image:alt after twitter:image if not present
  if (!html.includes('twitter:image:alt')) {
    const target = '<meta name="twitter:image" content="https://selflove9417.github.io/eyes-solar-system/assets/img/PIA21895_final_image.png">';
    const replacement = `${target}\n<meta name="twitter:image:alt" content="卡西尼号土星任务艺术概念图 - 深空之眸">`;
    html = html.replace(target, replacement);
  }

  // 4. Update ?v=20261016p6 -> ?v=20261016p6final
  html = html.replace(/\?v=20261016p6/g, '?v=20261016p6final');

  fs.writeFileSync(p, html, 'utf8');
  console.log(`Updated ${p}`);
}
