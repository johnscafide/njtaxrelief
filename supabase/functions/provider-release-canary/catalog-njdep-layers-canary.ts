// Watchdog provider release canary: catalog_njdep_layers_v1.
//
// Observes the live workbench-hydrate NJDEP spatial resolver for the 29 catalog
// markers that still have no data_center_provider_coverage row: 28 that no
// recorded production resolver output covered, plus
// land.wetland_mitigation_service_area, which returned source_checked_no_value
// for every sampled parcel. This canary asserts no expected marker values.
// It records every (pin, marker) status, value and reason so a reviewer can
// decide which markers to register. A marker is certifiable from this run only
// where the resolver itself returned status 'available'.
//
// Sample pins (six counties), chosen so the layers are likely to intersect:
//   0502_1056_2   Cape May City, Cape May     606 Columbia Ave, inside the Cape May historic district
//   1420_1003_1   Mine Hill Twp, Morris       167 Canfield Ave, Highlands iron-mining district
//   1906_1301_19  Franklin Boro, Sussex       32 Evans St, beside the former Franklin zinc mine and marble quarries
//   0202_1_1      Alpine Boro, Bergen         public land "Route 9W on Palisades" on the Palisades cliffs
//   0336_1.01_1   Washington Twp, Burlington  public land on Atsion-Quaker Bridge Rd, Wharton State Forest area, Pinelands core
//   0113_2802_10  Hammonton Town, Atlantic    downtown Pinelands town supplied by public wells
//
// Diagnostics (never used for pass/fail and never evidence on their own):
//   layers - name, geometry type and field names of every target NJDEP layer,
//            so a reviewer can confirm each registry source_layer points at
//            the intended layer.
//   probes - for value markers that came back source_checked_no_value, the
//            same point query the resolver runs, reduced to the feature count
//            and attribute key names. Features present with no resolver value
//            means the resolver's field mapping needs work; zero features
//            means the parcel does not intersect the layer.
//
// Privacy: workbench-hydrate returns full parcel records to developer-plan
// sessions, including owner and mailing fields. This canary reads only the
// requested markers and meta, plus the town and county names. It never
// returns or stores records. Probes and layer metadata record key/field names
// only, never attribute values.
import { createClient } from 'npm:@supabase/supabase-js@2.95.0';

const URL = Deno.env.get('SUPABASE_URL')!, ANON = Deno.env.get('SUPABASE_ANON_KEY')!, SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

export const CATALOG_NJDEP_SCENARIO = 'catalog_njdep_layers_v1';
const SCENARIO = CATALOG_NJDEP_SCENARIO;
const HYDRATE_TIMEOUT_MS = 110000;
const ARCGIS_TIMEOUT_MS = 6000;

// Same services as supabase/functions/workbench-hydrate/environment-provider.ts.
const SERVICES: Record<string, string> = {
  'njdep-geology-live': 'https://mapsdep.nj.gov/arcgis/rest/services/Features/Geology/MapServer',
  'njdep-hydro-live': 'https://mapsdep.nj.gov/arcgis/rest/services/Features/Hydrography/MapServer',
  'njdep-land-live': 'https://mapsdep.nj.gov/arcgis/rest/services/Features/Land/MapServer',
};

