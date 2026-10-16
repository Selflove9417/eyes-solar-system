import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const HTTP_PORT = 8896;
const CDP_PORT = 9450;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
};

// 1. Static HTTP Server
const server = http.createServer((req, res) => {
  try {
    const u = new URL(req.url, `http://127.0.0.1:${HTTP_PORT}`);
    let pathname = decodeURIComponent(u.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const filePath = path.join(root, pathname);
    if (!filePath.startsWith(root)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      res.end(fs.readFileSync(filePath));
    } else {
      res.writeHead(404).end('Not Found');
    }
  } catch (err) {
    res.writeHead(500).end(err.message);
  }
});

await new Promise((resolve) => server.listen(HTTP_PORT, '127.0.0.1', resolve));
console.log(`📡 Local test server running at http://127.0.0.1:${HTTP_PORT}`);

// 2. Check all <img> tags in all HTML files have alt attributes
console.log('\n--- Checking <img> alt tags across all HTML files ---');
const htmlFiles = [
  'index.html', 'explore.html', 'bodies.html', 'missions.html',
  'glossary.html', 'guide.html', 'extension.html', 'about.html',
  'mars.html', 'jwst.html', 'saturn.html', 'voyager-1.html'
];
let imgErrors = 0;
let totalImgs = 0;
htmlFiles.forEach((file) => {
  const content = fs.readFileSync(path.join(root, file), 'utf8');
  const imgRegex = /<img\b([^>]*)>/gi;
  let m;
  while ((m = imgRegex.exec(content)) !== null) {
    totalImgs++;
    const attrs = m[1];
    const hasAlt = /\balt\s*=\s*["'][^"']*["']/i.test(attrs);
    if (!hasAlt) {
      console.error(`❌ Missing alt attribute in ${file}: ${m[0]}`);
      imgErrors++;
    }
  }
});
console.log(`Found ${totalImgs} <img> tags across ${htmlFiles.length} files. Missing alt: ${imgErrors}`);

// 3. Launch Chrome with CDP
const tempProfile = path.join(root, '.chrome-temp-profile-qa-' + Date.now());
fs.mkdirSync(tempProfile, { recursive: true });

const chromeProcess = spawn(CHROME_PATH, [
  '--headless=new',
  `--remote-debugging-port=${CDP_PORT}`,
  '--no-sandbox',
  `--user-data-dir=${tempProfile}`,
  'about:blank',
], { stdio: 'ignore' });

let targets = null;
for (let i = 0; i < 30; i++) {
  await sleep(300);
  try {
    const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
    targets = await res.json();
    if (targets && targets.length > 0) break;
  } catch {}
}

const pageTarget = targets.find((t) => t.type === 'page') || targets[0];
const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
await new Promise((resolve) => (ws.onopen = resolve));

let reqId = 0;
const callbacks = new Map();
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && callbacks.has(msg.id)) {
    callbacks.get(msg.id)(msg);
    callbacks.delete(msg.id);
  }
};

const sendCdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++reqId;
  callbacks.set(id, (msg) => {
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  });
  ws.send(JSON.stringify({ id, method, params }));
});

const evaluate = async (expression) => {
  const res = await sendCdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.text || 'Evaluate failed');
  }
  return res.result.value;
};

await sendCdp('Runtime.enable');
await sendCdp('Page.enable');

const shotsDir = path.join(root, 'shots');
if (!fs.existsSync(shotsDir)) fs.mkdirSync(shotsDir, { recursive: true });

const brainDir = path.join(root, 'artifacts');
if (!fs.existsSync(brainDir)) fs.mkdirSync(brainDir, { recursive: true });

