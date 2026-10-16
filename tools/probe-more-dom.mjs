import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9599;
const userDataDir = path.resolve('.chrome-temp-probe-more');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log('🚀 启动 Chrome 进行 DOM 实测...');
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

    for (const slug of ['europa', 'io']) {
      console.log(`\n================== 测试天体: ${slug} ==================`);
      console.log(`正在导航到: https://eyes.nasa.gov/apps/solar-system/#/${slug}`);
      await send('Page.navigate', { url: `https://eyes.nasa.gov/apps/solar-system/#/${slug}` });

      // 等待加载屏幕消失与应用就绪
      const ready = await ev(`(async () => {
        for (let i = 0; i < 90; i++) {
          const ls = document.getElementById('loading-screen');
          const done = !ls || getComputedStyle(ls).display === 'none' || getComputedStyle(ls).opacity === '0';
          if (done && document.querySelectorAll('.pioneer-label-div').length > 0) return true;
          await new Promise(r => setTimeout(r, 1000));
        }
        return false;
      })()`);
      console.log('应用就绪状态:', ready);
      if (!ready) {
        console.warn('警告：页面未在预期时间内就绪，抓取当前页面诊断信息...');
      }

      await sleep(3000);

      // 分析详情面板和 More 按钮
      const preClick = await ev(`(() => {
        const detail = document.querySelector('#detail-panel, .detail-panel, [class*="detail"]');
        const moreBtn = document.querySelector('button.more-button, [class*="more-button"]');
        const descContainer = document.querySelector('.description, [class*="description"]');
        return {
          hasDetail: !!detail,
          detailClasses: detail?.className,
          hasMoreBtn: !!moreBtn,
          moreBtnText: moreBtn?.textContent?.trim(),
          moreBtnOuter: moreBtn?.outerHTML,
          hasDesc: !!descContainer,
          descOuter: descContainer?.outerHTML,
          descText: descContainer?.textContent?.trim()
        };
      })()`);
      console.log('点击前状态:', JSON.stringify(preClick, null, 2));

      // 点击 More 按钮
      const clickRes = await ev(`(() => {
        const btn = document.querySelector('button.more-button, [class*="more-button"]');
        if (btn) {
          btn.click();
          return { clicked: true, text: btn.textContent.trim() };
        }
        return { clicked: false };
      })()`);
      console.log('点击结果:', clickRes);

      await sleep(1500);

      // 点击后的详细 DOM 结构普查
      const postClick = await ev(`(() => {
        const descContainer = document.querySelector('.description, [class*="description"]');
        if (!descContainer) return { error: '找不到 description 容器' };

        // 遍历 descContainer 内部子节点
        const children = [...descContainer.children].map(c => ({
          tagName: c.tagName,
          className: c.className,
          outerHTML: c.outerHTML,
          textContent: c.textContent,
          nodeType: c.nodeType,
          childNodeTypes: [...c.childNodes].map(n => ({ type: n.nodeType, nodeName: n.nodeName, val: n.nodeValue }))
        }));

        const textNodes = [];
        const walk = (node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            const val = node.nodeValue;
            if (val && val.trim()) textNodes.push({ parentTag: node.parentElement?.tagName, parentClass: node.parentElement?.className, val });
          } else {
            for (const ch of node.childNodes) walk(ch);
          }
        };
        walk(descContainer);

        return {
          descOuterHTML: descContainer.outerHTML,
          childrenSummary: children,
          textNodes,
          paragraphs: [...descContainer.querySelectorAll('p')].map(p => ({
            outerHTML: p.outerHTML,
            innerHTML: p.innerHTML,
            textContent: p.textContent
          }))
        };
      })()`);

      console.log('点击后 description 容器 OuterHTML:');
      console.log(postClick.descOuterHTML);
      console.log('\n段落 (<p>) 分析:', JSON.stringify(postClick.paragraphs, null, 2));
      console.log('\n所有 Text Nodes:', JSON.stringify(postClick.textNodes, null, 2));

      // 对比 descriptions.en.json
      const descEn = JSON.parse(fs.readFileSync('data/source/descriptions.en.json', 'utf8'));
      const entityData = descEn[slug];
      if (entityData?.description) {
        console.log(`\n[descriptions.en.json 对比 - ${slug}]`);
        console.log('blurb:', entityData.description.blurb);
        console.log('more 长度:', entityData.description.more?.length);
        console.log('more 前 100 字:', entityData.description.more?.slice(0, 100));

        // 检查 postClick 中的文本与 more 的匹配关系
        if (postClick.paragraphs && postClick.paragraphs.length > 0) {
          postClick.paragraphs.forEach((p, idx) => {
            const cleanP = p.textContent.replace(/\s+/g, ' ').trim();
            const inMore = entityData.description.more.includes(cleanP);
            console.log(`段落 ${idx} (len ${cleanP.length}) 是否包含在 more 中:`, inMore);
            if (!inMore) {
              console.log(`段落 ${idx} 文本:`, cleanP.slice(0, 80));
            }
          });
        }
      }
    }

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
