import fs from 'node:fs';

const pages = [
  'index.html',
  'explore.html',
  'bodies.html',
  'missions.html',
  'glossary.html',
  'guide.html',
  'extension.html',
  'about.html',
  'saturn.html',
  'mars.html',
  'jwst.html',
  'voyager-1.html'
];

for (const p of pages) {
  const html = fs.readFileSync(p, 'utf8');
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  const ogTitle = html.match(/<meta property="og:title" content="([^"]+)"/)?.[1];
  const ogUrl = html.match(/<meta property="og:url" content="([^"]+)"/)?.[1];
  const ogImage = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
  const twitterCard = html.match(/<meta name="twitter:card" content="([^"]+)"/)?.[1];
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  console.log(JSON.stringify({ page: p, title, ogTitle, twitterCard, ogUrl, canonical }));
}
