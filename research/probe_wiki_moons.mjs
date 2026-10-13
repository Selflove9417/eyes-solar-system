() => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  // Wikipedia renders progressively; wait for the satellite table to exist.
  for (let i = 0; i < 60; i++) {
    if (document.querySelectorAll('table tr').length > 30) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  // Planet satellite tables differ: Saturn's 编号 column holds a bare numeral
  // ("十八"), Jupiter's holds the full ordinal ("木卫十六"). Accept both.
  const ORDINAL = /^([木土天海冥火])?卫([一二三四五六七八九十百零]+)$/;
  const BARE = /^([一二三四五六七八九十百零]+)$/;
  const pairs = [];
  for (const tr of document.querySelectorAll('table tr')) {
    const cells = [...tr.cells].map((c) => clean(c.innerText));
    let prefix = null;
    let numeral = null;
    let idx = -1;
    for (let i = 0; i < Math.min(cells.length, 4); i++) {
      const m = cells[i].match(ORDINAL);
      const b = cells[i].match(BARE);
      if (m) { prefix = m[1] || null; numeral = m[2]; idx = i; break; }
      if (b && b[1].length <= 6) { numeral = b[1]; idx = i; break; }
    }
    if (numeral === null) continue;
    // Uranus/Neptune put the Latin name in a "原名（发音）" column, so drop any
    // parenthetical and trailing prose before matching.
    const latin = cells.slice(idx + 1)
      .map((c) => c.replace(/[（(].*$/, '').replace(/[†♠‡♦♣]/g, '').trim())
      .find((c) => /^[A-Z][A-Za-z'’\-]{2,24}$/.test(c));
    if (!latin) continue;
    pairs.push({ prefix, numeral, latin });
  }
  const seen = new Set();
  const uniq = pairs.filter((p) => {
    const k = p.latin + '|' + p.numeral;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { title: document.title, url: location.href, count: uniq.length, pairs: uniq };
}
