() => {
  for (let i = 0; i < 30 && location.origin === 'null'; i++) await new Promise(r => setTimeout(r, 500));
  const targets = {
    'JPL Horizons': 'https://ssd.jpl.nasa.gov/api/horizons.api?format=text&COMMAND=%2736%27&CENTER=%27500%40399%27&START_TIME=2026-10-12%2000:00&STOP_TIME=2026-10-12%2000:05',
    'NASA CNEOS': 'https://cneos.jpl.nasa.gov/CW/?t=now-1h',
    'NASA Open NTP': 'https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY',
  };
  return (async () => {
    const out = { origin: location.origin };
    for (const [name, url] of Object.entries(targets)) {
      try {
        const r = await fetch(url, { mode: 'cors' });
        const t = await r.text();
        out[name] = { ok: true, status: r.status, bytes: t.length, allowOrigin: r.headers.get('access-control-allow-origin') };
      } catch (e) { out[name] = { ok: false, error: String(e).slice(0, 90) }; }
    }
    return out;
  })();
}
