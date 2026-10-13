() => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelector('.menu-container')?.classList.contains('hidden') === false &&
    document.querySelector('.close-button, .overlay-bg')?.click();
  await wait(800);
  const btn = document.querySelector('button.share-button');
  if (!btn) return { error: 'no share-button' };
  btn.click();
  await wait(2500);
  const modal = document.getElementById('share-modal');
  const texts = [];
  modal.querySelectorAll('*').forEach((el) => {
    if (el.children.length === 0) {
      const t = clean(el.textContent);
      if (t) texts.push({ tag: el.tagName.toLowerCase(), cls: clean(el.className), text: t.slice(0, 600) });
    }
  });
  const code = [...modal.querySelectorAll('code, pre, textarea, .embed-code, [class*=embed]')]
    .map((e) => ({ cls: clean(e.className), txt: clean(e.textContent).slice(0, 900), val: e.value ? clean(e.value).slice(0, 900) : undefined }));
  return {
    modalHidden: modal.classList.contains('hidden'),
    texts,
    embedCodeNodes: code,
    labels: [...modal.querySelectorAll('label')].map((l) => clean(l.textContent)),
    inputs: [...modal.querySelectorAll('input')].map((i) => ({ type: i.type, id: i.id, checked: i.checked })),
  };
}
