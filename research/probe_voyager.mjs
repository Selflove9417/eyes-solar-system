() => {
  const q = new URLSearchParams({
    format: 'text', COMMAND: "'36'", CENTER: '500@399',
    QUANTITIES: '19,20', CAL_FORMAT: 'JD',
    START_TIME: '2026-10-12 00:00', STOP_TIME: '2026-10-12 01:00', STEP_SIZE: '1 h',
  });
  return (async () => {
    const r = await fetch('https://ssd.jpl.nasa.gov/api/horizons.api?' + q.toString());
    const t = await r.text();
    const i = t.indexOf('target-distance');
    const j = t.indexOf('SOE results');
    return { status: r.status, bytes: t.length,
      header: i > -1 ? t.slice(i, i + 220) : 'NO target-distance column',
      data: j > -1 ? t.slice(j, j + 700) : t.slice(-700) };
  })();
}
