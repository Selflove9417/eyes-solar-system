() => {
  const ei = window.app?._entityInfo;
  if (!ei) return { error: 'no _entityInfo' };
  const keys = Object.keys(ei);
  const sample = ei[keys[6]];
  const byCategory = {};
  for (const k of keys) {
    const e = ei[k];
    const c = (e.category || 'unknown').toLowerCase();
    (byCategory[c] ||= []).push(k);
  }
  return {
    total: keys.length,
    categories: Object.fromEntries(Object.entries(byCategory).map(([c, a]) => [c, a.length])),
    sampleKeys: Object.keys(sample || {}),
    sample,
    planets: keys.filter((k) => (ei[k].category || '').toLowerCase() === 'planet')
      .map((k) => ({ id: k, displayName: ei[k].displayName, altName: ei[k].altName, iauName: ei[k].iauName })),
  };
}
