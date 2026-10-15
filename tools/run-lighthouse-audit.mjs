import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = path.resolve('.');
const HTTP_PORT = 8890;
process.env.CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const pages = ['index.html', 'explore.html', 'saturn.html', 'bodies.html'];
const artifactsDir = path.join(root, 'artifacts', 'lighthouse');
fs.mkdirSync(artifactsDir, { recursive: true });

const results = {};

for (const p of pages) {
  const url = `http://127.0.0.1:${HTTP_PORT}/${p}`;
  const outJson = path.join(artifactsDir, `${p.replace('.html', '')}.json`);
  console.log(`\nRunning Lighthouse on ${url}...`);

  try {
    const cmd = `npx lighthouse "${url}" --output=json --output-path="${outJson}" --chrome-flags="--headless=new --no-sandbox --disable-dev-shm-usage" --preset=desktop --quiet`;
    execSync(cmd, { stdio: 'inherit', timeout: 90000 });

    const report = JSON.parse(fs.readFileSync(outJson, 'utf8'));
    const categories = report.categories || {};

    const scores = {
      performance: Math.round((categories.performance?.score || 0) * 100),
      accessibility: Math.round((categories.accessibility?.score || 0) * 100),
      bestPractices: Math.round((categories['best-practices']?.score || 0) * 100),
      seo: Math.round((categories.seo?.score || 0) * 100),
    };

    const issues = [];
    for (const [key, audit] of Object.entries(report.audits || {})) {
      if (audit.score !== null && audit.score < 0.9 && audit.scoreDisplayMode !== 'notApplicable' && audit.scoreDisplayMode !== 'informative') {
        issues.push({
          id: key,
          title: audit.title,
          score: Math.round((audit.score || 0) * 100),
          displayValue: audit.displayValue || '',
          explanation: audit.explanation || ''
        });
      }
    }

    results[p] = { scores, issues };
    console.log(`Results for ${p}:`, scores);
  } catch (err) {
    console.error(`Error running Lighthouse on ${p}:`, err.message);
    results[p] = { error: err.message };
  }
}
console.log('\n========================================');
console.log('LIGHTHOUSE AUDIT SUMMARY:');
console.log(JSON.stringify(results, null, 2));

const summaryFile = path.join(artifactsDir, 'summary.json');
fs.writeFileSync(summaryFile, JSON.stringify(results, null, 2), 'utf8');

let totalFailures = 0;
for (const [p, res] of Object.entries(results)) {
  if (res.error) {
    console.error(`❌ [${p}] Lighthouse execution error: ${res.error}`);
    totalFailures++;
  } else if (res.scores) {
    if (res.scores.accessibility < 90) {
      console.error(`❌ [${p}] Accessibility score below 90: ${res.scores.accessibility}`);
      totalFailures++;
    }
    if (res.scores.bestPractices < 90) {
      console.error(`❌ [${p}] Best Practices score below 90: ${res.scores.bestPractices}`);
      totalFailures++;
    }
    if (res.scores.seo < 90) {
      console.error(`❌ [${p}] SEO score below 90: ${res.scores.seo}`);
      totalFailures++;
    }
  }
}

if (totalFailures > 0) {
  console.error(`\n❌ Lighthouse audit failed with ${totalFailures} failures.`);
  process.exit(1);
} else {
  console.log('\n✅ Lighthouse audit passed with 0 failures!');
  process.exit(0);
}
