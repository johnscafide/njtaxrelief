#!/usr/bin/env node
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const manifest = JSON.parse(read('browser-extension/watchdog-crm-companion/manifest.json'));
const popup = read('browser-extension/watchdog-crm-companion/popup.js');
const popupWrite = read('browser-extension/watchdog-crm-companion/popup-write-v021.js');
const popupHtml = read('browser-extension/watchdog-crm-companion/popup.html');
const content = read('browser-extension/watchdog-crm-companion/content.js');
const agentIntel = read('browser-extension/watchdog-crm-companion/agent-intel.js');
const writer = read('browser-extension/watchdog-crm-companion/writer-v021.js');
const background = read('browser-extension/watchdog-crm-companion/background.js');
const commandBar = read('browser-extension/watchdog-crm-companion/command-bar.js');
const municipalPacket = read('browser-extension/watchdog-crm-companion/municipal-packet.js');
const installer = read('agent/contacts/crm-companion-install.js');
const connect = read('agent/extension/connect/index.html');
const api = read('supabase/functions/watchdog-crm-companion/index.ts');
const analyticsApi = read('supabase/functions/watchdog-crm-companion-analytics/index.ts');
const analyticsPage = read('property/backoffice/crm-companion/index.html');
const migrationPair = read('supabase/migrations/20260915182601_njw_347_extension_pairings.sql');
const migrationSessions = read('supabase/migrations/20260915182606_njw_347_extension_sessions.sql');
const migrationEvents = read('supabase/migrations/20260915182612_njw_347_extension_analytics.sql');

const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

assert(manifest.manifest_version === 3, 'CRM Companion must remain Manifest V3.');
assert(manifest.version === '0.3.0', 'CRM Companion release must be v0.3.0.');
assert(Array.isArray(manifest.permissions) && manifest.permissions.includes('storage') && manifest.permissions.includes('activeTab'), 'CRM Companion must keep its explicit storage + activeTab permission model.');
assert(!manifest.permissions.includes('tabs') && !manifest.permissions.includes('scripting') && !manifest.permissions.includes('webRequest'), 'CRM Companion must not widen to tabs/scripting/webRequest permissions without review.');
assert((manifest.host_permissions || []).some((x) => x === 'https://app.boldtrail.com/*'), 'BoldTrail must be the only CRM page origin in the first adapter.');
const boldTrailScript = (manifest.content_scripts || []).find((x) => (x.matches || []).includes('https://app.boldtrail.com/*'));
assert(!!boldTrailScript, 'BoldTrail content script contract is missing.');
assert((boldTrailScript?.js || []).includes('content.js') && (boldTrailScript?.js || []).includes('agent-intel.js') && (boldTrailScript?.js || []).includes('writer-v021.js') && (boldTrailScript?.js || []).includes('command-bar.js'), 'BoldTrail must load scanner, Agent intelligence adapter, safe writer, and persistent command bar.');
assert(manifest.background?.service_worker === 'background.js', 'v0.3 must use a Manifest V3 service worker as the auth/API broker.');

for (const forbidden of ['SUPABASE_SERVICE_ROLE_KEY', 'sb_secret_', 'service_role']) {
  assert(!popup.includes(forbidden) && !popupWrite.includes(forbidden) && !content.includes(forbidden) && !agentIntel.includes(forbidden) && !writer.includes(forbidden) && !background.includes(forbidden) && !commandBar.includes(forbidden) && !municipalPacket.includes(forbidden), `Browser extension must not contain ${forbidden}.`);
}
assert(popup.includes('/agent/extension/connect/'), 'Extension must pair through the Watchdog connect page.');
assert(popup.includes('chrome.storage.local'), 'Opaque extension session must remain local to extension storage.');
assert(connect.includes('data-access-require="agent"'), 'Watchdog connection page must require Agent-or-higher access.');

for (const plan of ['agent', 'pro', 'pro_plus', 'teams', 'developer']) {
  assert(api.includes(`"${plan}"`), `Server paid-plan allowlist is missing ${plan}.`);
}
assert(api.includes('PAID_STATUSES') && api.includes('subscription_status'), 'Extension API must recheck current paid entitlement server-side.');
assert(api.includes('challenge_sha256') && api.includes('token_hash'), 'Extension pairing/session secrets must be persisted only as hashes.');
assert(api.includes('30*24*60*60*1000') || api.includes('30 * 24 * 60 * 60 * 1000'), 'Extension session expiry must remain bounded to 30 days.');
assert(api.includes('watchdog_extension_events'), 'Extension API must keep first-party usage analytics.');
assert(api.includes('SAFE_META_KEYS'), 'Extension analytics metadata must remain allowlisted.');
assert(!api.includes('contact_name') && !api.includes('contact_email') && !api.includes('contact_phone'), 'Server telemetry must not add CRM identity fields.');
assert(api.includes('NJ Office of GIS statewide Parcels and MOD-IV Composite'), 'Uncached NJ property matching must retain the official statewide parcel/MOD-IV fallback.');
assert(api.includes('lookup_ambiguous') && api.includes('lookup_no_match'), 'Property resolution must preserve fail-closed ambiguous/no-match outcomes.');

