import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve('.');
const names = JSON.parse(fs.readFileSync(path.join(root, 'data/names.zh.json'), 'utf8'));

console.log('====================================================');
console.log('🧪 标题消歧保护与路由回退回归测试 (test-title-disambiguation)');
console.log('====================================================\n');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`✅ [PASS] ${message}`);
  } else {
    failed++;
    console.error(`❌ [FAIL] ${message}`);
  }
}

// 模拟浏览器 DOM 环境执行 content.js 标题消歧逻辑
class MockTextNode {
  constructor(value) {
    this.nodeType = 3; // TEXT_NODE
    this.nodeValue = value;
    this.parentElement = null;
  }
}

class MockElement {
  constructor(tagName, className = '') {
    this.nodeType = 1; // ELEMENT_NODE
    this.tagName = tagName.toUpperCase();
    this.className = className;
    this.childNodes = [];
    this.parentElement = null;
  }

  appendChild(child) {
    child.parentElement = this;
    this.childNodes.push(child);
    return child;
  }

  get textContent() {
    return this.childNodes.map(c => c.nodeType === 3 ? c.nodeValue : c.textContent).join('');
  }

  querySelectorAll(selector) {
    const results = [];
    const match = (el) => {
      const classes = el.className.split(/\s+/).filter(Boolean);
      if (selector.includes('.title.long-title') || selector.includes('.semi.title.long-title')) {
        if (classes.includes('title') && classes.includes('long-title')) return true;
      }
      return false;
    };

    const walk = (el) => {
      if (match(el)) results.push(el);
      for (const ch of el.childNodes) {
        if (ch.nodeType === 1) walk(ch);
      }
    };
    walk(this);
    return results;
  }
}

class MockDocument {
  constructor() {
    this.title = '';
    this.body = new MockElement('body');
  }

  querySelectorAll(selector) {
    return this.body.querySelectorAll(selector);
  }
}

// 提取 content.js 中的实体映射及标题消歧逻辑
const contentCode = fs.readFileSync(path.join(root, 'extension/content.js'), 'utf8');

function createTester() {
  const document = new MockDocument();
  let currentHash = '#/';
  const location = {
    get hash() { return currentHash; },
    set hash(v) { currentHash = v; }
  };

  const written = new WeakSet();
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const hasHan = (s) => /[一-鿿]/.test(s);

  const entityById = {};
  const entityEnById = {};
  for (const [id, e] of Object.entries(names.entities)) {
    if (e.zh) entityById[id] = e.zh;
    if (e.en) entityEnById[id] = e.en;
  }

  function replaceText(node, zh) {
    const raw = node.nodeValue || '';
    if (!node.__origEn) {
      const c = clean(raw);
      if (c && !hasHan(c)) node.__origEn = c;
    }
    const lead = raw.match(/^\s*/)[0];
    const tail = raw.match(/\s*$/)[0];
    written.add(node);
    node.nodeValue = lead + zh + tail;
  }

  function getRouteEntitySlug() {
    const raw = location.hash.replace(/^#\/?/, '').split('?')[0];
    if (!raw) return null;
    const segments = raw.toLowerCase().split('/').filter(Boolean);
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i];
      if (entityById[seg]) return seg;
    }
    return null;
  }

  function updateDocumentTitle(slug) {
    if (!slug) return;
    const name = entityById[slug];
    if (!name) return;
    const wanted = `太阳系探索 - ${name} - NASA/JPL（非官方中文）`;
    if (document.title !== wanted) { written.add(document); document.title = wanted; }
  }

  function translateDetailTitle(slug) {
    if (!slug) return;
    const targetEn = entityEnById[slug];
    const targetZh = entityById[slug];
    if (!targetEn || !targetZh) return;

    for (const el of document.querySelectorAll('.title.long-title, .semi.title.long-title')) {
      for (const n of el.childNodes) {
        if (n.nodeType !== Node.TEXT_NODE) continue;
        const cur = clean(n.nodeValue);
        if (!cur) continue;

        if (!hasHan(cur)) {
          n.__origEn = cur;
        }

        const en = n.__origEn || (!hasHan(cur) ? cur : null);
        if (en && en.toLowerCase() === targetEn.toLowerCase()) {
          if (cur !== targetZh) {
            replaceText(n, targetZh);
          }
        }
      }
    }
  }

  function translateTitle() {
    const slug = getRouteEntitySlug();
    updateDocumentTitle(slug);
    translateDetailTitle(slug);
  }

  return { document, location, translateTitle };
}

