() => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const anchor = [...document.querySelectorAll('*')].find((e) => !e.children.length && clean(e.textContent) === 'Time controls.');
  if (!anchor) return { error: 'anchor not found' };
  let root = anchor;
  for (let i = 0; i < 6 && root.parentElement && root.parentElement !== document.body; i++) root = root.parentElement;
  const walk = (el) => {
    const kids = [...el.children];
    if (!kids.length) return clean(el.textContent) ? { t: clean(el.textContent), tag: el.tagName.toLowerCase(), cls: clean(el.className) } : null;
    const sub = kids.map(walk).filter(Boolean);
    return { tag: el.tagName.toLowerCase(), cls: clean(el.className), kids: sub };
  };
  const n = walk(root);
  const flat = [];
  const dump = (x, path) => {
    if (x.t !== undefined) { flat.push(path + ' :: ' + x.t); return; }
    (x.kids || []).forEach((k) => dump(k, path + '/' + (k.cls ? k.cls.split(' ')[0] : k.tag)));
  };
  dump(n, root.className.split(' ')[0] || root.tagName);
  return { rootCls: clean(root.className), lines: flat };
}
