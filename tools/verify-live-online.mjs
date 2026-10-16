import { SITE_ORIGIN, PAGES } from './site-config.mjs';

const pages = PAGES;
const baseUrl = SITE_ORIGIN;

async function checkOnline() {
  const timestamp = Date.now();
  console.log(`=== 线上 GitHub Pages 实时抓取验证 (时间戳: ${timestamp}) ===\n`);

  const results = [];
  let isDeployed = false;

  for (const p of pages) {
    const url = `${baseUrl}/${p}?t=${timestamp}`;
    try {
      const res = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
      if (!res.ok) {
        console.error(`❌ [${p}] HTTP ${res.status}`);
        continue;
      }
      const html = await res.text();

      const titleMatch = html.match(/<title>([^<]+)<\/title>/);
      const title = titleMatch ? titleMatch[1].trim() : '(无)';

      const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/);
      const ogTitle = ogTitleMatch ? ogTitleMatch[1].trim() : '(无)';

      const ogImageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/);
      const ogImage = ogImageMatch ? ogImageMatch[1].trim() : '(无)';

      const ogWidthMatch = html.match(/<meta\s+property="og:image:width"\s+content="([^"]+)"/);
      const ogWidth = ogWidthMatch ? ogWidthMatch[1].trim() : '(无)';

      const ogHeightMatch = html.match(/<meta\s+property="og:image:height"\s+content="([^"]+)"/);
      const ogHeight = ogHeightMatch ? ogHeightMatch[1].trim() : '(无)';

      const ogAltMatch = html.match(/<meta\s+property="og:image:alt"\s+content="([^"]+)"/);
      const ogAlt = ogAltMatch ? ogAltMatch[1].trim() : '(无)';

      const twitterCardMatch = html.match(/<meta\s+name="twitter:card"\s+content="([^"]+)"/);
      const twitterCard = twitterCardMatch ? twitterCardMatch[1].trim() : '(无)';

      const canonicalMatch = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/);
      const canonical = canonicalMatch ? canonicalMatch[1].trim() : '(无)';

      const versionMatch = html.match(/\?v=([a-zA-Z0-9_-]+)/);
      const version = versionMatch ? versionMatch[1].trim() : '(无)';

      if (version === '20261016p6final') isDeployed = true;

      results.push({
        page: p,
        title,
        ogTitle,
        ogImage,
        ogWidth,
        ogHeight,
        ogAlt,
        twitterCard,
        canonical,
        version
      });
    } catch (err) {
      console.error(`❌ 获取 ${p} 异常:`, err.message);
    }
  }

  console.log(`部署状态: ${isDeployed ? '✅ 新版本 (20261016p6final) 已生效' : '⏳ 正在等待 GitHub Pages 部署同步...'}\n`);

  console.log('| 页面文件 | 真实 `<title>` | `og:title` | `twitter:card` | `og:image:width × height` | `og:image:alt` | `canonical` | 版本参数 |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    const dim = r.ogWidth !== '(无)' ? `${r.ogWidth}×${r.ogHeight}` : '(未生效)';
    console.log(`| \`${r.page}\` | ${r.title} | ${r.ogTitle} | \`${r.twitterCard}\` | ${dim} | ${r.ogAlt} | \`${r.canonical}\` | \`?v=${r.version}\` |`);
  }

  return isDeployed;
}

const deployed = await checkOnline();
if (!deployed) {
  process.exit(2);
} else {
  process.exit(0);
}
