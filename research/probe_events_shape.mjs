() => {
  const r = await fetch('/apps/solar-system/events/sc_europa_clipper/all_events.json');
  const j = await r.json();
  const shape = (o, d = 0) => Array.isArray(o) ? { arr: o.length, first: d < 2 ? shape(o[0], d + 1) : '…' }
    : (o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).slice(0, 12).map(([k, v]) => [k, d < 2 ? shape(v, d + 1) : typeof v])) : typeof o);
  return { raw: JSON.stringify(j).slice(0, 900), shape: shape(j) };
}
