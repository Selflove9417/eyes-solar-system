() => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const btn = [...document.querySelectorAll('button, a, div, span')]
    .find(e => /更多|More/.test(e.textContent) && e.textContent.length < 30 && e.getBoundingClientRect().width > 0);
  const dump = (el, d = 0) => {
    let s = '  '.repeat(d) + '<' + el.tagName.toLowerCase() + (el.className ? ' class="' + clean(el.className) + '"' : '') + '>\n';
    for (const n of el.childNodes) {
      if (n.nodeType === 3) s += '  '.repeat(d + 1) + '#text ' + JSON.stringify(n.nodeValue) + '\n';
      else if (n.nodeType === 1) s += dump(n, d + 1);
    }
    return s;
  };
  return { found: !!btn, tree: btn ? dump(btn) : null, text: btn ? clean(btn.textContent) : null };
}
