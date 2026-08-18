#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));
const fail = [];
const assert = (ok, msg) => { if (!ok) fail.push(msg); };

const manifestPath = 'supabase/intelligence-production-manifest.json';
const configPath = 'supabase/config.toml';
const runbookPath = 'property/docs/intelligence-production-promotion-manifest.md';
const evidencePath = 'property/docs/intelligence-release-certification-2026-08-18.md';

for (const file of [manifestPath, configPath, runbookPath, evidencePath]) {
  assert(exists(file), `Required promotion artifact missing: ${file}`);
}

const manifest = JSON.parse(read(manifestPath));
const config = read(configPath);
const runbook = read(runbookPath);
const evidence = read(evidencePath);

assert(manifest.manifest_version === 'watchdog-intelligence-production-v1', 'Unexpected Intelligence promotion manifest version.');
assert(manifest.release_candidate?.pull_request === 63, 'Manifest must identify PR #63.');
assert(manifest.release_candidate?.branch === 'feature/watchdog-intelligence-foundation', 'Manifest must identify the isolated Intelligence release branch.');
assert(manifest.release_candidate?.production_project_ref === 'uvkvaxljhhngydvlrzom', 'Manifest production project ref mismatch.');
assert(manifest.release_candidate?.staging_project_ref === 'pxossnwmrygxlpxtstnl', 'Manifest staging project ref mismatch.');
assert(manifest.safety?.explicit_production_authorization_required === true, 'Production authorization must remain explicit.');
assert(manifest.safety?.customer_visibility_last === true, 'Customer visibility must remain the final Gate 5 action.');
assert(manifest.safety?.stripe_mutations_in_this_manifest === false, 'Intelligence promotion manifest must not mutate Stripe.');
assert(manifest.safety?.schema_down_migrations_are_not_the_primary_rollback === true, 'Rollback must prefer operational stop/forward fix over destructive down-migrations.');
assert(Array.isArray(manifest.technical_promotion_prerequisites) && manifest.technical_promotion_prerequisites.length >= 5, 'Manifest must distinguish technical promotion prerequisites.');
assert(Array.isArray(manifest.commercial_public_launch_gates) && manifest.commercial_public_launch_gates.length >= 3, 'Manifest must distinguish commercial/public launch gates.');
assert(manifest.commercial_public_launch_gates.some((x) => /Free plan/i.test(x) && /leaked-password/i.test(x)), 'Manifest must document the accepted Supabase Free-plan leaked-password limitation.');
assert(manifest.commercial_public_launch_gates.some((x) => /Live billing lifecycle/i.test(x) && /paid enrollment/i.test(x)), 'Manifest must keep Live billing as a separate paid-enrollment gate.');

const migrations = manifest.migrations?.apply_in_order || [];
assert(migrations.length === 43, `Expected 43 allowlisted production migrations, found ${migrations.length}.`);
assert(new Set(migrations).size === migrations.length, 'Migration allowlist contains duplicates.');
for (const file of migrations) {
  assert(exists(`supabase/migrations/${file}`), `Allowlisted migration missing from source control: ${file}`);
  assert(!/(stripe|paddle|billing)/i.test(file), `Billing migration leaked into Intelligence manifest: ${file}`);
  assert(!/staging|fixture|selftest|test_account/i.test(file), `Staging/test migration leaked into production manifest: ${file}`);
}
assert(migrations.at(-2) === '20260818221624_watchdog_teams_org_plan_boundary.sql', 'Teams organization RLS migration must be the penultimate allowlisted migration.');
assert(migrations.at(-1) === '20260818221753_watchdog_agent_workbench_plan_boundary.sql', 'Agent Workbench RLS migration must be the final allowlisted migration.');

const reconcile = manifest.migrations?.reconcile_only_do_not_reapply_blindly || [];
const reconcileFiles = new Set(reconcile.map((x) => x.file));
for (const required of [
  '20260818213000_watchdog_full_tier_entitlement_contract.sql',
  '20260818214500_watchdog_standard_entitlement_access_fix.sql'
]) {
  assert(reconcileFiles.has(required), `Entitlement compatibility migration must be reconcile-only: ${required}`);
  assert(!migrations.includes(required), `Reconcile-only entitlement migration must not be in automatic apply order: ${required}`);
  assert(exists(`supabase/migrations/${required}`), `Reconciliation source missing: ${required}`);
}
const productionEntitlementVersions = new Set(manifest.migrations?.known_newer_production_entitlement_versions_to_preserve || []);
for (const requiredVersion of ['20260818214156', '20260818234619']) {
  assert(productionEntitlementVersions.has(requiredVersion), `Manifest must preserve current production entitlement migration ${requiredVersion}.`);
}
assert(productionEntitlementVersions.size === 2, 'Manifest entitlement lineage should contain the two currently observed production entitlement migrations, not stale staging/release IDs.');

