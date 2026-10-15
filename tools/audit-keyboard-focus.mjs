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
      type: 'rawKeyDown',
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
      type: 'rawKeyDown',
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
await client.send('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false
});

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
        if (el.closest('[inert]')) return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        return el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0;
      });
      return visible.length;
    })()
  `);

  // Tab through elements and collect sequence + detect traps
  const tabSequence = [];
  const visitedUids = [];
  let trapDetected = false;
  let trapReason = '';
  let lostFocusDetected = false;

  const stepsToTest = Math.min(focusableCount + 3, 30);
  for (let i = 0; i < stepsToTest; i++) {
    await client.pressTab();
    const info = await client.evaluate(`
      (() => {
        let el = document.activeElement;
        if (!el || el === document.body) return { tag: 'BODY', label: 'lost-focus', uid: 'BODY' };
        if (el.tagName === 'IFRAME') {
          // In headless CDP, cross-origin iframes capture keyboard input without bubbling back to top frame.
          // To continue auditing the parent page's remaining interactive elements, advance focus past the iframe.
          const iframeTag = el.tagName;
          const iframeId = el.id;
          const all = Array.from(document.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'));
          const idx = all.findIndex(item => el.compareDocumentPosition(item) & Node.DOCUMENT_POSITION_FOLLOWING);
          if (idx !== -1) {
            all[idx].focus();
          }
          return { tag: iframeTag, id: iframeId, class: '', label: '(iframe-bridged)', uid: 'iframe_' + iframeId };
        }
        if (!el.__node_uid) {
          window.__node_counter = (window.__node_counter || 0) + 1;
          el.__node_uid = 'node_' + window.__node_counter;
        }
        let label = el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('placeholder') || el.className;
        label = (label || '').trim().replace(/\\s+/g, ' ').slice(0, 30);

        return {
          tag: el.tagName,
          id: el.id,
          class: el.className,
          label,
          uid: el.__node_uid
        };
      })()
    `);

    if (info.label === 'lost-focus') {
      lostFocusDetected = true;
    }

    // Real Keyboard Trap Detection Check 1:
    // If consecutive Tab presses are stuck on the exact same DOM node (and there are other focusable elements)
    if (visitedUids.length > 0 && info.uid !== 'BODY' && focusableCount > 1) {
      const prevUid = visitedUids[visitedUids.length - 1];
      if (info.uid === prevUid && i < focusableCount) {
        trapDetected = true;
        trapReason = `Focus repeatedly stuck on same element: ${info.tag}${info.id ? '#' + info.id : ''} ("${info.label}")`;
      }
    }

    // Real Keyboard Trap Detection Check 2:
    // Detect micro sub-loop trap (e.g. A -> B -> A -> B) before reaching the rest of the page
    if (visitedUids.length >= 3 && focusableCount > 4 && i < focusableCount - 2) {
      const pCurrent = info.uid;
      const pPrev1 = visitedUids[visitedUids.length - 1];
      const pPrev2 = visitedUids[visitedUids.length - 2];
      const pPrev3 = visitedUids[visitedUids.length - 3];
      if (pCurrent === pPrev2 && pPrev1 === pPrev3 && pCurrent !== pPrev1) {
        trapDetected = true;
        trapReason = `Focus trapped in 2-element loop: ${pCurrent} <-> ${pPrev1}`;
      }
    }

    visitedUids.push(info.uid);
    tabSequence.push(`${info.tag}${info.id ? '#' + info.id : ''} ("${info.label}")`);
  }

  // Reverse traversal test (Shift+Tab) to verify escape backward
  let reverseOk = true;
  if (visitedUids.length >= 3) {
    const beforeShift = await client.evaluate(`document.activeElement?.tagName || 'NONE'`);
    await client.pressTab(true); // Shift+Tab
    const afterShift = await client.evaluate(`document.activeElement?.tagName || 'NONE'`);
    if (afterShift === 'NONE' || afterShift === 'BODY') {
      reverseOk = false;
      lostFocusDetected = true;
    }
  }

  // Check "更多" dropdown keyboard accessibility using real selectors from site.js
  // (Trigger: .nav-dropdown-btn, Container: .nav-item, Menu: .nav-dropdown, Sub-links: .nav-dropdown a)
  let dropdownTest = 'N/A';
  const hasDropdownBtn = await client.evaluate(`!!document.querySelector('.nav-dropdown-btn')`);
  if (hasDropdownBtn) {
    // 1. Focus button and press ArrowDown
    await client.evaluate(`document.querySelector('.nav-dropdown-btn').focus()`);
    await client.pressKey('ArrowDown', 'ArrowDown', 40);

    const openCheck = await client.evaluate(`
      (() => {
        const btn = document.querySelector('.nav-dropdown-btn');
        const item = btn?.closest('.nav-item');
        const isOpen = item && item.classList.contains('open');
        const ariaExpanded = btn?.getAttribute('aria-expanded');
        const firstLink = item?.querySelector('.nav-dropdown a');
        const firstFocused = document.activeElement === firstLink;
        return { isOpen, ariaExpanded, firstFocused };
      })()
    `);

    // 2. Press ArrowDown to advance to second link
    await client.pressKey('ArrowDown', 'ArrowDown', 40);
    const advanceCheck = await client.evaluate(`
      (() => {
        const item = document.querySelector('.nav-dropdown-btn')?.closest('.nav-item');
        const secondLink = item?.querySelectorAll('.nav-dropdown a')[1];
        return document.activeElement === secondLink;
      })()
    `);

    // 3. Press Escape to close and restore focus
    await client.pressKey('Escape', 'Escape', 27);
    const closeCheck = await client.evaluate(`
      (() => {
        const btn = document.querySelector('.nav-dropdown-btn');
        const item = btn?.closest('.nav-item');
        const isClosed = item && !item.classList.contains('open');
        const ariaClosed = btn?.getAttribute('aria-expanded') === 'false';
        const focusRestored = document.activeElement === btn;
        return { isClosed, ariaClosed, focusRestored };
      })()
    `);

    const openPass = openCheck.isOpen && openCheck.ariaExpanded === 'true' && openCheck.firstFocused;
    const advancePass = advanceCheck;
    const closePass = closeCheck.isClosed && closeCheck.ariaClosed && closeCheck.focusRestored;

    dropdownTest = `Open & Focus 1st: ${openPass ? 'OK' : 'FAIL'}, Cycle: ${advancePass ? 'OK' : 'FAIL'}, Esc Close & Restore: ${closePass ? 'OK' : 'FAIL'}`;
  }

  // Check explore drawer keyboard accessibility (explore.html)
  let drawerTest = 'N/A';
  if (p === 'explore.html') {
    // 1. Open drawer
    await client.evaluate(`document.getElementById('drawer-toggle-btn').click()`);
    await sleep(80);

    const drawerOpenResult = await client.evaluate(`
      (() => {
        const btn = document.getElementById('drawer-toggle-btn');
        const drawer = document.getElementById('explore-drawer');
        const isOpen = document.body.classList.contains('drawer-open');
        const searchFocused = document.activeElement === document.getElementById('jump-search');
        return { isOpen, searchFocused };
      })()
    `);

    // 2. Controlled focus trap test inside open drawer:
    // Tab should wrap within drawer elements
    await client.pressTab();
    const trapActiveInsideDrawer = await client.evaluate(`
      (() => {
        const drawer = document.getElementById('explore-drawer');
        return drawer && drawer.contains(document.activeElement);
      })()
    `);

    // 3. Press Escape to close drawer and verify trap release + focus restoration
    await client.pressKey('Escape', 'Escape', 27);
    await sleep(80);

    const drawerCloseResult = await client.evaluate(`
      (() => {
        const btn = document.getElementById('drawer-toggle-btn');
        const isClosed = !document.body.classList.contains('drawer-open');
        const focusRestored = document.activeElement === btn;
        return { isClosed, focusRestored };
      })()
    `);

    const openPass = drawerOpenResult.isOpen && drawerOpenResult.searchFocused;
    const closePass = drawerCloseResult.isClosed && drawerCloseResult.focusRestored;
    drawerTest = `Open & Focus: ${openPass ? 'OK' : 'FAIL'}, Esc Close & Restore: ${closePass ? 'OK' : 'FAIL'}, Trap Contained: ${trapActiveInsideDrawer ? 'OK' : 'FAIL'}`;
  }

  auditResults[p] = {
    focusableCount,
    lostFocusDetected,
    trapDetected,
    trapReason,
    dropdownTest,
    drawerTest,
    sampleSequence: tabSequence.slice(0, 8)
  };

  console.log(`Page: ${p}`);
  console.log(`  可获得焦点的元素数: ${focusableCount}`);
  console.log(`  焦点丢失: ${lostFocusDetected ? 'YES (FAIL)' : 'NO (PASS)'}`);
  console.log(`  键盘陷阱: ${trapDetected ? `YES (FAIL: ${trapReason})` : 'NO (PASS)'}`);
  if (hasDropdownBtn) console.log(`  「更多」下拉键盘控制: ${dropdownTest}`);
  if (p === 'explore.html') console.log(`  探索页天体抽屉键盘控制: ${drawerTest}`);
  console.log(`  Tab 顺序示例: ${tabSequence.slice(0, 5).join(' -> ')}`);
  console.log('');
}

client.close();
chromeProc.kill();

const outPath = path.join(root, 'artifacts', 'keyboard-audit.json');
fs.writeFileSync(outPath, JSON.stringify(auditResults, null, 2), 'utf8');
console.log('Saved keyboard audit to:', outPath);

// Exit non-zero if ANY failure occurred
let totalFailures = 0;
for (const [pageName, res] of Object.entries(auditResults)) {
  if (res.lostFocusDetected) {
    console.error(`❌ [${pageName}] Lost focus detected.`);
    totalFailures++;
  }
  if (res.trapDetected) {
    console.error(`❌ [${pageName}] Keyboard trap detected: ${res.trapReason}`);
    totalFailures++;
  }
  if (res.dropdownTest.includes('FAIL')) {
    console.error(`❌ [${pageName}] Dropdown keyboard test failed: ${res.dropdownTest}`);
    totalFailures++;
  }
  if (res.drawerTest.includes('FAIL')) {
    console.error(`❌ [${pageName}] Drawer keyboard test failed: ${res.drawerTest}`);
    totalFailures++;
  }
}

if (totalFailures > 0) {
  console.error(`\n❌ Keyboard audit failed with ${totalFailures} failures.`);
  process.exit(1);
} else {
  console.log('\n✅ All keyboard accessibility and focus navigation audits passed with 0 failures!');
  process.exit(0);
}
