#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const fail = [];
const assert = (condition, message) => { if (!condition) fail.push(message); };

const apiPath = 'api/watchdog-intelligence-voice.js';
const uiPath = 'property/js/watchdog-intelligence-voice.js';
const addonPath = 'property/js/data-workbench-analyst-addon.js';
const analystPath = 'supabase/functions/intelligence-analyst/index.ts';
const pagePath = 'property/data-workbench/index.html';
const cssPath = 'property/css/watchdog-intelligence-voice.css';

for (const file of [apiPath, uiPath, addonPath, analystPath, pagePath, cssPath]) {
  assert(fs.existsSync(path.join(root, file)), `Missing Voice Intelligence artifact: ${file}`);
}

const api = read(apiPath);
const ui = read(uiPath);
const addon = read(addonPath);
const analyst = read(analystPath);
const page = read(pagePath);

assert(api.includes("fish-audio/s2.1-pro-free"), 'Speech model must retain the Fish Audio -free billing guard.');
assert(api.includes("fish-audio/transcribe-1-free"), 'Transcription model must retain the Fish Audio -free billing guard.');
assert(!api.includes("fish-audio/s2.1-pro';"), 'Unbounded paid Fish speech model must not replace the pilot model.');
assert(!api.includes("fish-audio/transcribe-1';"), 'Unbounded paid Fish transcription model must not replace the pilot model.');
assert(api.includes("WATCHDOG_VOICE_ENABLED"), 'Voice API must retain its independent rollout kill switch.');
assert(api.includes("rollout_enabled: VOICE_ENABLED"), 'Voice status must expose the rollout switch state.');
assert(api.includes("if (!VOICE_ENABLED)"), 'Voice provider actions must fail closed when the rollout switch is disabled.');
assert(api.includes("raw_audio_persisted: false"), 'Voice API must explicitly record the no-raw-audio-retention boundary.');
assert(api.includes("eventType: 'voice_transcription'"), 'Transcription usage telemetry must remain enabled.');
assert(api.includes("eventType: 'voice_speech'"), 'Speech usage telemetry must remain enabled.');
assert(api.includes("VOICE_ADDON_FEATURE = 'watchdog_intelligence'"), 'Voice API must use the Watchdog Intelligence add-on feature key.');
assert(api.includes('account_feature_entitlements'), 'Voice API must read the server-owned feature entitlement contract.');
assert(api.includes("['agent', 'pro'].includes(plan)"), 'Agent and Pro must be eligible through an active Watchdog Intelligence add-on.');
assert(api.includes('includedByPlan(plan)'), 'Pro+ and higher plans must retain included Voice access.');
assert(api.includes("get_my_entitlement"), 'Voice API must derive base entitlement from the server-side Supabase contract.');
assert(api.includes("rendered_governed_analyst_response"), 'Speech must identify the governed written Analyst response as its source.');
assert(api.includes("base64Payload(result?.audio)"), 'Speech audio must use dedicated base64 validation instead of text sanitization.');

assert(analyst.includes('INTELLIGENCE_ADDON_FEATURE="watchdog_intelligence"'), 'Analyst server must recognize the Watchdog Intelligence feature entitlement.');
assert(analyst.includes('addonActive=plan==="agent"&&featureActive(addon)'), 'Agent Analyst access must require the active add-on server-side.');
assert(analyst.includes('analystAllowed=(PLAN_RANK[plan]??0)>=PLAN_RANK.pro||addonActive'), 'Analyst must preserve Pro plan access while adding Agent add-on access.');
assert(analyst.includes('access_path:addonActive?"watchdog_intelligence_add_on":"plan"'), 'Analyst telemetry must identify the add-on access path.');

assert(addon.includes("FEATURE = 'watchdog_intelligence'"), 'Agent UI bridge must use the same feature key as the server.');
assert(addon.includes("usage.data?.plan !== 'agent'"), 'Agent UI bridge must be bounded to Agent accounts.');
assert(addon.includes("client.from('account_feature_entitlements')"), 'Agent UI bridge must verify the owner-readable feature entitlement.');
assert(addon.includes("client.functions.invoke('intelligence-analyst'"), 'Agent add-on questions must use the same governed Analyst function as typed Pro questions.');
assert(!addon.includes('Opportunity Value'), 'Agent Intelligence add-on must not silently unlock unrelated Pro Opportunity Value functionality.');

assert(ui.includes("Transcript ready. Review it, then choose Ask Watchdog."), 'Voice transcript must require user review before Analyst submission.');
assert(!ui.includes("ask(data.text"), 'Voice transcription must not bypass the existing typed Analyst submission path.');
assert(ui.includes("extractBrief(message)"), 'Spoken playback must be derived from the rendered written Analyst response.');
assert(ui.includes("getUserMedia"), 'Voice UI must use explicit browser microphone permission.');
assert(ui.includes("Maximum 45 seconds"), 'Voice UI must retain the bounded recording window.');

const analystScript = '/property/js/data-workbench-analyst.js';
const addonScript = '/property/js/data-workbench-analyst-addon.js';
const voiceScript = '/property/js/watchdog-intelligence-voice.js';
assert(page.includes(analystScript), 'Existing governed Analyst must remain loaded.');
assert(page.includes(addonScript), 'Agent add-on Analyst bridge must be loaded.');
assert(page.includes(voiceScript), 'Voice decorator must be loaded alongside Analyst.');
assert(page.indexOf(analystScript) < page.indexOf(addonScript), 'Agent add-on bridge must load after the governed Analyst implementation.');
assert(page.indexOf(addonScript) < page.indexOf(voiceScript), 'Voice decorator must load after both Analyst access paths are established.');

if (fail.length) {
  console.error(JSON.stringify({ passed: false, contract: 'watchdog-intelligence-voice-pilot-v2', failures: fail }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  passed: true,
  contract: 'watchdog-intelligence-voice-pilot-v2',
  provider: 'fish_audio_via_vercel_ai_gateway',
  free_model_guard: true,
  rollout_kill_switch: true,
  raw_audio_persisted: false,
  transcript_review_before_submit: true,
  spoken_response_source: 'governed_written_analyst_response',
  packaging: 'agent_or_pro_with_watchdog_intelligence_addon_or_pro_plus_and_higher',
  underlying_data_model_entitlements_preserved: true
}, null, 2));
