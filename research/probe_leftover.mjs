() => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const vis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.opacity !== '0'; };
  const out = new Set();
  document.querySelectorAll('#dynamic-ui *, #static-ui *, #pioneer *').forEach(e => {
    if (e.children.length) return;
    const t = clean(e.textContent);
    if (t && vis(e) && !/[一-鿿]/.test(t) && /[A-Za-z]{3}/.test(t) && t.length < 200) out.add(t);
    for (const a of ['aria-label','title','data-tippy-content','placeholder']) {
      const v = clean(e.getAttribute && e.getAttribute(a));
      if (v && !/[一-鿿]/.test(v) && /[A-Za-z]{3}/.test(v)) out.add('[attr] ' + v);
    }
  });
  return { hash: location.hash, leftover: [...out] };
}
