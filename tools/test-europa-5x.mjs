import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve('.');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9595;
const userDataDir = path.resolve('.chrome-temp-test-europa-5x');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const content = fs.readFileSync(path.join(root, 'extension/content.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'extension/manifest.json'), 'utf8'));
const dataFiles = manifest.web_accessible_resources.flatMap((r) => r.resources)
  .filter((p) => p.startsWith('data/'));
const table = dataFiles.map((rel) =>
  `p.endsWith('${rel.split('/').pop()}') ? ${JSON.stringify(fs.readFileSync(path.join(root, rel), 'utf8'))}`);

const bundle = `
window.__eyesZh = false;
Object.defineProperty(window, 'chrome', {
  configurable: true,
  get: () => ({ runtime: { getURL: (p) => 'data:application/json;charset=utf-8,' + encodeURIComponent(
      ${table.join('\n      : ')}
      : ({})) } }),
});
${content}
'content.js injected'`;

async function main() {
  console.log('====================================================');
  console.log('🔄 木卫二 (europa) 按钮文案连跑 5 次稳定性专项测试');
  console.log('====================================================\n');

  const proc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--window-size=1600,900'
  ]);

  try {
    let wsUrl = null;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
        const targets = await res.json();
        const page = targets.find((t) => t.type === 'page');
        if (page && page.webSocketDebuggerUrl) {
          wsUrl = page.webSocketDebuggerUrl;
          break;
        }
      } catch {}
      await sleep(300);
    }

    const ws = new WebSocket(wsUrl);
    await new Promise((r) => (ws.onopen = r));
    let id = 0;
    const pending = new Map();
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) {
        pending.get(m.id)(m);
        pending.delete(m.id);
      }
    };
    const send = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const i = ++id;
        pending.set(i, (m) => (m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)));
        ws.send(JSON.stringify({ id: i, method, params }));
      });

    const ev = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('CDP eval error: ' + JSON.stringify(r.exceptionDetails));
      return r.result.value;
    };

    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });

    let passCount = 0;

    for (let round = 1; round <= 5; round++) {
      process.stdout.write(`第 ${round}/5 次测试 europa ... `);
      await send('Page.navigate', { url: 'https://eyes.nasa.gov/apps/solar-system/#/europa' });

      await ev(`(async () => {
        for (let i = 0; i < 90; i++) {
          const ls = document.getElementById('loading-screen');
          const done = !ls || getComputedStyle(ls).display === 'none' || getComputedStyle(ls).opacity === '0';
          if (done && document.querySelectorAll('.pioneer-label-div').length > 0) return true;
          await new Promise(r => setTimeout(r, 1000));
        }
        return false;
      })()`);

      await sleep(1500);
      await ev(bundle);
      await sleep(2000);

      // 点击展开
      await ev(`document.querySelector('button.more-button')?.click()`);
      await sleep(1000);

      const btnAfterMore = await ev(`(() => {
        const btn = document.querySelector('button.more-button');
        return btn ? btn.textContent.trim() : '';
      })()`);

      // 点击收起
      await ev(`document.querySelector('button.more-button')?.click()`);
      await sleep(1000);

      const btnAfterCollapse = await ev(`(() => {
        const btn = document.querySelector('button.more-button');
        return btn ? btn.textContent.trim() : '';
      })()`);

      if (btnAfterMore === '收起' && btnAfterCollapse === '阅读更多') {
        passCount++;
        console.log(`✅ 通过 (展开: "${btnAfterMore}", 收起: "${btnAfterCollapse}")`);
      } else {
        console.log(`❌ 异常 (展开: "${btnAfterMore}", 收起: "${btnAfterCollapse}")`);
      }
    }

    console.log('\n================ 5 次连跑结果汇总 ================');
    console.log(`总轮次: 5，通过轮次: ${passCount} / 5`);
    console.log(passCount === 5 ? '🎉 5 次连跑全部为"收起"！稳定性 100% 通过！' : '❌ 存在失败轮次！');
    console.log('==================================================');

    ws.close();
  } finally {
    proc.kill();
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
  }
}

main().catch(console.error);
