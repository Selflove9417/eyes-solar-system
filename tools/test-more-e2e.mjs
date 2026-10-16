import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve('.');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9598;
const userDataDir = path.resolve('.chrome-temp-test-more');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const routes = process.argv.slice(2).length > 0
  ? process.argv.slice(2)
  : ['europa', 'io', 'ganymede', 'callisto'];

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

// 确保截图临时目录存在
const shotsDir = path.join(root, 'shots', '.tmp');
fs.mkdirSync(shotsDir, { recursive: true });

async function main() {
  console.log('====================================================');
  console.log('🧪 浏览器汉化扩展 More 长文展开端到端测试');
  console.log(`测试路由: ${routes.join(', ')}`);
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
    if (!wsUrl) throw new Error('无法连接到 Chrome CDP 端口');

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

    const results = [];

    for (const route of routes) {
      console.log(`\n▶ 正在测试天体路由: ${route}...`);
      await send('Page.navigate', { url: `https://eyes.nasa.gov/apps/solar-system/#/${route}` });

      const ready = await ev(`(async () => {
        for (let i = 0; i < 90; i++) {
          const ls = document.getElementById('loading-screen');
          const done = !ls || getComputedStyle(ls).display === 'none' || getComputedStyle(ls).opacity === '0';
          if (done && document.querySelectorAll('.pioneer-label-div').length > 0) return true;
          await new Promise(r => setTimeout(r, 1000));
        }
        return false;
      })()`);

      if (!ready) {
        console.warn(`⚠️ 路由 ${route} 页面加载超时`);
        results.push({ route, ok: false, reason: '加载超时' });
        continue;
      }

      await sleep(2000);

      // 注入汉化扩展 content.js
      await ev(bundle);
      await sleep(2500);

      // 点击 Read More 展开
      const clickRes = await ev(`(() => {
        const btn = document.querySelector('button.more-button, [class*="more-button"]');
        if (btn) {
          btn.click();
          return { clicked: true, text: btn.textContent.trim() };
        }
        return { clicked: false };
      })()`);

      await sleep(2000);

      // 检测详情面板、一句话简介、展开长文的汉化状况
      const status = await ev(`(() => {
        const han = /[\\u4e00-\\u9fff]/;
        const blurbEl = document.querySelector('.description .copy:not(.more)');
        const moreEl = document.querySelector('.description .copy.more');
        const moreBtn = document.querySelector('button.more-button');

        const blurbText = blurbEl ? blurbEl.textContent.trim() : '';
        const moreText = moreEl ? moreEl.textContent.trim() : '';

        // 统计段落（按换行符或纯文本）
        const paragraphs = moreText.split(/\\n+/).map(s => s.trim()).filter(Boolean);
        const zhParagraphs = paragraphs.filter(p => han.test(p));
        const enParagraphs = paragraphs.filter(p => !han.test(p));

        return {
          blurbText,
          blurbIsZh: han.test(blurbText),
          moreIsZh: han.test(moreText),
          totalParagraphs: paragraphs.length,
          zhParagraphsCount: zhParagraphs.length,
          enParagraphsCount: enParagraphs.length,
          moreBtnText: moreBtn ? moreBtn.textContent.trim() : '',
          moreTextPreviewZh: zhParagraphs[0]?.slice(0, 60) || '',
          enParagraphsPreview: enParagraphs.slice(0, 2)
        };
      })()`);

      // 截取截图保存至 shots/.tmp/
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      const shotFile = path.join(shotsDir, `more-${route}.png`);
      fs.writeFileSync(shotFile, Buffer.from(shot.data, 'base64'));

      const isAllZh = status.totalParagraphs > 0 && status.enParagraphsCount === 0 && status.moreIsZh;
      console.log(`  - 一句话简介汉化: ${status.blurbIsZh ? '✅ 中文' : '❌ 仍为英文'}`);
      console.log(`  - 按钮文案: "${status.moreBtnText}"`);
      console.log(`  - 长文段落数: 总计 ${status.totalParagraphs}，中文 ${status.zhParagraphsCount}，未翻译英文 ${status.enParagraphsCount}`);
      if (status.moreTextPreviewZh) {
        console.log(`  - 长文译文预览: "${status.moreTextPreviewZh}..."`);
      }
      if (status.enParagraphsCount > 0) {
        console.log(`  - 未翻译段落样例:`, status.enParagraphsPreview);
      }
      console.log(`  - 验收截图已保存: ${shotFile}`);

      results.push({
        route,
        ok: isAllZh,
        blurbIsZh: status.blurbIsZh,
        totalParagraphs: status.totalParagraphs,
        zhCount: status.zhParagraphsCount,
        enCount: status.enParagraphsCount,
        preview: status.moreTextPreviewZh,
        shotFile
      });
    }

    console.log('\n================ 端到端测试汇总 ================');
    for (const r of results) {
      const statusIcon = r.ok ? '✅' : '❌';
      console.log(`${statusIcon} ${r.route.padEnd(12)} : 未翻译英文段落数 = ${r.enCount} (总段落 ${r.totalParagraphs})`);
    }
    console.log('================================================');

    ws.close();
  } finally {
    proc.kill();
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
