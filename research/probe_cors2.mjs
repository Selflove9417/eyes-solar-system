() => {
  const url = 'https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY&count=1';
  const hz = 'https://ssd.jpl.nasa.gov/api/horizons.api?format=text&COMMAND=%2736%27&CENTER=%27500%40399%27&START_TIME=2026-10-12%2000:00&STOP_TIME=2026-10-12%2000:05';
  return (async () => {
    const out = { origin: location.origin };
    for (const [name, u] of Object.entries({ nasa_api: url, horizons: hz })) {
      // no-cors yields an opaque response if the network path works at all.
      try {
        const r = await fetch(u, { mode: 'no-cors' });
        out[name + '_nocors'] = { reached: true, type: r.type, status: r.status };
      } catch (e) { out[name + '_nocors'] = { reached: false, err: String(e).slice(0, 80) }; }
      try {
        const r = await fetch(u, { mode: 'cors' });
        out[name + '_cors'] = { ok: true, status: r.status, acao: r.headers.get('access-control-allow-origin') };
      } catch (e) { out[name + '_cors'] = { ok: false, err: String(e).slice(0, 80) }; }
    }
    return out;
  })();
}
