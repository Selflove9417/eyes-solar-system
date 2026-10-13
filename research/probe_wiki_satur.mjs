() => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  // Pull every "土卫N（English）" or table row pairing from the article body.
  const text = document.body.innerText;
  const rows = [];
  const tables = [...document.querySelectorAll('table tr')];
  for (const tr of tables) {
    const cells = [...tr.querySelectorAll('th,td')].map((c) => clean(c.innerText));
    if (!cells.length) continue;
    rows.push(cells.slice(0, 6).join(' | '));
  }
  const navbox = [...document.querySelectorAll('table.navbox, .navbox')].map((e) => clean(e.innerText)).join('\n');
  return {
    title: document.title,
    url: location.href,
    rowCount: rows.length,
    sample: rows.slice(0, 40),
    navboxLen: navbox.length,
    navboxSample: navbox.slice(0, 1200),
  };
}
