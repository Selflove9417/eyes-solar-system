() => {
  const ids = ['sc_europa_clipper','sc_iss','mars','jupiter','saturn','sc_voyager_1','sc_cassini','earth','sc_parker_solar_probe','1p_halley'];
  const out = {};
  for (const id of ids) {
    try {
      const r = await fetch('/apps/solar-system/events/' + id + '/all_events.json');
      if (!r.ok) { out[id] = 'HTTP ' + r.status; continue; }
      const j = await r.json();
      const titles = (j.events || j || []).map(e => e.title || e.name).filter(Boolean);
      out[id] = { count: titles.length, sample: titles.slice(0, 8) };
    } catch (e) { out[id] = String(e).slice(0, 60); }
  }
  return out;
}
