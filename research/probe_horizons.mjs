() => {
  const base = 'https://ssd.jpl.nasa.gov/api/horizons.api';
  const sets = {
    minimal: { format: 'text', COMMAND: "'36'", CENTER: '500@399', QUANTITIES: '19',
      START_TIME: '2026-10-12 00:00', STOP_TIME: '2026-10-12 00:05', STEP_SIZE: '5 m' },
    withEphem: { format: 'text', COMMAND: "'36'", CENTER: '500@399', EPHEM_TYPE: 'OBSERVER',
      QUANTITIES: '19', START_TIME: '2026-10-12 00:00', STOP_TIME: '2026-10-12 00:05', STEP_SIZE: '5 m' },
    noEphemTypeOnly: { format: 'text', COMMAND: "'36'", CENTER: '500@399',
      START_TIME: '2026-10-12 00:00', STOP_TIME: '2026-10-12 00:05' },
  };
  return (async () => {
    const out = {};
    for (const [k, p] of Object.entries(sets)) {
      const t0 = performance.now();
      try {
        const r = await fetch(base + '?' + new URLSearchParams(p).toString());
        const t = await r.text();
        out[k] = { status: r.status, bytes: t.length, ms: Math.round(performance.now() - t0),
          msg: r.ok ? t.slice(t.indexOf('target-distance') - 120, t.indexOf('target-distance') + 300) : t.slice(0, 200) };
      } catch (e) { out[k] = { error: String(e).slice(0, 150) }; }
    }
    return out;
  })();
}
