declare const Deno: any;
// @ts-ignore remote runtime import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ENGINE_VERSION = 'watchdog-derived-v16-chapter123-fields';
const CHAPTER123_PROVIDER = 'chapter123-provider-v3';
const SR1A_SUBJECT_PROVIDER = 'sr1a-subject-provider-v1';
const SR1A_SUMMARY_URL = 'https://njpropertytaxrelief.com/property/sr1a-ratios.json';
const ORIGINS = new Set([
  'https://njpropertytaxrelief.com',
  'https://www.njpropertytaxrelief.com',
]);

let sr1aSummaryCache: any = null;
let sr1aSummaryAt = 0;

function cors(req: Request) {
  const origin = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ORIGINS.has(origin) ? origin : 'https://njpropertytaxrelief.com',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function out(req: Request, status: number, payload: any) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...cors(req),
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store',
    },
  });
}

function clean(v: any, max = 140) { return String(v || '').trim().slice(0, max); }
function num(v: any) { if (v === null || v === undefined || v === '') return null; const x = Number(v); return Number.isFinite(x) ? x : null; }
function present(v: any) { return v !== null && v !== undefined && v !== ''; }
function truth(v: any) { return v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true' || String(v).toLowerCase() === 'yes'; }
function clamp(v: number, min = 0, max = 100) { return Math.max(min, Math.min(max, v)); }
function round(v: number, precision = 0) { const f = 10 ** precision; return Math.round(v * f) / f; }
function districtCode(v: any) { const s = String(v || '').replace(/\D/g, ''); return s.length >= 4 ? s.slice(0, 4) : ''; }
function floodBand(v: any) { const zone = String(v || '').toUpperCase(); if (!zone) return 0; if (/^(A|AE|AH|AO|AR|A99|V|VE)/.test(zone)) return 100; if (/^(X.*0\.2|B)/.test(zone)) return 66; if (/^(X|C)/.test(zone)) return 0; return 33; }
function positivePct5(v: any) { const x = num(v); return x == null ? null : clamp(Math.max(0, x) / 0.05 * 100); }
function collectionScore(v: any) { const x = num(v); return x == null ? null : clamp((x - 0.90) / 0.10 * 100); }
function inverseDebtShare(v: any) { const x = num(v); return x == null ? null : clamp(100 - x / 0.20 * 100); }
function codRisk(v: any) { const x = num(v); return x == null ? null : clamp((x - 15) / 20 * 100); }
function sampleDepth150(v: any) { const x = num(v); return x == null ? null : clamp(Math.max(0, x) / 150 * 100); }
function assessmentRatioGapRisk(subjectRatio: any, official: any) { const subject = num(subjectRatio); const publishedPct = num(official?.ratio); if (subject == null || subject <= 0 || publishedPct == null || publishedPct <= 0) return null; const published = publishedPct / 100; return clamp(Math.abs(subject - published) / 0.20 * 100); }
function yearObject(v: any) { return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : null; }
function orderedAssessmentHistory(landRaw: any, improvementRaw: any, totalRaw: any) {
  const land = yearObject(landRaw), improvement = yearObject(improvementRaw), total = yearObject(totalRaw);
  if (!land && !improvement && !total) return null;
  const keys = new Set<string>();
  for (const source of [land, improvement, total]) for (const key of Object.keys(source || {})) if (/^(19|20)\d{2}$/.test(key)) keys.add(key);
  const years = [...keys].map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!years.length) return null;
  return years.map((year) => {
    const key = String(year);
    return {
      year,
      land: land && Object.prototype.hasOwnProperty.call(land, key) ? num(land[key]) : null,
      improvement: improvement && Object.prototype.hasOwnProperty.call(improvement, key) ? num(improvement[key]) : null,
      total: total && Object.prototype.hasOwnProperty.call(total, key) ? num(total[key]) : null,
    };
  });
}

async function loadSr1aSummary() {
  if (sr1aSummaryCache && Date.now() - sr1aSummaryAt < 21600000) return sr1aSummaryCache;
  const response = await fetch(SR1A_SUMMARY_URL, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`SR-1A summary returned ${response.status}`);
  const json = await response.json();
  if (!json?.districts || !/NJ Division of Taxation SR1A/i.test(String(json?.source || ''))) throw new Error('SR-1A summary signature validation failed');
  sr1aSummaryCache = json; sr1aSummaryAt = Date.now(); return json;
}

