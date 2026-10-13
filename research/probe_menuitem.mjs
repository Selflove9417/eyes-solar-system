() => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelector('button.menu-btn')?.click();
  await wait(2500);
  const mercury = [...document.querySelectorAll('.menu-container *')].find(e => !e.children.length && clean(e.textContent) === 'Mercury');
  const chain = [];
  let n = mercury;
  for (let i = 0; i < 5 && n; i++) { chain.push({ tag: n.tagName.toLowerCase(), cls: clean(n.className), txt: clean(n.textContent).slice(0,40) }); n = n.parentElement; }
  const share = document.querySelector('button.share-button');
  return {
    chain,
    shareHtml: share ? share.outerHTML.slice(0, 220) : null,
    menuBtnHtml: document.querySelector('button.menu-btn')?.outerHTML.slice(0, 220),
  };
}
