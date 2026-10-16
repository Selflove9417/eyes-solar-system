import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve('.');
const HTTP_PORT = 8890;
const CDP_PORT = 9458;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pages = [
  'index.html', 'explore.html', 'bodies.html', 'missions.html',
  'glossary.html', 'guide.html', 'extension.html', 'about.html',
  'mars.html', 'jwst.html', 'saturn.html', 'voyager-1.html'
];

async function launchChrome() {
  const proc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${CDP_PORT}`,
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--window-size=1440,900'
  ]);
  await sleep(1500);
  return proc;
}

async function getWsUrl() {
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
      const targets = await res.json();
      const page = targets.find((t) => t.type === 'page');
      if (page && page.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(200);
  }
  throw new Error('Failed to find page target');
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 0;
    this.callbacks = new Map();
  }
  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    return new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const { resolve, reject } = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) reject(msg.error);
          else resolve(msg.result);
        }
      };
    });
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expr) {
    const res = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return res.result?.value;
  }
  close() {
    this.ws.close();
  }
}

console.log('=== 全站真实渲染 Computed Style 对比度实测 ===\n');

const chromeProc = await launchChrome();
const wsUrl = await getWsUrl();
const client = new CDPClient(wsUrl);
await client.connect();

await client.send('Page.enable');
await client.send('Runtime.enable');

const allResults = {};

for (const p of pages) {
  const url = `http://127.0.0.1:${HTTP_PORT}/${p}`;
  await client.send('Page.navigate', { url });
  await sleep(1200);

  const measurements = await client.evaluate(`
    (() => {
      function parseRgb(colorStr) {
        if (!colorStr) return { r: 3, g: 7, b: 18, a: 1 };
        const m = colorStr.match(/rgba?\\((\\d+)[,\\s]+(\\d+)[,\\s]+(\\d+)(?:[,\\s/]+([\\d.]+))?\\)/);
        if (!m) return { r: 3, g: 7, b: 18, a: 1 };
        return {
          r: parseInt(m[1], 10),
          g: parseInt(m[2], 10),
          b: parseInt(m[3], 10),
          a: m[4] !== undefined ? parseFloat(m[4]) : 1
        };
      }

      function blend(top, bottom) {
        const a = top.a + bottom.a * (1 - top.a);
        if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
        const r = Math.round((top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / a);
        const g = Math.round((top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / a);
        const b = Math.round((top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / a);
        return { r, g, b, a };
      }

      function getEffectiveBg(el) {
        const bodyBg = parseRgb(window.getComputedStyle(document.body).backgroundColor) || { r: 3, g: 7, b: 18, a: 1 };
        let cur = el;
        const stack = [];
        while (cur && cur !== document.documentElement) {
          const style = window.getComputedStyle(cur);
          const bg = parseRgb(style.backgroundColor);
          if (bg.a > 0) stack.unshift(bg);
          cur = cur.parentElement;
        }
        let result = bodyBg;
        for (const layer of stack) {
          result = blend(layer, result);
        }
        return result;
      }

      function sRgbToLinear(c) {
        const val = c / 255;
        return val <= 0.04045 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
      }

      function getLuminance(rgb) {
        return 0.2126 * sRgbToLinear(rgb.r) + 0.7152 * sRgbToLinear(rgb.g) + 0.0722 * sRgbToLinear(rgb.b);
      }

      function getRatio(fgRgb, bgRgb) {
        const l1 = getLuminance(fgRgb);
        const l2 = getLuminance(bgRgb);
        const top = Math.max(l1, l2);
        const bottom = Math.min(l1, l2);
        return ((top + 0.05) / (bottom + 0.05)).toFixed(2);
      }

      const targets = [
        { type: '正文文本 (h1/h2/p)', selector: 'h1, h2, main p' },
        { type: '次级说明 (--fg-dim / lede)', selector: '.lede, .feature-kicker, .entry-desc, .text-block-content' },
        { type: '灰色辅助字 (--fg-muted / src)', selector: '.src, .note-dim, .footer-text, .entry-en, [style*="fg-muted"]' },
        { type: '文字链接 (a)', selector: 'main a:not(.btn-primary):not(.btn)' },
        { type: '按钮文字 (.btn-primary)', selector: '.btn-primary, .btn' }
      ];

      const results = [];
      for (const t of targets) {
        const el = document.querySelector(t.selector);
        if (!el) continue;
        const cs = window.getComputedStyle(el);
        const fg = parseRgb(cs.color);
        const bg = getEffectiveBg(el);
        const ratio = parseFloat(getRatio(fg, bg));
        const wcagAA = ratio >= 4.5;
        const wcagAAA = ratio >= 7.0;
        results.push({
          element: t.type,
          tag: el.tagName.toLowerCase() + (el.className ? '.' + el.className.split(' ')[0] : ''),
          fgColor: cs.color,
          bgColor: 'rgb(' + bg.r + ', ' + bg.g + ', ' + bg.b + ')',
          ratio: ratio + ':1',
          level: wcagAAA ? 'AAA' : (wcagAA ? 'AA' : 'FAIL')
        });
      }
      return results;
    })()
  `);

  allResults[p] = measurements;
}

client.close();
chromeProc.kill();

const outPath = path.join(root, 'artifacts', 'contrast-audit.json');
fs.writeFileSync(outPath, JSON.stringify(allResults, null, 2), 'utf8');

// Print formatted Markdown tables
console.log('| 页面 | 元素类别 | 渲染选择器 | 真实前景色 (Computed) | 真实背景色 (Computed) | 对比度 | WCAG 等级 |');
console.log('| :--- | :--- | :--- | :--- | :--- | :--- | :--- |');

for (const [p, items] of Object.entries(allResults)) {
  for (const item of items) {
    console.log(`| \`${p}\` | ${item.element} | \`${item.tag}\` | \`${item.fgColor}\` | \`${item.bgColor}\` | **${item.ratio}** | ${item.level} |`);
  }
}

console.log('\n✅ 真实渲染对比度测量完成，结果已保存至 artifacts/contrast-audit.json');
