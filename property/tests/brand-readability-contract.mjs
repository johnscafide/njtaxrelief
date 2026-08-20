#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const css = fs.readFileSync(path.join(root, 'property/css/brand-consistency.css'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'property/js/brand-consistency-runtime.js'), 'utf8');

const checks = [
  ['canonical body UI font', css.includes('font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important')],
  ['canonical heading font', css.includes('font-family:"Plus Jakarta Sans",Inter,sans-serif')],
  ['desktop app nav readable', css.includes('font-size:14px!important') && css.includes('min-height:48px!important')],
  ['mobile app nav readable', css.includes('min-height:52px!important;font-size:15px!important')],
  ['secondary buttons readable', css.includes('body.wdx-modern .wdx-btn{font-size:13px!important}')],
  ['secondary supporting chrome readable', css.includes('body.wdx-modern .wdx-date span') && css.includes('body.wdx-modern .wdx-weather span{font-size:12px!important}')],
  ['profile menu labels readable', css.includes('.wd6-pop nav b{font-size:13px!important')],
  ['profile menu supporting text readable', css.includes('.wd6-pop nav small{font-size:12px!important')],
  ['notification labels readable', css.includes('.wd6-note b{font-size:12px!important') && css.includes('.wd6-note small{font-size:12px!important')],
  ['current app focus visible', css.includes(':focus-visible') && css.includes('outline:2px solid var(--wd-primary)!important')],
  ['current app reduced motion', css.includes('@media (prefers-reduced-motion:reduce)')],
  ['canonical navigation includes Property Home', runtime.includes("label:'Property Home'" )],
  ['canonical navigation includes Professional Hub', runtime.includes("label:'Professional Hub'" )],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
if (failed.length) {
  console.error(`Brand readability contract failed: ${failed.map(([name]) => name).join(', ')}`);
  process.exit(1);
}
console.log(`Brand readability contract passed: ${checks.length}/${checks.length}.`);