type Target = { id: string; source: string; layer: string };
// source_id and source_layer copied from property/data/marker-registry.json (2026-09-29).
const TARGETS: Target[] = [
  { id: 'geology.abandoned_mine_within_1km', source: 'njdep-geology-live', layer: '0' },
  { id: 'geology.bedrock_aquifer', source: 'njdep-geology-live', layer: '13' },
  { id: 'geology.bedrock_geology', source: 'njdep-geology-live', layer: '14' },
  { id: 'geology.groundwater_recharge_rank', source: 'njdep-geology-live', layer: '18' },
  { id: 'geology.sole_source_aquifer', source: 'njdep-geology-live', layer: '19' },
  { id: 'geology.surficial_aquifer', source: 'njdep-geology-live', layer: '23' },
  { id: 'geology.surficial_geology', source: 'njdep-geology-live', layer: '25' },
  { id: 'geology.physiographic_province', source: 'njdep-geology-live', layer: '20' },
  { id: 'geology.landslide_within_1km', source: 'njdep-geology-live', layer: '1' },
  { id: 'geology.fault_within_500m', source: 'njdep-geology-live', layer: '6' },
  { id: 'geology.quarry_within_1500m', source: 'njdep-geology-live', layer: '3' },
  { id: 'water.wellhead_community_tier', source: 'njdep-hydro-live', layer: '25' },
  { id: 'water.wellhead_community_travel_time', source: 'njdep-hydro-live', layer: '25' },
  { id: 'water.wellhead_noncommunity_tier', source: 'njdep-hydro-live', layer: '26' },
  { id: 'water.wellhead_noncommunity_travel_time', source: 'njdep-hydro-live', layer: '26' },
  { id: 'water.groundwater_treatment_source_area', source: 'njdep-hydro-live', layer: '27' },
  { id: 'water.category1_water_within_500m', source: 'njdep-hydro-live', layer: '6' },
  { id: 'water.surface_spring_within_1km', source: 'njdep-hydro-live', layer: '34' },
  { id: 'water.water_source_area', source: 'njdep-hydro-live', layer: '16' },
  { id: 'water.watershed_huc11', source: 'njdep-hydro-live', layer: '17' },
  { id: 'water.subwatershed_huc14', source: 'njdep-hydro-live', layer: '22' },
  { id: 'land.open_space_hit', source: 'njdep-land-live', layer: '65' },
  { id: 'land.open_space_encumbrance', source: 'njdep-land-live', layer: '65' },
  { id: 'land.historic_property_hit', source: 'njdep-land-live', layer: '55' },
  { id: 'land.historic_district_hit', source: 'njdep-land-live', layer: '57' },
  { id: 'land.archaeological_grid_hit', source: 'njdep-land-live', layer: '56' },
  { id: 'land.natural_area_preserve_hit', source: 'njdep-land-live', layer: '80' },
  { id: 'land.open_space_within_500m', source: 'njdep-land-live', layer: '65' },
  { id: 'land.wetland_mitigation_service_area', source: 'njdep-land-live', layer: '70' },
];
// Context only: the coordinates the resolver used and whether each pin sits in
// the Pinelands or Highlands. Not part of the certification set.
const LAT = 'property.lat', LON = 'property.lon';
const CONTEXT = [LAT, LON, 'preflight.pinelands_hit', 'preflight.highlands_hit'];
const PINS: { pin: string; why: string }[] = [
  { pin: '0502_1056_2', why: 'Cape May historic district (historic district/property, archaeological grid, coastal plain geology)' },
  { pin: '1420_1003_1', why: 'Highlands iron-mining district (abandoned mines, faults, bedrock aquifer, wellheads)' },
  { pin: '1906_1301_19', why: 'Franklin zinc mine and marble quarries (mines, quarries, faults, springs)' },
  { pin: '0202_1_1', why: 'Palisades cliffs public land (open space, landslide inventory, Piedmont province)' },
  { pin: '0336_1.01_1', why: 'Wharton State Forest area, Pinelands core (open space, natural areas, surficial aquifer, recharge)' },
  { pin: '0113_2802_10', why: 'Hammonton downtown, public-well supply (wellhead protection, source water areas)' },
];
const KNOWN_STATUSES = new Set(['available', 'source_checked_no_value', 'dependency_missing', 'provider_error', 'provider_missing', 'not_computed', 'not_entitled']);