function signal(v: any, transform = 'bool') {
  if (transform === 'identity') return clamp(num(v) ?? 0);
  if (transform === 'inverse_identity') return clamp(100 - (num(v) ?? 100));
  if (transform === 'bool') return truth(v) || (num(v) != null && Number(v) > 0) ? 100 : 0;
  if (transform === 'flood100') return floodBand(v);
  if (transform === 'positive_pct5') return positivePct5(v) ?? 0;
  if (transform === 'inverse_positive_pct5') return 100 - (positivePct5(v) ?? 100);
  if (transform === 'collection90_100') return collectionScore(v) ?? 0;
  if (transform === 'inverse_share20') return inverseDebtShare(v) ?? 0;
  if (transform === 'cod_risk') return codRisk(v) ?? 0;
  if (transform === 'cod_consistency') return 100 - (codRisk(v) ?? 100);
  if (transform === 'sample_depth150') return sampleDepth150(v) ?? 0;
  if (transform === 'inverse_sample_depth150') return 100 - (sampleDepth150(v) ?? 100);
  if (transform === 'share35') { const x = num(v); return x == null ? 0 : clamp(x / 0.35 * 100); }
  const cap = Number(String(transform).replace('count', '')) || 1; return clamp(((num(v) || 0) / cap) * 100);
}

