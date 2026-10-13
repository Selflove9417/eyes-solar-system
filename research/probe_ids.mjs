() => {
  const ids = ['-31', '-30', '-29', '-27', '-55', '-43', '255', '-230', '-141'];
  return (async () => {
    const out = {};
    for (const id of ids) {
      const q = new URLSearchParams({
        format: 'text', COMMAND: `'${id}'`, CENTER: '500@399', QUANTITIES: '19', CAL_FORMAT: 'JD',
        START_TIME: '2026-10-12 00:00', STOP_TIME: '2026-10-12 00:10', STEP_SIZE: '10 m',
      });
      try {
        const r = await fetch('https://ssd.jpl.nasa.gov/api/horizons.api?' + q);
        const t = await r.text();
        const tgt = (t.match(/Target description\s*:\s*(.+)/i) || t.match(/RE: (.+)/) || [])[1];
        const soe = t.indexOf('$$SOE');
        const row = soe > -1 ? t.slice(soe + 6, soe + 60).trim().split(/\s+/) : null;
        out[id] = { target: tgt ? tgt.trim().slice(0, 46) : null, rAU: row ? row[1] : null };
      } catch (e) { out[id] = { err: String(e).slice(0, 60) }; }
    }
    return out;
  })();
}
