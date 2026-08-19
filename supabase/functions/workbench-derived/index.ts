declare const Deno: any;
// @ts-ignore remote runtime import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ENGINE_VERSION = 'watchdog-derived-v8-reset-conversation';
const CHAPTER123_PROVIDER = 'chapter123-provider-v3';
const ORIGINS = new Set([
  'https://njpropertytaxrelief.com',
  'https://www.njpropertytaxrelief.com',
]);

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

function clean(v: any, max = 140) {
  return String(v || '').trim().slice(0, max);
}
function num(v: any) {
  if (v === null || v === undefined || v === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}
function present(v: any) {
  return v !== null && v !== undefined && v !== '';
}
function truth(v: any) {
  return v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true' || String(v).toLowerCase() === 'yes';
}
function clamp(v: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v));
}
function round(v: number, precision = 0) {
  const f = 10 ** precision;
  return Math.round(v * f) / f;
}
function districtCode(v: any) {
  const s = String(v || '').replace(/\D/g, '');
  return s.length >= 4 ? s.slice(0, 4) : '';
}
function floodBand(v: any) {
  const zone = String(v || '').toUpperCase();
  if (!zone) return 0;
  if (/^(A|AE|AH|AO|AR|A99|V|VE)/.test(zone)) return 100;
  if (/^(X.*0\.2|B)/.test(zone)) return 66;
  if (/^(X|C)/.test(zone)) return 0;
  return 33;
}
function positivePct5(v: any) {
  const x = num(v);
  return x == null ? null : clamp(Math.max(0, x) / 0.05 * 100);
}
function collectionScore(v: any) {
  const x = num(v);
  return x == null ? null : clamp((x - 0.90) / 0.10 * 100);
}
function inverseDebtShare(v: any) {
  const x = num(v);
  return x == null ? null : clamp(100 - x / 0.20 * 100);
}
function codRisk(v: any) {
  const x = num(v);
  return x == null ? null : clamp((x - 15) / 20 * 100);
}
function assessmentRatioGapRisk(subjectRatio: any, official: any) {
  const subject = num(subjectRatio);
  const publishedPct = num(official?.ratio);
  if (subject == null || subject <= 0 || publishedPct == null || publishedPct <= 0) return null;
  const published = publishedPct / 100;
  return clamp(Math.abs(subject - published) / 0.20 * 100);
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
  if (transform === 'share35') {
    const x = num(v);
    return x == null ? 0 : clamp(x / 0.35 * 100);
  }
  const cap = Number(String(transform).replace('count', '')) || 1;
  return clamp(((num(v) || 0) / cap) * 100);
}

