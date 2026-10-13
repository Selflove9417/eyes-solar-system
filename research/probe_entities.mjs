() => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  if (document.querySelector('.menu-container')?.classList.contains('hidden')) {
    document.querySelector('button.menu-btn')?.click();
    await wait(2500);
  }
  const globals = Object.keys(window).filter((k) => !/^(webkit|on[a-z]|chrome|document|location|navigator)/.test(k));
  const interesting = globals.filter((k) => /app|eyes|pioneer|config|manager|EYES|NASA/i.test(k));
  const out = { interestingGlobals: interesting.slice(0, 40), totalGlobals: globals.length };
  // Try to reach the running app instance to enumerate the entity database.
  const roots = ['app', 'EyesApp', 'eyesApp', 'config'];
  out.rootInfo = {};
  for (const r of roots) {
    try { if (window[r]) out.rootInfo[r] = typeof window[r] === 'object' ? Object.keys(window[r]).slice(0, 25) : String(window[r]).slice(0, 120); } catch (e) {}
  }
  // The menu list is our reliable, DOM-visible entity catalogue.
  const menu = document.querySelector('.menu-container');
  out.menuPresent = !!menu;
  if (menu) {
    const blocks = [...menu.querySelectorAll('.block')].map((b) => ({
      title: clean(b.querySelector('.title')?.textContent),
      items: [...b.querySelectorAll('li, .item, [class*=entity]')].map((li) => ({
        txt: clean(li.textContent).slice(0, 80),
        cls: clean(li.className),
        id: li.getAttribute('id') || li.dataset?.id || null,
      })).filter((x) => x.txt).slice(0, 60),
    }));
    out.blocks = blocks;
  }
  return out;
}
