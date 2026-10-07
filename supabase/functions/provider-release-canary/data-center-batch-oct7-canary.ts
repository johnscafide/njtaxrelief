// Watchdog provider release canaries: data_center_batch_oct7_v1 and municipal_context_oct7_v1.
//
// data_center_batch_oct7_v1 checks the 27 formulas staged by 20261007181000_prepare_data_center_batch_oct7.sql
// and the six formulas repaired by 20261007180000_fix_live_formula_transforms.sql against production.
// municipal_context_oct7_v1 checks every value the three new workbench-hydrate providers serve (PILOT schedule,
// federal housing context, ACS rental) against the published data files, then the PILOT and rental formulas
// from 20261007182000_prepare_pilot_schedule.sql and 20261007183000_prepare_rental_scores.sql.
// It reads each formula's config from derived_formula_registry, gets raw inputs from workbench-hydrate
// and already-live derived inputs from workbench-derived, recomputes every value with its own copy of the
// arithmetic, and compares it with what workbench-derived returns. A marker passes only when every pin
// matches and at least one pin returns a value.
import { createClient } from 'npm:@supabase/supabase-js@2.95.0';

const URL = Deno.env.get('SUPABASE_URL')!, ANON = Deno.env.get('SUPABASE_ANON_KEY')!, SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
export const DATA_CENTER_BATCH_OCT7_SCENARIO = 'data_center_batch_oct7_v1';
export const MUNICIPAL_CONTEXT_SCENARIO = 'municipal_context_oct7_v1';
const SCENARIOS = new Set([DATA_CENTER_BATCH_OCT7_SCENARIO, MUNICIPAL_CONTEXT_SCENARIO]);

const BATCH = [
  'watchdog.environmental_site_proximity', 'watchdog.water_protection_overlap', 'watchdog.historic_property_constraint',
  'watchdog.njplus.construction_scope_signal', 'watchdog.njplus.certificate_gap_priority', 'watchdog.njplus.commercial_buildout_signal',
  'watchdog.njplus.demolition_redevelopment_watch', 'watchdog.njplus.amenity_access_profile', 'watchdog.njplus.public_facility_proximity_signal',
  'watchdog.njplus.site_marketing_context', 'watchdog.njplus.new_build_price_pressure', 'watchdog.njplus.new_build_delivery_momentum',
  'watchdog.njplus.new_build_market_depth', 'watchdog.njplus.local_demand_context', 'watchdog.njplus.household_cost_context',
  'watchdog.njplus.housing_supply_balance', 'watchdog.njplus.assessment_history_reliability', 'watchdog.tax_trajectory',
  'watchdog.collateral_operating_cost_stress', 'watchdog.fiscal_trend_momentum',
  'watchdog.fairness_score', 'watchdog.reassessment_risk', 'watchdog.appeal_odds', 'watchdog.tax_carry_advantage',
  'watchdog.permit_lifecycle_score', 'watchdog.abatement_exposure', 'watchdog.exempt_pilot_exposure',
];
const REPAIRED = [
  'watchdog.appraiser.market_anchor_refresh', 'watchdog.consumer.sale_context_strength', 'watchdog.comparable_depth_score',
  'watchdog.market_anchor_confidence', 'watchdog.title.closing_clearance_signal', 'watchdog.fiscal_intervention_priority',
];
const CONTEXT_DERIVED = [
  'watchdog.njplus.pilot_rolloff_watch', 'watchdog.njplus.development_incentive_profile',
  'watchdog.njplus.rental_market_pressure', 'watchdog.njplus.housing_affordability_gap', 'watchdog.njplus.rent_support_context',
  'watchdog.internal.pilot_term_remaining_scaled_v1', 'watchdog.internal.acs_rental_vacancy_scaled_v1', 'watchdog.internal.rent_to_income_v1',
  'watchdog.internal.hud_units_per_renter_v1', 'watchdog.internal.affordable_rental_per_renter_v1',
];
const DATA = 'https://www.watchdogindex.com/property/data/';
// Hydrate marker id -> [published data file, field in that file's municipalities record].
const CONTEXT_HYDRATE: Record<string, [string, string]> = {
  'njplus.nj-dca-pilot-forecast.pilot_payment_schedule': ['pilot-schedule.json', 'payment_schedule'],
  'njplus.nj-dca-pilot-forecast.pilot_revenue_projection': ['pilot-schedule.json', 'revenue_projection'],
  'njplus.nj-dca-pilot-forecast.pilot_forecast_year': ['pilot-schedule.json', 'forecast_year'],
  'njplus.nj-dca-pilot-forecast.pilot_municipal_share': ['pilot-schedule.json', 'municipal_share_pct'],
  'watchdog.njplus.pilot_forecast_confidence': ['pilot-schedule.json', 'dated_billing_share_pct'],
  'njplus.nj-dca-affordable-housing.hud_subsidized_units': ['federal-housing-context-v041.json', 'hud_subsidized_units'],
  'njplus.nj-dca-affordable-housing.low_income_cost_burden': ['federal-housing-context-v041.json', 'low_income_cost_burden'],
  'njplus.nj-dca-neighborhood-trends.commute_mode_mix': ['federal-housing-context-v041.json', 'commute_mode_mix'],
  'watchdog.internal.acs_renter_households_v1': ['acs-rental-2024.json', 'renter_households'],
  'watchdog.internal.acs_rental_vacancy_rate_v1': ['acs-rental-2024.json', 'rental_vacancy_rate'],
  'watchdog.internal.acs_rent_burden_share_v1': ['acs-rental-2024.json', 'rent_burden_share'],
};
const sorted = (v: unknown): unknown => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sorted((v as any)[k])])) : Array.isArray(v) ? v.map(sorted) : v;
// Pins already used by earlier production canaries, spread across 8 counties.
const PINS = ['0202_1_1', '0336_1.01_1', '0502_1056_2', '1420_1003_1', '0113_2802_10', '1906_1301_19', '0101_25.01_10', '0102_139_15'];

