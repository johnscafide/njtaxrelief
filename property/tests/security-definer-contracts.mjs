import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260817001500_security_definer_permission_hardening.sql'),
  'utf8'
);

assert.match(
  migration,
  /revoke execute on function public\.watchdog_effective_plan\(uuid\) from anon, authenticated/i,
  'Authenticated clients must not be able to probe another user through watchdog_effective_plan(uuid).'
);
assert.match(
  migration,
  /grant execute on function public\.watchdog_effective_plan\(uuid\) to service_role/i,
  'The internal plan resolver must remain available to server-side callers.'
);

assert.match(migration, /v_role text := coalesce\(auth\.role\(\), ''\)/i,
  'Data Workbench entitlement checks must distinguish service-role calls from browser calls.');
assert.match(migration, /p_user_id is not null and p_user_id <> v_uid/i,
  'Authenticated Data Workbench checks must reject cross-user UUID probes.');
assert.match(migration, /v_target := v_uid/i,
  'Authenticated Data Workbench checks must resolve the current caller only.');

assert.match(
  migration,
  /revoke execute on function public\.save_public_watchdog_score_cache\(jsonb\) from public, anon, authenticated/i,
  'The global Watchdog score cache must not be writable from the public API.'
);
assert.match(
  migration,
  /grant execute on function public\.save_public_watchdog_score_cache\(jsonb\) to service_role/i,
  'The score cache write path must be service-only.'
);

assert.match(
  migration,
  /create or replace function public\.marketing_direct_mail_quote[\s\S]*?security invoker/i,
  'The compatibility Direct Mail quote wrapper must not run with definer privileges.'
);

assert.match(
  migration,
  /alter view public\.workbench_provider_registry_summary set \(security_invoker = true\)/i,
  'The provider registry summary must evaluate RLS and privileges as the querying user.'
);
assert.match(
  migration,
  /grant select \(provider_kind, value_status, bulk_capable\)[\s\S]*?on public\.data_center_provider_coverage to authenticated/i,
  'Authenticated Data Workbench users should receive only the base columns required by the invoker view.'
);
assert.match(
  migration,
  /create policy "entitled users read provider coverage summary"[\s\S]*?to authenticated[\s\S]*?using \(public\.can_use_data_workbench\(auth\.uid\(\)\)\)/i,
  'The invoker view must have an explicit entitled-user RLS policy on its base table.'
);
assert.match(
  migration,
  /revoke all on public\.data_center_provider_coverage from anon/i,
  'Anonymous users must not gain provider coverage access while the view is converted.'
);

console.log('NJW-167 SECURITY DEFINER permission contracts passed.');
