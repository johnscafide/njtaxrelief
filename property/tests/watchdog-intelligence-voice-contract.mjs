#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const fail = [];
const assert = (condition, message) => { if (!condition) fail.push(message); };

const wrapperPath = 'api/watchdog-intelligence-voice.js';
const corePath = 'api/watchdog-intelligence-voice-core.js';
const usagePath = 'api/watchdog-intelligence-voice-browser-usage.js';
const uiPath = 'property/js/watchdog-intelligence-voice.js';
const browserPath = 'property/js/watchdog-intelligence-voice-browser.js';
const addonPath = 'property/js/data-workbench-analyst-addon.js';
const analystPath = 'supabase/functions/intelligence-analyst/index.ts';
const pagePath = 'property/data-workbench/index.html';
const cssPath = 'property/css/watchdog-intelligence-voice.css';

for (const file of [wrapperPath, corePath, usagePath, uiPath, browserPath, addonPath, analystPath, pagePath, cssPath]) {
  assert(fs.existsSync(path.join(root, file)), `Missing Voice Intelligence artifact: ${file}`);
}

const wrapper = read(wrapperPath);
const core = read(corePath);
const api = `${wrapper}\n${core}`;
const usage = read(usagePath);
const ui = read(uiPath);
const browser = read(browserPath);
const addon = read(addonPath);
const analyst = read(analystPath);
const page = read(pagePath);

assert(wrapper.includes("getVercelOidcToken"), 'Voice API must support Vercel request-context OIDC authentication.');
assert(wrapper.includes("oidc_request_context"), 'Voice API must expose the OIDC authentication path for diagnostics.');
assert(wrapper.includes("ai-gateway-protocol-version"), 'Fish Gateway requests must include the required Gateway protocol version.');
assert(api.includes("fish-audio/s2.1-pro-free"), 'Server speech fallback must retain the Fish Audio -free billing guard.');
assert(api.includes("fish-audio/transcribe-1-free"), 'Server transcription fallback must retain the Fish Audio -free billing guard.');
assert(!core.includes("fish-audio/s2.1-pro';"), 'Unbounded paid Fish speech must not replace the fail-closed server fallback.');
assert(!core.includes("fish-audio/transcribe-1';"), 'Unbounded paid Fish transcription must not replace the fail-closed server fallback.');
assert(api.includes("WATCHDOG_VOICE_ENABLED"), 'Voice API must retain its independent rollout kill switch.');
assert(api.includes("raw_audio_persisted: false"), 'Server Voice must preserve the no-raw-audio-retention boundary.');
assert(api.includes("VOICE_ADDON_FEATURE = 'watchdog_intelligence'"), 'Voice API must use the Watchdog Intelligence add-on feature key.');
assert(api.includes('account_feature_entitlements'), 'Voice API must read the server-owned feature entitlement contract.');
assert(api.includes('includedByPlan(plan)'), 'Pro+ and higher plans must retain included Voice access.');
assert(api.includes("get_my_entitlement"), 'Voice API must derive base entitlement from the server-side Supabase contract.');
assert(api.includes("rendered_governed_analyst_response"), 'Server speech fallback must identify the governed written Analyst response as its source.');

assert(usage.includes("provider: 'browser_web_speech'"), 'Browser Voice usage must be recorded in Intelligence telemetry.');
assert(usage.includes("model: kind === 'speech' ? 'browser_speech_synthesis' : 'browser_speech_recognition'"), 'Browser Voice telemetry must identify the browser capability used.');
assert(usage.includes("raw_audio_persisted: false"), 'Browser Voice telemetry must explicitly preserve no raw-audio retention.');
assert(usage.includes("get_my_entitlement"), 'Browser Voice telemetry must verify the server-owned plan entitlement.');
assert(usage.includes('account_feature_entitlements'), 'Browser Voice telemetry must verify Agent/Pro add-on access.');
assert(usage.includes("DAILY_LIMITS = { transcription: 40, speech: 60 }"), 'Browser Voice must retain bounded daily usage controls.');

