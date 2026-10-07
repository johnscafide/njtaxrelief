// Data Center / Data Workbench marker wiring contract (no browser, no network).
// Locks in: one registry download per page, explicit parcel-field wiring (town/county/derived
// markers never borrow a parcel value), readable missing-value states, structured values that never
// render as [object Object], the full field library, loop-free Workbench resolvers, the governed
// catalog generator, and that every live source-reference marker is producible from committed data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const json = (file) => JSON.parse(read(file));

const dcHtml = read('property/data-center/index.html');
const dwHtml = read('property/data-workbench/index.html');
const runtimeSrc = read('property/js/data-marker-runtime.js');
const workbench = read('property/js/data-workbench.js');
const enhancements = read('property/js/data-workbench-enhancements.js');
const derivedBridge = read('property/js/data-workbench-derived-bridge.js');
const providerStatus = read('property/js/data-workbench-provider-status.js');
const coverageJs = read('property/js/data-workbench-coverage.js');
const governance = read('property/js/provider-governance.js');
const dcRuntime = read('property/js/data-center-runtime-v2.js');
const dcPublic = read('property/js/data-center-public-v2.js');
const dcFilter = read('property/js/data-center-provider-filter.js');
const registry = json('property/data/marker-registry.json');
const markers = registry.markers;

// ---- Pages load the shared runtime before every data script, once. ----
const scriptOrder = (html, name) => html.indexOf(`/property/js/${name}`);
assert.ok(scriptOrder(dcHtml, 'data-marker-runtime.js') > 0, 'Data Center loads data-marker-runtime.js');
for (const name of ['data-center-runtime-v2.js', 'data-center-public-v2.js', 'data-center-provider-filter.js', 'marker-intelligence.js', 'provider-governance.js']) {
  assert.ok(scriptOrder(dcHtml, 'data-marker-runtime.js') < scriptOrder(dcHtml, name), `data-marker-runtime.js loads before ${name}`);
}
assert.ok(scriptOrder(dwHtml, 'data-marker-runtime.js') > 0 && scriptOrder(dwHtml, 'data-marker-runtime.js') < scriptOrder(dwHtml, 'data-workbench.js'), 'Data Workbench loads the shared runtime before data-workbench.js');
assert.doesNotMatch(dwHtml, /\?v=/, 'Data Workbench keeps its no-query-string asset policy');

// One registry download: data scripts go through WatchdogMarkerRuntime (the fetch is a fallback only).
for (const [name, src] of [['data-center-runtime-v2.js', dcRuntime], ['data-center-public-v2.js', dcPublic], ['data-center-provider-filter.js', dcFilter], ['provider-governance.js', governance], ['data-workbench.js', workbench]]) {
  assert.match(src, /WatchdogMarkerRuntime/, `${name} uses the shared registry loader`);
  assert.doesNotMatch(src, /marker-registry\.json\?v=/, `${name} no longer downloads its own cache-busted registry copy`);
}
// The provider filter reuses the public runtime's single overview call.
assert.match(dcFilter, /WatchdogDataCenterPublic/);
assert.match(dcFilter, /publicRuntime\.ready/);