const ROW: Record<string, (r: any) => any> = {
  'property.address': (r) => r?.address, 'property.municipality': (r) => r?.town, 'property.county': (r) => r?.county,
  'property.zip': (r) => r?.zip, 'property.block': (r) => r?.block, 'property.lot': (r) => r?.lot, 'property.qualifier': (r) => r?.qualifier,
  'property.pams_pin': (r) => r?.pams_pin, 'property.property_class': (r) => r?.prop_class, 'property.class': (r) => r?.prop_class,
  'property.year_built': (r) => r?.year_built, 'property.lot_area': (r) => r?.acres, 'property.acres': (r) => r?.acres,
  'property.units': (r) => r?.dwelling_units, 'property.assessed_value': (r) => r?.assessed_value, 'property.annual_tax': (r) => r?.last_year_tax,
  'property.land_assessment': (r) => r?.land_value, 'property.land_value': (r) => r?.land_value,
  'property.improvement_assessment': (r) => r?.improvement_value, 'property.improvement_value': (r) => r?.improvement_value,
  'property.sale_price': (r) => r?.last_sale_price, 'property.last_sale_price': (r) => r?.last_sale_price,
  'property.sale_date': (r) => r?.deed_date ?? r?.last_sale_year, 'property.deed_date': (r) => r?.deed_date ?? r?.last_sale_year,
  'property.deed_book': (r) => r?.deed_book, 'property.deed_page': (r) => r?.deed_page,
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return out(req, 405, { error: 'POST required' });
  const auth = req.headers.get('authorization') || ''; if (!auth.startsWith('Bearer ')) return out(req, 401, { error: 'Sign in required' });
  const url = Deno.env.get('SUPABASE_URL') || '', anon = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: who } = await userClient.auth.getUser(); if (!who.user) return out(req, 401, { error: 'Session invalid' });
  const { data: entitlement, error: entitlementError } = await userClient.rpc('get_my_entitlement'); if (entitlementError) return out(req, 503, { error: 'Entitlement resolver unavailable' });
  const entitlementRow = Array.isArray(entitlement) ? entitlement[0] : entitlement; const plan = String(entitlementRow?.plan_tier || 'standard');
  if (!['pro', 'pro_plus', 'teams', 'developer'].includes(plan)) return out(req, 403, { error: 'Pro plan required' });
  let body: any = {}; try { body = await req.json(); } catch { return out(req, 400, { error: 'Invalid JSON' }); }
  const pins: string[] = [...new Set<string>((Array.isArray(body.pams_pins) ? body.pams_pins : [body.pams_pin]).map((x: any) => clean(x, 80)).filter(Boolean))].slice(0, 500);
  const rawIds: string[] = [...new Set<string>((Array.isArray(body.marker_ids) ? body.marker_ids : []).map((x: any) => clean(x)).filter(Boolean))].slice(0, 250);
  if (!pins.length || !rawIds.length) return out(req, 200, { records: [], markers: {}, meta: {}, engine_version: ENGINE_VERSION });
  const { data: defs, error: defErr } = await userClient.from('derived_formula_registry').select('marker_id,formula,dependencies,confidence,status,explanation,operation,config').eq('status', 'live');
  if (defErr) return out(req, 503, { error: 'Formula registry unavailable' });
  const defMap = new Map((defs || []).map((d: any) => [String(d.marker_id), d]));
  const requested = rawIds.filter((id) => defMap.has(id)); if (!requested.length) return out(req, 200, { records: [], markers: {}, meta: {}, engine_version: ENGINE_VERSION });
  const rawDeps = new Set<string>(), seen = new Set<string>();
  const walk = (id: string) => { if (seen.has(id)) return; seen.add(id); const def: any = defMap.get(id); for (const dep of def?.dependencies || []) { if (defMap.has(dep)) walk(dep); else rawDeps.add(dep); } };
  requested.forEach(walk);
  const operations = [...seen].map((id) => String((defMap.get(id) as any)?.operation || ''));
  const needsChapter123 = operations.some((op) => ['revaluation_pressure','tax_reset_sensitivity','assessment_defensibility','appeal_evidence_strength','appeal_opportunity','chapter123_field'].includes(op));
  const needsEvidenceReferences = operations.some((op) => ['sr1a_subject_square_feet','comparable_evidence_reliability','assessment_defensibility','appeal_evidence_strength','appeal_opportunity'].includes(op));
  const hydratePromise = fetch(url + '/functions/v1/workbench-hydrate', { method: 'POST', headers: { Authorization: auth, apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ pams_pins: pins, marker_ids: [...rawDeps] }) });
  const chapterPromise = needsChapter123 ? fetch(url + '/functions/v1/chapter123-provider', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ districts: [...new Set(pins.map(districtCode).filter(Boolean))] }) }) : Promise.resolve(null);
  const summaryPromise = needsEvidenceReferences ? loadSr1aSummary() : Promise.resolve(null);
  const parallel = await Promise.all([hydratePromise, chapterPromise, summaryPromise]).catch((error) => { console.error(error); return [null, null, { error: String((error as Error)?.message || error) }] as any; });
  const hydrateResponse: any = parallel[0], chapterResponse: any = parallel[1], sr1aSummary: any = parallel[2];
  if (!hydrateResponse || !hydrateResponse.ok) return out(req, 503, { error: 'Dependency resolver unavailable', status: hydrateResponse?.status || 503 });
  if (sr1aSummary?.error) return out(req, 503, { error: 'SR-1A summary unavailable', detail: sr1aSummary.error });
  const hydrated = await hydrateResponse.json();
  const rowMap = new Map((hydrated.records || []).map((r: any) => [String(r.pams_pin), r]));
  let chapterDistricts: any = {};
  if (needsChapter123) { if (!chapterResponse || !chapterResponse.ok) return out(req, 503, { error: 'Chapter 123 provider unavailable', status: chapterResponse?.status || 503 }); const chapterJson = await chapterResponse.json(); if (chapterJson?.source_id !== 'nj-chapter123-2026' || chapterJson?.provider_version !== CHAPTER123_PROVIDER || Number(chapterJson?.district_count) !== 564 || Number(chapterJson?.county_count) !== 21) return out(req, 503, { error: 'Chapter 123 provider validation failed' }); chapterDistricts = chapterJson?.districts || {}; }
  let subjectEvidence: any = { records: {}, meta: {} };
  if (needsEvidenceReferences) {
    const subjects = pins.map((pin) => { const row: any = rowMap.get(pin) || {}; return { key: pin, pams_pin: pin, district: districtCode(pin), block: row?.block, lot: row?.lot, qualifier: row?.qualifier }; });
    let subjectResponse: Response;
    try {
      subjectResponse = await fetch(url + '/functions/v1/sr1a-subject-provider', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subjects }) });
    } catch (error) {
      return out(req, 503, { error: 'SR-1A subject provider unavailable', detail: String((error as Error)?.message || error) });
    }
    if (!subjectResponse.ok) return out(req, 503, { error: 'SR-1A subject provider unavailable', status: subjectResponse.status });
    subjectEvidence = await subjectResponse.json();
    if (subjectEvidence?.source_id !== 'nj-sr1a-subject-evidence' || subjectEvidence?.provider_version !== SR1A_SUBJECT_PROVIDER) return out(req, 503, { error: 'SR-1A subject provider validation failed' });
  }
  const markers: any = {}, meta: any = {}, now = new Date().toISOString();

  for (const pin of pins) {
    markers[pin] = {}; meta[pin] = {};
    const row: any = rowMap.get(pin) || { pams_pin: pin }, rawVals: any = hydrated.markers?.[pin] || {}, rawMeta: any = hydrated.meta?.[pin] || {};
    const memo = new Map<string, any>(), stack = new Set<string>(), auxMeta = new Map<string, any>();
    const district = districtCode(pin), sr1aRow = sr1aSummary?.districts?.[district] || null;
    const subjectSale = subjectEvidence?.records?.[pin] || null;
    const rawValue = (dep: string) => { const rowValue = ROW[dep]?.(row); if (present(rowValue)) return rowValue; if (present(rawVals[dep])) return rawVals[dep]; const status = rawMeta[dep]?.status; if ((dep.startsWith('preflight.') || dep.startsWith('njplus.nj-dca-permits-raw.')) && status === 'source_checked_no_value') return 0; return rowValue ?? rawVals[dep] ?? null; };
    const checked = (dep: string) => { if (present(ROW[dep]?.(row)) || present(rawVals[dep])) return true; return ['available', 'source_checked_no_value'].includes(String(rawMeta[dep]?.status || '')); };
    const evidenceAnchor = () => { const ppsf = num(sr1aRow?.ppsf), sqft = num(subjectSale?.sf); return ppsf != null && ppsf > 0 && sqft != null && sqft > 0 ? ppsf * sqft : null; };

    const evalId = (id: string): any => {
      if (memo.has(id)) return memo.get(id); const def: any = defMap.get(id); if (!def || stack.has(id)) return null; stack.add(id);
      const value = (dep: string) => (defMap.has(dep) ? evalId(dep) : rawValue(dep)); const cfg = def.config || {}; let v: any = null;
      if (def.operation === 'year_delta') { const x = value(cfg.dep); let year = num(x); if (cfg.date_year && !year) { const match = String(x || '').match(/(19|20)\d{2}/); if (match) year = Number(match[0]); } if (year && year > 1600) v = new Date().getUTCFullYear() - year; }
      else if (def.operation === 'ratio') { const numerator = num(value(cfg.num)), denominator = num(value(cfg.den)); if (numerator != null && denominator != null) { const denominatorFloor = num(cfg.den_min); const effectiveDenominator = denominatorFloor == null ? denominator : Math.max(denominator, denominatorFloor); if (effectiveDenominator === 0) v = cfg.zero_as_100 && numerator === 0 ? 100 : null; else v = round(numerator / effectiveDenominator * Number(cfg.scale ?? 1), Number(cfg.precision ?? 3)); } }
      else if (def.operation === 'completeness') { const requirements: any[] = Array.isArray(cfg.requirements) ? cfg.requirements : (def.dependencies || []); if (requirements.length) { const ok = (q: any) => { if (cfg.mode === 'checked' && typeof q === 'string') return defMap.has(q) ? present(value(q)) : checked(q); if (typeof q === 'string') return present(value(q)); if (q?.all) return q.all.every((x: string) => present(value(x))); if (q?.ratio) { const a = num(value(q.ratio[0])), z = num(value(q.ratio[1])); return a != null && z != null && z !== 0; } return false; }; v = Math.round(requirements.filter(ok).length / requirements.length * 100); } }
      else if (def.operation === 'inverse') { const x = num(value(cfg.dep)); if (x != null) v = clamp(100 - x); }
      else if (def.operation === 'source_alias') { const dep = String(cfg.dep || ''); const x = dep ? value(dep) : null; if (present(x)) { v = x; const depMeta: any = defMap.has(dep) ? { provider_kind: 'derived_governed', source: 'Watchdog governed formula registry · ' + ENGINE_VERSION, observed_at: now, checked_at: null } : (rawMeta[dep] || {}); auxMeta.set(id, { alias_dependency: dep, reference_source: depMeta.source || null, reference_provider_kind: depMeta.provider_kind || null, reference_observed_at: depMeta.observed_at || null, reference_checked_at: depMeta.checked_at || null }); } }
      else if (def.operation === 'ordered_history') { const landDep = String(cfg.land_dep || ''), improvementDep = String(cfg.improvement_dep || ''), totalDep = String(cfg.total_dep || ''); const trace = orderedAssessmentHistory(landDep ? value(landDep) : null, improvementDep ? value(improvementDep) : null, totalDep ? value(totalDep) : null); if (trace) { v = trace; auxMeta.set(id, { history_years: trace.map((row: any) => row.year), missing_years_synthesized: false, trace_contract: 'actual_source_years_only' }); } }
      else if (def.operation === 'chapter123_field') { const official = chapterDistricts[districtCode(pin)] || null, field = String(cfg.field || ''); if (official && ['ratio','lower','upper'].includes(field)) { const x = num(official[field]); if (x != null) { v = x; auxMeta.set(id, { chapter123_field: field, reference_source: 'NJ Division of Taxation 2026 Chapter 123 · ' + CHAPTER123_PROVIDER }); } } }
      else if (def.operation === 'permit_closure') { const permits = num(value('preflight.permit_count')), open = num(value('preflight.open_permit_count')); if (permits != null || open != null) { if ((permits || 0) <= 0) v = (open || 0) > 0 ? 0 : 100; else v = Math.round((1 - Math.min((open || 0) / permits!, 1)) * 100); } }
      else if (def.operation === 'permit_activity') { const permits = num(value('preflight.permit_count')), open = num(value('preflight.open_permit_count')); if (permits != null || open != null) v = clamp(Math.round(Math.min(permits || 0, 20) * 3 + Math.min(open || 0, 10) * 8)); }
      else if (def.operation === 'weighted_signals') { const signals: any[] = cfg.signals || [], values = signals.map((s) => ({ s, v: value(s.dep) })); if (values.some((x) => present(x.v))) v = clamp(Math.round(values.reduce((sum, x) => sum + signal(x.v, x.s.transform) * Number(x.s.weight || 0) / 100, 0))); }
      else if (def.operation === 'signal_count' || def.operation === 'signal_density') { const deps: any[] = def.dependencies || [], readiness = deps.map((dep) => checked(dep) || present(value(dep))), ready = cfg.require_all ? (deps.length > 0 && readiness.every(Boolean)) : readiness.some(Boolean); if (ready) { const active = deps.filter((dep) => dep === cfg.flood_dep ? floodBand(value(dep)) > 0 : (truth(value(dep)) || (num(value(dep)) || 0) > 0)).length; v = def.operation === 'signal_count' ? active : Math.round(active / deps.length * 100); } }
      else if (def.operation === 'weighted_scores') { const configured: any[] = cfg.items || [], items = configured.map((s: any) => ({ s, v: value(s.dep) })).filter((x: any) => present(x.v)); if (items.length && (!cfg.require_all || items.length === configured.length)) { const weight = items.reduce((sum: number, x: any) => sum + Number(x.s.weight || 0), 0); if (weight > 0) v = Math.round(items.reduce((sum: number, x: any) => sum + signal(x.v, x.s.transform) * Number(x.s.weight || 0), 0) / weight); } }
      else if (def.operation === 'max_scores') { const configured: any[] = cfg.items || [], items = configured.map((s: any) => ({ s, v: value(s.dep) })).filter((x: any) => present(x.v)); if (items.length && (!cfg.require_all || items.length === configured.length)) v = Math.round(Math.max(...items.map((x: any) => signal(x.v, x.s.transform)))); }
      else if (def.operation === 'product_scores') { const configured: any[] = Array.isArray(cfg.items) ? cfg.items : []; const values = configured.map((item: any) => num(value(typeof item === 'string' ? item : item?.dep))); if (configured.length >= 2 && values.every((x: any) => x != null)) { const scores = values.map((x: any) => clamp(Number(x))); const product = scores.reduce((acc: number, score: number) => acc * score, 1); v = Math.round(product / (100 ** (scores.length - 1))); } }
      else if (def.operation === 'tax_rate_position') { const rateDefs: any[] = cfg.rate_deps || [], points = rateDefs.map((x: any) => ({ year: Number(x.year), rate: num(value(x.dep)) })).filter((x: any) => Number.isFinite(x.year) && x.rate != null && x.rate > 0).sort((a: any, b: any) => a.year - b.year); if (points.length >= 3) { const first = points[0], last = points[points.length - 1], span = last.year - first.year; if (span >= 2) { const cagr = Math.pow(last.rate / first.rate, 1 / span) - 1; v = Math.round(100 - (positivePct5(cagr) ?? 100)); } } }
      else if (def.operation === 'municipal_cost_absorption') { const levy = num(value(cfg.levy_dep)), ratable = num(value(cfg.ratable_dep)), collection = num(value(cfg.collection_dep)); if (levy != null && ratable != null && collection != null) { const gap = Math.max(0, levy - ratable), growth = clamp(100 - (positivePct5(gap) ?? 100)), collections = collectionScore(collection); if (collections != null) v = Math.round(growth * 0.70 + collections * 0.30); } }
      else if (def.operation === 'fiscal_resilience') { const pressure = num(value(cfg.pressure_dep)), absorption = num(value(cfg.absorption_dep)), collection = num(value(cfg.collection_dep)), debt = num(value(cfg.debt_dep)); if (pressure != null && absorption != null && collection != null && debt != null) { const collections = collectionScore(collection), debtScore = inverseDebtShare(debt); if (collections != null && debtScore != null) v = Math.round(clamp(100 - pressure) * 0.35 + clamp(absorption) * 0.30 + collections * 0.20 + debtScore * 0.15); } }
      else if (def.operation === 'revaluation_pressure') { const official = chapterDistricts[districtCode(pin)] || null, verified = num(value(cfg.verified_ratio_dep)), coefficient = num(value(cfg.uniformity_dep)); if (official && verified != null && verified > 0) { const published = Number(official.ratio) / 100; if (published > 0) { const level = clamp((0.85 - published) / 0.35, 0, 1), decay = clamp((published - verified)/0.20,0,1); let weighted = level * 0.45 + decay * 0.25, weight = 0.70; if (coefficient != null && coefficient > 0) { weighted += clamp((coefficient - 15) / 20, 0, 1) * 0.30; weight += 0.30; } let score = Math.round(weighted / weight * 100); if (published >= 0.98) score = Math.min(score, 8); v = clamp(score); } } }
      else if (def.operation === 'transaction_tax_shock') { const reval = num(value(cfg.reval_dep)), pressure = num(value(cfg.pressure_dep)), stability = num(value(cfg.tax_stability_dep)), levy = num(value(cfg.levy_dep)), ratable = num(value(cfg.ratable_dep)); if (reval != null && pressure != null && stability != null && levy != null && ratable != null) { const taxRisk = clamp(100 - stability), gapRisk = positivePct5(Math.max(0, levy - ratable)); if (gapRisk != null) v = Math.round(clamp(reval) * 0.35 + clamp(pressure) * 0.25 + taxRisk * 0.25 + gapRisk * 0.15); } }
      else if (def.operation === 'investor_carry_volatility') { const pressure = num(value(cfg.pressure_dep)), reval = num(value(cfg.reval_dep)), stability = num(value(cfg.tax_stability_dep)), levy = num(value(cfg.levy_dep)), ratable = num(value(cfg.ratable_dep)), exempt = num(value(cfg.exempt_share_dep)); if (pressure != null && reval != null && stability != null && levy != null && ratable != null && exempt != null) { const taxRisk = clamp(100 - stability), gapRisk = positivePct5(Math.max(0, levy - ratable)), exemptRisk = clamp(exempt / 0.35 * 100); if (gapRisk != null) v = Math.round(clamp(pressure) * 0.32 + gapRisk * 0.24 + clamp(reval) * 0.22 + taxRisk * 0.14 + exemptRisk * 0.08); } }
      else if (def.operation === 'tax_reset_sensitivity') { const base = num(value(cfg.base_dep)), subjectRatio = num(value(cfg.ratio_dep)), official = chapterDistricts[districtCode(pin)] || null, gapRisk = assessmentRatioGapRisk(subjectRatio, official); if (base != null && gapRisk != null) v = Math.round(clamp(base) * gapRisk / 100); }
      else if (def.operation === 'marketability_drag') { const annualTax = num(value(cfg.tax_dep)), assessed = num(value(cfg.assessed_dep)), verifiedRatio = num(value(cfg.verified_ratio_dep)), sampleSize = num(value(cfg.sample_size_dep)), pressure = num(value(cfg.pressure_dep)), reval = num(value(cfg.reval_dep)), coefficient = num(value(cfg.uniformity_dep)); if (annualTax != null && annualTax >= 0 && assessed != null && assessed > 0 && verifiedRatio != null && verifiedRatio > 0 && sampleSize != null && sampleSize >= 10 && pressure != null && reval != null && coefficient != null) { const marketValue = assessed / verifiedRatio, effectiveBurden = marketValue > 0 ? annualTax / marketValue : null, unevenness = codRisk(coefficient); if (effectiveBurden != null && unevenness != null) { const burdenRisk = clamp((effectiveBurden - 0.012) / (0.036 - 0.012) * 100); v = Math.round(burdenRisk * 0.34 + clamp(pressure) * 0.23 + clamp(reval) * 0.23 + unevenness * 0.20); } } }
      else if (def.operation === 'sr1a_subject_square_feet') { const sqft = num(subjectSale?.sf); if (sqft != null && sqft > 0) { v = Math.round(sqft); auxMeta.set(id, { reference_source: 'NJ Division of Taxation SR-1A compact subject evidence index', subject_sale_year: num(subjectSale?.y), subject_sale_month: num(subjectSale?.m), subject_match_quality: subjectSale?.match_quality || null, subject_provider: SR1A_SUBJECT_PROVIDER }); } }
      else if (def.operation === 'comparable_evidence_reliability') { const sample = num(value(cfg.sample_size_dep)), p25 = num(value(cfg.p25_dep)), p75 = num(value(cfg.p75_dep)), sqft = num(value(cfg.square_feet_dep)); const years = Array.isArray(sr1aRow?.years) ? sr1aRow.years.map((x: any) => Number(x)).filter(Number.isFinite) : []; const latest = years.length ? Math.max(...years) : null; if (sample != null && sample >= 10 && p25 != null && p75 != null && p75 >= p25 && latest != null) { const depth = clamp(sample / 150 * 100), spread = clamp(100 - Math.max(0, p75 - p25) / 0.35 * 100), recency = latest >= 2025 ? 100 : latest === 2024 ? 75 : 45, detail = sqft != null && sqft > 0 ? 100 : 0; v = Math.round(depth * 0.45 + spread * 0.30 + recency * 0.15 + detail * 0.10); auxMeta.set(id, { verified_sale_sample: sample, verified_sale_latest_year: latest, subject_square_feet_present: detail === 100, reference_source: 'NJ Division of Taxation SR-1A verified sales', subject_provider: SR1A_SUBJECT_PROVIDER }); } }
      else if (def.operation === 'assessment_defensibility') { const comparable = num(value(cfg.comparable_dep)), assessed = num(value(cfg.assessed_dep)), coefficient = num(value(cfg.uniformity_dep)), official = chapterDistricts[districtCode(pin)] || null, anchor = evidenceAnchor(), unevenness = codRisk(coefficient); if (comparable != null && assessed != null && assessed > 0 && coefficient != null && official && anchor != null && unevenness != null) { const supportedUpper = anchor * Number(official.upper) / 100, withinRange = assessed > supportedUpper ? 15 : 100, uniformity = 100 - unevenness; v = Math.round(clamp(comparable) * 0.30 + uniformity * 0.25 + withinRange * 0.25 + 100 * 0.20); auxMeta.set(id, { independent_value_anchor: Math.round(anchor), chapter123_upper_supported_assessment: Math.round(supportedUpper), chapter123_within_range: assessed <= supportedUpper, uniformity_transform: 'IAAO COD 15-35 consistency normalization', subject_provider: SR1A_SUBJECT_PROVIDER }); } }
      else if (def.operation === 'appeal_evidence_strength') { const assessed = num(value(cfg.assessed_dep)), sample = num(value(cfg.sample_size_dep)), coefficient = num(value(cfg.uniformity_dep)), prior = num(value(cfg.appeal_outcome_dep)), completeness = num(value(cfg.completeness_dep)), official = chapterDistricts[districtCode(pin)] || null, anchor = evidenceAnchor(); if (assessed != null && assessed > 0 && sample != null && sample >= 10 && coefficient != null && prior != null && completeness != null && official && anchor != null) { const supportedUpper = anchor * Number(official.upper) / 100, over = Math.max(0, assessed - supportedUpper), margin = clamp(over / assessed * 500), depth = clamp(sample / 100 * 100), uniformityContext = clamp((coefficient - 10) / 15 * 100); v = Math.round(100 * 0.25 + margin * 0.20 + depth * 0.18 + uniformityContext * 0.14 + clamp(prior) * 0.10 + clamp(completeness) * 0.13); auxMeta.set(id, { independent_value_anchor: Math.round(anchor), chapter123_margin_score: Math.round(margin), verified_comparable_depth: Math.round(depth), property_record_completeness: Math.round(clamp(completeness)), subject_provider: SR1A_SUBJECT_PROVIDER }); } }
      else if (def.operation === 'appeal_opportunity') { const assessed = num(value(cfg.assessed_dep)), annualTax = num(value(cfg.tax_dep)), coefficient = num(value(cfg.uniformity_dep)), prior = num(value(cfg.appeal_outcome_dep)), evidence = num(value(cfg.evidence_dep)), official = chapterDistricts[districtCode(pin)] || null, anchor = evidenceAnchor(); const parts: { weight: number; score: number; key: string }[] = []; let chapterMarginFraction: number | null = null; if (assessed != null && assessed > 0 && official && anchor != null) { const supportedUpper = anchor * Number(official.upper) / 100; chapterMarginFraction = Math.max(0, assessed - supportedUpper) / assessed; const hasCase = assessed > supportedUpper; parts.push({ weight: 35, score: hasCase ? 70 + Math.min(30, chapterMarginFraction * 300) : 0, key: 'chapter123_position' }); } if (evidence != null) parts.push({ weight: 25, score: clamp(evidence), key: 'evidence_file_strength' }); const inverseConsistency = codRisk(coefficient); if (inverseConsistency != null) parts.push({ weight: 15, score: inverseConsistency, key: 'inverse_assessment_consistency' }); if (prior != null) parts.push({ weight: 10, score: clamp(prior), key: 'county_appeal_outcomes' }); let annualDollars: number | null = null; if (assessed != null && assessed > 0 && annualTax != null && annualTax >= 0 && official && anchor != null) { const fair = anchor * Number(official.ratio) / 100; annualDollars = Math.max(0, assessed - fair) * (annualTax / assessed); parts.push({ weight: 15, score: clamp(annualDollars / 2500 * 100), key: 'annual_dollars_at_stake' }); } const available = parts.reduce((sum, part) => sum + part.weight, 0); if (available > 0) { v = Math.round(parts.reduce((sum, part) => sum + part.score * part.weight, 0) / available); auxMeta.set(id, { evidence_coverage: available, available_components: parts.map((part) => part.key), annual_dollars_at_stake: annualDollars == null ? null : Math.round(annualDollars), chapter123_margin_fraction: chapterMarginFraction, assessment_consistency_transform: 'IAAO COD 15-35 risk normalization', subject_provider: SR1A_SUBJECT_PROVIDER }); } }
      stack.delete(id); memo.set(id, v); return v;
    };

    for (const id of requested) {
      const def: any = defMap.get(id), value = evalId(id);
      if (value !== null && value !== undefined && !Number.isNaN(value)) {
        const operation = String(def.operation || ''), chapterField = operation === 'chapter123_field', chapterBacked = ['revaluation_pressure','tax_reset_sensitivity','assessment_defensibility','appeal_evidence_strength','appeal_opportunity','chapter123_field'].includes(operation), sr1aDirect = operation === 'sr1a_subject_square_feet', sourceAlias = operation === 'source_alias', directReference = sr1aDirect || sourceAlias || chapterField, aliasInfo: any = auxMeta.get(id) || {};
        markers[pin][id] = value;
        meta[pin][id] = { status: 'available', provider_kind: sourceAlias ? (aliasInfo.reference_provider_kind || 'authoritative_reference') : (directReference ? 'authoritative_reference' : 'derived_governed'), source: sourceAlias ? (aliasInfo.reference_source || 'Watchdog authoritative source alias') : (chapterField ? 'NJ Division of Taxation 2026 Chapter 123 · ' + CHAPTER123_PROVIDER : (sr1aDirect ? 'NJ Division of Taxation SR-1A compact subject evidence index' : 'Watchdog governed formula registry · ' + ENGINE_VERSION)), engine_version: ENGINE_VERSION, formula: def.formula, dependencies: def.dependencies, confidence: def.confidence, explanation: def.explanation, observed_at: sourceAlias ? (aliasInfo.reference_observed_at || now) : now, checked_at: sourceAlias ? (aliasInfo.reference_checked_at || null) : null, ...(chapterBacked ? { reference_source: 'NJ Division of Taxation 2026 Chapter 123 · ' + CHAPTER123_PROVIDER } : {}), ...(sr1aDirect ? { subject_provider: SR1A_SUBJECT_PROVIDER } : {}), ...(auxMeta.get(id) || {}) };
      } else {
        const operation = String(def.operation || ''), sourceAlias = operation === 'source_alias', aliasDep = String(def.config?.dep || ''), aliasMeta: any = aliasDep ? (defMap.has(aliasDep) ? { provider_kind: 'derived_governed', source: 'Watchdog governed formula registry · ' + ENGINE_VERSION } : (rawMeta[aliasDep] || {})) : {};
        meta[pin][id] = { status: 'dependency_missing', provider_kind: (operation === 'sr1a_subject_square_feet' || operation === 'chapter123_field') ? 'authoritative_reference' : (sourceAlias ? (aliasMeta.provider_kind || 'authoritative_reference') : 'derived_governed'), source: operation === 'chapter123_field' ? 'NJ Division of Taxation 2026 Chapter 123 · ' + CHAPTER123_PROVIDER : (operation === 'sr1a_subject_square_feet' ? 'NJ Division of Taxation SR-1A compact subject evidence index' : (sourceAlias ? (aliasMeta.source || 'Watchdog authoritative source alias') : 'Watchdog governed formula registry · ' + ENGINE_VERSION)), engine_version: ENGINE_VERSION, dependencies: def.dependencies, checked_at: now, ...(operation === 'sr1a_subject_square_feet' ? { subject_provider: SR1A_SUBJECT_PROVIDER } : {}), ...(sourceAlias ? { alias_dependency: aliasDep } : {}), ...(auxMeta.get(id) || {}) };
      }
    }
  }
  if (pins.length === 1) return out(req, 200, { pams_pin: pins[0], values: markers[pins[0]], records: hydrated.records || [], markers, meta, engine_version: ENGINE_VERSION, subject_provider: needsEvidenceReferences ? SR1A_SUBJECT_PROVIDER : null });
  return out(req, 200, { records: hydrated.records || [], markers, meta, engine_version: ENGINE_VERSION, subject_provider: needsEvidenceReferences ? SR1A_SUBJECT_PROVIDER : null });
});