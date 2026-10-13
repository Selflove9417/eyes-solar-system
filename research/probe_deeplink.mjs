() => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const labels = [...document.querySelectorAll('.pioneer-label-div')]
    .map((e) => ({ key: clean(e.className).replace(/no-select|clickable|hidden\S*|hiddenByLabelQuadtree/g, '').trim(), txt: clean(e.querySelector('.text')?.textContent) }));
  const detail = document.querySelector('.detail-panel, [class*=detail]');
  const clock = [...document.querySelectorAll('.date, .time, .meridiem, .rate')].map((e) => clean(e.textContent)).filter(Boolean);
  const breadcrumb = [...document.querySelectorAll('nav.breadcrumb *')].filter((e) => !e.children.length).map((e) => clean(e.textContent)).filter(Boolean);
  return {
    url: location.href,
    pageTitle: document.title,
    breadcrumb: [...new Set(breadcrumb)],
    clock: [...new Set(clock)],
    detailTexts: detail ? [...new Set([...detail.querySelectorAll('*')].filter((e) => !e.children.length).map((e) => clean(e.textContent)).filter(Boolean))].slice(0, 40) : null,
    labels,
    domNodes: document.querySelectorAll('*').length,
  };
}
