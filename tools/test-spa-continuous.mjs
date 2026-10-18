import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { getExpectedBlurb, normalizeUrl, namesData } from './test-more-e2e.mjs';

const root = path.resolve('.');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9599;
const userDataDir = path.resolve('.chrome-temp-test-spa');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runSpaContinuousTest() {
  console.log('====================================================');
  console.log('🧪 SPA 真实单次注入连续路由跳转与防串译回归测试');
  console.log('====================================================\n');

  const content = fs.readFileSync(path.join(root, 'extension/content.js'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'extension/manifest.json'), 'utf8'));
  const dataFiles = manifest.web_accessible_resources
    .flatMap((r) => r.resources)
    .filter((p) => p.startsWith('data/'));
  const table = dataFiles.map(
    (rel) => `p.endsWith('${rel.split('/').pop()}') ? ${JSON.stringify(fs.readFileSync(path.join(root, rel), 'utf8'))}`
  );

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

    // 导航序列：带链接 -> 带链接 -> 带链接 -> 普通实体 -> 普通实体
    const navigationSteps = [
      { slug: 'sc_osiris_rex', hasLink: true },
      { slug: 'sc_dart', hasLink: true },
      { slug: 'sc_lucy', hasLink: true },
      { slug: 'europa', hasLink: false },
      { slug: 'io', hasLink: false }
    ];

    // 1. 初次打开页面：首个实体
    const initialSlug = navigationSteps[0].slug;
    console.log(`▶ 初始载入天体: ${initialSlug}...`);
    await send('Page.navigate', { url: `https://eyes.nasa.gov/apps/solar-system/#/${initialSlug}` });

    // 等待首个实体原生加载
    for (let i = 0; i < 40; i++) {
      const isReady = await ev(`(() => {
        const ls = document.getElementById('loading-screen');
        const loading = ls && getComputedStyle(ls).display !== 'none' && getComputedStyle(ls).opacity !== '0';
        const blurbEl = document.querySelector('.description .copy:not(.more)');
        return !loading && blurbEl && blurbEl.textContent.trim().length > 10;
      })()`);
      if (isReady) break;
      await sleep(1000);
    }

    // 2. 单次注入扩展
    console.log('▶ 执行单次注入扩展 content.js (后续连续跳转不再重新注入)...');
    await ev(bundle);
    await sleep(2500);

    let allPassed = true;

    for (let stepIdx = 0; stepIdx < navigationSteps.length; stepIdx++) {
      const step = navigationSteps[stepIdx];
      const slug = step.slug;
      const expectedMeta = namesData.entities?.[slug];
      const expectedBlurb = getExpectedBlurb(slug);

      if (stepIdx > 0) {
        console.log(`\n▶ [SPA 连续跳转 ${stepIdx + 1}/${navigationSteps.length}] 改变 hash 到: #/${slug}...`);
        await ev(`location.hash = '#/${slug}'`);
        
        // 监控过渡期：绝不允许在此期间出现串译（即上一个实体的 DOM 残留被注入了当前实体的译文，或当前实体的 DOM 被注入了上一个实体的译文）
        let transitionDetected = false;
        for (let wait = 0; wait < 35; wait++) {
          await sleep(500);
          const domCheck = await ev(`(() => {
            const blurbEl = document.querySelector('.description .copy:not(.more)');
            const titleEl = document.querySelector('.title.long-title, .semi.title.long-title');
            const anchor = blurbEl ? blurbEl.querySelector('a') : null;
            return {
              text: blurbEl ? blurbEl.textContent.trim() : '',
              title: titleEl ? titleEl.textContent.trim() : '',
              hasAnchor: !!anchor,
              anchorHref: anchor ? anchor.href : '',
              anchorText: anchor ? anchor.textContent.trim() : '',
              childrenCount: blurbEl ? blurbEl.children.length : 0
            };
          })()`);

          // 当标题或简介文本更新为当前天体时，判定过渡完成
          const isCurrentZhTitle = expectedMeta?.zh && domCheck.title.includes(expectedMeta.zh);
          const isCurrentEnTitle = expectedMeta?.en && domCheck.title.includes(expectedMeta.en);
          const containsHan = /[\u4e00-\u9fff]/.test(domCheck.text);

          if (isCurrentZhTitle || (isCurrentEnTitle && containsHan)) {
            transitionDetected = true;
            break;
          }
        }

        if (!transitionDetected) {
          console.error(`  ❌ 天体 ${slug} SPA 视图过渡超时`);
          allPassed = false;
          continue;
        }
      }

      // 等待 DOM 汉化稳定
      await sleep(1500);

      const finalState = await ev(`(() => {
        const blurbEl = document.querySelector('.description .copy:not(.more)');
        const titleEl = document.querySelector('.title.long-title, .semi.title.long-title');
        const anchor = blurbEl ? blurbEl.querySelector('a') : null;
        return {
          title: titleEl ? titleEl.textContent.trim() : '',
          blurbText: blurbEl ? blurbEl.textContent.trim() : '',
          hasAnchor: !!anchor,
          anchorHref: anchor ? anchor.href : '',
          anchorText: anchor ? anchor.textContent.trim() : '',
          childrenCount: blurbEl ? blurbEl.children.length : 0
        };
      })()`);

      console.log(`  - 当前天体标识: ${slug}`);
      console.log(`  - 页面标题: "${finalState.title}"`);
      console.log(`  - 简介文本: "${finalState.blurbText.slice(0, 60)}..."`);

      const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const stripTags = (s) => (s || '').replace(/<[^>]+>/g, '').trim();
      const actClean = clean(finalState.blurbText);
      const expClean = clean(stripTags(expectedBlurb.zh));

      // 检验 1: 文本完全匹配预期实体，防串译
      if (actClean !== expClean) {
        console.error(`  ❌ 简介文本与预期译文不匹配 (可能发生串译或未汉化):\n    预期: "${expClean}"\n    实际: "${actClean}"`);
        allPassed = false;
      } else {
        console.log(`  ✅ 简介汉化严格匹配词库 (无串译)`);
      }

      // 检验 2: 超链接保真核验
      if (step.hasLink) {
        if (!finalState.hasAnchor) {
          console.error(`  ❌ 预期保留超链接 <a>，但未找到`);
          allPassed = false;
        } else {
          const expHrefMatch = expectedBlurb.en.match(/href=['"]([^'"]+)['"]/i);
          const expHref = expHrefMatch ? expHrefMatch[1] : '';
          const normAct = normalizeUrl(finalState.anchorHref);
          const normExp = normalizeUrl(expHref);
          if (normAct !== normExp) {
            console.error(`  ❌ 超链接 href 不匹配: 预期 "${normExp}", 实际 "${normAct}"`);
            allPassed = false;
          } else {
            console.log(`  ✅ 超链接节点与 href 严格保真 ("${normAct}")`);
          }
        }
      } else {
        // 普通简介无 <a>
        if (finalState.hasAnchor) {
          console.error(`  ❌ 普通实体意外检测到 <a> 标签 (发生串译残留)`);
          allPassed = false;
        } else {
          console.log(`  ✅ 普通实体未受多余 <a> 标签污染`);
        }
      }
    }

    console.log('\n====================================================');
    console.log(`SPA 连续导航防串译测试: ${allPassed ? '✅ 全部通过' : '❌ 存在失败项'}`);
    console.log('====================================================');

    try { ws.close(); } catch {}
    return allPassed;
  } finally {
    proc.kill();
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
  }
}

runSpaContinuousTest()
  .then((ok) => {
    if (!ok) process.exit(1);
  })
  .catch((err) => {
    console.error('Fatal in test-spa-continuous:', err);
    process.exit(1);
  });