function json(status: number, p: unknown) { return new Response(JSON.stringify(p), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, private' } }); }
async function hash(v: string) { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)); return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join(''); }
async function cleanup(id: string) { await admin.from('watchdog_test_accounts').delete().eq('user_id', id); await admin.from('account_entitlements').delete().eq('user_id', id); await admin.from('profiles').delete().eq('id', id); await admin.auth.admin.deleteUser(id); }
async function post(path: string, body: unknown, access: string) { const r = await fetch(URL + '/functions/v1/' + path, { method: 'POST', headers: { Authorization: 'Bearer ' + access, apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); let p: any = {}; try { p = await r.json(); } catch { /* recorded as an empty payload */ } return { ok: r.ok, status: r.status, p }; }

const n = (v: unknown) => { if (v === null || v === undefined || v === '') return null; const x = Number(v); return Number.isFinite(x) ? x : null; };
const present = (v: unknown) => v !== null && v !== undefined && v !== '';
const truthy = (v: unknown) => v === true || v === 1 || v === '1' || ['true', 'yes'].includes(String(v).toLowerCase());
const clamp = (v: number) => Math.max(0, Math.min(100, v));

// Independent copy of the transforms the batch uses. Anything else is reported, never guessed.
function transform(v: unknown, t: string): number | null {
  const x = n(v);
  if (t === 'identity') return clamp(x ?? 0);
  if (t === 'inverse_identity') return clamp(100 - (x ?? 100));
  if (t === 'bool') return truthy(v) || (x != null && x > 0) ? 100 : 0;
  if (t === 'positive_pct5') return x == null ? 0 : clamp(Math.max(0, x) / 0.05 * 100);
  if (t === 'share35') return x == null ? 0 : clamp(x / 0.35 * 100);
  const m = /^count(\d+)$/.exec(t);
  if (m) return clamp(((x || 0) / Number(m[1])) * 100);
  return null;
}

function expected(def: any, value: (dep: string) => unknown, ready: (dep: string) => boolean): { v: number | null; unsupported?: string } {
  const cfg = def.config || {}, op = String(def.operation || '');
  if (op === 'weighted_scores') {
    const all: any[] = cfg.items || [], items = all.map((s) => ({ s, v: value(s.dep) })).filter((x) => present(x.v));
    if (!items.length || (cfg.require_all && items.length !== all.length)) return { v: null };
    let total = 0, weight = 0;
    for (const x of items) { const t = transform(x.v, String(x.s.transform || 'identity')); if (t == null) return { v: null, unsupported: String(x.s.transform) }; total += t * Number(x.s.weight || 0); weight += Number(x.s.weight || 0); }
    return { v: weight > 0 ? Math.round(total / weight) : null };
  }
  if (op === 'weighted_signals') {
    const signals: any[] = cfg.signals || [], vals = signals.map((s) => ({ s, v: value(s.dep) }));
    if (!vals.some((x) => present(x.v))) return { v: null };
    let total = 0;
    for (const x of vals) { const t = transform(x.v, String(x.s.transform || 'bool')); if (t == null) return { v: null, unsupported: String(x.s.transform) }; total += t * Number(x.s.weight || 0) / 100; }
    return { v: clamp(Math.round(total)) };
  }
  if (op === 'max_scores') {
    const all: any[] = cfg.items || [], items = all.map((s) => ({ s, v: value(s.dep) })).filter((x) => present(x.v));
    if (!items.length || (cfg.require_all && items.length !== all.length)) return { v: null };
    const scores = items.map((x) => transform(x.v, String(x.s.transform || 'identity')));
    if (scores.some((s) => s == null)) return { v: null, unsupported: 'max_scores transform' };
    return { v: Math.round(Math.max(...(scores as number[]))) };
  }
  if (op === 'signal_density') {
    const deps: string[] = def.dependencies || [], readiness = deps.map((d) => ready(d) || present(value(d)));
    if (!(cfg.require_all ? deps.length > 0 && readiness.every(Boolean) : readiness.some(Boolean))) return { v: null };
    const active = deps.filter((d) => truthy(value(d)) || (n(value(d)) || 0) > 0).length;
    return { v: Math.round(active / deps.length * 100) };
  }
  if (op === 'product_scores') {
    const items: any[] = cfg.items || [], vals = items.map((i) => n(value(typeof i === 'string' ? i : i?.dep)));
    if (items.length < 2 || vals.some((x) => x == null)) return { v: null };
    const scores = vals.map((x) => clamp(Number(x)));
    return { v: Math.round(scores.reduce((a, b) => a * b, 1) / (100 ** (scores.length - 1))) };
  }
  if (op === 'inverse') { const x = n(value(cfg.dep)); return { v: x == null ? null : clamp(100 - x) }; }
  if (op === 'ratio') {
    const num = n(value(cfg.num)), den = n(value(cfg.den));
    if (num == null || den == null) return { v: null };
    const floor = n(cfg.den_min), d = floor == null ? den : Math.max(den, floor);
    if (d === 0) return { v: cfg.zero_as_100 && num === 0 ? 100 : null };
    const p = 10 ** Number(cfg.precision ?? 3);
    return { v: Math.round(num / d * Number(cfg.scale ?? 1) * p) / p };
  }
  if (op === 'source_alias') { const x = value(cfg.dep); return { v: present(x) ? (n(x) ?? (x as any)) : null }; }
  return { v: null, unsupported: op };
}

export async function handleDataCenterBatchOct7Canary(req: Request) {
  let body: any = {};
  try { body = await req.json(); } catch { return json(400, { error: 'Invalid JSON' }); }
  const token = String(body?.token || '').trim();
  const SCENARIO = String(body?.scenario || '');
  if (!SCENARIOS.has(SCENARIO) || !/^[A-Za-z0-9_-]{40,160}$/.test(token)) return json(401, { error: 'Invalid release canary request' });
  const now = new Date().toISOString();
  const { data: gate } = await admin.from('watchdog_test_bootstrap_tokens').update({ used_at: now }).eq('token_hash', await hash(token)).is('used_at', null).gt('expires_at', now).contains('metadata', { purpose: 'provider_release_canary', scenario: SCENARIO }).select('id,desired_email').maybeSingle();
  if (!gate) return json(401, { error: 'Invalid or expired release canary token' });
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
    const pr = await admin.from('profiles').upsert({ id: userId, email: String(gate.desired_email || ''), full_name: 'Watchdog Data Center Batch Canary', display_name: 'Watchdog Data Center Batch Canary', account_role: 'developer', plan_tier: 'standard', plan: 'free', profile_complete: true, custom: { watchdog_test_account: true, no_real_spend: true, release_canary: true, scenario: SCENARIO } }, { onConflict: 'id' });
    if (pr.error) throw new Error('sandbox_profile_failed');
    const ta = await admin.from('watchdog_test_accounts').upsert({ user_id: userId, label: 'Data Center Batch Oct 7 Canary', last_bootstrap_at: now, metadata: { no_real_spend: true, scenario: SCENARIO } }, { onConflict: 'user_id' });
    if (ta.error) throw new Error('sandbox_account_failed');

    const started = Date.now();
    const contextRun = SCENARIO === MUNICIPAL_CONTEXT_SCENARIO;
    const TARGETS = contextRun ? CONTEXT_DERIVED : [...BATCH, ...REPAIRED];
    const { data: defRows, error: defError } = await admin.from('derived_formula_registry').select('marker_id,operation,config,dependencies,status').eq('status', 'live');
    if (defError) throw new Error('formula_registry_unavailable');
    const defs = new Map((defRows || []).map((d: any) => [String(d.marker_id), d]));
    const missingDefs = TARGETS.filter((id) => !defs.has(id));
    const inputs = new Set<string>();
    for (const id of TARGETS) {
      const d: any = defs.get(id); if (!d) continue;
      const cfg = d.config || {};
      for (const dep of [...(d.dependencies || []), ...(cfg.items || []).map((i: any) => typeof i === 'string' ? i : i?.dep), ...(cfg.signals || []).map((s: any) => s?.dep), cfg.dep]) if (dep) inputs.add(String(dep));
    }
    const derivedInputs = [...inputs].filter((id) => defs.has(id)), rawInputs = [...inputs].filter((id) => !defs.has(id));
    const [hydrate, derivedIn, derived] = await Promise.all([
      post('workbench-hydrate', { pams_pins: PINS, marker_ids: rawInputs }, access),
      post('workbench-derived', { pams_pins: PINS, marker_ids: derivedInputs }, access),
      post('workbench-derived', { pams_pins: PINS, marker_ids: TARGETS }, access),
    ]);

    const mismatches: string[] = [], observations: Record<string, any> = {};
    let contextHydrateStatus: number | null = null;
    if (contextRun) {
      const ids = Object.keys(CONTEXT_HYDRATE), names = [...new Set(ids.map((id) => CONTEXT_HYDRATE[id][0]))];
      const [served, ...loaded] = await Promise.all([
        post('workbench-hydrate', { pams_pins: PINS, marker_ids: ids }, access),
        ...names.map((name) => fetch(DATA + name, { headers: { accept: 'application/json' } }).then((r) => r.ok ? r.json() : null).catch(() => null)),
      ]);
      const files = new Map(names.map((name, i) => [name, loaded[i]]));
      contextHydrateStatus = served.status;
      for (const name of names) if (!files.get(name)?.municipalities) mismatches.push(name + ' (not loaded)');
      for (const id of ids) {
        const [name, field] = CONTEXT_HYDRATE[id], perPin: Record<string, any> = {};
        let withValue = 0, bad = false;
        for (const pin of PINS) {
          const town = files.get(name)?.municipalities?.[pin.slice(0, 4)];
          const want = town && present(town[field]) ? town[field] : null;
          const got = served.p?.markers?.[pin]?.[id], status = served.p?.meta?.[pin]?.[id]?.status || null;
          const match = want == null ? !present(got) && status === 'source_checked_no_value' : JSON.stringify(sorted(got)) === JSON.stringify(sorted(want)) && status === 'available';
          if (present(got)) withValue++;
          if (!match) bad = true;
          perPin[pin] = { expected: want, actual: present(got) ? got : null, status };
        }
        observations[id] = { provider: 'workbench-hydrate', pins_with_value: withValue, pins: perPin };
        if (bad || withValue === 0) mismatches.push(id + (withValue === 0 ? ' (no pin returned a value)' : ' (value mismatch)'));
      }
    }
    for (const id of TARGETS) {
      const def: any = defs.get(id);
      const perPin: Record<string, any> = {};
      let withValue = 0, bad = false, unsupported = '';
      for (const pin of PINS) {
        const value = (dep: string) => defs.has(dep) ? derivedIn.p?.markers?.[pin]?.[dep] : hydrate.p?.markers?.[pin]?.[dep];
        const ready = (dep: string) => ['available', 'source_checked_no_value'].includes(String((defs.has(dep) ? derivedIn.p?.meta : hydrate.p?.meta)?.[pin]?.[dep]?.status || ''));
        const exp = def ? expected(def, value, ready) : { v: null, unsupported: 'missing formula' };
        if (exp.unsupported) unsupported = exp.unsupported;
        const actual = derived.p?.markers?.[pin]?.[id], meta = derived.p?.meta?.[pin]?.[id] || {};
        const match = exp.v == null ? !present(actual) : (n(actual) != null && Math.abs(Number(actual) - Number(exp.v)) <= 0.5);
        if (present(actual)) withValue++;
        if (!match) bad = true;
        perPin[pin] = { expected: exp.v, actual: present(actual) ? actual : null, status: meta.status || null };
      }
      observations[id] = { operation: def?.operation || null, pins_with_value: withValue, pins: perPin };
      if (!def || unsupported || bad || withValue === 0) mismatches.push(id + (unsupported ? ' (unsupported: ' + unsupported + ')' : withValue === 0 ? ' (no pin returned a value)' : bad ? ' (value mismatch)' : ''));
    }
    const ok = hydrate.ok && derivedIn.ok && derived.ok && !missingDefs.length && mismatches.length === 0 && (!contextRun || contextHydrateStatus === 200);
    const summary = { pins: PINS.length, targets: TARGETS.length, ...(contextRun ? { context_hydrate_status: contextHydrateStatus, context_hydrate_targets: Object.keys(CONTEXT_HYDRATE) } : {}), hydrate_status: hydrate.status, derived_input_status: derivedIn.status, derived_status: derived.status, engine_version: derived.p?.engine_version || null, missing_formulas: missingDefs, passed: [...(contextRun ? Object.keys(CONTEXT_HYDRATE) : []), ...TARGETS].filter((id) => !mismatches.some((m) => m.startsWith(id + ' ') || m === id)) };
    await admin.from('watchdog_test_auth_events').insert({ token_id: gate.id, user_id: userId, event_type: 'provider_release_canary', metadata: { scenario: SCENARIO, status_code: ok ? 200 : 502, duration_ms: Date.now() - started, assertion_ok: ok, mismatches, summary, observations } });
    return json(ok ? 200 : 502, { ok, scenario: SCENARIO, assertion_ok: ok, mismatches, summary, duration_ms: Date.now() - started });
  } catch (e) {
    console.error(SCENARIO + ' failed:', e);
    const known = ['sandbox_link_generation_failed', 'sandbox_session_verification_failed', 'sandbox_profile_failed', 'sandbox_account_failed', 'formula_registry_unavailable'];
    const message = e instanceof Error && known.includes(e.message) ? e.message : 'canary_failed';
    return json(500, { ok: false, scenario: SCENARIO, error: message });
  } finally {
    if (userId) await cleanup(userId);
  }
}
