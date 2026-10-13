() => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  // Collect every DOM node that carries user-visible text, with a stable-ish selector.
  const path = (el) => {
    const parts = [];
    let n = el;
    while (n && n !== document.body && parts.length < 5) {
      let s = n.tagName.toLowerCase();
      if (n.id) s = '#' + n.id;
      else if (n.className && typeof n.className === 'string') {
        const c = clean(n.className).split(' ').filter(Boolean).slice(0, 2).join('.');
        if (c) s += '.' + c;
      }
      parts.unshift(s);
      n = n.parentElement;
    }
    return parts.join(' > ');
  };
  const texts = [];
  const seen = new Set();
  document.querySelectorAll('#static-ui *, #dynamic-ui *, body > div *').forEach((el) => {
    if (el.children.length) return;
    const t = clean(el.textContent);
    if (!t || t.length > 160) return;
    if (!visible(el)) return;
    const key = path(el) + '|' + t;
    if (seen.has(key)) return;
    seen.add(key);
    texts.push({ text: t, where: path(el) });
  });
  return {
    url: location.href,
    pageTitle: document.title,
    canvasCount: document.querySelectorAll('canvas').length,
    labelDivs: document.querySelectorAll('.pioneer-label-div').length,
    totalDomNodes: document.querySelectorAll('*').length,
    visibleTextNodes: texts.length,
    texts,
  };
}
