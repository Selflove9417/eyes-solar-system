() => {
  const urls = [
    ['/apps/solar-system/descriptions/mars.json', 'small json'],
    ['/assets/static/stars/', 'asset dir (expect 403/list)'],
    ['/apps/solar-system/app.js', '1.7 MB bundle'],
    ['/apps/solar-system/vendors.js', '2.5 MB bundle'],
  ];
  const out = [];
  for (const [u, label] of urls) {
    const t0 = performance.now();
    try {
      const r = await fetch(u, { cache: 'no-store' });
      const b = await r.blob();
      out.push({ u: u.slice(0, 46), label, status: r.status, bytes: b.size, ms: Math.round(performance.now() - t0) });
    } catch (e) {
      out.push({ u: u.slice(0, 46), label, error: String(e).slice(0, 120), ms: Math.round(performance.now() - t0) });
    }
  }
  const res = performance.getEntriesByType('resource');
  const slow = res.filter((r) => r.duration > 8000).slice(-8).map((r) => [Math.round(r.duration), r.name.replace(/^https:\/\/eyes\.nasa\.gov/, '').slice(0, 60)]);
  const zero = res.filter((r) => r.transferSize === 0 && r.decodedBodySize === 0).length;
  return { probes: out, resourcesSeen: res.length, slowOver8s: slow, zeroByteResources: zero };
}
