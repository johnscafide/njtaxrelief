// Mobile push notifications: device registration function, FCM sender, and the
// migration that holds tokens, the kill switch, the outbox and the event hook.
// Source-only invariants; nothing here talks to Supabase or FCM.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const sql = read('supabase/migrations/20260930090000_push_device_registrations.sql');
const planSql = read('supabase/migrations/20260818214500_watchdog_standard_entitlement_access_fix.sql');
const register = read('supabase/functions/push-device-register/index.ts');
const sender = read('supabase/functions/push-sender/index.ts');
const config = read('supabase/config.toml');
const pkg = JSON.parse(read('package.json'));
const between = (text, start, end) => { const a = text.indexOf(start); assert.ok(a >= 0, `missing ${start}`); const b = text.indexOf(end, a); assert.ok(b > a, `missing ${end}`); return text.slice(a, b); };

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
assert.match(sql, /revoke all on private\.push_runtime from public, anon, authenticated;/, 'worker runtime is not readable by browser roles');

for (const t of ['push_outbox']) {
  assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security;`));
  assert.match(sql, new RegExp(`revoke all on public\\.${t} from anon, authenticated;`));
}

// Token-free device list is the only thing authenticated may execute, and it
// returns exactly the register function's SAFE_COLUMNS.
const devicesFn = between(sql, 'create function public.get_my_push_devices()', 'grant execute on function public.get_my_push_devices() to authenticated;');
assert.doesNotMatch(devicesFn, /\btoken\b/, 'get_my_push_devices never selects the token column');
assert.match(devicesFn, /where r\.user_id = auth\.uid\(\)/);
assert.match(sql, /drop function if exists public\.get_my_push_devices\(\);/, 'result columns can change between source revisions');
const safeColumns = register.match(/const SAFE_COLUMNS = "([^"]+)"/)[1].split(',');
const rpcColumns = [...devicesFn.match(/returns table \(([\s\S]*?)\)\s*language sql/)[1].matchAll(/([a-z_]+) (?:uuid|text|boolean|smallint|timestamptz)/g)].map((m) => m[1]);
assert.deepEqual(rpcColumns, safeColumns, 'get_my_push_devices() and SAFE_COLUMNS must stay identical');
assert.ok(!safeColumns.includes('token') && !safeColumns.includes('token_hash'), 'responses never include the token');
const authenticatedGrants = [...sql.matchAll(/grant execute on function public\.([a-z_]+)\([^)]*\) to authenticated/g)].map((m) => m[1]);
assert.deepEqual(authenticatedGrants, ['get_my_push_devices'], 'only get_my_push_devices is executable by authenticated');

// Worker RPCs are service-role only, same shape as property alerts.
for (const fn of ['verify_push_worker(text)', 'claim_push_outbox(integer)', 'complete_push_outbox(bigint,boolean,text,uuid)', 'release_push_outbox(bigint,timestamptz,text)', 'defer_push_outbox(bigint,timestamptz)', 'invoke_push_sender()']) {
  assert.ok(sql.includes(`'${fn}'`), `${fn} is in the revoke/grant loop`);
}
assert.match(sql, /revoke all on function public\.%s from public, anon, authenticated/);
assert.match(sql, /grant execute on function public\.%s to service_role/);
assert.match(sql, /create table if not exists private\.push_runtime/);
assert.match(sql, /x-push-worker-token/);

// Claim: fan-out locks, marks and expands parents in one statement.
const claim = between(sql, 'create or replace function public.claim_push_outbox', 'create or replace function public.complete_push_outbox');
assert.match(claim, /with parents as \(\s*select o\.id from public\.push_outbox o\s*where o\.status = 'queued' and o\.registration_id is null[\s\S]*?for update skip locked\s*\),\s*done as \(\s*update public\.push_outbox o\s*set status = 'skipped', error = 'fanned_out'\s*from parents[\s\S]*?returning[\s\S]*?\)\s*insert into public\.push_outbox/, 'fan-out is a single locked statement');
assert.equal((claim.match(/registration_id is null/g) || []).length, 1, 'no second unlocked statement touches parent rows');
assert.match(claim, /o\.next_attempt_at <= now\(\)/, 'claim honours the backoff / quiet-hours time');

// Complete: failed sends back off; invalid tokens disable the device.
const complete = between(sql, 'create or replace function public.complete_push_outbox', 'create or replace function public.release_push_outbox');
assert.match(complete, /next_attempt_at = case when p_sent then next_attempt_at\s*else now\(\) \+ make_interval\(mins => least\(60, 2 \^ attempts\)::integer\) end/, 'retry backoff 2^attempts minutes capped at 60');
assert.match(complete, /disabled_reason = coalesce\(disabled_reason, 'invalid_token'\)/);
const releaseFn = between(sql, 'create or replace function public.release_push_outbox', 'create or replace function public.defer_push_outbox');
assert.match(releaseFn, /attempts = greatest\(attempts - 1, 0\)/, 'release does not count an attempt');
assert.match(sql, /select public\.release_push_outbox\(p_id, p_until, 'deferred_quiet_hours'\);/);

// Plan helper copies has_watchdog_plan's tier maps exactly.
const tierMaps = (text) => [...text.matchAll(/case\s+[^\n]+?\n((?:\s*when\s+'[a-z_+]+'\s+then\s+\d+\s*\n)+)\s*else\s+(\d+)\s*\n\s*end/g)]
  .map((m) => m[1].trim().split(/\n/).map((l) => l.trim()).join(' ') + ` else ${m[2]}`);
const sourceMaps = tierMaps(planSql), pushMaps = tierMaps(between(sql, 'create or replace function private.push_plan_allows', 'revoke all on function private.push_plan_allows'));
assert.equal(sourceMaps.length, 2, 'has_watchdog_plan has two tier maps');
assert.deepEqual(pushMaps, sourceMaps, 'private.push_plan_allows tier maps must match has_watchdog_plan (20260818214500)');
assert.match(sql, /20260818214500_watchdog_standard_entitlement_access_fix\.sql/, 'comment points at the source migration');

// Hook: guarded by the kill switch, an early device check, pause, plan and quiet hours.
const hook = between(sql, 'create or replace function private.push_enqueue_property_event()', 'create trigger trg_push_property_event');
const killSwitchAt = hook.indexOf('select enabled from public.push_settings where singleton');
const deviceCheckAt = hook.indexOf('if not exists (\n    select 1 from public.push_device_registrations d');
const pauseAt = hook.indexOf('property_alert_preferences p');
const planAt = hook.indexOf('private.push_plan_allows(new.user_id, new.minimum_plan)');
assert.ok(killSwitchAt >= 0 && deviceCheckAt > killSwitchAt && pauseAt > deviceCheckAt && planAt > pauseAt, 'order: kill switch, cheap device exists, pause, plan');
assert.match(hook, /d\.disabled_at is null and d\.alerts_enabled/);
assert.match(hook, /property_alert_preferences p[\s\S]*p\.paused/);
assert.match(hook, /order by d\.last_seen_at desc\s*limit 20/, 'defensive cap on devices per event');
assert.match(hook, /private\.push_in_quiet_hours\(r\.quiet_hours_start, r\.quiet_hours_end, r\.timezone\)/);
assert.match(hook, /private\.push_quiet_hours_end\(r\.quiet_hours_end, r\.timezone\)/);
assert.match(hook, /exception when others then[\s\S]*raise warning 'push_enqueue_property_event: %', sqlerrm;\s*return new;/, 'a push problem is logged and never blocks the producer insert');
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
assert.match(register, /const MAX_ACTIVE_DEVICES = 10;/, 'active devices per member are capped');
assert.match(register, /\.slice\(MAX_ACTIVE_DEVICES\)[\s\S]*disabled_reason: "replaced"/, 'overflow devices are retired, not rejected');
assert.match(register, /order\("last_seen_at", \{ ascending: false \}\)/, 'the least recently seen device is the one retired');
assert.doesNotMatch(register, /select\("\*"\)/, 'no wildcard select that could leak the token');
assert.doesNotMatch(register, /get_my_entitlement|has_watchdog_plan|watchdog_effective_plan/, 'no plan gate on registration');

// --- push-sender: worker token, configured gate, FCM v1, quiet hours, invalid tokens, outages. ---
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
assert.match(sender, /rpc\("release_push_outbox"/, 'outages release rows without an attempt');
assert.match(sender, /catch \(error\) \{[\s\S]*?const released = await release\(rows, OAUTH_RELEASE_MS/, 'OAuth failure releases every claimed row and stops');
assert.match(sender, /p_invalid_registration: row\.registration_id/, 'unregistered tokens disable the registration');
assert.match(sender, /httpStatus === 404 \|\| e\.codes\.includes\("UNREGISTERED"\)/);
assert.match(sender, /httpStatus === 403 && \(e\.codes\.includes\("SENDER_ID_MISMATCH"\)/, 'sender-id mismatch is a dead token');
assert.match(sender, /httpStatus === 400 && \(e\.codes\.includes\("INVALID_ARGUMENT"\)[^\n]*\/registration token\/i/, 'invalid-argument naming the token is a dead token');
assert.match(sender, /httpStatus === 429 \|\| httpStatus >= 500/, '429 and 5xx are outages');
for (const code of ['QUOTA_EXCEEDED', 'UNAVAILABLE', 'INTERNAL']) assert.ok(sender.includes(`"${code}"`), `${code} is treated as an outage`);
assert.match(sender, /headers\.get\("retry-after"\)/, 'Retry-After is honoured');
assert.match(sender, /if \(isOutage\(response\.status, err\)\) \{[\s\S]*?break;/, 'an outage stops the row loop');
assert.match(sender, /released, push_configured: true/);

// --- push-sender: the message is what the Android app decodes (watchdogandroid app/push/PushPayload.kt). ---
const alertsKt = read('watchdogandroid/core/src/main/kotlin/com/watchdogindex/agent/core/model/Alerts.kt');
const actionsKt = read('watchdogandroid/app/src/main/kotlin/com/watchdogindex/agent/push/NotificationActions.kt');
const routesKt = read('watchdogandroid/app/src/main/kotlin/com/watchdogindex/agent/navigation/IntentRoutes.kt');
const fcm = between(sender, 'function fcmMessage(', '// --- FCM error classification ---');
const iosAt = fcm.indexOf('if (row.platform === "ios")');
assert.ok(iosAt > 0, 'only an ios registration gets an alert payload');
assert.doesNotMatch(fcm.slice(0, iosAt), /\bnotification: \{/, 'Android messages are data-only: the app posts the notification itself');
assert.doesNotMatch(fcm.slice(0, iosAt), /\bapns\b/, 'APNs headers only on the ios branch');
assert.match(fcm, /android: \{ priority: "HIGH", collapse_key: collapse \}/, 'every push is a user-visible alert: high priority, collapsed per event');
for (const key of ['title,', 'body,', 'kind:', 'route:', 'pin:', 'event_id:', 'event_type:', 'severity,', 'channel:', 'actions:', 'collapse_key:', 'outbox_id:']) assert.ok(fcm.includes(key), `data map carries ${key.replace(/[:,]/, '')}`);
assert.match(fcm, /for \(const k of Object\.keys\(data\)\) if \(!data\[k\]\) delete data\[k\];/, 'FCM data values are non-empty strings');
// Channel ids are the app's AlertChannel ids, one system notification channel each (NotificationChannels.ensure).
const appChannels = [...alertsKt.matchAll(/^\s+[A-Za-z]+\("([a-z_]+)", "/gm)].map((m) => m[1]);
assert.deepEqual(appChannels, ['client_home_changes', 'farm_sales_deeds', 'town_rates_revaluations', 'appeal_deadlines', 'monday_brief'], 'AlertChannel ids in core/model/Alerts.kt');
const senderChannels = [...between(sender, 'const CHANNEL_IDS = {', '} as const;').matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
assert.deepEqual(senderChannels, appChannels, 'push-sender CHANNEL_IDS must equal the app AlertChannel ids, in order');
const channelRule = between(sender, 'function channelFor(', 'function actionsFor(');
for (const [eventType, channel] of [['deed_change', 'farmSalesDeeds'], ['municipal_change', 'townRatesRevaluations'], ['appeal_deadline', 'appealDeadlines']]) {
  assert.ok(channelRule.includes(`if (eventType === "${eventType}") return CHANNEL_IDS.${channel};`), `${eventType} posts on ${channel} (LiveAlertsRepository.channelFor)`);
}
assert.match(channelRule, /if \(kind === "digest"\) return CHANNEL_IDS\.mondayBrief;/);
assert.match(channelRule, /return CHANNEL_IDS\.clientHomeChanges;\s*\}$/m, 'everything else is a client home change');
// Action words are ones NotificationActions.kindOf understands; never call_client (no phone number in the pipeline).
const appActionWords = new Set([...between(actionsKt, 'return when (key) {', 'else -> null').matchAll(/"([a-z_]+)"/g)].map((m) => m[1]));
const senderActionWords = [...between(sender, 'function actionsFor(', 'function routeFor(').matchAll(/return "([a-z_,]+)"/g)].flatMap((m) => m[1].split(','));
assert.ok(senderActionWords.length >= 4, 'actionsFor covers digest, test, deed and other property events');
for (const word of senderActionWords) assert.ok(appActionWords.has(word), `the app understands the action word ${word}`);
assert.ok(!senderActionWords.includes('call_client'), 'no call_client: the pipeline has no phone number');
assert.ok(senderActionWords.filter((w) => w === 'later').length >= 2, 'property events offer Later');
assert.match(between(sender, 'function actionsFor(', 'function routeFor('), /if \(kind === "digest"\) return "open_brief";/);
// Route words are ones IntentRoutes.fromExtras understands; a digest lands on the brief, never on "pulse".
const appRouteWords = new Set([...between(routesKt, 'return when (word) {', 'else -> cleanPin').matchAll(/"([a-z-]+)"/g)].map((m) => m[1]));
const routeRule = between(sender, 'function routeFor(', 'function fcmMessage(');
const senderRouteWords = [...routeRule.matchAll(/(?:\|\| |: )"([a-z-]+)"/g)].map((m) => m[1]);
assert.deepEqual(senderRouteWords, ['brief', 'alerts', 'pulse'], 'digest -> brief, test -> alerts, property event -> pulse');
for (const word of senderRouteWords) assert.ok(appRouteWords.has(word), `the app understands the route word ${word}`);
assert.match(routeRule, /requested && requested !== "pulse" \? requested : "brief"/, 'a digest never routes to pulse');
assert.ok(appRouteWords.has('brief') && appRouteWords.has('digest'), 'the app accepts both digest route words');
// The earlier server words stay decodable on the phone (an older deployment of this function may still send them).
for (const legacy of ['property_alerts_action', 'property_alerts', 'open_property', 'mark_read', 'open_desk', 'open_app']) {
  assert.ok(actionsKt.includes(`"${legacy}"`) || read('watchdogandroid/app/src/main/kotlin/com/watchdogindex/agent/push/PushPayload.kt').includes(legacy), `the app still tolerates ${legacy}`);
}
assert.doesNotMatch(sender, /njpropertytaxrelief/i);

// --- Config and scripts. ---
assert.match(config, /\[functions\.push-device-register\]\nverify_jwt = true/);
assert.match(config, /\[functions\.push-sender\]\nverify_jwt = false/);
assert.match(config, /pg_cron with the private\.push_runtime worker token/);
assert.equal(pkg.scripts['test:push-notifications'], 'node property/tests/push-notifications-contract.mjs');
assert.doesNotMatch(pkg.scripts['vercel-build:full'] || '', /test:push-notifications/, 'not part of the Vercel build');

console.log('Push notifications contract passed.');
