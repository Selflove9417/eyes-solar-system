import fs from 'node:fs';
import path from 'node:path';

import { SITE_ORIGIN, PAGES } from './site-config.mjs';

const files = PAGES;

console.log('=== SEO & Social Sharing Audit ===\n');

let totalErrors = 0;

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

  const requiredFields = [
    ['title', title],
    ['description', desc],
    ['canonical', canonical],
    ['og:title', ogTitle],
    ['og:description', ogDesc],
    ['og:type', ogType],
    ['og:image', ogImg],
    ['og:url', ogUrl],
    ['twitter:card', twCard],
    ['twitter:title', twTitle],
    ['twitter:description', twDesc],
    ['twitter:image', twImg]
  ];

  for (const [name, val] of requiredFields) {
    if (val === 'MISSING') {
      console.error(`  ❌ [${f}] Missing required SEO/social tag: ${name}`);
      totalErrors++;
    }
  }

  // Validate absolute URL format for social images
  if (ogImg !== 'MISSING') {
    if (!ogImg.startsWith('https://')) {
      console.error(`  ❌ [${f}] og:image must be an absolute URL starting with https:// (got: ${ogImg})`);
      totalErrors++;
    }
    const imgUrl = new URL(ogImg);
    const localRel = imgUrl.pathname.replace(/^\/eyes-solar-system/, '').replace(/^\//, '');
    const exists = fs.existsSync(localRel);
    console.log(`  og:image on disk: ${exists ? 'EXISTS (' + localRel + ')' : 'NOT FOUND (' + localRel + ')'}`);
    if (!exists) {
      console.error(`  ❌ [${f}] og:image target file does not exist on disk: ${localRel}`);
      totalErrors++;
    }
  }

  if (twImg !== 'MISSING' && !twImg.startsWith('https://')) {
    console.error(`  ❌ [${f}] twitter:image must be an absolute URL starting with https:// (got: ${twImg})`);
    totalErrors++;
  }

  console.log('');
}

if (totalErrors > 0) {
  console.error(`❌ SEO & social audit failed with ${totalErrors} error(s).`);
  process.exit(1);
} else {
  console.log(`✅ All ${files.length} pages passed SEO and social sharing audit with 0 errors!`);
  process.exit(0);
}