assert(api.includes('streetSimilarity') && api.includes('levenshtein'), 'v0.2 matcher must score street-name similarity rather than house-number coincidence alone.');
assert(api.includes('candidate_id') && api.includes('alternatives'), 'v0.2 must support deterministic candidate choice and next-best alternatives.');
assert(api.includes('property_watchdog_scores') && api.includes('watchdog_score'), 'v0.2 must expose sourced Watchdog Score when available.');
assert(api.includes('property_id:clean(row.pams_pin') || api.includes('property_id: clean(row.pams_pin'), 'Lookup response must carry exact PAMS PIN for a governed Watchdog property link.');
assert(api.includes('dwelling_units') && api.includes('building_description'), 'v0.2 must expose expanded Agent property facts.');
assert(popup.includes('candidate_id:item.id') && popup.includes('renderAlternatives'), 'Popup must use deterministic ranked alternatives.');
assert(popup.includes('fieldSearch') && popup.includes('fieldCategory') && popup.includes('fieldSort'), 'Agent data picker must support search, filter, and sort.');
assert(popupHtml.includes('wdc-field-search') && popupHtml.includes('wdc-field-category') && popupHtml.includes('wdc-field-sort'), 'Agent picker controls must be present in the popup UI.');

assert(popupHtml.includes('popup-write-v021.js') && popupWrite.includes('WATCHDOG_APPLY_PROPERTY_V021'), 'v0.2.1 popup must route explicit writes through the reliable write adapter.');
assert(writer.includes('WATCHDOG_APPLY_PROPERTY_V021'), 'v0.2.1 writer must remain behind the explicit popup apply message.');
assert(writer.includes('FIELD_LABELS') && writer.includes('aliasScore') && writer.includes('findBestField'), 'v0.2.1 must semantically match Watchdog facts to existing BoldTrail fields.');
assert(writer.includes('if(current&&current!==value){skipped.push'), 'v0.2.1 must refuse conflicting non-empty CRM fields.');
assert(writer.includes('enterEditMode') && writer.includes('saveContactEdits'), 'v0.2.1 must support explicit contact edit + persistence when fields are not already editable.');
assert(writer.includes('add note') && writer.includes('persistNote') && writer.includes('WATCHDOG PROPERTY INTELLIGENCE'), 'v0.2.1 must use a sourced BoldTrail note fallback instead of failing silently.');
assert(writer.includes('Watchdog Score:') && writer.includes('Sourced from Watchdog:') && writer.includes('Public-record warehouse verified:'), 'Fallback note must carry Watchdog Score and sourcing/verification dates.');
assert(writer.includes('https://www.watchdogindex.com/home?pin=') && writer.includes('property_id'), 'Fallback note must deep-link to the exact Watchdog property record.');
assert(installer.includes("VERSION='0.3.0'") && installer.includes("'writer-v021.js'") && installer.includes("'popup-write-v021.js'") && installer.includes("'background.js'") && installer.includes("'command-bar.js'") && installer.includes("'municipal-packet.html'"), 'Agent Contacts beta installer must package the complete v0.3 extension.');

assert(!/read\(\s*\[\s*['"](?:email|phone|name)/i.test(content), 'BoldTrail scanner must not read contact name/email/phone fields.');
assert(!/FIELD_LABELS\s*=\s*\{[^}]*\b(?:email|phone|name)\b/i.test(writer), 'v0.2.1 writer must not target CRM identity fields.');
assert(content.includes('WATCHDOG_SCAN_CONTACT'), 'BoldTrail scanner must remain behind an explicit extension scan message.');
assert(commandBar.includes('MutationObserver') && commandBar.includes('routeChanged') && commandBar.includes('setInterval'), 'v0.3 command bar must survive BoldTrail SPA navigation and refresh contact context.');
assert(commandBar.includes('Alt+W') && commandBar.includes("e.altKey") && commandBar.includes("e.key.toLowerCase()==='w'"), 'v0.3 must expose the Alt+W Agent Command Bar shortcut.');
assert(commandBar.includes("data-action=\"enrich\"") && commandBar.includes("data-action=\"town\"") && commandBar.includes("data-action=\"packet\"") && commandBar.includes("data-action=\"brief\""), 'v0.3 command bar must expose the core Agent workflows.');
const routeBlock = commandBar.match(/async function routeChanged\([\s\S]*?\n  \}/)?.[0] || '';
assert(commandBar.includes("WDC_SCAN_LOCAL") && commandBar.includes("ensureMatch") && !routeBlock.includes("WDC_API"), 'Contact route changes may scan locally, while remote Watchdog lookup remains action-driven.');
assert(background.includes("WDC_SCAN_LOCAL") && background.includes("WATCHDOG_SCAN_CONTACT") && background.includes("WDC_APPLY_PROPERTY") && background.includes("WATCHDOG_APPLY_PROPERTY_V021"), 'Service worker must broker local scan and safe write messages.');
assert(api.includes('municipal.preview') && api.includes('transaction_municipal_requirements') && api.includes('never_infer_not_required'), 'Extension API must expose governed municipal closing intelligence without inferring not-required from missing coverage.');
assert(municipalPacket.includes('Print / Save PDF') && municipalPacket.includes('Missing web coverage is never treated'), 'Instant Municipal Packet must be printable and preserve the municipal verification caveat.');

for (const sql of [migrationPair, migrationSessions, migrationEvents]) {
  assert(/enable row level security/i.test(sql), 'Every CRM Companion persistence table must keep RLS enabled.');
}
assert(analyticsPage.includes('data-access-require="developer"'), 'Raw aggregate extension analytics UI must remain developer-only.');
assert(analyticsApi.includes('account_role') && analyticsApi.includes('developer_required'), 'Analytics API must independently verify developer role.');

if (failures.length) {
  console.error(JSON.stringify({ passed: false, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  passed: true,
  contract: 'watchdog-crm-companion-v3',
  checks: 60,
  matching: 'street-dominant-ranked-candidates',
  writes: 'semantic-empty-fields-with-sourced-note-fallback',
  shell: 'persistent-shadow-dom-command-bar',
  municipal: 'official-registry-preview-and-printable-packet',
  evidence: 'watchdog-score-date-and-exact-property-link',
  privacy: 'no-contact-identity-telemetry',
  entitlement: 'agent-or-higher-paid'
}, null, 2));
