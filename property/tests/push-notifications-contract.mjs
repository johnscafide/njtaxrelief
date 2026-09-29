// Mobile push notifications: device registration function, FCM sender, and the
// migration that holds tokens, the kill switch, the outbox and the event hook.
// Source-only invariants; nothing here talks to Supabase or FCM.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const sql = read('supabase/migrations/20260930090000_push_device_registrations.sql');
const register = read('supabase/functions/push-device-register/index.ts');
const sender = read('supabase/functions/push-sender/index.ts');
const config = read('supabase/config.toml');
const pkg = JSON.parse(read('package.json'));

// --- Migration: tokens are service-role only, push starts switched off. ---
assert.match(sql, /create table if not exists public\.push_device_registrations/);
assert.match(sql, /alter table public\.push_device_registrations enable row level security;/);
assert.match(sql, /revoke all on public\.push_device_registrations from anon, authenticated;/);
assert.doesNotMatch(sql, /grant[^;]*on (table )?public\.push_device_registrations[^;]*to[^;]*\b(authenticated|anon)\b/i, 'the token table is never granted to browser roles');
assert.doesNotMatch(sql, /create policy[^;]*push_device_registrations/i, 'no RLS policy opens the token table to browser roles');
assert.match(sql, /grant select, insert, update, delete on public\.push_device_registrations to service_role;/);

assert.match(sql, /create table if not exists public\.push_settings[\s\S]*?enabled boolean not null default false/, 'kill switch defaults to off');
assert.match(sql, /insert into public\.push_settings \(singleton, enabled\) values \(true, false\) on conflict do nothing;/);
assert.match(sql, /revoke all on public\.push_settings from anon, authenticated;/);

