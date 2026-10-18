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

const namesJsonPath = path.join(root, 'data/names.zh.json');
export const namesData = JSON.parse(fs.readFileSync(namesJsonPath, 'utf8'));

const descJsonPath = path.join(root, 'data/source/descriptions.en.json');
export const descData = JSON.parse(fs.readFileSync(descJsonPath, 'utf8'));

const missionsJsonPath = path.join(root, 'data/missions.zh.json');
export const missionsData = JSON.parse(fs.readFileSync(missionsJsonPath, 'utf8'));

const bodiesJsonPath = path.join(root, 'data/bodies.zh.json');
export const bodiesData = JSON.parse(fs.readFileSync(bodiesJsonPath, 'utf8'));

export const LINKED_ENTITIES = [
  'sc_osiris_rex',
  'sc_dart',
  'sc_lucy',
  'sc_dawn',
  'sc_psyche',
  'sc_stardust',
  'sc_deep_impact',
  'sc_galileo',
  'sc_rosetta'
];

export function getExpectedBlurb(slug) {
  const mis = missionsData.missions?.find((m) => m.id === slug);
  if (mis && mis.zhBlurb) {
    return {
      en: mis.enBlurb,
      zh: mis.zhBlurb,
      hasLink: /<a[^>]*>/i.test(mis.enBlurb || '')
    };
  }
  const body = bodiesData.bodies?.find((b) => b.id === slug);
  if (body && body.zhl) {
    return {
      en: body.en,
      zh: body.zhl,
      hasLink: /<a[^>]*>/i.test(body.en || '')
    };
  }
  return null;
}

/**
 * 严格比对详情面板长文展开汉化质量
 * 1. 展开按钮文案必须为 "收起"
 * 2. 收起按钮文案必须为 "阅读更多"
 * 3. 一句话简介必须包含汉字且与词库严格全文匹配
 * 4. 带超链接简介必须保持 <a> 节点、有效 href、正确包裹对应词汇或航天器名称且无英文句子残留
 * 5. 展开文本段落数与 data/more.zh.json 完全一致
 * 6. 每一段中文必须与预期译文完整匹配（正确处理 [##moon_count##] 动态占位符，不硬编码）
 * 7. 展开文本中绝不能残留原始英文完整句子或连续英文残留
 */