function json(status: number, p: any) {
  return new Response(JSON.stringify(p), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, private' } });
}
async function hash(v: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function cleanup(id: string) {
  await admin.from('watchdog_test_accounts').delete().eq('user_id', id);
  await admin.from('account_entitlements').delete().eq('user_id', id);
  await admin.from('profiles').delete().eq('id', id);
  await admin.auth.admin.deleteUser(id);
}
async function post(path: string, body: any, access: string) {
  const c = new AbortController(), timer = setTimeout(() => c.abort(), HYDRATE_TIMEOUT_MS);
  try {
    const r = await fetch(URL + '/functions/v1/' + path, { method: 'POST', signal: c.signal, headers: { Authorization: 'Bearer ' + access, apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let p: any = {};
    try { p = await r.json(); } catch { /* non-JSON body */ }
    return { ok: r.ok, status: r.status, p, error: r.ok ? null : String(p?.error || 'http_' + r.status) };
  } catch (e) {
    return { ok: false, status: 0, p: {}, error: e instanceof DOMException && e.name === 'AbortError' ? 'hydrate_timeout' : 'hydrate_unavailable' };
  } finally {
    clearTimeout(timer);
  }
}
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i]); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
async function arcgis(url: string): Promise<{ ok: boolean; body?: any; error?: string }> {
  const c = new AbortController(), timer = setTimeout(() => c.abort(), ARCGIS_TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: c.signal, headers: { accept: 'application/json' } });
    if (!r.ok) return { ok: false, error: 'http_' + r.status };
    const body = await r.json();
    if (body?.error) return { ok: false, error: 'arcgis_error_' + String(body.error.code ?? 'unknown') };
    return { ok: true, body };
  } catch (e) {
    return { ok: false, error: e instanceof DOMException && e.name === 'AbortError' ? 'timeout' : 'unavailable' };
  } finally {
    clearTimeout(timer);
  }
}
// Mirrors the resolver's classification in environment-provider.ts.
function fieldOf(id: string) { return id.slice(id.indexOf('.') + 1); }
function modeOf(id: string) {
  const field = fieldOf(id);
  if (field.endsWith('_count') || /_(\d+)m$/.test(field)) return 'count';
  if (/_hit$|within_/.test(field)) return 'hit';
  return 'value';
}
function positive(v: any) { return v !== null && v !== undefined && v !== '' && v !== false && v !== 0; }
function clip(v: any): any {
  if (typeof v === 'string') return v.length > 200 ? v.slice(0, 200) + '...' : v;
  if (Array.isArray(v)) return v.slice(0, 10).map(clip);
  if (v && typeof v === 'object') return '[object]';
  return v;
}
function num(v: any) { const x = Number(v); return v === null || v === undefined || v === '' || !Number.isFinite(x) ? null : x; }
function layerKey(t: Target) { return t.source + '/' + t.layer; }
async function layerInfo(t: Target) {
  const r = await arcgis(SERVICES[t.source] + '/' + t.layer + '?f=json');
  if (!r.ok) return { ok: false, error: r.error };
  const b = r.body || {};
  return { ok: true, name: b.name ?? null, type: b.type ?? null, geometry_type: b.geometryType ?? null, field_names: (Array.isArray(b.fields) ? b.fields : []).map((f: any) => String(f?.name || '')).filter(Boolean).slice(0, 80) };
}
// Same point query the resolver runs for value markers (distance 0).
async function probe(t: Target, lat: number, lon: number) {
  const q = new URLSearchParams({ f: 'json', where: '1=1', geometry: lon + ',' + lat, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: '*', returnGeometry: 'false', resultRecordCount: '10' });
  const r = await arcgis(SERVICES[t.source] + '/' + t.layer + '/query?' + q.toString());
  if (!r.ok) return { ok: false, error: r.error };
  const features = Array.isArray(r.body?.features) ? r.body.features : [];
  const keys = [...new Set(features.flatMap((f: any) => Object.keys(f?.attributes || {})))].sort().slice(0, 80);
  return { ok: true, feature_count: features.length, attribute_keys: keys };
}

async function run(gate: { id: string; desired_email: string }, now: string) {
  let userId = '';
  try {
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email: String(gate.desired_email || '') });
    userId = String(link?.user?.id || '');
    const hashed = String(link?.properties?.hashed_token || '');
    if (linkError || !userId || !hashed) throw new Error('sandbox_link_generation_failed');
    const authClient = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data: v, error: ve } = await authClient.auth.verifyOtp({ token_hash: hashed, type: 'email' });
    const access = v?.session?.access_token || '';
    if (ve || !access) throw new Error('sandbox_session_verification_failed');
    const pr = await admin.from('profiles').upsert({ id: userId, email: String(gate.desired_email || ''), full_name: 'Watchdog NJDEP Catalog Canary', display_name: 'Watchdog NJDEP Catalog Canary', account_role: 'developer', plan_tier: 'standard', plan: 'free', profile_complete: true, custom: { watchdog_test_account: true, no_real_spend: true, release_canary: true, scenario: SCENARIO } }, { onConflict: 'id' });
    if (pr.error) throw new Error('sandbox_profile_failed');
    const ta = await admin.from('watchdog_test_accounts').upsert({ user_id: userId, label: 'NJDEP Catalog Layers Canary', last_bootstrap_at: now, metadata: { no_real_spend: true, scenario: SCENARIO } }, { onConflict: 'user_id' });
    if (ta.error) throw new Error('sandbox_account_failed');

    const started = Date.now();
    const markerIds = [...TARGETS.map((t) => t.id), ...CONTEXT];
    const distinctLayers = [...new Map(TARGETS.map((t) => [layerKey(t), t])).values()];
    // One hydrate call per pin so the resolver's sequential per-marker queries run in parallel across pins.
    const [hydrates, layerRows] = await Promise.all([
      Promise.all(PINS.map((p) => post('workbench-hydrate', { pams_pins: [p.pin], marker_ids: markerIds }, access))),
      pool(distinctLayers, 4, async (t) => [layerKey(t), await layerInfo(t)] as const),
    ]);
    const layers = Object.fromEntries(layerRows);

    const pins: any = {}, markers: any = {}, resolverErrors: any[] = [], hydrateFailures: any[] = [], missingStatus: any[] = [];
    let providerVersions: any = null, resolverSource: any = null;
    for (const t of TARGETS) markers[t.id] = { source_id: t.source, source_layer: t.layer, resolver_mode: modeOf(t.id), available_pins: 0, positive_pins: 0, states: {} };
    PINS.forEach((p, i) => {
      const h = hydrates[i], values = h.p?.markers?.[p.pin] || {}, meta = h.p?.meta?.[p.pin] || {};
      const record = (Array.isArray(h.p?.records) ? h.p.records : []).find((r: any) => String(r?.pams_pin) === p.pin) || {};
      if (h.ok) { providerVersions ??= h.p?.provider_versions || null; resolverSource ??= h.p?.source || null; }
      else hydrateFailures.push({ pin: p.pin, status: h.status, error: h.error });
      pins[p.pin] = {
        why: p.why, hydrate_status: h.status, town: record.town ?? null, county: record.county ?? null,
        lat: num(values[LAT]), lon: num(values[LON]),
        pinelands_hit: meta['preflight.pinelands_hit']?.status === 'available' ? values['preflight.pinelands_hit'] : null,
        highlands_hit: meta['preflight.highlands_hit']?.status === 'available' ? values['preflight.highlands_hit'] : null,
        provider_summary: h.p?.provider_summary || null,
      };
      for (const t of TARGETS) {
        const m = meta[t.id], status = m?.status ? String(m.status) : null, value = status === 'available' ? clip(values[t.id]) : null;
        markers[t.id].states[p.pin] = { status, value, reason: m?.reason ?? null, provider_kind: m?.provider_kind ?? null };
        if (!status || !KNOWN_STATUSES.has(status)) { if (h.ok) missingStatus.push({ pin: p.pin, marker_id: t.id, status }); continue; }
        if (status === 'available') { markers[t.id].available_pins++; if (positive(value)) markers[t.id].positive_pins++; }
        else if (status !== 'source_checked_no_value') resolverErrors.push({ pin: p.pin, marker_id: t.id, status, reason: m?.reason ?? null });
      }
    });

    // Diagnostic probes for value markers with no resolver value, one per (pin, layer).
    const probes: any = {};
    await Promise.all(PINS.map(async (p) => {
      const lat = pins[p.pin].lat, lon = pins[p.pin].lon;
      const wanted = TARGETS.filter((t) => modeOf(t.id) === 'value' && markers[t.id].states[p.pin].status === 'source_checked_no_value');
      if (!wanted.length) return;
      if (lat === null || lon === null) { probes[p.pin] = { error: 'coordinates_unavailable' }; return; }
      const byLayer = [...new Map(wanted.map((t) => [layerKey(t), t])).values()], out: any = {};
      for (const t of byLayer) out[layerKey(t)] = { markers: wanted.filter((w) => layerKey(w) === layerKey(t)).map((w) => w.id), ...(await probe(t, lat, lon)) };
      probes[p.pin] = out;
    }));

    const available = TARGETS.filter((t) => markers[t.id].available_pins > 0).map((t) => t.id);
    const positiveIds = TARGETS.filter((t) => markers[t.id].positive_pins > 0).map((t) => t.id);
    const neverAvailable = TARGETS.filter((t) => markers[t.id].available_pins === 0).map((t) => ({ marker_id: t.id, statuses: [...new Set(Object.values(markers[t.id].states).map((s: any) => s.status))] }));
    const assertionOk = hydrateFailures.length === 0 && missingStatus.length === 0 && resolverErrors.length === 0;
    const summary = {
      target_markers: TARGETS.length, pins: PINS.length,
      available_markers: available, available_with_positive_value: positiveIds, never_available: neverAvailable,
      hydrate_failures: hydrateFailures, missing_status: missingStatus, resolver_errors: resolverErrors,
      semantics: 'assertion_ok means every hydrate call succeeded and every (pin, marker) pair returned available or source_checked_no_value; it does not certify any marker. For hit markers, false is an available observation; for count markers, 0 is.',
    };
    const observations = { pins, markers, layers, probes, resolver_source: resolverSource, provider_versions: providerVersions };
    const duration = Date.now() - started;
    await admin.from('watchdog_test_auth_events').insert({ token_id: gate.id, user_id: userId, event_type: 'provider_release_canary', metadata: { scenario: SCENARIO, status_code: assertionOk ? 200 : 502, duration_ms: duration, assertion_ok: assertionOk, summary, observations } });
    return json(assertionOk ? 200 : 502, { ok: assertionOk, scenario: SCENARIO, assertion_ok: assertionOk, summary, observations, duration_ms: duration });
  } catch (e) {
    return json(500, { ok: false, scenario: SCENARIO, error: String((e as Error)?.message || e) });
  } finally {
    if (userId) await cleanup(userId);
  }
}

export async function handleCatalogNjdepLayersCanary(req: Request) {
  let body: any = {};
  try { body = await req.json(); } catch { return json(400, { error: 'Invalid JSON' }); }
  const token = String(body?.token || '').trim();
  if (String(body?.scenario || '') !== SCENARIO || !/^[A-Za-z0-9_-]{40,160}$/.test(token)) return json(401, { error: 'Invalid release canary request' });
  const now = new Date().toISOString();
  const { data: gate } = await admin.from('watchdog_test_bootstrap_tokens').update({ used_at: now }).eq('token_hash', await hash(token)).is('used_at', null).gt('expires_at', now).contains('metadata', { purpose: 'provider_release_canary', scenario: SCENARIO }).select('id,desired_email').maybeSingle();
  if (!gate) return json(401, { error: 'Invalid or expired release canary token' });
  const work = run(gate as any, now);
  // pg_net gives up after 30 s. Keep the worker alive until the run has written
  // its watchdog_test_auth_events row and deleted the bootstrap user.
  try { (globalThis as any).EdgeRuntime?.waitUntil?.(work); } catch { /* not running on Supabase Edge Runtime */ }
  return await work;
}
