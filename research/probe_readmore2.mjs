() => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const btn = document.querySelector('button.more-button');
  const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const all = [...document.querySelectorAll('#dynamic-ui *, #static-ui *')]
    .filter(e => !e.children.length && vis(e)).map(e => clean(e.textContent)).filter(Boolean);
  return {
    moreBtn: btn ? clean(btn.textContent) : null,
    title: document.title,
    englishLeft: [...new Set(all.filter(t => /^[A-Za-z][A-Za-z .,'()&\/-]{2,}$/.test(t)))],
  };
}
