() => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const vis = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const dump = (root) => {
    const arr = [];
    root.querySelectorAll('*').forEach((el) => {
      if (el.children.length) return;
      const t = clean(el.textContent);
      if (!t || t.length > 200 || !vis(el)) return;
      arr.push(t);
    });
    // also tooltips / labels not rendered as textContent
    root.querySelectorAll('[aria-label],[data-tippy-content],input[type=checkbox]+label').forEach((el) => {
      const t = clean(el.getAttribute('aria-label') || el.getAttribute('data-tippy-content') || el.textContent);
      if (t) arr.push('[label] ' + t);
    });
    return [...new Set(arr)];
  };
  const findClickable = (txt) =>
    [...document.querySelectorAll('button, [role=button], .clickable, a, li, span, div')].find(
      (el) => vis(el) && clean(el.textContent).toLowerCase() === txt && el.getBoundingClientRect().width < 400,
    );
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { steps: [] };

  // Inventory of the persistent chrome (header + shortcuts)
  out.header = dump(document.querySelector('header') || document.body);
  out.shortcuts = [...document.querySelectorAll('.shortcut, [class*=shortcut]')].map((e) => ({
    cls: clean(e.className), txt: clean(e.textContent).slice(0, 60), vis: vis(e),
  })).slice(0, 30);

  const menuBtn = findClickable('Menu');
  out.menuBtnFound = !!menuBtn;
  if (menuBtn) {
    menuBtn.click();
    await wait(2500);
    out.menuDom = dump(document.querySelector('#dynamic-ui') || document.body);
    out.menuAddedNodes = document.querySelectorAll('#dynamic-ui *').length;
    out.steps.push('opened menu');
  }
  return out;
}