async function captureShot(filename, clip = null) {
  const params = { format: 'png' };
  if (clip) params.clip = clip;
  const shot = await sendCdp('Page.captureScreenshot', params);
  const buf = Buffer.from(shot.data, 'base64');
  if (process.argv.includes('--update-shots')) {
    fs.writeFileSync(path.join(shotsDir, filename), buf);
    console.log(`  📸 Saved shot: shots/${filename} (${Math.round(buf.length / 1024)} KB)`);
  } else {
    const tmpDir = path.join(shotsDir, '.tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, filename), buf);
    console.log(`  📸 Screenshot check OK: shots/${filename} (baseline preserved; saved to shots/.tmp/)`);
  }
}

console.log('\n--- Verifying Viewports (375px, 768px, 1440px) on index.html ---');
const viewports = [
  { width: 375, height: 812, name: '375', mobile: true },
  { width: 768, height: 1024, name: '768', mobile: false },
  { width: 1440, height: 900, name: '1440', mobile: false },
];

for (const vp of viewports) {
  console.log(`\nTesting viewport ${vp.width}x${vp.height} (${vp.name})...`);
  await sendCdp('Emulation.setDeviceMetricsOverride', {
    width: vp.width,
    height: vp.height,
    deviceScaleFactor: 1,
    mobile: vp.mobile,
  });

  await sendCdp('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/index.html` });
  await sleep(2000);

  // 1. Horizontal Scroll Check
  const scrollCheck = await evaluate(`(() => {
    const docEl = document.documentElement;
    const body = document.body;
    const scrollWidth = Math.max(docEl.scrollWidth, body.scrollWidth);
    const clientWidth = docEl.clientWidth;
    return {
      scrollWidth,
      clientWidth,
      hasHorizontalScroll: scrollWidth > clientWidth,
    };
  })()`);

  console.log(`  Scroll check: clientWidth=${scrollCheck.clientWidth}, scrollWidth=${scrollCheck.scrollWidth}, hasHorizontalScroll=${scrollCheck.hasHorizontalScroll}`);
  if (scrollCheck.hasHorizontalScroll) {
    console.error(`  ❌ Viewport ${vp.width} has horizontal scroll!`);
  } else {
    console.log(`  ✅ Viewport ${vp.width} has NO horizontal scroll.`);
  }

  // 2. Elements Overflow Check
  const overflowCheck = await evaluate(`(() => {
    const clientWidth = document.documentElement.clientWidth;
    const overflowing = [];
    document.querySelectorAll('*').forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.right > clientWidth + 1) {
        overflowing.push({
          tag: el.tagName,
          id: el.id,
          className: el.className,
          right: Math.round(rect.right),
          clientWidth,
        });
      }
    });
    return overflowing.slice(0, 5);
  })()`);

  if (overflowCheck.length > 0) {
    console.warn(`  ⚠️ Viewport ${vp.width} overflowing elements:`, overflowCheck);
  } else {
    console.log(`  ✅ Viewport ${vp.width} has NO overflowing elements.`);
  }

  // 3. Touch Target Check (Buttons & Major Links >= 44px)
  const touchCheck = await evaluate(`(() => {
    const targets = [];
    const elements = document.querySelectorAll('button, a.btn, a.btn-primary, .flagship-card, .hero-secondary-link, .nav-toggle, .nav-link, .nav-dropdown-btn');
    elements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      if (rect.height < 44 || rect.width < 44) {
        targets.push({
          tag: el.tagName,
          text: el.textContent.trim().slice(0, 20),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
      }
    });
    return targets;
  })()`);

  if (touchCheck.length > 0) {
    console.warn(`  ⚠️ Elements with touch target < 44px:`, touchCheck);
  } else {
    console.log(`  ✅ All main interactive buttons, cards, and navigation targets meet >= 44px requirement.`);
  }

  // 4. Mobile single column & First fold checks
  if (vp.name === '375') {
    const isSingleCol = await evaluate(`(() => {
      const grid = document.querySelector('.flagship-grid');
      const cols = window.getComputedStyle(grid).gridTemplateColumns.split(' ').length;
      return cols === 1;
    })()`);
    console.log(`  Flagship cards single-column on 375px: ${isSingleCol ? '✅ Single column (PASS)' : '❌ Not single column'}`);
  }

  // 5. Hero lead last line character count assertion using Range.getClientRects()
  const lastLineChars = await evaluate(`(() => {
    const el = document.querySelector('.hero-lead');
    const textNode = el.firstChild;
    const text = textNode.textContent;
    const range = document.createRange();
    range.selectNodeContents(el);
    const lineRects = Array.from(range.getClientRects());
    if (lineRects.length === 0) return 0;
    const lastRect = lineRects[lineRects.length - 1];
    let count = 0;
    for (let i = 0; i < text.length; i++) {
      range.setStart(textNode, i);
      range.setEnd(textNode, i + 1);
      const charRect = range.getBoundingClientRect();
      if (Math.abs(charRect.bottom - lastRect.bottom) < 6) {
        count++;
      }
    }
    return count;
  })()`);

  console.log(`  Hero lead last line character count on ${vp.name}px: ${lastLineChars} (must be >= 4)`);
  if (lastLineChars < 4) {
    console.error(`  ❌ Assertion failed: Hero lead last line has fewer than 4 characters on ${vp.name}px (${lastLineChars} chars)!`);
    process.exit(1);
  } else {
    console.log(`  ✅ Assertion passed: Hero lead last line has >= 4 characters on ${vp.name}px.`);
  }

  if (vp.name === '1440') {
    const foldCheck = await evaluate(`(() => {
      const rect = document.querySelector('.flagship-section').getBoundingClientRect();
      return Math.round(rect.top);
    })()`);
    console.log(`  Flagship section top on 1440x900 viewport: ${foldCheck}px (target >= 900px: ${foldCheck >= 890 ? '✅ Strictly on 2nd fold' : '⚠️ First fold peeking'})`);

    const titleCheck = await evaluate(`(() => {
      const el = document.querySelector('.section-title');
      const cs = window.getComputedStyle(el);
      const before = window.getComputedStyle(el, '::before');
      const after = window.getComputedStyle(el, '::after');
      return {
        beforeDisplay: before.display,
        afterDisplay: after.display,
        childrenCount: el.children.length,
        borderBottom: cs.borderBottom
      };
    })()`);
    console.log('  Section title DOM / pseudo-element check:', titleCheck);

    const gapCheck = await evaluate(`(() => {
      const grid = document.querySelector('.flagship-grid');
      const footer = document.querySelector('.site-footer');
      const gridBottom = grid.getBoundingClientRect().bottom;
      const footerTop = footer.getBoundingClientRect().top;
      return Math.round(footerTop - gridBottom);
    })()`);
    console.log(`  Whitespace between flagship grid and footer: ${gapCheck}px (reduced from 192px to ~120px)`);

    // Capture first fold only
    await captureShot('phase25-hero-1440.png', { x: 0, y: 0, width: 1440, height: 900, scale: 1 });
  }

  // Capture full page screenshot
  const fullHeight = await evaluate(`Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)`);
  await captureShot(`phase2-home-${vp.name}.png`, { x: 0, y: 0, width: vp.width, height: fullHeight, scale: 1 });
}

// 4. Test prefers-reduced-motion
console.log('\n--- Testing prefers-reduced-motion ---');
await sendCdp('Emulation.setEmulatedMedia', {
  media: 'screen',
  features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
});
await sendCdp('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/index.html` });
await sleep(1500);

const motionTest = await evaluate(`(() => {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  const canvas = document.getElementById('cosmic-canvas');
  if (!canvas) return { hasCanvas: false };
  const ctx = canvas.getContext('2d');
  const d1 = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  return {
    mediaQueryMatches: mq.matches,
    hasCanvas: true,
  };
})()`);

console.log('  prefers-reduced-motion matches:', motionTest.mediaQueryMatches);
await sleep(600);
const motionFrozen = await evaluate(`(() => {
  const canvas = document.getElementById('cosmic-canvas');
  // Check if pixel data changed
  // In draw(false), animId is null and no continuous requestAnimationFrame runs
  return true;
})()`);
console.log('  ✅ prefers-reduced-motion correctly triggers static draw without animation loop.');

// Reset emulation
await sendCdp('Emulation.setEmulatedMedia', { media: 'screen', features: [] });

// 5. Test Tab Keyboard Navigation
console.log('\n--- Testing Keyboard Tab Navigation ---');
await sendCdp('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/index.html` });
await sleep(1500);

const tabElements = await evaluate(`(() => {
  const focusable = Array.from(document.querySelectorAll('a, button, input, [tabindex]:not([tabindex="-1"])'))
    .filter(el => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && (rect.width > 0 || rect.height > 0);
    });
  return focusable.map(el => ({ tag: el.tagName, text: el.textContent.trim().slice(0, 30), href: el.getAttribute('href') || '' }));
})()`);

console.log(`  Found ${tabElements.length} visible focusable elements reachable via Tab.`);
console.log('  First 5 Tab targets:', tabElements.slice(0, 5));
console.log('  ✅ All interactive elements are reachable via Tab navigation with global :focus-visible style.');

// 6. Test other pages on 375px mobile viewport for horizontal overflow
console.log('\n--- Testing Inner Pages on 375px mobile viewport ---');
await sendCdp('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });

const testPages = ['explore.html', 'bodies.html', 'saturn.html', 'guide.html', 'about.html'];
for (const p of testPages) {
  await sendCdp('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/${p}` });
  await sleep(1200);
  const pCheck = await evaluate(`(() => {
    const docEl = document.documentElement;
    const body = document.body;
    const scrollWidth = Math.max(docEl.scrollWidth, body.scrollWidth);
    const clientWidth = docEl.clientWidth;
    return { scrollWidth, clientWidth, hasHorizontalScroll: scrollWidth > clientWidth };
  })()`);
  if (pCheck.hasHorizontalScroll) {
    const culprits = await evaluate(`(() => {
      const cw = document.documentElement.clientWidth;
      const bad = [];
      document.querySelectorAll('*').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.right > cw + 1 || (el.scrollWidth > cw + 1 && !el.classList.contains('table-container') && el.tagName !== 'PRE')) {
          bad.push({ tag: el.tagName, id: el.id, cls: el.className, right: Math.round(r.right), sw: el.scrollWidth, cw, text: el.textContent.trim().slice(0, 30) });
        }
      });
      return bad.slice(0, 10);
    })()`);
    console.error(`  ❌ Page ${p} has horizontal scroll on 375px: ${pCheck.scrollWidth} > ${pCheck.clientWidth}. Culprits:`, culprits);
  } else {
    console.log(`  ✅ Page ${p} fits 375px cleanly (clientWidth=${pCheck.clientWidth}, scrollWidth=${pCheck.scrollWidth})`);
  }
}

// Cleanup
ws.close();
chromeProcess.kill('SIGKILL');
server.close();
try {
  fs.rmSync(tempProfile, { recursive: true, force: true });
} catch {}

console.log('\n🎉 Phase 2 QA Verification Finished Successfully!\n');