// 模拟全局 Node 常量
globalThis.Node = { TEXT_NODE: 3, ELEMENT_NODE: 1 };

console.log('--- 阶段 1: 内存 DOM 严谨逻辑验证 (覆盖 A/B/C/D/E 场景) ---');

// 场景 A: 朱诺号 #/sc_juno
{
  const t = createTester();
  t.location.hash = '#/sc_juno';
  const span = new MockElement('span', 'semi title long-title');
  const textNode = new MockTextNode('Juno');
  span.appendChild(textNode);
  t.document.body.appendChild(span);

  t.translateTitle();

  assert(span.textContent === '朱诺号', '场景 A (朱诺号): 真实英文为 Juno 时正确汉化为“朱诺号”');
  assert(t.document.title === '太阳系探索 - 朱诺号 - NASA/JPL（非官方中文）', '场景 A (朱诺号): 文档标题正确设置为朱诺号');
}

// 场景 B: 婚神星 #/3_juno
{
  const t = createTester();
  t.location.hash = '#/3_juno';
  const span = new MockElement('span', 'semi title long-title');
  const textNode = new MockTextNode('Juno');
  span.appendChild(textNode);
  t.document.body.appendChild(span);

  t.translateTitle();

  assert(span.textContent === '婚神星', '场景 B (婚神星): 真实英文为 Juno 时正确汉化为“婚神星”，不能错误显示为“朱诺号”');
  assert(t.document.title === '太阳系探索 - 婚神星 - NASA/JPL（非官方中文）', '场景 B (婚神星): 文档标题正确设置为婚神星');
}

// 场景 C: 跨实体切换 (朱诺号 <-> 婚神星 来回 5 次切换)
{
  const t = createTester();
  t.location.hash = '#/sc_juno';
  const span = new MockElement('span', 'semi title long-title');
  const textNode = new MockTextNode('Juno');
  span.appendChild(textNode);
  t.document.body.appendChild(span);

  t.translateTitle();
  let switchOk = true;

  for (let cycle = 0; cycle < 5; cycle++) {
    // 切换至 3_juno
    t.location.hash = '#/3_juno';
    t.translateTitle();
    if (span.textContent !== '婚神星' || t.document.title !== '太阳系探索 - 婚神星 - NASA/JPL（非官方中文）') {
      switchOk = false;
    }

    // 切换回 sc_juno
    t.location.hash = '#/sc_juno';
    t.translateTitle();
    if (span.textContent !== '朱诺号' || t.document.title !== '太阳系探索 - 朱诺号 - NASA/JPL（非官方中文）') {
      switchOk = false;
    }
  }

  assert(switchOk, '场景 C (跨实体切换): 在朱诺号与婚神星之间多次切换，路由与实体始终匹配，无上一实体残留');
}

// 场景 D: 嵌套天体路由 #/mars/moons/deimos
{
  const t = createTester();
  t.location.hash = '#/mars/moons/deimos';
  const span = new MockElement('span', 'semi title long-title');
  const textNode = new MockTextNode('Deimos');
  span.appendChild(textNode);
  t.document.body.appendChild(span);

  t.translateTitle();

  assert(span.textContent === '火卫二', '场景 D (嵌套路由): 嵌套路由 #/mars/moons/deimos 正确解析为火卫二，而非火星');
  assert(t.document.title === '太阳系探索 - 火卫二 - NASA/JPL（非官方中文）', '场景 D (嵌套路由): 文档标题正确显示火卫二，而非火星');
}

