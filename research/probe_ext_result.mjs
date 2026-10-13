() => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(4000);
  const labels = [...document.querySelectorAll('.pioneer-label-div .text')].map((e) => clean(e.textContent));
  const rail = [...document.querySelectorAll('[aria-label]')].map((e) => clean(e.getAttribute('aria-label'))).filter(Boolean);
  const menuBtn = clean(document.querySelector('button.menu-btn')?.textContent);
  const shareBtn = clean(document.querySelector('button.share-button')?.textContent);
  const time = clean(document.querySelector('.rate')?.textContent);
  const live = clean(document.querySelector('[class*=live]')?.textContent);
  document.querySelector('button.menu-btn')?.click();
  await wait(2500);
  const menuTexts = [...new Set([...document.querySelectorAll('.menu-container *')]
    .filter((e) => !e.children.length).map((e) => clean(e.textContent)).filter(Boolean))].slice(0, 26);
  return {
    title: document.title,
    extensionLoaded: !!window.__eyesZh,
    labelsChinese: labels.filter((t) => /[一-鿿]/.test(t)),
    labelsEnglishLeft: labels.filter((t) => !/[一-鿿]/.test(t)),
    menuBtn, shareBtn, time, live,
    railChinese: rail.filter((t) => /[一-鿿]/.test(t)).slice(0, 14),
    railEnglishLeft: rail.filter((t) => !/[一-鿿]/.test(t) && /[a-z]{3}/.test(t)).slice(0, 14),
    menuTexts,
  };
}
