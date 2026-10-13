() => {
  const res = performance.getEntriesByType('resource').map((r) => r.name);
  return {
    total: res.length,
    descriptions: res.filter((u) => /description|stories\/|events\//i.test(u)),
    staticAssets: [...new Set(res.filter((u) => /assets\/static|assets\/dynamic/.test(u)).map((u) => u.replace(/\/[^/]*$/, '/')))].slice(0, 40),
  };
}