// ---- Data Center: one status rule, explicit load/error states, clean URLs, accessible drawer. ----
assert.match(dcPublic, /function effectiveStatus\(marker\)/);
assert.match(dcRuntime, /function statusFor\(marker\)/);
assert.match(dcRuntime, /effectiveStatus/);
assert.match(governance, /function dataCenterGoverned\(\)/, 'static provider governance defers to the governed Data Center runtime');
assert.match(governance, /if\(!dataCenterGoverned\(\)\)applyDataCenter\(\)/);
for (const id of ['dc-overview-error', 'dc-catalog-error', 'dc-source-freshness-error', 'dc-category-coverage-error']) {
  assert.match(dcHtml, new RegExp(`id="${id}"[^>]*hidden`), `#${id} is authored in HTML and hidden by default`);
}
assert.equal((dcHtml.match(/data-dc-retry/g) || []).length, 2, 'both load-failure notices offer Try again');
assert.match(dcHtml, /id="dc-marker-drawer"[^>]*role="dialog"/);
assert.match(dcPublic, /focus\(\{ preventScroll: true \}\)/, 'opening a marker moves focus into the drawer');
assert.match(dcPublic, /'\/marker\?id=' \+ encodeURIComponent\(id\)/, 'marker reference link uses the clean /marker route');
assert.doesNotMatch(dcPublic + dcRuntime, /'\/property\/(pro|marker)/, 'Data Center runtime links are root-level');
assert.doesNotMatch(dcHtml, /href="\/property\/(pro|marker)/);
// Planned/unavailable fields stay visible under their Availability filter but cannot be added.
assert.match(dcRuntime, /var selectable = status === 'live' \|\| status === 'partial'/);
// Every selected field is offered to workbench-derived (some public-origin markers resolve there).
assert.match(dcRuntime, /var derived = selected\.slice\(\);/);
assert.match(dcRuntime, /Sheet could not be built: ' \+ reason/);
assert.match(dcRuntime, /setBuilding\(false\)/);

// ---- Data Workbench: no resolver loops, full field library, state-aware cells. ----
assert.doesNotMatch(workbench, /\.slice\(0,721\)/, 'field library lists every catalog marker');
assert.match(workbench, /window\.WatchdogDataWorkbench=\{mergeProviderPayload,scheduleRender,hasValue/);
assert.match(workbench, /display\(r,id,true\)/, 'CSV export writes full structured values');
for (const [name, src] of [['data-workbench-enhancements.js', enhancements], ['data-workbench-derived-bridge.js', derivedBridge], ['data-workbench-provider-status.js', providerStatus]]) {
  assert.doesNotMatch(src, /observe\(\s*(?:target|rows|head|\$\('#dw-(?:rows|head)'\))\s*,\s*\{\s*childList:\s*true,\s*subtree:\s*true/, `${name} does not observe cell-level grid mutations`);
  assert.doesNotMatch(src, /lastSignature=''|last=''/, `${name} does not reset its request signature on every render`);
}
assert.doesNotMatch(providerStatus, /cell\.(?:textContent|innerHTML|title)\s*=/, 'provider-status never rewrites cell text');
assert.match(coverageJs, /function set\(node,key,value\)\{if\(node&&node\[key\]!==value\)/, 'coverage decoration writes are idempotent');
assert.doesNotMatch(enhancements, /function direct\(/, 'regex-based value borrowing is gone');

// ---- Root-level page navigation from the data pages' own scripts (AGENTS.md: /property/ is only the repo path). ----
const pageScripts = ['data-center-shell-2027.js', 'data-center-public-v2.js', 'data-center-runtime-v2.js', 'data-center-provider-filter.js', 'data-center-mobile-results.js', 'data-center-mobile-recovery.js', 'data-workbench-shell-2027.js', 'data-workbench.js', 'data-workbench-enhancements.js', 'data-workbench-derived-bridge.js', 'data-workbench-intelligence.js', 'data-workbench-marketing-studio.js', 'data-workbench-pcm.js'];
for (const name of pageScripts) {
  const code = read('property/js/' + name);
  assert.doesNotMatch(code, /location\.(?:href|assign|replace)\s*[=(]\s*['"`]\/property\//, `${name} navigates to a root-level URL`);
  assert.doesNotMatch(code, /\.href\s*=\s*['"`]\/property\/(?!js\/|css\/|data\/|assets\/)/, `${name} sets root-level link targets`);
}
assert.match(dcHtml, /<template id="dc-pagebar-actions">[^]*href="\/dashboard"[^]*href="\/data-workbench"[^]*<\/template>/, 'Data Center page actions are authored in HTML with root-level URLs');
assert.match(workbench, /function cleanPageHref\(href\)/, 'Workbench normalizes script-rendered page links to root-level URLs');

// ---- Coverage registration migration: only evidenced, catalog-live markers; none of the unverifiable ones. ----
const migration = read('supabase/migrations/20260929170000_register_verified_catalog_markers.sql');
const registered = [...migration.matchAll(/^  \('([^']+)',array\[/gm)].map((m) => m[1]);
assert.ok(registered.length > 0, 'migration registers markers');
assert.equal(new Set(registered).size, registered.length, 'each marker is registered once');
const catalogById = new Map(markers.map((m) => [m.id, m]));
for (const id of registered) assert.equal(catalogById.get(id)?.provider_status, 'live', `${id} is a catalog-live marker`);
const notRegistered = [...migration.matchAll(/^--\s+(?:unverifiable|failed)\s+([a-z0-9_.-]+):/gm)].map((m) => m[1]);
assert.ok(notRegistered.length > 0, 'migration lists markers left unregistered with a reason');
for (const id of notRegistered) assert.ok(!registered.includes(id), `${id} without evidence is not registered`);
assert.doesNotMatch(migration, /now\(\)/, 'last_verified_at records the evidence time, not the apply time');
const rowBlocks = migration.split(/\n  \('/).slice(1);
assert.equal(rowBlocks.length, registered.length);
for (const block of rowBlocks) {
  assert.match(block, /,'live',/);
  assert.match(block, /(Resolver|Artifact|Warehouse) evidence: /, 'every row names its evidence');
  assert.match(block, / = [^;.']/, 'every row records an observed value');
}

// ---- Shared runtime behaviour (evaluated in a sandbox). ----
const sandbox = { window: {}, fetch: () => Promise.reject(new Error('no network')), console };
vm.createContext(sandbox);
vm.runInContext(runtimeSrc, sandbox);
const rt = sandbox.window.WatchdogMarkerRuntime;
assert.ok(rt, 'WatchdogMarkerRuntime is defined');
const parcelRow = { pams_pin: '0409_1_1', address: '1 Main St', town: 'Cherry Hill Township', county: 'Camden', zip: '08002', block: '10', lot: '5', qualifier: 'C01', prop_class: '2', prop_use: 'RES', year_built: 1962, acres: 0.25, dwelling_units: 1, building_desc: '2S', land_value: 90000, improvement_value: 160000, assessed_value: 250000, last_year_tax: 8200, effective_rate: 3.28, last_sale_price: 400000, last_sale_year: 2019, deed_date: '2019-05-01', deed_book: '1', deed_page: '2', owner_name: 'OWNER', lat: 39.9, lon: -75.0, cd_code: '0409', watchdog_value: 410000 };
const borrowed = markers.filter((m) => m.scope !== 'property' && rt.parcelValue(m.id, parcelRow) != null).map((m) => m.id);
assert.deepEqual(borrowed, [], `town/county markers must never read a parcel field: ${borrowed.join(', ')}`);
const derivedBorrowed = markers.filter((m) => m.origin === 'watchdog-derived' && !['watchdog.market_value_estimate', 'watchdog.effective_tax_rate'].includes(m.id) && rt.parcelValue(m.id, parcelRow) != null).map((m) => m.id);
assert.deepEqual(derivedBorrowed, [], `derived markers must come from their provider: ${derivedBorrowed.join(', ')}`);
assert.equal(rt.parcelValue('property.lot_area', parcelRow), 0.25, 'lot area reads acres, not the tax lot number');
assert.equal(rt.parcelValue('property.lot_area_sqft', parcelRow), Math.round(0.25 * 43560));
assert.equal(rt.parcelValue('property.sale_date', parcelRow), '2019-05-01');
assert.equal(rt.parcelValue('property.treasury_code', parcelRow), '0409');
assert.equal(rt.parcelValue('property.property_class', parcelRow), '2');
assert.equal(rt.parcelValue('property.lot', parcelRow), '5');
const history = { 2021: 97.1, 2022: 98.0, 2023: 98.4 };
assert.equal(rt.formatValue('x.rut_tax_collection_pct_history', history, { unit: 'ratio' }), '2023: 98.4 · 3 yrs');
assert.equal(rt.formatValue('x.rut_tax_collection_pct_history', history, { unit: 'ratio' }, { full: true }), '2021: 97.1; 2022: 98; 2023: 98.4');
assert.match(rt.formatValue('x.trace', [{ year: 2024, total: 1 }, { year: 2025, total: 2 }], null), /^2025: total 2 · 2 yrs$/);
assert.doesNotMatch(rt.formatValue('x', { a: 1 }, null), /\[object Object\]/);
assert.equal(rt.formatValue('property.assessed_value', 250000, { unit: 'currency' }), '$250,000');
assert.equal(rt.formatValue('property.last_sale_year', 2019, null), '2019');
assert.equal(rt.formatValue('property.lot_area_sqft', 10890, { unit: 'square feet' }), '10,890 sq ft');
assert.equal(rt.formatValue('m.share', 12.5, { unit: 'percent' }), '12.5%');
const states = ['source_checked_no_value', 'not_computed', 'dependency_missing', 'provider_missing', 'provider_error', 'not_entitled', 'redacted_by_source'];
const labels = states.map((s) => rt.statusLabel(s));
assert.equal(new Set(labels).size, states.length, 'every provider state has its own label');
assert.ok(labels.every((l) => l && l !== 'Not available'), 'provider states never collapse to a generic label');
assert.ok(states.every((s) => rt.statusHint(s).length > 20), 'every provider state explains itself');

// ---- Governed catalog generator: DB-live markers without a source-pack entry join the catalog. ----
const defs = json('property/data/governed-marker-definitions.json');
const overlay = { ...json('property/data/db-governed-status.json').statuses, ...json('property/data/db-governed-provider-overlay.json').statuses };
for (const def of defs.markers) {
  for (const key of ['id', 'label', 'description', 'category', 'scope', 'tier', 'origin', 'source_id', 'field']) assert.ok(def[key], `${def.id} defines ${key}`);
  assert.ok(['property', 'municipality', 'county'].includes(def.scope), `${def.id} uses a catalog scope`);
  assert.ok(['live', 'partial'].includes(overlay[def.id]), `${def.id} is governed live in the committed DB snapshot`);
  assert.doesNotMatch(def.label, /mailing/i, `${def.id} is not presented as a mailing field`);
}
for (const [alias, target] of Object.entries(defs.aliases)) assert.ok(markers.some((m) => m.id === target), `alias ${alias} targets catalog marker ${target}`);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-governance-'));
try {
  fs.mkdirSync(path.join(tmp, 'property/data'), { recursive: true });
  for (const f of ['marker-registry.json', 'derived-marker-formulas.json', 'db-governed-status.json', 'db-governed-provider-overlay.json', 'governed-marker-definitions.json']) fs.copyFileSync(path.join(root, 'property/data', f), path.join(tmp, 'property/data', f));
  execFileSync(process.execPath, [path.join(root, 'scripts/build-derived-governance.js')], { cwd: tmp, stdio: 'pipe' });
  const built = JSON.parse(fs.readFileSync(path.join(tmp, 'property/data/marker-registry.json'), 'utf8'));
  const gov = JSON.parse(fs.readFileSync(path.join(tmp, 'property/data/derived-marker-governance.json'), 'utf8'));
  const ids = built.markers.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, 'generated catalog has unique ids');
  assert.equal(gov.summary.untriaged, 0);
  for (const def of defs.markers) assert.ok(ids.includes(def.id), `generator adds governed marker ${def.id}`);
  for (const alias of Object.keys(defs.aliases)) assert.ok(!ids.includes(alias), `alias ${alias} is not listed twice`);
  assert.deepEqual(built.marker_aliases, defs.aliases);
  const counted = built.markers.reduce((acc, m) => { acc[m.provider_status] = (acc[m.provider_status] || 0) + 1; return acc; }, {});
  for (const k of ['live', 'partial', 'planned', 'unavailable']) assert.equal(Number(built.summary.provider_status[k] || 0), Number(counted[k] || 0), `summary ${k} reconciles`);
  for (const [id, status] of Object.entries(overlay)) { const m = built.markers.find((x) => x.id === id); if (m) assert.equal(m.provider_status, status, `${id} follows the governed DB status`); }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ---- Every live source-reference marker resolves from committed reference data. ----
// The resolver functions are evaluated from the workbench-hydrate source so the check tracks the code.
const hydrateSrc = read('supabase/functions/workbench-hydrate/index.ts');
function grab(name) {
  const start = hydrateSrc.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `workbench-hydrate defines ${name}()`);
  let depth = 0;
  for (let i = hydrateSrc.indexOf('{', start); i < hydrateSrc.length; i += 1) {
    if (hydrateSrc[i] === '{') depth += 1;
    else if (hydrateSrc[i] === '}') { depth -= 1; if (!depth) return hydrateSrc.slice(start, i + 1); }
  }
  throw new Error(`unterminated ${name}`);
}
const stripTypes = (code) => code.replace(/:\s*(any|string|number|boolean)(\[\])?(?=[,)=;\s{])/g, '').replace(/ as number\[\]/g, '').replace(/ as any/g, '');
const resolvers = new Function('BUDGET_DERIVED_FIELDS', ['n', 'propField', 'sr1aValue', 'uniformityValue', 'appealValue', 'budgetValue'].map((f) => stripTypes(grab(f))).join('\n') + '; return { propField, sr1aValue, uniformityValue, appealValue, budgetValue };')(new Set());
const ref = { sr1a: json('property/sr1a-ratios.json'), uniformity: json('property/uniformity.json'), codHistory: json('property/data/cod/historical-cod-2018-2021.json'), codLegacy: json('property/data/cod/historical-cod-2016-2017.json'), appeals: json('property/appeals.json'), budget: json('property/data/budget-pressure.json') };
const districts = Object.keys(ref.budget.municipalities);
const counties = Object.keys(ref.appeals.counties);
const fullRecord = { ...parcelRow, prop_class: '2', bldg_class: '15', land_desc: 'L', sales_code: '0', mailing_address: 'x', shape_area: 1, shape_length: 1, parcel_last_update: 'x', parcel_publication_date: 'x', pcl_mun: 'x', gis_pin: 'x', old_property_id: 'x', parcel_guid: 'x', facility_name: 'x', additional_lots_1: 'x' };
// Resolved by workbench-derived / the SR-1A subject provider in production, not by the parcel record.
const derivedResolved = new Set(['property.market_value', 'property.square_feet']);
// Resolved by a compatibility provider that the production Workbench bootstrap imports, not by index.ts.
const providerResolved = { 'property.city': ['city-provider.ts', 'enrichCityAddress', /const CITY_MARKER_ID = 'property\.city'/] };
const hydrateBootstrap = read('supabase/functions/workbench-hydrate/production-bootstrap.ts');
for (const [id, [file, fn, marker]] of Object.entries(providerResolved)) {
  assert.match(read(`supabase/functions/workbench-hydrate/${file}`), marker, `${file} produces ${id}`);
  assert.match(hydrateBootstrap, new RegExp(`import \\{ ${fn} \\} from '\\./${file.replace('.', '\\.')}'`), `production bootstrap imports ${fn} for ${id}`);
}
const never = [];
for (const m of markers.filter((x) => x.provider_status === 'live')) {
  const field = String(m.field || '');
  let produced = null;
  if (m.source_id === 'nj-parcels-modiv') produced = derivedResolved.has(m.id) || Object.hasOwn(providerResolved, m.id) || resolvers.propField(fullRecord, field) != null;
  else if (m.source_id === 'nj-sr1a') produced = districts.some((d) => resolvers.sr1aValue(ref.sr1a.districts[d], field) != null);
  else if (m.source_id === 'nj-cod') produced = districts.some((d) => resolvers.uniformityValue(ref.uniformity.districts[d], field, ref.codHistory.districts?.[d], ref.codLegacy.districts?.[d]) != null);
  else if (m.source_id === 'nj-dca-budget') produced = districts.some((d) => resolvers.budgetValue(ref.budget.municipalities[d], field) != null);
  else if (m.source_id === 'nj-tax-court-appeals') produced = counties.some((c) => resolvers.appealValue(ref.appeals.counties[c], field) != null);
  if (produced === false) never.push(`${m.id} (${m.source_id}.${field})`);
}
assert.deepEqual(never, [], `live markers with no producing resolver path: ${never.join(', ')}`);
for (const id of derivedResolved) assert.equal(overlay[id], 'live', `${id} stays governed live through its derived provider`);

console.log(`data marker wiring contract: ok (${markers.length} catalog markers, ${defs.markers.length} governed additions, ${Object.keys(defs.aliases).length} aliases)`);
