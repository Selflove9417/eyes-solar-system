() => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const leafText = [];
  const attrs = { placeholder: new Set(), title: new Set(), ariaLabel: new Set(), tippy: new Set(), option: new Set() };
  document.querySelectorAll('*').forEach((el) => {
    if (el.children.length === 0) {
      const t = clean(el.textContent);
      if (t && t.length <= 200) leafText.push(t);
    }
    const p = clean(el.getAttribute && el.getAttribute('placeholder'));
    if (p) attrs.placeholder.add(p);
    const ti = clean(el.getAttribute && el.getAttribute('title'));
    if (ti) attrs.title.add(ti);
    const al = clean(el.getAttribute && el.getAttribute('aria-label'));
    if (al) attrs.ariaLabel.add(al);
    const tp = clean(el.getAttribute && el.getAttribute('data-tippy-content'));
    if (tp) attrs.tippy.add(tp);
    if (el.tagName === 'OPTION') attrs.option.add(clean(el.textContent));
  });
  const uniq = (a) => [...new Set(a)];
  return {
    totalDomNodes: document.querySelectorAll('*').length,
    hiddenNodes: [...document.querySelectorAll('.hidden')].length,
    labelDivs: document.querySelectorAll('.pioneer-label-div').length,
    leafTextCount: leafText.length,
    uniqueLeafText: uniq(leafText),
    placeholders: [...attrs.placeholder],
    titles: [...attrs.title],
    ariaLabels: [...attrs.ariaLabel],
    tippy: [...attrs.tippy],
    options: [...attrs.option],
  };
}
