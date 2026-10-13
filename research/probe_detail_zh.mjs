() => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const vis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.opacity !== '0'; };
  document.querySelector('.menu-container .icon-close')?.click();
  await new Promise(r => setTimeout(r, 1200));
  const all = [...document.querySelectorAll('#dynamic-ui *, #static-ui *')]
    .filter(e => !e.children.length && vis(e)).map(e => clean(e.textContent)).filter(Boolean);
  const uniq = [...new Set(all)];
  return {
    title: document.title,
    hasXingxing: uniq.some(t => t === '行星'),
    hasReadMoreZh: uniq.some(t => /阅读更多/.test(t)),
    leftovers: uniq.filter(t => /^[A-Za-z][A-Za-z .,'()&/-]{2,}$/.test(t)).slice(0, 20),
    sample: uniq.slice(0, 30),
  };
}
