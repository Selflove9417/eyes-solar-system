() => {
  const res = performance.getEntriesByType('resource').map((r) => r.name);
  const interesting = res.filter((u) => /\.(json|txt|csv|geojson|topojson|js|wasm)(\?|$)/i.test(u) || /assets|data|manifest/i.test(u));
  return { total: res.length, interesting: [...new Set(interesting)].slice(0, 80) };
}
