() => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  // The onboarding tutorial is in the DOM even before it is shown; read its structure
  // so key-to-action pairings come from the site itself, not from guesswork.
  const find = [...document.querySelectorAll('*')].filter((e) =>
    clean(e.textContent).includes('Here are some tips to get you navigating'));
  const root = find[find.length - 1];
  if (!root) return { error: 'tutorial block not found', bodySample: clean(document.body.textContent).slice(0, 300) };
  const walk = (el, depth = 0) => {
    const kids = [...el.children];
    if (!kids.length) return { t: clean(el.textContent), tag: el.tagName.toLowerCase(), cls: clean(el.className) };
    return { tag: el.tagName.toLowerCase(), cls: clean(el.className), kids: kids.map((k) => walk(k, depth + 1)) };
  };
  return { rootTag: root.tagName, cls: clean(root.className), tree: walk(root) };
}
