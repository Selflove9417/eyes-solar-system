() => {
  const res = performance.getEntriesByType('resource').map(r => r.name);
  return { events: res.filter(u => /events\//i.test(u)), json: res.filter(u => /\.json/.test(u)).slice(0, 12) };
}
