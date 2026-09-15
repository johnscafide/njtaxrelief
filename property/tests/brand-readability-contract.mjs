#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const css = read('property/css/brand-consistency.css');
const tokens = read('property/css/shared/00-design-tokens.css');
const runtime = read('property/js/brand-consistency-runtime.js');
const universalMenu = read('property/js/watchdog-universal-menu.js');
const agentShell = read('property/js/agent-control-shell-2027.js');
const agentReadability = read('property/css/agent-control-readability.css');
const agentDiscover = read('property/css/agent-discover.css');
const agentHardening = read('property/css/agent-hardening.css');
const brandCenter = read('property/branding/brand-center.js');
const llmGuide = read('property/branding/LLM-BRAND-GUIDE.md');
const brand = JSON.parse(read('property/branding/brand-system.json'));
const rawTinyAgentOverride = /font-size\s*:\s*(?:[0-9](?:\.\d+)?|1[01](?:\.\d+)?)px/i.test(agentReadability);
const sub12PixelType = (text) => {
  const values = [];
  for (const match of text.matchAll(/font-size\s*:\s*([0-9]+(?:\.[0-9]+)?)px/gi)) values.push(Number(match[1]));
  for (const match of text.matchAll(/font\s*:[^;{}]*?\s([0-9]+(?:\.[0-9]+)?)px(?:\/|\s|;)/gi)) values.push(Number(match[1]));
  return values.filter((value) => value < 12);
};

const checks = [
  ['brand spec keeps Inter body/UI authority', brand.typography?.canonical_product?.body_ui?.family === 'Inter'],
  ['brand spec keeps Plus Jakarta Sans display authority', brand.typography?.canonical_product?.display?.family === 'Plus Jakarta Sans'],
  ['current shell imports shared design tokens', css.includes('@import url("/property/css/shared/00-design-tokens.css")')],
  ['shared type scale preserves 12/14/16px readability floors', tokens.includes('--type-xs: 0.75rem') && tokens.includes('--type-sm: 0.875rem') && tokens.includes('--type-md: 1rem')],
  ['current shell uses governed UI font token', css.includes('font-family:var(--font-ui)!important')],
  ['current shell headings use governed font token', css.includes('body.wdx-modern :is(h1,h2,h3)') && css.includes('font-family:var(--font-ui);')],
  ['desktop app nav readable', css.includes('min-height:48px!important') && css.includes('font-size:var(--type-sm)!important')],
  ['mobile app nav readable', css.includes('min-height:52px!important') && css.includes('font-size:var(--type-md)!important')],
  ['secondary buttons readable', css.includes('body.wdx-modern .wdx-btn{font-size:var(--type-sm)!important}')],
  ['secondary supporting chrome readable', css.includes('body.wdx-modern .wdx-date span') && css.includes('body.wdx-modern .wdx-weather span{font-size:var(--type-xs)!important}')],
  ['profile menu labels readable', css.includes('.wd6-pop nav b{font-size:var(--type-sm)!important')],
  ['profile menu supporting text readable', css.includes('.wd6-pop nav small{font-size:var(--type-xs)!important')],
  ['notification labels readable', css.includes('.wd6-note b{font-size:var(--type-xs)!important') && css.includes('.wd6-note small{font-size:var(--type-xs)!important')],
  ['current app focus visible', css.includes(':focus-visible') && css.includes('outline:2px solid var(--wd-primary)!important')],
  ['current app reduced motion', css.includes('@media (prefers-reduced-motion:reduce)')],
  ['brand runtime delegates navigation to universal source', runtime.includes('/property/js/watchdog-universal-menu.js') && runtime.includes('WatchdogUniversalMenu.refresh')],
  ['canonical navigation includes Property Home', universalMenu.includes("label:'Property Home'")],
  ['canonical navigation includes ROBUST Framework', universalMenu.includes("label:'ROBUST Framework'")],
  ['canonical navigation includes Property Pulse', universalMenu.includes("label:'Property Pulse'")],
  ['canonical navigation includes Professional Hub', universalMenu.includes("label:'Professional Hub'")],
  ['Agent Control loads canonical brand CSS', agentShell.includes("BRAND_STYLE='/property/css/brand-consistency.css'") && agentShell.includes('ensureStyle(BRAND_STYLE)')],
  ['Agent Control loads final readability overlay', agentShell.includes("READABILITY_STYLE='/property/css/agent-control-readability.css'") && agentShell.includes('ensureStyle(READABILITY_STYLE)')],
  ['Agent Control loads canonical brand runtime', agentShell.includes("BRAND_RUNTIME='/property/js/brand-consistency-runtime.js'")],
  ['Agent Control aliases local accents to canonical tokens', agentReadability.includes('--ad-teal:var(--wd-primary,#2f6df6)') && agentReadability.includes('--ad-red:var(--wd-danger,#e34f5f)') && agentReadability.includes('--ad-green:var(--wd-success,#18a966)')],
  ['Agent Control supporting text uses 12px token floor', agentReadability.includes('font-size:var(--type-xs)!important') && !rawTinyAgentOverride],
  ['Agent Control desktop controls use readable token floor', agentReadability.includes('min-height:42px!important') && agentReadability.includes('font-size:var(--type-sm)!important')],
  ['Agent Control mobile form controls avoid browser zoom', agentReadability.includes('min-height:48px!important') && agentReadability.includes('font-size:var(--type-md)!important')],
  ['Agent Control numeric data uses tabular numerals', agentReadability.includes('font-variant-numeric:tabular-nums')],
  ['Agent Discover source uses shared type scale without raw sub-12px text', agentDiscover.includes('var(--type-xs)') && sub12PixelType(agentDiscover).length === 0],
  ['Agent plan/assessment source uses shared type scale without raw sub-12px text', agentHardening.includes('var(--type-xs)') && sub12PixelType(agentHardening).length === 0],
  ['brand spec version advanced', brand.metadata?.version === '1.1.0' && brand.metadata?.updated === '2026-08-20'],
  ['brand spec names consistency CSS', brand.implementation?.canonical_shared_reference === '/property/css/brand-consistency.css'],
  ['brand spec names consistency runtime', brand.implementation?.brand_runtime === '/property/js/brand-consistency-runtime.js'],
  ['brand spec names current nav loader', brand.implementation?.sidebar === '/property/js/sidemenu.js'],
  ['LLM guide names consistency CSS', llmGuide.includes('/property/css/brand-consistency.css')],
  ['LLM guide names consistency runtime', llmGuide.includes('/property/js/brand-consistency-runtime.js')],
  ['Brand Center synchronizes machine-spec references', brandCenter.includes('syncCurrentReferences(spec)') && brandCenter.includes("implementation.sidebar || '/property/js/sidemenu.js'")],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
if (failed.length) {
  console.error(`Brand readability/source contract failed: ${failed.map(([name]) => name).join(', ')}`);
  process.exit(1);
}
console.log(`Brand readability/source contract passed: ${checks.length}/${checks.length}.`);
