import { createClient } from 'npm:@supabase/supabase-js@2.55.0';
import {
  buildCertifiedIndex,
  findCertified,
  buildTaxRateIndex,
  findTaxRate,
  chapter123Screen,
  monthsBeforeValuationDate,
  marketAtValuationDate,
  appealDeadlineContext,
} from './formula.mjs';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
});

const SOURCE_ROOT = 'https://njpropertytaxrelief.com';
const SCOPED_SALES_ENDPOINT = 'https://www.watchdogindex.com/api/sales-by-district';
const FORMULA_VERSION = 'appeal-prospect-scan-server-v4-certified-clr-scoped-sales';
const CHAPTER123_SOURCE = 'https://www.nj.gov/treasury/taxation/pdf/lpt/chap123/2026CH123.pdf';
const DEADLINE_RULES_SOURCE = 'https://www.nj.gov/treasury/taxation/lpt/lpt-appeal.shtml';
const COUNTIES: Record<string, string> = {
  '01':'Atlantic','02':'Bergen','03':'Burlington','04':'Camden','05':'Cape May','06':'Cumberland',
  '07':'Essex','08':'Gloucester','09':'Hudson','10':'Hunterdon','11':'Mercer','12':'Middlesex',
  '13':'Monmouth','14':'Morris','15':'Ocean','16':'Passaic','17':'Salem','18':'Somerset',
  '19':'Sussex','20':'Union','21':'Warren'
};
const ALLOWED_MIN_ASSESSMENT = new Set([0, 250000, 500000, 1000000, 2000000, 5000000]);

