() => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const tables = [...document.querySelectorAll('table')];
  const info = tables.slice(0, 12).map((t, i) => ({
    i, rows: t.rows.length,
    first: [...t.rows].slice(0, 4).map((r) => [...r.cells].map((c) => clean(c.innerText)).slice(0, 5).join(' | ')),
  }));
  return { title: document.title, tableCount: tables.length, info };
}
