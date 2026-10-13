() => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const harvest = () => {
    const texts = new Set();
    const attrs = new Set();
    document.querySelectorAll('*').forEach((el) => {
      if (el.children.length === 0) {
        const t = clean(el.textContent);
        if (t && t.length <= 120 && /[a-z]/i.test(t)) texts.add(t);
      }
      for (const a of ['aria-label', 'title', 'data-tippy-content', 'placeholder', 'alt']) {
        const v = clean(el.getAttribute && el.getAttribute(a));
        if (v && v.length <= 160) attrs.add(v);
      }
    });
    return { texts, attrs };
  };
  const acc = { texts: new Set(), attrs: new Set() };
  const merge = () => { const h = harvest(); h.texts.forEach((t) => acc.texts.add(t)); h.attrs.forEach((t) => acc.attrs.add(t)); };
  merge();

  // Enumerate the right-hand settings bar icons without guessing their class names.
  const bars = [...document.querySelectorAll('[class*=settings], [class*=shortcut], nav, aside')]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > innerWidth - 140 && r.height > 40; });
  const icons = [...new Set(bars.flatMap((b) => [...b.querySelectorAll('[class*=icon]')]))];
  const trail = icons.map((el, i) => ({ i, cls: clean(el.className), tag: el.tagName.toLowerCase() }));
  for (let i = 0; i < icons.length; i++) {
    try { icons[i].click(); } catch {}
    await wait(1100);
    merge();
    try { icons[i].click(); } catch {}   // close again so panels don't stack
    await wait(500);
  }
  merge();
  return {
    route: location.hash,
    domNodes: document.querySelectorAll('*').length,
    iconTrail: trail,
    texts: [...acc.texts],
    attrs: [...acc.attrs],
  };
}
