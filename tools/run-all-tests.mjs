import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// 1. Detect Browser Environment
function detectBrowser() {
  const candidates = [
    process.env.CHROME_BIN,
    process.env.BROWSER_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);

  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {}
  }
  return null;
}

// 2. Server Management with Robust Error Handling
let fallbackServer = null;

function cleanup() {
  if (fallbackServer) {
    try { fallbackServer.close(); } catch {}
    fallbackServer = null;
  }
}

process.on('SIGINT', () => { cleanup(); process.exit(130); });
process.on('SIGTERM', () => { cleanup(); process.exit(143); });
process.on('exit', () => cleanup());

async function checkPortAndEnsureServer() {
  try {
    const res = await fetch('http://127.0.0.1:8890/index.html', { signal: AbortSignal.timeout(1200) });
    if (res.ok) {
      const text = await res.text();
      if (text.includes('深空之眸')) {
        return null; // Healthy existing server
      }
    }
    console.error('❌ 端口 8890 已被非深空之眸服务占用且未返回首页，请先释放端口 8890 或停止占用进程后再执行测试。');
    cleanup();
    process.exit(1);
  } catch {
    // Port 8890 is free -> start our fallback server
    try {
      const server = http.createServer((req, res) => {
        try {
          let pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1:8890').pathname);
          if (pathname.endsWith('/')) pathname += 'index.html';
          const filePath = path.join(root, pathname);
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream' });
            res.end(fs.readFileSync(filePath));
          } else {
            res.writeHead(404).end('Not Found');
          }
        } catch (e) {
          res.writeHead(500).end(e.message);
        }
      });

      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(8890, '127.0.0.1', () => resolve());
      });

      fallbackServer = server;
      return server;
    } catch (listenErr) {
      console.error(`❌ 无法在 127.0.0.1:8890 启动测试静态服务: ${listenErr.message}`);
      cleanup();
      process.exit(1);
    }
  }
}

const testSteps = [
  { name: 'lint-zh', script: 'tools/lint-zh.mjs', needsBrowser: false },
  { name: 'check-more', script: 'tools/check-more.mjs', needsBrowser: false },
  { name: 'check-all-links', script: 'tools/check-all-links.mjs', needsBrowser: false },
  { name: 'test-stories', script: 'tools/test-stories.mjs', needsBrowser: false },
  { name: 'check-design-doc', script: 'tools/check-design-doc.mjs', needsBrowser: false },
  { name: 'check-css-vars', script: 'tools/check-css-vars.mjs', needsBrowser: false },
  { name: 'measure-computed-contrast', script: 'tools/measure-computed-contrast.mjs', needsBrowser: true },
  { name: 'measure-touch-targets', script: 'tools/measure-touch-targets.mjs', needsBrowser: true },
  { name: 'measure-lede-orphan', script: 'tools/measure-lede-orphan.mjs', needsBrowser: true },
  { name: 'audit-keyboard-focus', script: 'tools/audit-keyboard-focus.mjs', needsBrowser: true },
  { name: 'verify-phase2-qa', script: 'tools/verify-phase2-qa.mjs', needsBrowser: true },
  { name: 'verify-phase3-qa', script: 'tools/verify-phase3-qa.mjs', needsBrowser: true },
  { name: 'verify-phase4', script: 'tools/verify-phase4-qa.mjs', needsBrowser: true },
  { name: 'verify-phase5', script: 'tools/verify-phase5-qa.mjs', needsBrowser: true },
];

function runStep(step) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const proc = spawn('node', [step.script], { stdio: 'pipe' });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });

    proc.on('close', (code) => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      resolve({ code, elapsed, stdout, stderr });
    });
  });
}

console.log('====================================================');
console.log('🚀 深空之眸 全站全项聚合回归测试套件 (npm test)');
console.log('====================================================\n');

// 1. Detect browser
const browserPath = detectBrowser();
let hasSkipped = false;

if (browserPath) {
  console.log(`🧭 检测到本地浏览器: ${browserPath}`);
} else {
  console.warn('⚠️ 未检测到可用的无头浏览器环境 (Chrome / Chromium / Edge)');
  console.warn('⚠️ 将跳过需要浏览器支持的 8 项 UI 自动化审计脚本：');
  testSteps.filter(s => s.needsBrowser).forEach(s => console.warn(`   - ${s.name} (${s.script})`));
  console.warn('');
  hasSkipped = true;
}

// 2. Ensure static server
await checkPortAndEnsureServer();

const results = [];
let allPassed = true;

for (let i = 0; i < testSteps.length; i++) {
  const step = testSteps[i];

  if (step.needsBrowser && !browserPath) {
    console.log(`[${i + 1}/${testSteps.length}] 跳过 ${step.name} (无可用浏览器环境)`);
    results.push({ name: step.name, status: 'SKIP (环境缺失跳过)', elapsed: '0.0' });
    continue;
  }

  process.stdout.write(`[${i + 1}/${testSteps.length}] 正在运行 ${step.name} ... `);
  const { code, elapsed, stdout, stderr } = await runStep(step);

  if (code === 0) {
    console.log(`✅ 通过 (${elapsed}s)`);
    results.push({ name: step.name, status: 'PASS', elapsed });
  } else {
    console.log(`❌ 失败 (exit code: ${code}, ${elapsed}s)`);
    console.error(`\n--- 错误输出 (${step.name}) ---`);
    console.error(stderr || stdout);
    results.push({ name: step.name, status: 'FAIL', elapsed });
    allPassed = false;
    break;
  }
}

cleanup();

console.log('\n================ 聚合测试结果摘要 ================');
for (const r of results) {
  let icon = '✅';
  if (r.status === 'FAIL') icon = '❌';
  else if (r.status.startsWith('SKIP')) icon = '⏭️';
  console.log(`${icon} ${r.name.padEnd(26)} : ${r.status} (${r.elapsed}s)`);
}
console.log('====================================================');

if (!allPassed) {
  console.error('💥 回归测试未全部通过，存在执行失败项，终止发布流程。');
  process.exit(1); // 失败 -> 退出码 1
} else if (hasSkipped) {
  console.warn('⚠️ 注意：已执行的基础单元测试全部通过，但 8 项浏览器测试因环境缺失已跳过。');
  process.exit(2); // 因环境缺失跳过 -> 退出码 2
} else {
  console.log(`🎉 全部 ${testSteps.length} 项回归测试全部通过！0 错误！`);
  process.exit(0); // 全部通过 -> 退出码 0
}
