import { createClient } from 'npm:@supabase/supabase-js@2.55.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
});

const SOURCE_BASE = 'https://njpropertytaxrelief.com/property';
const FORMULA_VERSION = 'appeal-prospect-scan-server-v1';
const COUNTIES: Record<string, string> = {
  '01':'Atlantic','02':'Bergen','03':'Burlington','04':'Camden','05':'Cape May','06':'Cumberland',
  '07':'Essex','08':'Gloucester','09':'Hudson','10':'Hunterdon','11':'Mercer','12':'Middlesex',
  '13':'Monmouth','14':'Morris','15':'Ocean','16':'Passaic','17':'Salem','18':'Somerset',
  '19':'Sussex','20':'Union','21':'Warren'
};

const cache = new Map<string, { expires: number; value: unknown }>();
async function sourceJson(path: string, ttlMs = 10 * 60 * 1000) {
  const key = path;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const response = await fetch(`${SOURCE_BASE}/${path}`, {
    headers: { 'User-Agent': 'Watchdog-Server-Scanner/1.0' },
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`source_${response.status}_${path}`);
  const value = await response.json();
  cache.set(key, { expires: Date.now() + ttlMs, value });
  return value;
}

function rateKey(value: unknown) {
  return String(value || '').toUpperCase().replace(/TOWNSHIP|TWNSHP/g, 'TWP')
    .replace(/BOROUGH/g, 'BORO').replace(/\s+/g, ' ').trim();
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
  add('Chapter 123 margin', 30, clamp(hit.over / Math.max(1, hit.av) * 500));
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
function townEffectiveRate(district: string, uniformity: any, taxRates: any) {
  const town = uniformity?.name || '';
  const county = COUNTIES[district.slice(0, 2)] || '';
  const index: Record<string, any> = {};
  for (const [key, value] of Object.entries(taxRates?.rates || {})) index[rateKey(key)] = value;
  const series = index[rateKey(`${town} (${county})`)];
  if (!series) return 0.033;
  const years = Object.keys(series).filter(year => /^\d{4}$/.test(year)).sort((a, b) => Number(b) - Number(a));
  return years.length && Number(series[years[0]]) > 0 ? Number(series[years[0]]) / 100 : 0.033;
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
    const [sr1aJson, uniformityJson] = await Promise.all([
      sourceJson('sr1a-ratios.json'),
      sourceJson('uniformity.json'),
    ]);
    const districts = (sr1aJson as any)?.districts || {};
    const uniformity = (uniformityJson as any)?.districts || {};

    if (action === 'catalog') {
      const counties = Object.keys(COUNTIES).map(code => {
        const towns = Object.keys(districts)
          .filter(district => district.slice(0, 2) === code)
          .map(district => ({
            district,
            name: String(uniformity[district]?.name || district),
            verified_sales: Number(districts[district]?.n || 0),
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
        return { code, name: COUNTIES[code], towns };
      }).filter(county => county.towns.length > 0);
      return json({ formula_version: FORMULA_VERSION, counties });
    }

    if (action !== 'scan') return json({ error: 'Unsupported action' }, 400);
    const district = String(input.district || '').trim();
    const maxYears = Number(input.max_years);
    const minSaving = Number(input.min_saving);
    if (!/^\d{4}$/.test(district) || !districts[district]) return json({ error: 'Invalid municipality' }, 400);
    if (![2, 3, 6].includes(maxYears)) return json({ error: 'Invalid sale window' }, 400);
    if (![0, 250, 500, 1000].includes(minSaving)) return json({ error: 'Invalid minimum saving' }, 400);

    const districtSource = districts[district];
    const countyName = String(districtSource.county || COUNTIES[district.slice(0, 2)] || '').trim();
    const countySlug = countyName.toLowerCase().replace(/\s+/g, '-');
    if (!countySlug || !Object.values(COUNTIES).some(name => name.toLowerCase() === countyName.toLowerCase())) {
      return json({ error: 'Unsupported county' }, 400);
    }

    const [appealsJson, taxRatesJson, salesJson] = await Promise.all([
      sourceJson('appeals.json'),
      sourceJson('tax-rates.json'),
      sourceJson(`sales-${countySlug}.json`, 5 * 60 * 1000),
    ]);
    const all = Array.isArray((salesJson as any)?.sales) ? (salesJson as any).sales : [];
    const currentYear = new Date().getUTCFullYear();
    const ratio = Number(districtSource.ratio);
    const driftRaw = Number(districtSource.drift);
    const drift = Number.isFinite(driftRaw) && driftRaw > -0.05 && driftRaw < 0.20 ? driftRaw : 0.03;
    if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 2) return json({ error: 'Municipality ratio unavailable' }, 422);

    const pool = all.filter((sale: any) =>
      sale?.d === district && String(sale?.c).trim() === '2' && Number(sale?.p) > 40000 && Number(sale?.av) > 5000 &&
      (currentYear - Number(sale?.y)) <= maxYears
    );
    if (pool.length < 15) {
      return json({
        formula_version: FORMULA_VERSION,
        result: 'insufficient_sales',
        municipality: String(uniformity[district]?.name || district),
        pool: pool.length,
      });
    }

    const uniformityRow = uniformity[district] || null;
    const countyAppeal = (appealsJson as any)?.counties?.[district.slice(0, 2)] || null;
    const effectiveRate = townEffectiveRate(district, uniformityRow, taxRatesJson);
    const hits: any[] = [];

    for (const sale of pool) {
      const age = currentYear - Number(sale.y);
      const market = Number(sale.p) * Math.pow(1 + drift, age);
      const fair = market * ratio;
      const limit = fair * 1.15;
      const assessed = Number(sale.av);
      if (assessed <= limit) continue;
      const over = assessed - limit;
      const saving = (assessed - fair) * effectiveRate;
      if (saving < minSaving) continue;
      const hit: any = {
        a: String(sale.a || ''), b: String(sale.b || ''), l: String(sale.l || ''), y: Number(sale.y),
        p: Number(sale.p), av: assessed, sf: Number(sale.sf) || null, yb: Number(sale.yb) || null,
        age, market, fair, limit, over, saving, implied: assessed / Number(sale.p), g: grade(age),
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
      run: {
        d: district,
        name: String(uniformityRow?.name || district),
        county: COUNTIES[district.slice(0, 2)] || countyName,
        ratio,
        drift,
        rate: effectiveRate,
        maxYears,
        minSaving,
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
