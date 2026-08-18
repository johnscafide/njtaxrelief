#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

const orderLiteral = /standard\s*:\s*0[\s\S]*agent\s*:\s*1[\s\S]*pro\s*:\s*2[\s\S]*pro_plus\s*:\s*3[\s\S]*teams\s*:\s*4[\s\S]*developer\s*:\s*5/;
const planContext = read('property/js/plan-context.js');
const accessGuard = read('property/js/access-guard.js');
const billingClient = read('property/js/billing-client.js');
const migration = read('supabase/migrations/20260818213000_watchdog_full_tier_entitlement_contract.sql');
const dataWorkbench = read('property/data-workbench/index.html');
const dataCenter = read('property/data-center/index.html');

assert(orderLiteral.test(planContext), 'plan-context.js must preserve Standard → Agent → Pro → Pro+ → Teams → Developer order.');
assert(orderLiteral.test(accessGuard), 'access-guard.js must preserve Standard → Agent → Pro → Pro+ → Teams → Developer order.');

for (const [source, expected] of [
  ['agent', "{tier:'agent',plan:'agent'}"],
  ['pro', "{tier:'pro',plan:'pro'}"],
  ['pro_plus', "{tier:'pro_plus',plan:'pro_plus'}"],
  ['teams', "{tier:'teams',plan:'teams'"]
]) {
  assert(billingClient.includes(expected), `billing-client.js must map ${source} to its own commercial entitlement tier.`);
}

assert(/data-access-require=["']agent["']/.test(dataWorkbench), 'Data Workbench must remain Agent-or-higher.');
assert(/data-access-require=["']pro_plus["']/.test(dataCenter), 'Data Center must remain Pro+-or-higher.');

for (const tier of ['standard', 'agent', 'pro', 'pro_plus', 'teams']) {
  assert(migration.includes(`'${tier}'::text`), `Production entitlement constraint must include ${tier}.`);
}
assert(migration.includes("when 'teams' then 4"), 'Server authorization must rank Teams above Pro+.');
assert(migration.includes("when 'pro_plus' then 3"), 'Server authorization must rank Pro+ above Pro.');
assert(migration.includes("when 'pro' then 2"), 'Server authorization must rank Pro above Agent.');
assert(migration.includes("when 'agent' then 1"), 'Server authorization must rank Agent above Standard.');
assert(/revoke all on function public\.has_watchdog_plan\(text\) from public, anon/i.test(migration), 'Plan authorization RPC must not be executable by public/anon.');
assert(/grant execute on function public\.has_watchdog_plan\(text\) to authenticated, service_role/i.test(migration), 'Plan authorization RPC must remain available only to authenticated/service roles.');

if (failures.length) {
  console.error(JSON.stringify({ passed: false, failures }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({
  passed: true,
  contract: 'watchdog-commercial-tier-ladder-v1',
  tiers: ['standard', 'agent', 'pro', 'pro_plus', 'teams', 'developer'],
  checks: 18
}, null, 2));
