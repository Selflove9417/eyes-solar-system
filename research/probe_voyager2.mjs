() => {
  const tries = [
    { label: 'COMMAND=36 Q=19', p: { format: 'text', COMMAND: "'36'", CENTER: '500@399', QUANTITIES: '19', CAL_FORMAT: 'JD', START_TIME: '2026-10-12 00:00', STOP_TIME: '2026-10-12 00:10', STEP_SIZE: '10 m' } },
    { label: 'COMMAND=-31 (Voyager1 Horizons id)', p: { format: 'text', COMMAND: "'-31'", CENTER: '500@399', QUANTITIES: '19', CAL_FORMAT: 'JD', START_TIME: '2026-10-12 00:00', STOP_TIME: '2026-10-12 00:10', STEP_SIZE: '10 m' } },
    { label: 'COMMAND=36 no QUANTITIES', p: { format: 'text', COMMAND: "'36'", CENTER: '500@399', CAL_FORMAT: 'JD', START_TIME: '2026-10-12 00:00', STOP_TIME: '2026-10-12 00:10', STEP_SIZE: '10 m' } },
  ];
  return (async () => {
    const out = {};
    for (const t of tries) {
      try {
        const r = await fetch('https://ssd.jpl.nasa.gov/api/horizons.api?' + new URLSearchParams(t.p).toString());
        const x = await r.text();
        const i = x.indexOf('$$SOE');
        out[t.label] = { status: r.status, bytes: x.length,
          err: /API ERROR|ERROR:/.test(x.slice(0, 900)) ? x.slice(0, 260) : null,
          table: i > -1 ? x.slice(Math.max(0, i - 900), i + 260) : x.slice(0, 200) };
      } catch (e) { out[t.label] = { error: String(e).slice(0, 90) }; }
    }
    return out;
  })();
}