assert(browser.includes('window.SpeechRecognition || window.webkitSpeechRecognition'), 'V1 must provide zero-spend browser speech recognition.');
assert(browser.includes("'speechSynthesis' in window"), 'V1 must provide browser speech synthesis for spoken briefs.');
assert(browser.includes("Transcript ready. Review it, then choose Ask Watchdog."), 'Browser transcription must require user review before Analyst submission.');
assert(!browser.includes('intelligence-analyst'), 'Browser Voice must never submit directly to Analyst or bypass the existing governed composer.');
assert(browser.includes("input.value = transcript"), 'Browser recognition must write the transcript into the existing Analyst composer.');
assert(browser.includes("briefText(message)"), 'Browser speech must derive playback from the rendered written Analyst response.');
assert(browser.includes("raw_audio_persisted" ) === false, 'Browser client must never serialize a raw-audio persistence field or recording payload.');
assert(!browser.includes('audio_base64'), 'Browser-primary Voice must not upload microphone audio.');
assert(browser.includes("reserve('transcription')"), 'Browser transcription must reserve/log usage before starting recognition.');
assert(browser.includes("reserve('speech')"), 'Browser speech must reserve/log usage before playback.');

assert(ui.includes("Transcript ready. Review it, then choose Ask Watchdog."), 'Fish fallback transcript must still require review before Analyst submission.');
assert(!ui.includes("ask(data.text"), 'Fish fallback transcription must not bypass typed Analyst submission.');
assert(ui.includes("extractBrief(message)"), 'Fish fallback spoken playback must remain derived from the written response.');

assert(analyst.includes('INTELLIGENCE_ADDON_FEATURE="watchdog_intelligence"'), 'Analyst server must recognize the Watchdog Intelligence feature entitlement.');
assert(analyst.includes('addonActive=plan==="agent"&&featureActive(addon)'), 'Agent Analyst access must require the active add-on server-side.');
assert(analyst.includes('analystAllowed=(PLAN_RANK[plan]??0)>=PLAN_RANK.pro||addonActive'), 'Analyst must preserve Pro plan access while adding Agent add-on access.');
assert(addon.includes("FEATURE = 'watchdog_intelligence'"), 'Agent UI bridge must use the same feature key as the server.');
assert(addon.includes("client.functions.invoke('intelligence-analyst'"), 'Agent add-on questions must use the same governed Analyst function as typed Pro questions.');

const analystScript = '/property/js/data-workbench-analyst.js';
const addonScript = '/property/js/data-workbench-analyst-addon.js';
const voiceScript = '/property/js/watchdog-intelligence-voice.js';
const browserScript = '/property/js/watchdog-intelligence-voice-browser.js';
assert(page.includes(analystScript), 'Existing governed Analyst must remain loaded.');
assert(page.includes(addonScript), 'Agent add-on Analyst bridge must remain loaded.');
assert(page.includes(voiceScript), 'Fish server Voice fallback must remain loaded.');
assert(page.includes(browserScript), 'Browser-primary Voice v1 must be loaded.');
assert(page.indexOf(analystScript) < page.indexOf(addonScript), 'Agent add-on bridge must load after governed Analyst.');
assert(page.indexOf(addonScript) < page.indexOf(voiceScript), 'Voice server decorator must load after both Analyst access paths.');
assert(page.indexOf(voiceScript) < page.indexOf(browserScript), 'Browser Voice must load after the server Voice decorator so it can safely override provider-unavailable interactions.');

if (fail.length) {
  console.error(JSON.stringify({ passed: false, contract: 'watchdog-intelligence-voice-v1-browser-fallback-v3', failures: fail }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  passed: true,
  contract: 'watchdog-intelligence-voice-v1-browser-fallback-v3',
  primary_voice_path: 'browser_web_speech',
  server_fallback: 'fish_audio_via_vercel_ai_gateway',
  zero_spend_primary_path: true,
  request_context_oidc: true,
  rollout_kill_switch: true,
  raw_audio_persisted: false,
  transcript_review_before_submit: true,
  spoken_response_source: 'governed_written_analyst_response',
  packaging: 'agent_or_pro_with_watchdog_intelligence_addon_or_pro_plus_and_higher',
  underlying_data_model_entitlements_preserved: true
}, null, 2));
