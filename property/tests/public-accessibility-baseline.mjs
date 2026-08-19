import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const base = String(process.env.PUBLIC_A11Y_BASE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
const outputDir = process.env.ACCESSIBILITY_EVIDENCE_DIR || 'accessibility-evidence';
const routes = (process.env.ACCESSIBILITY_ROUTES || '/property/,/property/privacy/,/property/terms/,/property/trust/')
  .split(',').map(v => v.trim()).filter(Boolean);

fs.mkdirSync(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const summary = [];
let critical = 0;

try {
  for (const route of routes) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const url = new URL(route, `${base}/`).toString();
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (!response || !response.ok()) throw new Error(`${route} did not load successfully (${response?.status() || 'no response'}).`);
    await page.waitForTimeout(350);

    const results = await new AxeBuilder({ page }).analyze();
    const counts = results.violations.reduce((acc, item) => {
      const impact = item.impact || 'unknown';
      acc[impact] = (acc[impact] || 0) + 1;
      if (impact === 'critical') critical += 1;
      return acc;
    }, {});

    const safe = route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root';
    fs.writeFileSync(path.join(outputDir, `${safe}.json`), JSON.stringify({
      route,
      url,
      tested_at: new Date().toISOString(),
      counts,
      violations: results.violations
    }, null, 2));
    summary.push({ route, counts, violation_rules: results.violations.length });
    await page.close();
  }
} finally {
  await browser.close();
}

fs.writeFileSync(path.join(outputDir, 'summary.json'), JSON.stringify({
  baseline: 'WCAG 2.2 AA readiness - automated evidence helper, not a conformance determination',
  tested_at: new Date().toISOString(),
  routes: summary,
  critical_rules: critical
}, null, 2));

console.table(summary.map(item => ({ route: item.route, rules: item.violation_rules, ...item.counts })));
if (critical > 0) {
  console.error(`Accessibility baseline found ${critical} critical rule violation(s). Evidence was retained for remediation.`);
  process.exitCode = 1;
}