for (const t of ['push_outbox']) {
  assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security;`));
  assert.match(sql, new RegExp(`revoke all on public\\.${t} from anon, authenticated;`));
}

// Token-free device list is the only thing authenticated may execute.
const devicesFn = sql.slice(sql.indexOf('create or replace function public.get_my_push_devices()'), sql.indexOf('grant execute on function public.get_my_push_devices() to authenticated;'));
assert.ok(devicesFn.length > 0, 'get_my_push_devices exists and is granted to authenticated');
assert.doesNotMatch(devicesFn, /\btoken\b/, 'get_my_push_devices never selects the token column');
assert.match(devicesFn, /where r\.user_id = auth\.uid\(\)/);
const authenticatedGrants = [...sql.matchAll(/grant execute on function public\.([a-z_]+)\([^)]*\) to authenticated/g)].map((m) => m[1]);
assert.deepEqual(authenticatedGrants, ['get_my_push_devices'], 'only get_my_push_devices is executable by authenticated');

// Worker RPCs are service-role only, same shape as property alerts.
for (const fn of ['verify_push_worker(text)', 'claim_push_outbox(integer)', 'complete_push_outbox(bigint,boolean,text,uuid)', 'defer_push_outbox(bigint,timestamptz)', 'invoke_push_sender()']) {
  assert.ok(sql.includes(`'${fn}'`), `${fn} is in the revoke/grant loop`);
}
assert.match(sql, /revoke all on function public\.%s from public, anon, authenticated/);
assert.match(sql, /grant execute on function public\.%s to service_role/);
assert.match(sql, /create table if not exists private\.push_runtime/);
assert.match(sql, /x-push-worker-token/);

// Hook: guarded by the kill switch, alerts_enabled, pause, plan and quiet hours.
const hook = sql.slice(sql.indexOf('create or replace function private.push_enqueue_property_event()'), sql.indexOf('create trigger trg_push_property_event'));
assert.match(hook, /select enabled from public\.push_settings where singleton/);
assert.match(hook, /d\.disabled_at is null and d\.alerts_enabled/);
assert.match(hook, /property_alert_preferences p[\s\S]*p\.paused/);
assert.match(hook, /private\.push_plan_allows\(new\.user_id, new\.minimum_plan\)/);
assert.match(hook, /private\.push_in_quiet_hours\(r\.quiet_hours_start, r\.quiet_hours_end, r\.timezone\)/);
assert.match(hook, /private\.push_quiet_hours_end\(r\.quiet_hours_end, r\.timezone\)/);
assert.match(hook, /return new;\s*exception when others then/, 'a push problem never blocks the producer insert');
assert.match(sql, /create trigger trg_push_property_event\s+after insert on public\.property_update_events/);
// The payload is built from the reviewed columns only.
const payload = hook.slice(hook.indexOf('v_data := jsonb_strip_nulls('), hook.indexOf('));', hook.indexOf('v_data := jsonb_strip_nulls(')));
for (const key of ['pams_pin', 'event_id', 'event_type', 'severity', 'minimum_plan']) assert.ok(payload.includes(`'${key}'`), `payload carries ${key}`);
assert.match(hook, /left\(new\.title, 180\)/);
assert.match(hook, /left\(new\.summary, 700\)/);
assert.doesNotMatch(hook, /new\.payload|new\.old_value|new\.new_value|new\.source_url/, 'the hook copies title/summary/pin/type/severity only');

// No owner, mailing or CRM column ever appears in the push pipeline.
const FORBIDDEN = ['owner_name', 'owner_mails_elsewhere', 'postal_city', 'mailing_address', 'mailing_city', 'mailing_state', 'mailing_zip', 'contact_name', 'contact_email', 'contact_phone', 'legal_first_name', 'legal_last_name', 'ST_ADDRESS', 'CITY_STATE', 'ZIP_CODE', 'ZIP5'];
for (const [name, text] of [['migration', sql], ['push-device-register', register], ['push-sender', sender]]) {
  for (const word of FORBIDDEN) assert.ok(!text.includes(word), `${name} must not reference ${word}`);
  assert.doesNotMatch(text, /['"]zip['"]/, `${name} must not carry a zip field`);
}

// --- push-device-register: session auth, origin rule, vocabulary, never the token. ---
assert.match(register, /admin\.auth\.getUser\(auth\.slice\(7\)\.trim\(\)\)/, 'Bearer session verified with getUser');
assert.match(register, /if \(origin && !allowOrigin\(origin\)\) return reply\(req, 403, \{ error: "origin_not_allowed" \}\);/, 'missing Origin allowed, unlisted Origin rejected');
assert.match(register, /"https:\/\/www\.watchdogindex\.com", "https:\/\/watchdogindex\.com"/);
assert.doesNotMatch(register, /Access-Control-Allow-Origin":\s*"\*"/, 'no wildcard CORS');
for (const [status, code] of [[405, 'method_not_allowed'], [503, 'service_unavailable'], [401, 'sign_in_required'], [401, 'session_invalid'], [400, 'invalid_json'], [400, 'unknown_action'], [400, 'token_required'], [400, 'installation_id_required'], [400, 'platform_invalid'], [403, 'origin_not_allowed'], [500, 'registration_failed']]) {
  assert.ok(register.includes(`reply(req, ${status}, { error: "${code}" })`), `push-device-register answers ${status} ${code}`);
}
for (const action of ['register', 'heartbeat', 'update', 'unregister', 'list']) assert.ok(register.includes(`"${action}"`), `action ${action} supported`);
assert.match(register, /"Cache-Control": "private, no-store"/);
assert.match(register, /crypto\.subtle\.digest\("SHA-256"/, 'token hashed with sha256');
assert.match(register, /token_hash: tokenHash/);
assert.match(register, /disabled_reason: "replaced"/);
assert.match(register, /onConflict: "user_id,installation_id"/);
assert.match(register, /push\.device\.registered/);
assert.match(register, /push\.device\.unregistered/);
assert.match(register, /integration_audit_log/);
assert.match(register, /action === "register" \? 201 : 200/);
const safeColumns = register.match(/const SAFE_COLUMNS = "([^"]+)"/)[1].split(',');
assert.ok(!safeColumns.includes('token') && !safeColumns.includes('token_hash'), 'responses never include the token');
assert.doesNotMatch(register, /select\("\*"\)/, 'no wildcard select that could leak the token');
assert.doesNotMatch(register, /get_my_entitlement|has_watchdog_plan|watchdog_effective_plan/, 'no plan gate on registration');

// --- push-sender: worker token, configured gate, FCM v1, quiet hours, invalid tokens. ---
assert.match(sender, /x-push-worker-token/);
assert.match(sender, /rpc\("verify_push_worker"/);
assert.match(sender, /FCM_PROJECT_ID/);
assert.match(sender, /FCM_SERVICE_ACCOUNT_JSON/);
assert.match(sender, /claimed: 0, push_configured: false/);
assert.match(sender, /https:\/\/www\.googleapis\.com\/auth\/firebase\.messaging/);
assert.match(sender, /RSASSA-PKCS1-v1_5/);
assert.match(sender, /urn:ietf:params:oauth:grant-type:jwt-bearer/);
assert.match(sender, /fcm\.googleapis\.com\/v1\/projects\/\$\{encodeURIComponent\(projectId\)\}\/messages:send/);
assert.match(sender, /rpc\("claim_push_outbox"/);
assert.match(sender, /rpc\("defer_push_outbox"/, 'quiet hours requeue instead of drop');
assert.match(sender, /p_invalid_registration: row\.registration_id/, 'unregistered tokens disable the registration');
assert.match(sender, /response\.status === 404 \|\| \/UNREGISTERED\/\.test\(code\)/);
assert.match(sender, /priority = severity === "action" \? "HIGH" : "NORMAL"/);
assert.match(sender, /collapse_key: collapse/);
for (const key of ['route:', 'pin,', 'channel:', 'actions:']) assert.ok(sender.includes(key), `data map carries ${key.replace(/[:,]/, '')}`);
assert.match(sender, /push_configured: true/);
assert.doesNotMatch(sender, /njpropertytaxrelief/i);

// --- Config and scripts. ---
assert.match(config, /\[functions\.push-device-register\]\nverify_jwt = true/);
assert.match(config, /\[functions\.push-sender\]\nverify_jwt = false/);
assert.match(config, /pg_cron with the private\.push_runtime worker token/);
assert.equal(pkg.scripts['test:push-notifications'], 'node property/tests/push-notifications-contract.mjs');
assert.doesNotMatch(pkg.scripts['vercel-build:full'] || '', /test:push-notifications/, 'not part of the Vercel build');

console.log('Push notifications contract passed.');
