/**
 * 站点基础配置（单一事实来源）
 * 默认主站：https://deepspaceeye.pages.dev (Cloudflare Pages)
 * 支持通过环境变量 SITE_ORIGIN 覆盖（例如测试 GitHub Pages 镜像站点）
 */

export const DEFAULT_SITE_ORIGIN = 'https://deepspaceeye.pages.dev';
export const SITE_ORIGIN = (process.env.SITE_ORIGIN || DEFAULT_SITE_ORIGIN).replace(/\/+$/, '');

export const PAGES = [
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

/**
 * 获取规范页面完整 URL
 * @param {string} page 如 'explore.html' 或 'index.html'
 * @returns {string}
 */
export function getPageUrl(page = '') {
  const p = page === 'index.html' ? '' : page.replace(/^\//, '');
  return p ? `${SITE_ORIGIN}/${p}` : `${SITE_ORIGIN}/`;
}

/**
 * 获取静态资源绝对 URL
 * @param {string} relPath 如 'assets/img/PIA21895_final_image_505x508.jpg'
 * @returns {string}
 */
export function getAssetUrl(relPath = '') {
  return `${SITE_ORIGIN}/${relPath.replace(/^\//, '')}`;
}