const functions = manifest.edge_functions?.deploy_allowlist || [];
assert(functions.length === 23, `Expected 23 production-eligible Intelligence functions, found ${functions.length}.`);
const names = new Set(functions.map((x) => x.name));
for (const fn of functions) {
  assert(exists(`supabase/functions/${fn.name}/index.ts`), `Allowlisted Edge Function source missing: ${fn.name}`);
  const header = `[functions.${fn.name}]`;
  assert(config.includes(header), `supabase/config.toml is missing ${header}.`);
  const blockStart = config.indexOf(header);
  const nextBlock = config.indexOf('\n[functions.', blockStart + header.length);
  const block = config.slice(blockStart, nextBlock === -1 ? undefined : nextBlock);
  assert(new RegExp(`verify_jwt\\s*=\\s*${String(fn.verify_jwt)}`).test(block), `verify_jwt mismatch for ${fn.name}.`);
  assert(!/(stripe|paddle|billing)/i.test(fn.name), `Billing function leaked into Intelligence deploy allowlist: ${fn.name}`);
}
assert(functions.find((x) => x.name === 'intelligence-job-worker')?.verify_jwt === false, 'Population worker must retain its explicit internal-auth gateway exception.');
assert(functions.filter((x) => x.name !== 'intelligence-job-worker').every((x) => x.verify_jwt === true), 'All other allowlisted Intelligence functions must keep gateway JWT verification enabled.');

const excluded = manifest.edge_functions?.explicitly_excluded_staging_or_diagnostic_functions || [];
for (const fn of excluded) assert(!names.has(fn), `Excluded staging/diagnostic function leaked into deploy allowlist: ${fn}`);
assert(excluded.includes('intelligence-analyst-certification'), 'Temporary Analyst certification helper must remain explicitly excluded.');
assert(excluded.includes('intelligence-phase6-selftest'), 'Phase 6 self-test must remain excluded from production deploys.');

const vault = manifest.configuration?.required_vault_entries || [];
assert(vault.some((x) => x.name === 'watchdog_intelligence_worker_url'), 'Manifest must require the fail-closed worker URL Vault entry.');
assert(vault.some((x) => String(x.production_value_shape || '').includes('/functions/v1/intelligence-job-worker')), 'Production worker URL shape is missing or invalid.');
const optional = new Set((manifest.configuration?.optional_edge_secrets || []).map((x) => x.name));
assert(optional.has('OPENAI_API_KEY'), 'Optional Analyst prose-provider key must be documented as optional.');
assert(optional.has('WATCHDOG_ANALYST_MODEL'), 'Optional Analyst model override must be documented as optional.');

const smoke = manifest.post_deploy_smoke_matrix || {};
for (const tier of ['standard', 'agent', 'pro', 'pro_plus', 'teams', 'developer']) {
  assert(Array.isArray(smoke[tier]) && smoke[tier].length > 0, `Missing post-deploy smoke matrix for ${tier}.`);
}
assert((manifest.runtime_acceptance || []).some((x) => /provider is unavailable/i.test(x)), 'Runtime acceptance must prove Analyst usefulness without the prose provider.');
assert((manifest.runtime_acceptance || []).some((x) => /stale worker locks/i.test(x)), 'Runtime acceptance must include stale-lock recovery.');
assert((manifest.rollback_stop_order || []).some((x) => /cron/i.test(x) && /deactivate/i.test(x)), 'Rollback must include the global cron stop.');
assert((manifest.rollback_stop_order || []).some((x) => /worker_url/i.test(x) && /fail closed/i.test(x)), 'Rollback must include the fail-closed worker URL control.');

assert(/explicit production authorization/i.test(runbook), 'Runbook must require explicit production authorization.');
assert(/customer visibility/i.test(runbook) && /last/i.test(runbook), 'Runbook must keep customer visibility last.');
assert(/does not configure, charge, refund, test or otherwise mutate Stripe/i.test(runbook), 'Runbook must explicitly separate Stripe from Intelligence promotion.');
assert(/Free plan/i.test(runbook) && /leaked-password/i.test(runbook), 'Runbook must document the accepted Supabase Free-plan limitation.');
assert(/provider-unavailable/i.test(evidence), 'Certification evidence must record the Analyst provider-unavailable test.');
assert(/stale-lock recovery/i.test(evidence), 'Certification evidence must record stale-lock recovery.');
assert(/global cron stop\/restore/i.test(evidence), 'Certification evidence must record global scheduler stop/restore.');
assert(/Production changed: \*\*NO\*\*/i.test(evidence), 'Certification evidence must state that production was untouched.');

if (fail.length) {
  console.error(JSON.stringify({ passed: false, contract: 'watchdog-intelligence-production-manifest-v1', failures: fail }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  passed: true,
  contract: 'watchdog-intelligence-production-manifest-v1',
  migrations: migrations.length,
  functions: functions.length,
  reconcile_only_migrations: reconcile.length,
  tiers: Object.keys(smoke),
  customer_visibility_last: true,
  production_authorization_required: true,
  stripe_mutations: false
}, null, 2));
