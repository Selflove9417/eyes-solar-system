() => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const btn = document.querySelector('button.more-button');
  if (!btn) return { error: 'no more-button' };
  const kids = [...btn.childNodes].map(n => ({
    type: n.nodeType, val: n.nodeType === 3 ? JSON.stringify(n.nodeValue) : n.tagName.toLowerCase(),
    own: n.nodeType === 1 ? clean(n.textContent) : undefined,
    elChildren: n.nodeType === 1 ? n.children.length : undefined,
  }));
  return { textContent: clean(btn.textContent), kids,
    spanChildren: btn.querySelector('span') ? btn.querySelector('span').children.length : null };
}
