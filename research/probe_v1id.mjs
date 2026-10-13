() => {
  const q = new URLSearchParams({
    format: 'text', COMMAND: "'-31'", CENTER: '500@399', QUANTITIES: '19', CAL_FORMAT: 'JD',
    START_TIME: '2026-10-12 00:00', STOP_TIME: '2026-10-12 00:10', STEP_SIZE: '10 m',
  });
  return (async () => {
    const r = await fetch('https://ssd.jpl.nasa.gov/api/horizons.api?' + q);
    const t = await r.text();
    const head = t.slice(0, 1500);
    const idLines = head.split('\n').filter((l) => /VOYAGER|Target|RE:|Small Body ID|using|Geocentric|source/i.test(l)).slice(0, 12);
    const soe = t.indexOf('$$SOE');
    return { idLines, table: t.slice(soe - 200, soe + 260) };
  })();
}
