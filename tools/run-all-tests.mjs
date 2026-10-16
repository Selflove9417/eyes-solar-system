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

// Check if port 8890 is responding, if not start fallback static server
async function ensureServer() {
  try {
    const res = await fetch('http://127.0.0.1:8890/index.html');
    if (res.ok) return null;
  } catch {}

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
    } catch (err) {
      res.writeHead(500).end(err.message);
    }
  });

  await new Promise((resolve) => server.listen(8890, '127.0.0.1', resolve));
  return server;
}

const testSteps = [
  { name: 'lint-zh', script: 'tools/lint-zh.mjs' },
  { name: 'check-all-links', script: 'tools/check-all-links.mjs' },
  { name: 'test-stories', script: 'tools/test-stories.mjs' },
  { name: 'check-design-doc', script: 'tools/check-design-doc.mjs' },
  { name: 'check-css-vars', script: 'tools/check-css-vars.mjs' },
  { name: 'measure-computed-contrast', script: 'tools/measure-computed-contrast.mjs' },
  { name: 'measure-touch-targets', script: 'tools/measure-touch-targets.mjs' },
  { name: 'measure-lede-orphan', script: 'tools/measure-lede-orphan.mjs' },
  { name: 'audit-keyboard-focus', script: 'tools/audit-keyboard-focus.mjs' },
  { name: 'verify-phase2-qa', script: 'tools/verify-phase2-qa.mjs' },
  { name: 'verify-phase3-qa', script: 'tools/verify-phase3-qa.mjs' },
  { name: 'verify-phase4', script: 'tools/verify-phase4-qa.mjs' },
  { name: 'verify-phase5', script: 'tools/verify-phase5-qa.mjs' },
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

const fallbackServer = await ensureServer();
const results = [];
let allPassed = true;

for (let i = 0; i < testSteps.length; i++) {
  const step = testSteps[i];
  process.stdout.write(`[${i + 1}/${testSteps.length}] 正在运行 ${step.name} ... `);
  const { code, elapsed, stdout, stderr } = await runStep(step);

  if (code === 0) {
    console.log(`✅ 通过 (${elapsed}s)`);
    results.push({ name: step.name, status: 'PASS', elapsed });
  } else {
    console.log(`❌ 失败 (exit code: ${code}, ${elapsed}s)`);
    console.error(`--- 错误输出 (${step.name}) ---`);
    console.error(stderr || stdout);
    results.push({ name: step.name, status: 'FAIL', elapsed });
    allPassed = false;
    break;
  }
}

if (fallbackServer) fallbackServer.close();

console.log('\n================ 聚合测试结果摘要 ================');
for (const r of results) {
  const icon = r.status === 'PASS' ? '✅' : '❌';
  console.log(`${icon} ${r.name.padEnd(26)} : ${r.status} (${r.elapsed}s)`);
}
console.log('====================================================');

if (allPassed) {
  console.log('🎉 全部 13 项回归测试全部通过！0 错误！');
  process.exit(0);
} else {
  console.error('💥 回归测试未全部通过，终止发布流程。');
  process.exit(1);
}