const cache = new Map<string, { expires: number; value: unknown }>();
async function sourceJson(path: string, ttlMs = 10 * 60 * 1000) {
  const hit = cache.get(path);
  if (hit && hit.expires > Date.now()) return hit.value;
  const response = await fetch(`${SOURCE_ROOT}${path}`, {
    headers: { 'User-Agent': 'Watchdog-Server-Scanner/4.0' },
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`source_${response.status}_${path}`);
  const value = await response.json();
  cache.set(path, { expires: Date.now() + ttlMs, value });
  return value;
}

async function scopedSales(countySlug: string, district: string, ttlMs = 5 * 60 * 1000) {
  const cacheKey = `scoped-sales:${countySlug}:${district}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.expires > Date.now()) return hit.value as any;
  const url = `${SCOPED_SALES_ENDPOINT}?county=${encodeURIComponent(countySlug)}&district=${encodeURIComponent(district)}`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Watchdog-Server-Scanner/4.0', Accept: 'application/json' },
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`scoped_sales_${response.status}_${countySlug}_${district}`);
  const value = await response.json();
  if (String(value?.district || '') !== district || String(value?.county || '') !== countySlug || !Array.isArray(value?.sales)) {
    throw new Error(`scoped_sales_signature_${countySlug}_${district}`);
  }
  if (Number.isFinite(Number(value?.count)) && Number(value.count) !== value.sales.length) {
    throw new Error(`scoped_sales_count_${countySlug}_${district}`);
  }
  cache.set(cacheKey, { expires: Date.now() + ttlMs, value });
  return value;
}

function clamp(value: number) { return Math.max(0, Math.min(100, Number(value) || 0)); }
function grade(yearsOld: number) {
  if (yearsOld <= 1) return { k: 'A', t: 'Very strong', w: 'Sale is recent enough to stand on its own.' };
  if (yearsOld <= 3) return { k: 'B', t: 'Strong', w: 'Recent sale, lightly adjusted for time.' };
  if (yearsOld <= 5) return { k: 'C', t: 'Workable', w: 'Older sale, more of the figure is carried forward.' };
  return { k: 'D', t: 'Weak', w: 'The sale is old enough that the adjustment does most of the work.' };
}
function opportunity(hit: any, uniformity: any, countyAppeal: any) {
  const parts: Array<{ label: string; weight: number; value: number }> = [];
  let available = 0;
  const add = (label: string, weight: number, value: unknown) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return;
    available += weight;
    parts.push({ label, weight, value: clamp(number) });
  };
  add('Sale recency', 30, hit.g.k === 'A' ? 100 : hit.g.k === 'B' ? 82 : hit.g.k === 'C' ? 58 : 32);
  add('Certified Chapter 123 margin', 30, clamp(hit.over / Math.max(1, hit.av) * 500));
  if (uniformity) add('Assessment inconsistency', 15, clamp((Number(uniformity.coefficient) - 10) / 15 * 100));
  if (countyAppeal?.latest) add('County outcome context', 10, Number(countyAppeal.latest.win_rate_filed));
  add('Annual dollars at stake', 15, clamp(hit.saving / 2500 * 100));
  const score = available ? Math.round(parts.reduce((sum, part) => sum + part.value * part.weight, 0) / available) : null;
  return {
    score,
    confidence: available,
    band: score == null ? 'No signal' : score >= 75 ? 'High priority' : score >= 55 ? 'Review' : score >= 35 ? 'Developing' : 'Low signal',
    parts,
  };
}

async function authorize(req: Request) {
  const authorization = req.headers.get('Authorization');
  if (!authorization) return { error: json({ error: 'Sign in required' }, 401) };
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) return { error: json({ error: 'Scanner service unavailable' }, 503) };
  const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: { user }, error: userError } = await client.auth.getUser();
  if (userError || !user) return { error: json({ error: 'Sign in required' }, 401) };
  const { data: allowed, error: planError } = await client.rpc('has_watchdog_plan', { required_plan: 'pro_plus' });
  if (planError) {
    console.error('scanner_entitlement_check_failed', { code: planError.code, user_id: user.id });
    return { error: json({ error: 'Access check unavailable' }, 503) };
  }
  if (allowed !== true) return { error: json({ error: 'Pro+ access required' }, 403) };
  return { client, user };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = await authorize(req);
  if ('error' in auth) return auth.error;

  let input: Record<string, unknown>;
  try { input = await req.json(); } catch { return json({ error: 'Invalid request body' }, 400); }
  const action = String(input.action || 'scan');

  try {
    const [sr1aJson, uniformityJson, equalizationJson] = await Promise.all([
      sourceJson('/property/sr1a-ratios.json'),
      sourceJson('/property/uniformity.json'),
      sourceJson('/equalization-ratios.json'),
    ]);
    const districts = (sr1aJson as any)?.districts || {};
    const uniformity = (uniformityJson as any)?.districts || {};
    const certifiedIndex = buildCertifiedIndex(equalizationJson as any);

    if (action === 'catalog') {
      const counties = Object.keys(COUNTIES).map(code => {
        const towns = Object.keys(districts)
          .filter(district => district.slice(0, 2) === code)
          .map(district => {
            const uniformityRow = uniformity[district] || null;
            const certified = findCertified(certifiedIndex, uniformityRow?.name, uniformityRow?.county || COUNTIES[code]);
            return {
              district,
              name: String(uniformityRow?.name || district),
              verified_sales: Number(districts[district]?.n || 0),
              certified_year: certified?.year || null,
              scanner_ready: Boolean(certified),
            };
          })
          .sort((a: any, b: any) => a.name.localeCompare(b.name));
        return { code, name: COUNTIES[code], towns };
      });
      return json({
        formula_version: FORMULA_VERSION,
        source: { kind: 'NJ certified common-level range', url: CHAPTER123_SOURCE },
        counties,
      });
    }

    if (action !== 'scan') return json({ error: 'Unsupported action' }, 400);
    const district = String(input.district || '').trim();
    const maxYears = Number(input.max_years);
    const minSaving = Number(input.min_saving);
    const minAssessment = input.min_assessment == null ? 0 : Number(input.min_assessment);
    if (!/^\d{4}$/.test(district) || !districts[district]) return json({ error: 'Invalid municipality' }, 400);
    if (![2, 3, 6].includes(maxYears)) return json({ error: 'Invalid sale window' }, 400);
    if (![0, 250, 500, 1000].includes(minSaving)) return json({ error: 'Invalid minimum saving' }, 400);
    if (!ALLOWED_MIN_ASSESSMENT.has(minAssessment)) return json({ error: 'Invalid assessment threshold' }, 400);

    const districtSource = districts[district];
    const uniformityRow = uniformity[district] || null;
    const countyName = String(uniformityRow?.county || districtSource.county || COUNTIES[district.slice(0, 2)] || '').trim();
    const municipalityName = String(uniformityRow?.name || district).trim();
    const certified = findCertified(certifiedIndex, municipalityName, countyName);
    if (!certified) {
      return json({
        formula_version: FORMULA_VERSION,
        result: 'certified_ratio_unavailable',
        municipality: municipalityName,
        message: 'No governed certified Chapter 123 common-level range is loaded for this municipality. No substitute ratio was used.',
      }, 422);
    }

    const countySlug = countyName.toLowerCase().replace(/\s+/g, '-');
    if (!countySlug || !Object.values(COUNTIES).some(name => name.toLowerCase() === countyName.toLowerCase())) {
      return json({ error: 'Unsupported county' }, 400);
    }

    const [appealsJson, taxRatesJson, salesJson, revaluationJson, deadlineRulesJson] = await Promise.all([
      sourceJson('/property/appeals.json'),
      sourceJson('/property/tax-rates.json'),
      scopedSales(countySlug, district),
      sourceJson('/property/revaluation-reassessment-2026.json'),
      sourceJson('/property/appeal-deadline-rules.json'),
    ]);

    const revaluationDistricts = (revaluationJson as any)?.districts || {};
    const revaluationOrReassessment = revaluationDistricts[district] === true && Number((revaluationJson as any)?.tax_year) === certified.year;
    const deadlineContext = appealDeadlineContext({
      countyName,
      assessed: 0,
      revaluationOrReassessment,
      taxYear: certified.year,
      deadlineRules: deadlineRulesJson as any,
    });

    const taxRateIndex = buildTaxRateIndex(taxRatesJson as any);
    const taxRate = findTaxRate(taxRateIndex, municipalityName, countyName);
    if (!taxRate) {
      return json({
        formula_version: FORMULA_VERSION,
        result: 'tax_rate_unavailable',
        municipality: municipalityName,
        deadline_context: deadlineContext,
        message: 'No governed general tax rate is loaded for this municipality. Annual dollars at stake were not estimated.',
      }, 422);
    }

    if (revaluationOrReassessment) {
      return json({
        formula_version: FORMULA_VERSION,
        result: 'manual_review_required',
        municipality: municipalityName,
        reason: 'approved_revaluation_or_reassessment',
        tax_year: certified.year,
        deadline_context: deadlineContext,
        deadline_source: { kind: 'NJ local property tax appeal filing rules', url: DEADLINE_RULES_SOURCE },
        message: 'This municipality appears on the governed approved revaluation/reassessment list for the certified tax year. The automated Chapter 123 screen is disabled here. Filing-window context is provided only as a baseline; verify the current assessment notice and County Board instructions before relying on any date.',
      });
    }

    const all = Array.isArray((salesJson as any)?.sales) ? (salesJson as any).sales : [];
    const taxYear = certified.year;
    const valuationYear = taxYear - 1;
    const valuationDate = `${valuationYear}-10-01`;
    const saleCutoff = `${valuationYear}-09-30`;
    const driftRaw = Number(districtSource.drift);
    const drift = Number.isFinite(driftRaw) && driftRaw > -0.30 && driftRaw < 0.50 ? driftRaw : null;
    if (drift == null) {
      return json({
        formula_version: FORMULA_VERSION,
        result: 'market_adjustment_unavailable',
        municipality: municipalityName,
        deadline_context: deadlineContext,
        message: 'The governed residential sale-time adjustment is unavailable. No fallback market adjustment was used.',
      }, 422);
    }

    const pool = all.filter((sale: any) => {
      const monthsBefore = monthsBeforeValuationDate(sale?.y, sale?.m, taxYear);
      return sale?.d === district && String(sale?.c).trim() === '2' && Number(sale?.p) > 40000 && Number(sale?.av) > 5000 &&
        Number(sale?.av) >= minAssessment && monthsBefore != null && monthsBefore <= maxYears * 12;
    });
    if (pool.length < 15) {
      return json({
        formula_version: FORMULA_VERSION,
        result: 'insufficient_sales',
        municipality: municipalityName,
        pool: pool.length,
        deadline_context: deadlineContext,
      });
    }

    const countyAppeal = (appealsJson as any)?.counties?.[district.slice(0, 2)] || null;
    const hits: any[] = [];
    for (const sale of pool) {
      const monthsBefore = monthsBeforeValuationDate(sale.y, sale.m, taxYear);
      if (monthsBefore == null) continue;
      const age = monthsBefore / 12;
      const market = marketAtValuationDate(Number(sale.p), monthsBefore, drift);
      if (!Number.isFinite(market) || market <= 0) continue;
      const screened = chapter123Screen({ market, assessed: Number(sale.av), certified, taxRate });
      if (!screened?.above) continue;
      const saving = Number(screened.annual_tax_at_stake);
      if (saving < minSaving) continue;
      const hit: any = {
        a: String(sale.a || ''), b: String(sale.b || ''), l: String(sale.l || ''), y: Number(sale.y), c: '2',
        p: Number(sale.p), av: Number(sale.av), sf: Number(sale.sf) || null, yb: Number(sale.yb) || null,
        age, market,
        fair: screened.supported_assessment,
        limit: screened.threshold_assessment,
        over: screened.over,
        saving,
        implied: screened.subject_ratio,
        g: grade(age),
      };
      hit.opportunity = opportunity(hit, uniformityRow, countyAppeal);
      hits.push(hit);
    }
    hits.sort((a, b) => (Number(b.opportunity?.score) - Number(a.opportunity?.score)) || (b.saving - a.saving));
    if (hits.length > 10000) hits.length = 10000;

    return json({
      formula_version: FORMULA_VERSION,
      generated_at: new Date().toISOString(),
      result: 'ok',
      source: { kind: 'NJ certified common-level range', url: CHAPTER123_SOURCE },
      sales_source: {
        kind: 'Watchdog municipality-scoped NJ Division of Taxation SR-1A verified usable sales',
        endpoint: '/api/sales-by-district',
        county: countySlug,
        district,
        rows: all.length,
      },
      deadline_source: { kind: 'NJ local property tax appeal filing rules', url: DEADLINE_RULES_SOURCE },
      run: {
        d: district,
        name: municipalityName,
        county: COUNTIES[district.slice(0, 2)] || countyName,
        ratio: certified.ratio / 100,
        certified: {
          year: certified.year,
          ratio: certified.ratio / 100,
          lower: certified.lower / 100,
          upper: certified.upper / 100,
          upper_applied: certified.upper_applied / 100,
          key: certified.key,
        },
        drift,
        rate: taxRate.multiplier,
        rateYear: taxRate.year,
        valuationDate,
        saleCutoff,
        maxYears,
        minSaving,
        minAssessment,
        deadlineContext,
        pool: pool.length,
        from: Math.min(...pool.map((sale: any) => Number(sale.y))),
        to: Math.max(...pool.map((sale: any) => Number(sale.y))),
        uniformity: uniformityRow ? { coefficient: Number(uniformityRow.coefficient) || null } : null,
        countyAppeal: countyAppeal?.latest ? { latest: { win_rate_filed: Number(countyAppeal.latest.win_rate_filed) || 0 } } : null,
        hits,
      },
    });
  } catch (error) {
    console.error('appeal_prospect_scan_failed', { message: String((error as Error)?.message || error), user_id: auth.user.id });
    return json({ error: 'Scanner source data is temporarily unavailable' }, 503);
  }
});
