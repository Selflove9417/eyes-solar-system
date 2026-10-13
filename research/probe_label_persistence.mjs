() => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const map = { Sun: '太阳', Earth: '地球', Mars: '火星', Jupiter: '木星', Saturn: '土星', Venus: '金星', Mercury: '水星', Uranus: '天王星', Neptune: '海王星', Moon: '月球' };
  const snap = () => [...document.querySelectorAll('.pioneer-label-div .text')].map((e) => clean(e.textContent));
  const apply = () => {
    document.querySelectorAll('.pioneer-label-div').forEach((d) => {
      const t = d.querySelector('.text');
      if (t && map[clean(t.textContent)]) t.textContent = map[clean(t.textContent)];
    });
  };
  const out = { before: snap() };
  // Count how often the app rewrites label text on its own.
  let mutations = 0;
  const touched = new Set();
  const obs = new MutationObserver((recs) => {
    recs.forEach((r) => {
      mutations++;
      const n = r.target.nodeType === 3 ? r.target.parentElement : r.target;
      touched.add(clean(n?.textContent).slice(0, 30));
    });
  });
  obs.observe(document.getElementById('main-viewport'), { childList: true, subtree: true, characterData: true });
  apply();
  out.afterApply = snap();
  await wait(6000);
  out.after6s = snap();
  out.mutationCountIn6s = mutations;
  out.mutatedNodes = [...touched].slice(0, 25);
  // Now test whether a camera move (wheel zoom) reverts them.
  const vp = document.getElementById('main-viewport');
  const r = vp.getBoundingClientRect();
  for (let i = 0; i < 6; i++) {
    vp.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, clientX: r.width / 2, clientY: r.height / 2, bubbles: true, cancelable: true }));
    await wait(120);
  }
  await wait(3000);
  out.afterZoom = snap();
  out.stillChinese = out.afterZoom.filter((t) => /[一-龥]/.test(t)).length;
  obs.disconnect();
  return out;
}
