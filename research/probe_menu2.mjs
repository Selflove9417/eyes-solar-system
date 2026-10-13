() => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const btn = document.querySelector('button.menu-btn');
  if (!btn) return { error: 'no menu-btn' };
  btn.click();
  await wait(3000);
  const shell = document.querySelector('.menu-container') || document.body;
  const texts = [];
  const labels = { placeholder: [], title: [], aria: [], tippy: [], option: [] };
  shell.querySelectorAll('*').forEach((el) => {
    if (el.children.length === 0) {
      const t = clean(el.textContent);
      if (t && t.length <= 200) texts.push(t);
    }
    const g = (a) => clean(el.getAttribute && el.getAttribute(a));
    if (g('placeholder')) labels.placeholder.push(g('placeholder'));
    if (g('title')) labels.title.push(g('title'));
    if (g('aria-label')) labels.aria.push(g('aria-label'));
    if (g('data-tippy-content')) labels.tippy.push(g('data-tippy-content'));
    if (el.tagName === 'OPTION') labels.option.push(clean(el.textContent));
  });
  const u = (a) => [...new Set(a)];
  return {
    menuVisible: !shell.classList.contains('hidden'),
    domNodes: document.querySelectorAll('*').length,
    menuTexts: u(texts),
    labels: Object.fromEntries(Object.entries(labels).map(([k, v]) => [k, u(v)])),
  };
}
