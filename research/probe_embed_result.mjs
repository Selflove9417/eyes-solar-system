() => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 100; i++) {
    if (document.title === 'PROBE_DONE') break;
    await wait(1000);
  }
  return { title: document.title, log: document.getElementById('log').textContent };
}
