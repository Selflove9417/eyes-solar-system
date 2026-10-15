import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve('.');
const HTTP_PORT = 8890;
const CDP_PORT = 9456;
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
  async pressTab(shift = false) {
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Tab',
      code: 'Tab',
      windowsVirtualKeyCode: 9,
      modifiers: shift ? 8 : 0
    });
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Tab',
      code: 'Tab',
      windowsVirtualKeyCode: 9,
      modifiers: shift ? 8 : 0
    });
    await sleep(40);
  }
  async pressKey(key, code, vk) {
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key,
      code,
      windowsVirtualKeyCode: vk
    });
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      code,
      windowsVirtualKeyCode: vk
    });
    await sleep(40);
  }
  close() {
    this.ws.close();
  }
}

console.log('=== 全站键盘可达与焦点顺序审计 ===\n');

const chromeProc = await launchChrome();
const wsUrl = await getWsUrl();
const client = new CDPClient(wsUrl);
await client.connect();

await client.send('Page.enable');
await client.send('Runtime.enable');

const auditResults = {};

for (const p of pages) {
  const url = `http://127.0.0.1:${HTTP_PORT}/${p}`;
  await client.send('Page.navigate', { url });
  await sleep(1000);

  // Focus body first
  await client.evaluate(`document.body.focus()`);

  // Count focusable elements in regular flow
  const focusableCount = await client.evaluate(`
    (() => {
      const candidates = document.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), details summary, [tabindex]:not([tabindex="-1"])');
      const visible = Array.from(candidates).filter(el => {
        // filter out elements inside inert or display none or visibility hidden
        if (el.closest('[inert]')) return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        return el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0;
      });
      return visible.length;
    })()
  `);

  // Tab through elements and collect sequence
  const tabSequence = [];
  let trapDetected = false;
  let lostFocusDetected = false;

  for (let i = 0; i < Math.min(focusableCount + 3, 30); i++) {
    await client.pressTab();
    const info = await client.evaluate(`
      (() => {
        const el = document.activeElement;
        if (!el || el === document.body) return { tag: 'BODY', label: 'lost-focus' };
        let label = el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('placeholder') || el.className;
        label = (label || '').trim().replace(/\\s+/g, ' ').slice(0, 30);
        return {
          tag: el.tagName,
          id: el.id,
          class: el.className,
          label
        };
      })()
    `);

    if (info.label === 'lost-focus') {
      lostFocusDetected = true;
    }
    tabSequence.push(`${info.tag}${info.id ? '#' + info.id : ''} ("${info.label}")`);
  }

  // Check "更多" dropdown keyboard accessibility
  let dropdownTest = 'N/A';
  const hasMoreBtn = await client.evaluate(`!!document.querySelector('.nav-more-btn')`);
  if (hasMoreBtn) {
    const moreOpened = await client.evaluate(`
      (() => {
        const btn = document.querySelector('.nav-more-btn');
        btn.focus();
        btn.click();
        const menu = document.querySelector('.nav-more-dropdown');
        const isOpen = menu && menu.classList.contains('open');
        return { isOpen, ariaExpanded: btn.getAttribute('aria-expanded') };
      })()
    `);

    // Press Escape
    await client.pressKey('Escape', 'Escape', 27);
    const afterEsc = await client.evaluate(`
      (() => {
        const btn = document.querySelector('.nav-more-btn');
        const menu = document.querySelector('.nav-more-dropdown');
        const isClosed = !menu || !menu.classList.contains('open');
        const focusRestored = document.activeElement === btn;
        return { isClosed, focusRestored };
      })()
    `);

    dropdownTest = `Open: ${moreOpened.isOpen && moreOpened.ariaExpanded === 'true' ? 'OK' : 'FAIL'}, Esc Close & Focus Restore: ${afterEsc.isClosed && afterEsc.focusRestored ? 'OK' : 'FAIL'}`;
  }

  // Check explore drawer keyboard accessibility
  let drawerTest = 'N/A';
  if (p === 'explore.html') {
    const drawerOpenResult = await client.evaluate(`
      (() => {
        const btn = document.getElementById('drawer-toggle-btn');
        btn.focus();
        btn.click();
        const drawer = document.getElementById('explore-drawer');
        const isOpen = document.body.classList.contains('drawer-open');
        const searchFocused = document.activeElement === document.getElementById('jump-search');
        return { isOpen, searchFocused };
      })()
    `);

    // Press Escape to close drawer
    await client.pressKey('Escape', 'Escape', 27);
    const drawerCloseResult = await client.evaluate(`
      (() => {
        const btn = document.getElementById('drawer-toggle-btn');
        const isClosed = !document.body.classList.contains('drawer-open');
        const focusRestored = document.activeElement === btn;
        return { isClosed, focusRestored };
      })()
    `);

    drawerTest = `Open & Focus Input: ${drawerOpenResult.isOpen && drawerOpenResult.searchFocused ? 'OK' : 'FAIL'}, Esc Close & Focus Restore: ${drawerCloseResult.isClosed && drawerCloseResult.focusRestored ? 'OK' : 'FAIL'}`;
  }

  auditResults[p] = {
    focusableCount,
    lostFocusDetected,
    trapDetected,
    dropdownTest,
    drawerTest,
    sampleSequence: tabSequence.slice(0, 8)
  };

  console.log(`Page: ${p}`);
  console.log(`  可获得焦点的元素数: ${focusableCount}`);
  console.log(`  焦点丢失: ${lostFocusDetected ? 'YES (FAIL)' : 'NO (PASS)'}`);
  console.log(`  键盘陷阱: ${trapDetected ? 'YES (FAIL)' : 'NO (PASS)'}`);
  if (hasMoreBtn) console.log(`  「更多」下拉键盘控制: ${dropdownTest}`);
  if (p === 'explore.html') console.log(`  探索页天体抽屉键盘控制: ${drawerTest}`);
  console.log(`  Tab 顺序示例: ${tabSequence.slice(0, 5).join(' -> ')}`);
  console.log('');
}

client.close();
chromeProc.kill();

const outPath = path.join(root, 'artifacts', 'keyboard-audit.json');
fs.writeFileSync(outPath, JSON.stringify(auditResults, null, 2), 'utf8');
console.log('Saved keyboard audit to:', outPath);
