() => {
  const ids = ['mars', 'earth', 'jupiter', 'sun', 'pluto', 'sc_voyager_1', 'saturn'];
  const out = {};
  for (const id of ids) {
    try {
      const r = await fetch('/apps/solar-system/descriptions/' + id + '.json');
      const t = await r.text();
      out[id] = { status: r.status, bytes: t.length, json: r.ok ? JSON.parse(t) : t.slice(0, 200) };
    } catch (e) {
      out[id] = { error: String(e) };
    }
  }
  return JSON.stringify(out);
}