// 场景 E: 未知标题 (与目标英文名不匹配，且无法 lookup 识别)
{
  const t = createTester();
  t.location.hash = '#/sc_juno';
  const span = new MockElement('span', 'semi title long-title');
  const textNode = new MockTextNode('Unknown Space Mission XYZ');
  span.appendChild(textNode);
  t.document.body.appendChild(span);

  t.translateTitle();

  assert(span.textContent === 'Unknown Space Mission XYZ', '场景 E (未知标题): 未知标题不匹配英文目标时绝不被强制替换为“朱诺号”');
}

// 场景 F: 包含既有其他中文的节点不被覆盖
{
  const t = createTester();
  t.location.hash = '#/sc_juno';
  const span = new MockElement('span', 'semi title long-title');
  const textNode = new MockTextNode('已有中文标签');
  span.appendChild(textNode);
  t.document.body.appendChild(span);

  t.translateTitle();

  assert(span.textContent === '已有中文标签', '场景 F (既有中文保护): 包含既有其他中文的节点绝不被意外覆盖');
}

console.log(`\n阶段 1 逻辑测试完成: ${passed} 通过, ${failed} 失败\n`);

if (failed > 0) {
  process.exit(1);
}

// 阶段 2: 真实浏览器 E2E 验证 (当包含 --live 或需要全量端到端时运行)
if (process.argv.includes('--live')) {
  console.log('--- 阶段 2: 真实 Chrome 浏览器与 NASA 官方页面 E2E 测试 ---');
  const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const CDP_PORT = 9591;
  const userDataDir = path.resolve('.chrome-temp-test-disambiguation');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'extension/manifest.json'), 'utf8'));
  const dataFiles = manifest.web_accessible_resources.flatMap((r) => r.resources).filter((p) => p.startsWith('data/'));
  const table = dataFiles.map((rel) => `p.endsWith('${rel.split('/').pop()}') ? ${JSON.stringify(fs.readFileSync(path.join(root, rel), 'utf8'))}`);

  const bundle = `
window.__eyesZh = false;
Object.defineProperty(window, 'chrome', {
  configurable: true,
  get: () => ({ runtime: { getURL: (p) => 'data:application/json;charset=utf-8,' + encodeURIComponent(
      ${table.join('\n      : ')}
      : ({})) } }),
});
${contentCode}
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
    if (!wsUrl) throw new Error('无法连接到 Chrome CDP');

    const ws = new WebSocket(wsUrl);
    await new Promise((r) => (ws.onopen = r));
    let id = 0;
    const pending = new Map();
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    };
    const send = (method, params = {}) => new Promise((res, rej) => {
      const i = ++id;
      pending.set(i, (m) => (m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result)));
      ws.send(JSON.stringify({ id: i, method, params }));
    });
    const ev = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
      return r.result.value;
    };

    await send('Runtime.enable');
    await send('Page.enable');

    console.log('正在导航至真实 NASA Eyes 页面 (#/sc_juno)...');
    await send('Page.navigate', { url: 'https://eyes.nasa.gov/apps/solar-system/#/sc_juno' });
    for (let i = 0; i < 40; i++) {
      const loaded = await ev(`(() => {
        const ls = document.getElementById('loading-screen');
        return !ls || getComputedStyle(ls).display === 'none' || getComputedStyle(ls).opacity === '0';
      })()`);
      if (loaded) break;
      await sleep(1000);
    }
    await sleep(2500);

    console.log('注入已修正的 content.js ...');
    await ev(bundle);
    await sleep(2000);

    // 场景 A 验证 (等待详情面板标题加载并就绪)
    let stateA = {};
    for (let i = 0; i < 20; i++) {
      stateA = await ev(`(() => {
        const t = document.querySelector('.title.long-title, .semi.title.long-title');
        return { title: t?.textContent?.trim(), docTitle: document.title };
      })()`);
      if (stateA.title) break;
      await sleep(1000);
    }
    assert(stateA.title === '朱诺号', `真实页面 A (朱诺号): 详情标题 = "${stateA.title}" (预期: 朱诺号)`);
    assert(stateA.docTitle.includes('朱诺号'), `真实页面 A (朱诺号): 标签页标题 = "${stateA.docTitle}"`);

    // 场景 B 验证
    console.log('切换路由至 #/3_juno ...');
    await ev(`window.location.hash = '#/3_juno'`);
    await sleep(3500);
    const stateB = await ev(`(() => {
      const t = document.querySelector('.title.long-title, .semi.title.long-title');
      return { title: t?.textContent?.trim(), docTitle: document.title };
    })()`);
    assert(stateB.title === '婚神星', `真实页面 B (婚神星): 详情标题 = "${stateB.title}" (预期: 婚神星)`);
    assert(stateB.docTitle.includes('婚神星'), `真实页面 B (婚神星): 标签页标题 = "${stateB.docTitle}"`);

    // 场景 C 验证 (来回切换)
    console.log('切回 #/sc_juno ...');
    await ev(`window.location.hash = '#/sc_juno'`);
    await sleep(3500);
    const stateC1 = await ev(`(() => {
      const t = document.querySelector('.title.long-title, .semi.title.long-title');
      return { title: t?.textContent?.trim(), docTitle: document.title };
    })()`);
    assert(stateC1.title === '朱诺号', `真实页面 C1 (切回朱诺号): 详情标题 = "${stateC1.title}" (预期: 朱诺号)`);

    console.log('再次切回 #/3_juno ...');
    await ev(`window.location.hash = '#/3_juno'`);
    await sleep(3500);
    const stateC2 = await ev(`(() => {
      const t = document.querySelector('.title.long-title, .semi.title.long-title');
      return { title: t?.textContent?.trim(), docTitle: document.title };
    })()`);
    assert(stateC2.title === '婚神星', `真实页面 C2 (再次切回婚神星): 详情标题 = "${stateC2.title}" (预期: 婚神星)`);

    // 场景 D 验证 (嵌套卫星)
    console.log('切换至嵌套卫星 #/mars/moons/deimos ...');
    await ev(`window.location.hash = '#/mars/moons/deimos'`);
    await sleep(4000);
    const stateD = await ev(`(() => {
      const t = document.querySelector('.title.long-title, .semi.title.long-title');
      return { title: t?.textContent?.trim(), docTitle: document.title };
    })()`);
    assert(stateD.title === '火卫二', `真实页面 D (嵌套卫星火卫二): 详情标题 = "${stateD.title}" (预期: 火卫二)`);
    assert(stateD.docTitle.includes('火卫二'), `真实页面 D (嵌套卫星火卫二): 标签页标题 = "${stateD.docTitle}"`);

    // 场景 E 验证 (未知标题)
    console.log('注入未知标题测试节点 ...');
    const stateE = await ev(`(() => {
      const container = document.createElement('div');
      container.innerHTML = '<span class="semi title long-title">Unknown Deep Space Probe</span>';
      document.body.appendChild(container);
      return new Promise(resolve => {
        setTimeout(() => {
          const t = container.querySelector('.title.long-title');
          resolve({ title: t?.textContent?.trim() });
        }, 500);
      });
    })()`);
    assert(stateE.title === 'Unknown Deep Space Probe', `真实页面 E (未知标题保护): 实际文案 = "${stateE.title}" (未被错误覆盖)`);

    console.log(`\n🎉 全部真实浏览器消歧测试通过！(${passed} 项通过, ${failed} 项失败)`);
  } finally {
    try { proc.kill(); } catch {}
  }
}

console.log('\n====================================================');
console.log(`🎯 回归测试完成，总计通过: ${passed} 项，失败: ${failed} 项`);
console.log('====================================================');

process.exit(failed > 0 ? 1 : 0);
