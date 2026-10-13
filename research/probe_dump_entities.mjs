() => {
  const ei = window.app._entityInfo;
  const rows = Object.keys(ei).map((k) => {
    const e = ei[k];
    return {
      id: e.id ?? k,
      iauName: e.iauName ?? null,
      displayName: e.displayName ?? null,
      altName: e.altName ?? null,
      category: e.category ?? null,
      subcategory: e.subcategory ?? null,
    };
  });
  rows.sort((a, b) => (a.category || '').localeCompare(b.category || '') || (a.iauName || '').localeCompare(b.iauName || ''));
  return JSON.stringify(rows);
}
