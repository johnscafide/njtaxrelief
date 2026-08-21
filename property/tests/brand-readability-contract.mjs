#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const css = read('property/css/brand-consistency.css');
const runtime = read('property/js/brand-consistency-runtime.js');
const brandCenter = read('property/branding/brand-center.js');
const llmGuide = read('property/branding/LLM-BRAND-GUIDE.md');
const agentDiscover = read('property/css/agent-discover.css');
const agentHardening = read('property/css/agent-hardening.css');
const brand = JSON.parse(read('property/branding/brand-system.json'));

const sub12PixelType = (text) => {
  const values = [];
  for (const match of text.matchAll(/font-size\s*:\s*([0-9]+(?:\.[0-9]+)?)px/gi)) values.push(Number(match[1]));
  for (const match of text.matchAll(/font\s*:[^;{}]*?\s([0-9]+(?:\.[0-9]+)?)px(?:\/|\s|;)/gi)) values.push(Number(match[1]));
  return values.filter((value) => value < 12);
};

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
  ['canonical navigation includes Property Home', runtime.includes("label:'Property Home'")],
  ['canonical navigation includes Professional Hub', runtime.includes("label:'Professional Hub'")],
  ['brand spec version advanced', brand.metadata?.version === '1.1.0' && brand.metadata?.updated === '2026-08-20'],
  ['brand spec names consistency CSS', brand.implementation?.canonical_shared_reference === '/property/css/brand-consistency.css'],
  ['brand spec names consistency runtime', brand.implementation?.brand_runtime === '/property/js/brand-consistency-runtime.js'],
  ['brand spec names current nav loader', brand.implementation?.sidebar === '/property/js/sidemenu.js'],
  ['LLM guide names consistency CSS', llmGuide.includes('/property/css/brand-consistency.css')],
  ['LLM guide names consistency runtime', llmGuide.includes('/property/js/brand-consistency-runtime.js')],
  ['Brand Center synchronizes machine-spec references', brandCenter.includes('syncCurrentReferences(spec)') && brandCenter.includes("implementation.sidebar || '/property/js/sidemenu.js'")],
  ['Agent Control aliases legacy palette to canonical tokens', css.includes('body.wdx-modern[data-sidebar-page="agent-desk"]') && css.includes('--ac27-blue:var(--wd-primary);') && css.includes('--ad-teal:var(--wd-primary);') && css.includes('--ad-gold:var(--wd-warning);')],
  ['Agent Control enforces shared 12px floor', css.includes('NJW-73/74/75: bounded Agent Control readability + token convergence') && css.includes('font-size:var(--fs-2xs)!important')],
  ['Agent Control controls meet desktop readability', css.includes('.ac27-tabs a,') && css.includes('font-size:var(--fs-xs)!important;min-height:42px!important')],
  ['Agent Control numeric data uses tabular figures', css.includes('.ad-overview-meta b,') && css.includes('.ad-funnel-stage b,') && css.includes('font-variant-numeric:tabular-nums')],
  ['Agent Control removes decorative data gradients', css.includes('.ad-overview:after{display:none!important}') && css.includes('.ad-focus{background:var(--wd-surface)!important}') && css.includes('.ad-funnel-stage>i>em{background:var(--wd-primary)!important}')],
  ['Agent Discover raw sub-12px text migrated', sub12PixelType(agentDiscover).length === 0],
  ['Agent Hardening raw sub-12px text migrated', sub12PixelType(agentHardening).length === 0],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
if (failed.length) {
  console.error(`Brand readability/source contract failed: ${failed.map(([name]) => name).join(', ')}`);
  process.exit(1);
}
console.log(`Brand readability/source contract passed: ${checks.length}/${checks.length}.`);