export function verifyMoreExpansion({
  actualMoreText,
  blurbText,
  blurbDom,
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

  // 4. 一句话简介汉化与超链接深度保真核验
  const han = /[\u4e00-\u9fff]/;
  if (!blurbText || !han.test(blurbText)) {
    errors.push(`一句话简介未完成汉化或未含汉字: "${blurbText || ''}"`);
  }

  const expectedBlurb = getExpectedBlurb(slug);
  if (expectedBlurb?.zh && blurbDom) {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const stripTags = (s) => (s || '').replace(/<[^>]+>/g, '').trim();
    const expClean = clean(stripTags(expectedBlurb.zh));
    const actClean = clean(blurbText);

    // 4a. 严格全文比对（必须与对应词库中文译文一致，归一化空白后相等）
    if (actClean !== expClean) {
      errors.push(`一句话简介与词库中文译文不一致:\n  预期: "${expClean}"\n  实际: "${actClean}"`);
    }

    // 4b. 链接保真核验
    if (expectedBlurb.hasLink) {
      if (!blurbDom.hasAnchor) {
        errors.push(`简介链接保真失败: 预期包含 <a> 元素，实际未找到`);
      } else {
        const expHrefMatch = expectedBlurb.en.match(/href=['"]([^'"]+)['"]/i);
        const expHref = expHrefMatch ? expHrefMatch[1] : '';
        if (expHref) {
          const normExp = expHref.replace(/\/+$/, '');
          const normAct = (blurbDom.anchorHref || '').replace(/\/+$/, '');
          if (!normAct.includes(normExp) && !normExp.includes(normAct)) {
            errors.push(`简介超链接 href 不匹配: 预期包含 "${normExp}", 实际 "${normAct}"`);
          }
        }
        if (!blurbDom.anchorText || !blurbDom.anchorText.trim()) {
          errors.push(`简介超链接锚点文本为空`);
        }
      }
    }

    // 4c. 反向残留核验：绝不能残留未经汉化的原始长英文句子
    if (expectedBlurb.en) {
      const enSentences = stripTags(expectedBlurb.en)
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 15);

      for (const enSent of enSentences) {
        if (actClean.includes(enSent)) {
          errors.push(`一句话简介检测到残留未替换的原始英文句子: "${enSent}"`);
        }
      }
    }
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
  const routes = process.argv.includes('--linked')
    ? LINKED_ENTITIES
    : (cliArgs.length > 0 ? cliArgs : ['europa', 'io', 'ganymede', 'callisto']);

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
      const slug = route.split('/').pop();
      const entityMeta = namesData.entities?.[slug];
      const expectedEn = entityMeta?.en;
      const expectedZh = entityMeta?.zh;
      const expectedBlurbEn = descData[slug]?.description?.blurb;

      console.log(`\n▶ 正在测试天体路由: ${route} (预期实体: ${slug} | ${expectedEn || '未知'} / ${expectedZh || '未知'})...`);
      const targetUrl = route.startsWith('http') ? route : `https://eyes.nasa.gov/apps/solar-system/#/${route}`;
      await send('Page.navigate', { url: 'about:blank' });
      await sleep(300);
      await send('Page.navigate', { url: targetUrl });

      // 严格等待天体加载与 SPA 视图过渡完成，进行原生英文身份核验
      let identityMatched = false;
      let actualUrl = '';
      let preEnTitle = '';
      let preEnBlurb = '';
      let selectedLabel = '';

      for (let attempt = 0; attempt < 50; attempt++) {
        const state = await ev(`(() => {
          const ls = document.getElementById('loading-screen');
          const loading = ls && getComputedStyle(ls).display !== 'none' && getComputedStyle(ls).opacity !== '0';
          const titleEl = document.querySelector('.title.long-title, .semi.title.long-title');
          const panelTitle = titleEl ? titleEl.textContent.trim() : '';
          const copyEl = document.querySelector('.description .copy:not(.more)');
          const blurb = copyEl ? copyEl.textContent.trim() : '';
          const href = window.location.href;
          const labelEl = document.querySelector('.pioneer-label-div.selection, .pioneer-label-div.selected');
          const label = labelEl ? labelEl.textContent.trim() : '';
          return { loading, panelTitle, blurb, href, label };
        })()`);

        actualUrl = state.href;
        preEnTitle = state.panelTitle;
        preEnBlurb = state.blurb;
        selectedLabel = state.label;

        if (!state.loading) {
          const titleLower = (state.panelTitle || '').toLowerCase();
          const matchEn = expectedEn && (titleLower === expectedEn.toLowerCase() || titleLower.includes(expectedEn.toLowerCase()));
          const matchZh = expectedZh && (state.panelTitle === expectedZh || state.panelTitle.includes(expectedZh));
          const matchSlug = slug && titleLower.includes(slug.replace(/^sc_/, '').replace(/_/g, ' '));
          if ((matchEn || matchZh || matchSlug) && state.blurb.length > 0) {
            identityMatched = true;
            break;
          }
        }
        await sleep(1000);
      }

      if (!identityMatched) {
        const errMsg = `天体身份核验失败或页面过渡超时: 预期 "${expectedEn}" (${slug}), 实际面板 "${preEnTitle}", 选中标签 "${selectedLabel}", URL "${actualUrl}"`;
        console.error(`  ❌ ${errMsg}`);
        results.push({
          route,
          slug,
          ok: false,
          actualUrl,
          actualIdentity: preEnTitle || '未知',
          identityPassed: false,
          totalParagraphs: 0,
          errors: [errMsg]
        });
        continue;
      }

      // 注入汉化扩展 content.js
      await ev(bundle);
      await sleep(2500);

      // 核验汉化注入后的天体身份与标题
      const postInjection = await ev(`(() => {
        const titleEl = document.querySelector('.title.long-title, .semi.title.long-title');
        return {
          panelTitleZh: titleEl ? titleEl.textContent.trim() : '',
          docTitle: document.title
        };
      })()`);

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
        const anchor = blurbEl ? blurbEl.querySelector('a') : null;
        return {
          blurbText: blurbEl ? blurbEl.textContent.trim() : '',
          moreText: moreEl ? moreEl.textContent.trim() : '',
          blurbDom: {
            hasAnchor: !!anchor,
            anchorText: anchor ? anchor.textContent.trim() : '',
            anchorHref: anchor ? anchor.href : '',
            anchorTarget: anchor ? anchor.target : '',
            html: blurbEl ? blurbEl.innerHTML : ''
          }
        };
      })()`);

      // 截取截图保存至 shots/.tmp/
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      const shotFile = path.join(shotsDir, `more-${slug}.png`);
      fs.writeFileSync(shotFile, Buffer.from(shot.data, 'base64'));

      // 执行严谨的比对校验
      const entry = moreData.entries[slug] || moreData.entries[route];
      const checkRes = verifyMoreExpansion({
        actualMoreText: domData.moreText,
        blurbText: domData.blurbText,
        blurbDom: domData.blurbDom,
        slug,
        entry,
        btnAfterMore,
        btnAfterCollapse
      });

      // 附加检查：若有 expectedZh，核验面板标题是否完成汉化
      if (expectedZh && postInjection.panelTitleZh !== expectedZh) {
        checkRes.ok = false;
        checkRes.errors.push(`面板标题中文未正确翻译: 预期 "${expectedZh}", 实际 "${postInjection.panelTitleZh}"`);
      }

      const enIdentity = (preEnTitle === expectedZh || !preEnTitle) ? (expectedEn || slug) : preEnTitle;
      console.log(`  - 实际完整 URL: ${actualUrl}`);
      console.log(`  - 页面实际天体身份: ${enIdentity} -> ${postInjection.panelTitleZh} (预期: ${expectedEn} / ${expectedZh})`);
      console.log(`  - 预期实体标识符: ${slug}`);
      console.log(`  - 身份校验结果: ✅ 校验通过`);
      console.log(`  - 一句话简介汉化: ${domData.blurbText ? '✅ 已呈现' : '❌ 空'}`);
      if (domData.blurbDom?.hasAnchor) {
        console.log(`  - 简介超链接保真: ✅ <a> 已保留 (href: ${domData.blurbDom.anchorHref}, 锚点: "${domData.blurbDom.anchorText}")`);
      }
      console.log(`  - 点击 More 后按钮文案: "${btnAfterMore}" (${btnAfterMore === '收起' ? '✅ 正确' : '❌ 异常'})`);
      console.log(`  - 点击收起后按钮文案: "${btnAfterCollapse}" (${btnAfterCollapse === '阅读更多' ? '✅ 正确' : '❌ 异常'})`);
      console.log(`  - 展开长文段落校验: ${checkRes.ok ? '✅ 完全符合预期译文 (' + checkRes.totalActual + ' 段)' : '❌ 校验失败'}`);
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
        slug,
        actualUrl,
        actualIdentity: `${preEnTitle} -> ${postInjection.panelTitleZh}`,
        identityPassed: true,
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
      console.log(`${statusIcon} ${r.slug.padEnd(12)} : ${r.ok ? '全部通过' : '失败 (' + r.errors.length + ' 项错误)'} (段落数 ${r.totalParagraphs}) | URL: ${r.actualUrl}`);
      if (!r.ok) allOk = false;
    }
    console.log('================================================');

    try { ws.close(); } catch {}
    return allOk;
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
  const allOk = await runE2E();
  if (!allOk) {
    process.exit(1);
  }
}

const isDirectRun = process.argv[1] && process.argv[1].endsWith('test-more-e2e.mjs');
if (isDirectRun) {
  main().catch((err) => {
    console.error('Fatal error in test-more-e2e:', err);
    process.exit(1);
  });
}
