() => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  // Find the description paragraph and report its exact characters so a
  // mismatch against the dictionary key can be diagnosed, not guessed at.
  const cand = [...document.querySelectorAll('p, div, span')]
    .filter((e) => !e.children.length && /Europa Clipper will search/.test(e.textContent));
  const el = cand[0];
  if (!el) return { error: 'description node not found', body: clean(document.body.textContent).slice(0, 300) };
  const txt = el.textContent;
  return {
    tag: el.tagName,
    cls: clean(el.className),
    text: txt,
    parentCls: clean(el.parentElement?.className),
    grandCls: clean(el.parentElement?.parentElement?.className),
    codepoints: [...txt].slice(0, 60).map((c) => (c.charCodeAt(0) > 126 ? c + ':U+' + c.charCodeAt(0).toString(16) : null)).filter(Boolean),
    textNodeCount: el.childNodes.length,
  };
}