const ROW: Record<string, (r: any) => any> = {
  'property.address': (r) => r?.address,
  'property.municipality': (r) => r?.town,
  'property.county': (r) => r?.county,
  'property.zip': (r) => r?.zip,
  'property.block': (r) => r?.block,
  'property.lot': (r) => r?.lot,
  'property.qualifier': (r) => r?.qualifier,
  'property.pams_pin': (r) => r?.pams_pin,
  'property.property_class': (r) => r?.prop_class,
  'property.class': (r) => r?.prop_class,
  'property.year_built': (r) => r?.year_built,
  'property.lot_area': (r) => r?.acres,
  'property.acres': (r) => r?.acres,
  'property.units': (r) => r?.dwelling_units,
  'property.assessed_value': (r) => r?.assessed_value,
  'property.annual_tax': (r) => r?.last_year_tax,
  'property.land_assessment': (r) => r?.land_value,
  'property.land_value': (r) => r?.land_value,
  'property.improvement_assessment': (r) => r?.improvement_value,
  'property.improvement_value': (r) => r?.improvement_value,
  'property.sale_price': (r) => r?.last_sale_price,
  'property.last_sale_price': (r) => r?.last_sale_price,
  'property.sale_date': (r) => r?.deed_date ?? r?.last_sale_year,
  'property.deed_date': (r) => r?.deed_date ?? r?.last_sale_year,
  'property.deed_book': (r) => r?.deed_book,
  'property.deed_page': (r) => r?.deed_page,
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return out(req, 405, { error: 'POST required' });

  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return out(req, 401, { error: 'Sign in required' });

  const url = Deno.env.get('SUPABASE_URL') || '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: who } = await userClient.auth.getUser();
  if (!who.user) return out(req, 401, { error: 'Session invalid' });

  const { data: entitlement, error: entitlementError } = await userClient.rpc('get_my_entitlement');
  if (entitlementError) return out(req, 503, { error: 'Entitlement resolver unavailable' });
  const entitlementRow = Array.isArray(entitlement) ? entitlement[0] : entitlement;
  const plan = String(entitlementRow?.plan_tier || 'standard');
  if (!['pro', 'pro_plus', 'teams', 'developer'].includes(plan)) return out(req, 403, { error: 'Pro plan required' });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return out(req, 400, { error: 'Invalid JSON' });
  }

  const pins: string[] = [...new Set<string>((Array.isArray(body.pams_pins) ? body.pams_pins : [body.pams_pin]).map((x: any) => clean(x, 80)).filter(Boolean))].slice(0, 500);
  const rawIds: string[] = [...new Set<string>((Array.isArray(body.marker_ids) ? body.marker_ids : []).map((x: any) => clean(x)).filter(Boolean))].slice(0, 250);
  if (!pins.length || !rawIds.length) return out(req, 200, { records: [], markers: {}, meta: {}, engine_version: ENGINE_VERSION });

  const { data: defs, error: defErr } = await userClient
    .from('derived_formula_registry')
    .select('marker_id,formula,dependencies,confidence,status,explanation,operation,config')
    .eq('status', 'live');
  if (defErr) return out(req, 503, { error: 'Formula registry unavailable' });

  const defMap = new Map((defs || []).map((d: any) => [String(d.marker_id), d]));
  const requested = rawIds.filter((id) => defMap.has(id));
  if (!requested.length) return out(req, 200, { records: [], markers: {}, meta: {}, engine_version: ENGINE_VERSION });

  const rawDeps = new Set<string>();
  const seen = new Set<string>();
  const walk = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const def: any = defMap.get(id);
    for (const dep of def?.dependencies || []) {
      if (defMap.has(dep)) walk(dep);
      else rawDeps.add(dep);
    }
  };
  requested.forEach(walk);

  const needsChapter123 = [...seen].some((id) => {
    const op = (defMap.get(id) as any)?.operation;
    return op === 'revaluation_pressure' || op === 'tax_reset_sensitivity';
  });

  const hydratePromise = fetch(url + '/functions/v1/workbench-hydrate', {
    method: 'POST',
    headers: { Authorization: auth, apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ pams_pins: pins, marker_ids: [...rawDeps] }),
  });
  const chapterPromise = needsChapter123
    ? fetch(url + '/functions/v1/chapter123-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ districts: [...new Set(pins.map(districtCode).filter(Boolean))] }),
      })
    : Promise.resolve(null);

  const [hydrateResponse, chapterResponse] = await Promise.all([hydratePromise, chapterPromise]);
  if (!hydrateResponse.ok) return out(req, 503, { error: 'Dependency resolver unavailable', status: hydrateResponse.status });
  const hydrated = await hydrateResponse.json();

  let chapterDistricts: any = {};
  if (needsChapter123) {
    if (!chapterResponse || !chapterResponse.ok) return out(req, 503, { error: 'Chapter 123 provider unavailable', status: chapterResponse?.status || 503 });
    const chapterJson = await chapterResponse.json();
    if (chapterJson?.source_id !== 'nj-chapter123-2026' || Number(chapterJson?.district_count) !== 564) {
      return out(req, 503, { error: 'Chapter 123 provider validation failed' });
    }
    chapterDistricts = chapterJson?.districts || {};
  }

  const rowMap = new Map((hydrated.records || []).map((r: any) => [String(r.pams_pin), r]));
  const markers: any = {};
  const meta: any = {};
  const now = new Date().toISOString();

  for (const pin of pins) {
    markers[pin] = {};
    meta[pin] = {};
    const row = rowMap.get(pin) || { pams_pin: pin };
    const rawVals: any = hydrated.markers?.[pin] || {};
    const rawMeta: any = hydrated.meta?.[pin] || {};
    const memo = new Map<string, any>();
    const stack = new Set<string>();

    const rawValue = (dep: string) => {
      const rowValue = ROW[dep]?.(row);
      if (present(rowValue)) return rowValue;
      if (present(rawVals[dep])) return rawVals[dep];
      const status = rawMeta[dep]?.status;
      if ((dep.startsWith('preflight.') || dep.startsWith('njplus.nj-dca-permits-raw.')) && status === 'source_checked_no_value') return 0;
      return rowValue ?? rawVals[dep] ?? null;
    };
    const checked = (dep: string) => {
      if (present(ROW[dep]?.(row)) || present(rawVals[dep])) return true;
      return ['available', 'source_checked_no_value'].includes(String(rawMeta[dep]?.status || ''));
    };

    const evalId = (id: string): any => {
      if (memo.has(id)) return memo.get(id);
      const def: any = defMap.get(id);
      if (!def || stack.has(id)) return null;
      stack.add(id);
      const value = (dep: string) => (defMap.has(dep) ? evalId(dep) : rawValue(dep));
      const cfg = def.config || {};
      let v: any = null;

      if (def.operation === 'year_delta') {
        const x = value(cfg.dep);
        let year = num(x);
        if (cfg.date_year && !year) {
          const match = String(x || '').match(/(19|20)\d{2}/);
          if (match) year = Number(match[0]);
        }
        if (year && year > 1600) v = new Date().getUTCFullYear() - year;
      } else if (def.operation === 'ratio') {
        const numerator = num(value(cfg.num));
        const denominator = num(value(cfg.den));
        if (numerator != null && denominator != null) {
          if (denominator === 0) v = cfg.zero_as_100 && numerator === 0 ? 100 : null;
          else v = round(numerator / denominator * Number(cfg.scale ?? 1), Number(cfg.precision ?? 3));
        }
      } else if (def.operation === 'completeness') {
        const requirements: any[] = Array.isArray(cfg.requirements) ? cfg.requirements : (def.dependencies || []);
        if (requirements.length) {
          const ok = (q: any) => {
            if (cfg.mode === 'checked' && typeof q === 'string') return defMap.has(q) ? present(value(q)) : checked(q);
            if (typeof q === 'string') return present(value(q));
            if (q?.all) return q.all.every((x: string) => present(value(x)));
            if (q?.ratio) {
              const a = num(value(q.ratio[0]));
              const z = num(value(q.ratio[1]));
              return a != null && z != null && z !== 0;
            }
            return false;
          };
          v = Math.round(requirements.filter(ok).length / requirements.length * 100);
        }
      } else if (def.operation === 'inverse') {
        const x = num(value(cfg.dep));
        if (x != null) v = clamp(100 - x);
      } else if (def.operation === 'permit_closure') {
        const permits = num(value('preflight.permit_count'));
        const open = num(value('preflight.open_permit_count'));
        if (permits != null || open != null) {
          if ((permits || 0) <= 0) v = (open || 0) > 0 ? 0 : 100;
          else v = Math.round((1 - Math.min((open || 0) / permits!, 1)) * 100);
        }
      } else if (def.operation === 'permit_activity') {
        const permits = num(value('preflight.permit_count'));
        const open = num(value('preflight.open_permit_count'));
        if (permits != null || open != null) v = clamp(Math.round(Math.min(permits || 0, 20) * 3 + Math.min(open || 0, 10) * 8));
      } else if (def.operation === 'weighted_signals') {
        const signals: any[] = cfg.signals || [];
        const values = signals.map((s) => ({ s, v: value(s.dep) }));
        if (values.some((x) => present(x.v))) {
          v = clamp(Math.round(values.reduce((sum, x) => sum + signal(x.v, x.s.transform) * Number(x.s.weight || 0) / 100, 0)));
        }
      } else if (def.operation === 'signal_count' || def.operation === 'signal_density') {
        const deps: any[] = def.dependencies || [];
        if (deps.some((dep) => checked(dep) || present(value(dep)))) {
          const active = deps.filter((dep) => dep === cfg.flood_dep ? floodBand(value(dep)) > 0 : (truth(value(dep)) || (num(value(dep)) || 0) > 0)).length;
          v = def.operation === 'signal_count' ? active : Math.round(active / deps.length * 100);
        }
      } else if (def.operation === 'weighted_scores') {
        const configured: any[] = cfg.items || [];
        const items = configured.map((s: any) => ({ s, v: value(s.dep) })).filter((x: any) => present(x.v));
        if (items.length && (!cfg.require_all || items.length === configured.length)) {
          const weight = items.reduce((sum: number, x: any) => sum + Number(x.s.weight || 0), 0);
          if (weight > 0) v = Math.round(items.reduce((sum: number, x: any) => sum + signal(x.v, x.s.transform) * Number(x.s.weight || 0), 0) / weight);
        }
      } else if (def.operation === 'tax_rate_position') {
        const rateDefs: any[] = cfg.rate_deps || [];
        const points = rateDefs
          .map((x: any) => ({ year: Number(x.year), rate: num(value(x.dep)) }))
          .filter((x: any) => Number.isFinite(x.year) && x.rate != null && x.rate > 0)
          .sort((a: any, b: any) => a.year - b.year);
        if (points.length >= 3) {
          const first = points[0];
          const last = points[points.length - 1];
          const span = last.year - first.year;
          if (span >= 2) {
            const cagr = Math.pow(last.rate / first.rate, 1 / span) - 1;
            v = Math.round(100 - (positivePct5(cagr) ?? 100));
          }
        }
      } else if (def.operation === 'municipal_cost_absorption') {
        const levy = num(value(cfg.levy_dep));
        const ratable = num(value(cfg.ratable_dep));
        const collection = num(value(cfg.collection_dep));
        if (levy != null && ratable != null && collection != null) {
          const gap = Math.max(0, levy - ratable);
          const growth = clamp(100 - (positivePct5(gap) ?? 100));
          const collections = collectionScore(collection);
          if (collections != null) v = Math.round(growth * 0.70 + collections * 0.30);
        }
      } else if (def.operation === 'fiscal_resilience') {
        const pressure = num(value(cfg.pressure_dep));
        const absorption = num(value(cfg.absorption_dep));
        const collection = num(value(cfg.collection_dep));
        const debt = num(value(cfg.debt_dep));
        if (pressure != null && absorption != null && collection != null && debt != null) {
          const collections = collectionScore(collection);
          const debtScore = inverseDebtShare(debt);
          if (collections != null && debtScore != null) {
            v = Math.round(clamp(100 - pressure) * 0.35 + clamp(absorption) * 0.30 + collections * 0.20 + debtScore * 0.15);
          }
        }
      } else if (def.operation === 'revaluation_pressure') {
        const official = chapterDistricts[districtCode(pin)] || null;
        const verified = num(value(cfg.verified_ratio_dep));
        const coefficient = num(value(cfg.uniformity_dep));
        if (official && verified != null && verified > 0) {
          const published = Number(official.ratio) / 100;
          if (published > 0) {
            const level = clamp((0.85 - published) / 0.35, 0, 1);
            const decay = clamp((published - verified) / 0.20, 0, 1);
            let weighted = level * 0.45 + decay * 0.25;
            let weight = 0.70;
            if (coefficient != null && coefficient > 0) {
              weighted += clamp((coefficient - 15) / 20, 0, 1) * 0.30;
              weight += 0.30;
            }
            let score = Math.round(weighted / weight * 100);
            if (published >= 0.98) score = Math.min(score, 8);
            v = clamp(score);
          }
        }
      } else if (def.operation === 'transaction_tax_shock') {
        const reval = num(value(cfg.reval_dep));
        const pressure = num(value(cfg.pressure_dep));
        const stability = num(value(cfg.tax_stability_dep));
        const levy = num(value(cfg.levy_dep));
        const ratable = num(value(cfg.ratable_dep));
        if (reval != null && pressure != null && stability != null && levy != null && ratable != null) {
          const taxRisk = clamp(100 - stability);
          const gapRisk = positivePct5(Math.max(0, levy - ratable));
          if (gapRisk != null) v = Math.round(clamp(reval) * 0.35 + clamp(pressure) * 0.25 + taxRisk * 0.25 + gapRisk * 0.15);
        }
      } else if (def.operation === 'investor_carry_volatility') {
        const pressure = num(value(cfg.pressure_dep));
        const reval = num(value(cfg.reval_dep));
        const stability = num(value(cfg.tax_stability_dep));
        const levy = num(value(cfg.levy_dep));
        const ratable = num(value(cfg.ratable_dep));
        const exempt = num(value(cfg.exempt_share_dep));
        if (pressure != null && reval != null && stability != null && levy != null && ratable != null && exempt != null) {
          const taxRisk = clamp(100 - stability);
          const gapRisk = positivePct5(Math.max(0, levy - ratable));
          const exemptRisk = clamp(exempt / 0.35 * 100);
          if (gapRisk != null) v = Math.round(clamp(pressure) * 0.32 + gapRisk * 0.24 + clamp(reval) * 0.22 + taxRisk * 0.14 + exemptRisk * 0.08);
        }
      } else if (def.operation === 'tax_reset_sensitivity') {
        const base = num(value(cfg.base_dep));
        const subjectRatio = num(value(cfg.ratio_dep));
        const official = chapterDistricts[districtCode(pin)] || null;
        const gapRisk = assessmentRatioGapRisk(subjectRatio, official);
        if (base != null && gapRisk != null) v = Math.round(clamp(base) * gapRisk / 100);
      }

      stack.delete(id);
      memo.set(id, v);
      return v;
    };

    for (const id of requested) {
      const def: any = defMap.get(id);
      const value = evalId(id);
      if (value !== null && value !== undefined && !Number.isNaN(value)) {
        const chapterBacked = ['revaluation_pressure', 'tax_reset_sensitivity'].includes(String(def.operation || ''));
        markers[pin][id] = value;
        meta[pin][id] = {
          status: 'available',
          provider_kind: 'derived_governed',
          source: 'Watchdog governed formula registry · ' + ENGINE_VERSION,
          engine_version: ENGINE_VERSION,
          formula: def.formula,
          dependencies: def.dependencies,
          confidence: def.confidence,
          explanation: def.explanation,
          observed_at: now,
          ...(chapterBacked ? { reference_source: 'NJ Division of Taxation 2026 Chapter 123 · ' + CHAPTER123_PROVIDER } : {}),
        };
      } else {
        meta[pin][id] = {
          status: 'dependency_missing',
          provider_kind: 'derived_governed',
          source: 'Watchdog governed formula registry · ' + ENGINE_VERSION,
          engine_version: ENGINE_VERSION,
          dependencies: def.dependencies,
          checked_at: now,
        };
      }
    }
  }

  if (pins.length === 1) {
    return out(req, 200, {
      pams_pin: pins[0],
      values: markers[pins[0]],
      records: hydrated.records || [],
      markers,
      meta,
      engine_version: ENGINE_VERSION,
    });
  }
  return out(req, 200, { records: hydrated.records || [], markers, meta, engine_version: ENGINE_VERSION });
});
