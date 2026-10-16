import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve('.');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const CDP_PORT = 9598;
const userDataDir = path.resolve('.chrome-temp-test-more');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const moreJsonPath = path.join(root, 'data/more.zh.json');
export const moreData = JSON.parse(fs.readFileSync(moreJsonPath, 'utf8'));

/**
 * 严格比对详情面板长文展开汉化质量
 * 1. 展开按钮文案必须为 "收起"
 * 2. 收起按钮文案必须为 "阅读更多"
 * 3. 一句话简介必须包含汉字
 * 4. 展开文本段落数与 data/more.zh.json 完全一致
 * 5. 每一段中文必须与预期译文完整匹配（正确处理 [##moon_count##] 动态占位符，不硬编码）
 * 6. 展开文本中绝不能残留原始英文完整句子或连续英文残留
 */
export function verifyMoreExpansion({
  actualMoreText,
  blurbText,
  slug,
  entry,
  btnAfterMore,
  btnAfterCollapse
}) {
  const errors = [];
  const warnings = [];

  // 1. 展开按钮文案校验
  if (btnAfterMore !== '收起') {
    errors.push(`展开按钮文案错误: 预期 "收起", 实际 "${btnAfterMore}"`);
  }

  // 2. 收起按钮文案校验
  if (btnAfterCollapse !== '阅读更多') {
    errors.push(`收起后按钮文案错误: 预期 "阅读更多", 实际 "${btnAfterCollapse}"`);
  }

  // 3. 展开文本存在性
  if (!actualMoreText || !actualMoreText.trim()) {
    errors.push(`长文展开区域文本为空`);
    return { ok: false, errors, warnings };
  }

  // 4. 一句话简介汉化校验
  const han = /[\u4e00-\u9fff]/;
  if (!blurbText || !han.test(blurbText)) {
    errors.push(`一句话简介未完成汉化或未含汉字: "${blurbText || ''}"`);
  }

  // 5. 预期词条比对
  if (!entry || !Array.isArray(entry.paragraphs) || entry.paragraphs.length === 0) {
    errors.push(`词库中未找到 ${slug} 的预期段落配置`);
    return { ok: false, errors, warnings };
  }

  const expectedParagraphs = entry.paragraphs;
  const actualParagraphs = actualMoreText.split(/\n+/).map((s) => s.trim()).filter(Boolean);

  if (actualParagraphs.length !== expectedParagraphs.length) {
    errors.push(`段落数量不一致: 预期 ${expectedParagraphs.length} 段, 实际呈现 ${actualParagraphs.length} 段`);
  }

  for (let idx = 0; idx < expectedParagraphs.length; idx++) {
    const expP = expectedParagraphs[idx];
    const actP = actualParagraphs[idx] || '';

    // 5a. 处理动态占位符（如 [##moon_count##]）：转为动态数字正则匹配，不硬编码卫星数量
    const escapedExpectedZh = expP.zh
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\\\[##moon_count##\\\]/g, '(\\d+)');
    const paragraphRegex = new RegExp(`^${escapedExpectedZh}$`);

    if (!paragraphRegex.test(actP)) {
      errors.push(`第 ${idx + 1} 段内容与预期译文不匹配:
  预期: "${expP.zh}"
  实际: "${actP}"`);
    } else if (expP.zh.includes('[##moon_count##]')) {
      const match = actP.match(paragraphRegex);
      const moonCount = match ? match[1] : null;
      if (!moonCount || isNaN(Number(moonCount))) {
        errors.push(`第 ${idx + 1} 段动态占位符替换失败，未提取到有效数字`);
      }
    }

    // 5b. 检测原始英文长文是否仍有未替换的内容
    // 检查一：原英文段落中的完整英文句子（按标点切分，长度 >= 15）是否仍残留出现在展开长文中
    const enSentences = (expP.en || '')
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 15);

    for (const enSent of enSentences) {
      if (actualMoreText.includes(enSent)) {
        errors.push(`第 ${idx + 1} 段检测到残留未替换的原始英文句子: "${enSent}"`);
      }
    }

    // 检查二：中文段落中是否混入了连续英文单词 (>= 4 词)
    const residue = actP.match(/[a-zA-Z]{2,}(?:\s+[a-zA-Z]{2,}){3,}/);
    if (residue) {
      errors.push(`第 ${idx + 1} 段检测到残留连续英文片段: "${residue[0]}"`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    totalExpected: expectedParagraphs.length,
    totalActual: actualParagraphs.length,
    actualParagraphs
  };
}

// 确保截图临时目录存在
const shotsDir = path.join(root, 'shots', '.tmp');
fs.mkdirSync(shotsDir, { recursive: true });

async function runE2E() {
  const cliArgs = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const routes = cliArgs.length > 0
    ? cliArgs
    : ['europa', 'io', 'ganymede', 'callisto'];

  console.log('====================================================');
  console.log('🧪 浏览器汉化扩展 More 长文展开端到端测试 (加固版)');
  console.log(`测试路由: ${routes.join(', ')}`);
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

      // 1. 点击展开
      await ev(`document.querySelector('button.more-button')?.click()`);
      await sleep(1000);

      const btnAfterMore = await ev(`(() => {
        const btn = document.querySelector('button.more-button');
        return btn ? btn.textContent.trim() : '';
      })()`);

      // 2. 点击收起
      await ev(`document.querySelector('button.more-button')?.click()`);
      await sleep(1000);

      const btnAfterCollapse = await ev(`(() => {
        const btn = document.querySelector('button.more-button');
        return btn ? btn.textContent.trim() : '';
      })()`);

      // 3. 再次点击展开以便截取展开后长文截图和提取实际 DOM 文本
      await ev(`document.querySelector('button.more-button')?.click()`);
      await sleep(1000);

      // 提取 DOM 中的简介文本和展开长文文本
      const domData = await ev(`(() => {
        const blurbEl = document.querySelector('.description .copy:not(.more)');
        const moreEl = document.querySelector('.description .copy.more');
        return {
          blurbText: blurbEl ? blurbEl.textContent.trim() : '',
          moreText: moreEl ? moreEl.textContent.trim() : ''
        };
      })()`);

      // 截取截图保存至 shots/.tmp/
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      const shotFile = path.join(shotsDir, `more-${route}.png`);
      fs.writeFileSync(shotFile, Buffer.from(shot.data, 'base64'));

      // 执行严谨的比对校验
      const entry = moreData.entries[route];
      const checkRes = verifyMoreExpansion({
        actualMoreText: domData.moreText,
        blurbText: domData.blurbText,
        slug: route,
        entry,
        btnAfterMore,
        btnAfterCollapse
      });

      console.log(`  - 一句话简介汉化: ${domData.blurbText ? '✅ 已呈现' : '❌ 空'}`);
      console.log(`  - 点击 More 后按钮文案: "${btnAfterMore}" (${btnAfterMore === '收起' ? '✅ 正确' : '❌ 异常'})`);
      console.log(`  - 点击收起后按钮文案: "${btnAfterCollapse}" (${btnAfterCollapse === '阅读更多' ? '✅ 正确' : '❌ 异常'})`);
      console.log(`  - 展开长文段落校验: ${checkRes.ok ? '✅ 完全符合预期译文' : '❌ 校验失败'}`);
      if (checkRes.actualParagraphs && checkRes.actualParagraphs[0]) {
        console.log(`  - 长文译文首段预览: "${checkRes.actualParagraphs[0].slice(0, 60)}..."`);
      }
      if (!checkRes.ok) {
        console.error(`  - 错误详情:`);
        checkRes.errors.forEach((err) => console.error(`    ❌ ${err}`));
      }
      console.log(`  - 验收截图已保存: ${shotFile}`);

      results.push({
        route,
        ok: checkRes.ok,
        totalParagraphs: checkRes.totalActual || 0,
        errors: checkRes.errors,
        shotFile
      });
    }

    console.log('\n================ 端到端测试汇总 ================');
    let allOk = true;
    for (const r of results) {
      const statusIcon = r.ok ? '✅' : '❌';
      console.log(`${statusIcon} ${r.route.padEnd(12)} : ${r.ok ? '全部通过' : '失败 (' + r.errors.length + ' 项错误)'} (段落数 ${r.totalParagraphs})`);
      if (!r.ok) allOk = false;
    }
    console.log('================================================');

    ws.close();
    if (!allOk) {
      process.exit(1);
    }
  } finally {
    proc.kill();
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
  }
}

async function main() {
  if (process.argv.includes('--negative')) {
    const { runNegativeTests } = await import('./test-more-negative.mjs');
    await runNegativeTests();
    return;
  }
  await runE2E();
}

const isDirectRun = process.argv[1] && process.argv[1].endsWith('test-more-e2e.mjs');
if (isDirectRun) {
  main().catch((err) => {
    console.error('Fatal error in test-more-e2e:', err);
    process.exit(1);
  });
}
