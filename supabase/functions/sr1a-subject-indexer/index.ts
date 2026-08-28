declare const Deno: any;
// @ts-ignore remote runtime import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const INDEXER_VERSION = 'sr1a-subject-indexer-v3';
const MIN_REFRESH_MS = 20 * 60 * 60 * 1000;
const BATCH_SIZE = 500;
const COUNTY_SALES: Record<string, string> = {
  '01': 'atlantic', '02': 'bergen', '03': 'burlington', '04': 'camden', '05': 'cape-may',
  '06': 'cumberland', '07': 'essex', '08': 'gloucester', '09': 'hudson', '10': 'hunterdon',
  '11': 'mercer', '12': 'middlesex', '13': 'monmouth', '14': 'morris', '15': 'ocean',
  '16': 'passaic', '17': 'salem', '18': 'somerset', '19': 'sussex', '20': 'union', '21': 'warren',
};

function out(status: number, payload: any) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': 'https://njpropertytaxrelief.com',
      'Access-Control-Allow-Headers': 'content-type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    },
  });
}

function adminClient() {
  const url = Deno.env.get('SUPABASE_URL') || '';
  let key = '';
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
    key = String(keys?.default || '');
  } catch {}
  key ||= Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!url || !key) throw new Error('Supabase admin credentials unavailable');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
function cleanCounty(v: any) { const s = String(v || '').replace(/\D/g, ''); return s.length === 2 && COUNTY_SALES[s] ? s : ''; }
function parcelPart(v: any) { return String(v ?? '').replace(/\s+/g, '').replace(/^0+/, '').toUpperCase(); }
function qualifierPart(v: any) { return String(v ?? '').trim().replace(/\s+/g, '').toUpperCase(); }
function n(v: any) { if (v === null || v === undefined || v === '') return null; const x = Number(v); return Number.isFinite(x) ? x : null; }
function newer(a: any, b: any) { const ay = n(a?.y) || 0, by = n(b?.y) || 0, am = n(a?.m) || 0, bm = n(b?.m) || 0; return ay > by || (ay === by && am > bm); }

async function indexCounty(client: any, countyCode: string) {
  const started = Date.now();
  const slug = COUNTY_SALES[countyCode];
  const sourceUrl = `https://raw.githubusercontent.com/johnscafide/njtaxrelief/main/property/sales-${slug}.json`;
  const { data: prior } = await client.from('sr1a_subject_index_runs').select('status,refreshed_at,indexed_parcel_count,rows_with_living_space,source_record_count,source_etag,generation_id').eq('county_code', countyCode).maybeSingle();
  const priorAt = prior?.refreshed_at ? Date.parse(prior.refreshed_at) : 0;
  if (prior?.status === 'ready' && priorAt && Date.now() - priorAt < MIN_REFRESH_MS) {
    return { county_code: countyCode, status: 'ready', skipped: true, unchanged: true, source_record_count: prior.source_record_count, indexed_parcel_count: prior.indexed_parcel_count, rows_with_living_space: prior.rows_with_living_space, refreshed_at: prior.refreshed_at };
  }
  const headers: Record<string, string> = { accept: 'application/json' };
  if (prior?.source_etag) headers['If-None-Match'] = String(prior.source_etag);
  const generationId = crypto.randomUUID();
  await client.from('sr1a_subject_index_runs').upsert({ county_code: countyCode, source_url: sourceUrl, status: 'loading', generation_id: generationId, error_text: null, updated_at: new Date().toISOString() });
  try {
    const response = await fetch(sourceUrl, { headers });
    if (response.status === 304 && prior?.status === 'ready') {
      const refreshedAt = new Date().toISOString(), durationMs = Date.now() - started;
      await client.from('sr1a_subject_index_runs').upsert({ county_code: countyCode, source_url: sourceUrl, source_etag: prior.source_etag, status: 'ready', source_record_count: prior.source_record_count, indexed_parcel_count: prior.indexed_parcel_count, rows_with_living_space: prior.rows_with_living_space, generation_id: prior.generation_id, refreshed_at: refreshedAt, duration_ms: durationMs, error_text: null, updated_at: refreshedAt });
      return { county_code: countyCode, status: 'ready', skipped: false, unchanged: true, source_record_count: prior.source_record_count, indexed_parcel_count: prior.indexed_parcel_count, rows_with_living_space: prior.rows_with_living_space, duration_ms: durationMs, refreshed_at: refreshedAt };
    }
    if (!response.ok) throw new Error(`source returned ${response.status}`);
    const etag = response.headers.get('etag');
    const json = await response.json();
    if (String(json?.county_code || '') !== countyCode || !Array.isArray(json?.sales)) throw new Error('source signature validation failed');
    if (Number.isFinite(Number(json?.count)) && Number(json.count) !== json.sales.length) throw new Error(`source count mismatch ${json.count} != ${json.sales.length}`);
    const latest = new Map<string, any>();
    let invalid = 0;
    for (const sale of json.sales) {
      const district = String(sale?.d || '').replace(/\D/g, '').slice(0, 4), block = parcelPart(sale?.b), lot = parcelPart(sale?.l), qualifier = qualifierPart(sale?.q);
      if (district.length !== 4 || !district.startsWith(countyCode) || !block || !lot) { invalid += 1; continue; }
      const key = `${district}|${block}|${lot}|${qualifier}`;
      const priorSale = latest.get(key);
      if (!priorSale || newer(sale, priorSale)) latest.set(key, sale);
    }
    if (!latest.size) throw new Error('no valid subject rows after normalization');
    const importedAt = new Date().toISOString();
    const rows = [...latest.values()].map((sale: any) => {
      const district = String(sale?.d || '').replace(/\D/g, '').slice(0, 4), sf = n(sale?.sf), yb = n(sale?.yb), av = n(sale?.av), price = n(sale?.p), ratio = n(sale?.r), ppsf = n(sale?.ppsf);
      return { district_code: district, county_code: countyCode, block_key: parcelPart(sale?.b), lot_key: parcelPart(sale?.l), qualifier_key: qualifierPart(sale?.q), living_space: sf != null && sf > 0 ? Math.round(sf) : null, sale_year: n(sale?.y), sale_month: n(sale?.m), year_built: yb != null && yb >= 1700 && yb <= 2100 ? Math.round(yb) : null, assessed_value: av != null && av >= 0 ? Math.round(av) : null, sale_price: price != null && price >= 1000 ? Math.round(price) : null, sale_ratio: ratio != null && ratio >= 0 ? ratio : null, sale_ppsf: ppsf != null && ppsf >= 0 ? ppsf : null, generation_id: generationId, imported_at: importedAt };
    });
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const { error } = await client.from('sr1a_subject_evidence').upsert(rows.slice(i, i + BATCH_SIZE), { onConflict: 'district_code,block_key,lot_key,qualifier_key' });
      if (error) throw new Error(`upsert failed at ${i}: ${error.message}`);
    }
    const { error: deleteError } = await client.from('sr1a_subject_evidence').delete().eq('county_code', countyCode).neq('generation_id', generationId);
    if (deleteError) throw new Error(`stale-row cleanup failed: ${deleteError.message}`);
    const rowsWithLivingSpace = rows.filter((row: any) => row.living_space != null).length;
    const durationMs = Date.now() - started, refreshedAt = new Date().toISOString();
    const { error: runError } = await client.from('sr1a_subject_index_runs').upsert({ county_code: countyCode, source_url: sourceUrl, source_etag: etag, status: 'ready', source_record_count: json.sales.length, indexed_parcel_count: rows.length, rows_with_living_space: rowsWithLivingSpace, generation_id: generationId, refreshed_at: refreshedAt, duration_ms: durationMs, error_text: invalid ? `${invalid} malformed rows skipped` : null, updated_at: refreshedAt });
    if (runError) throw new Error(`run finalization failed: ${runError.message}`);
    return { county_code: countyCode, status: 'ready', skipped: false, unchanged: false, source_record_count: json.sales.length, indexed_parcel_count: rows.length, rows_with_living_space: rowsWithLivingSpace, malformed_rows_skipped: invalid, source_etag: etag, duration_ms: durationMs, refreshed_at: refreshedAt };
  } catch (error) {
    const message = String((error as Error)?.message || error).slice(0, 500);
    await client.from('sr1a_subject_index_runs').upsert({ county_code: countyCode, source_url: sourceUrl, status: 'failed', generation_id: generationId, duration_ms: Date.now() - started, error_text: message, updated_at: new Date().toISOString() });
    throw error;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return out(200, { ok: true });
  const client = adminClient();
  if (req.method === 'GET') {
    const { data, error } = await client.from('sr1a_subject_index_runs').select('county_code,status,source_record_count,indexed_parcel_count,rows_with_living_space,refreshed_at,duration_ms,error_text').order('county_code');
    if (error) return out(503, { error: error.message, indexer_version: INDEXER_VERSION });
    return out(200, { indexer_version: INDEXER_VERSION, counties: data || [] });
  }
  if (req.method !== 'POST') return out(405, { error: 'GET or POST required' });
  let body: any = {}; try { body = await req.json(); } catch { return out(400, { error: 'Invalid JSON' }); }
  const countyCode = cleanCounty(body?.county_code); if (!countyCode) return out(400, { error: 'Valid 2-digit NJ county_code required' });
  try { return out(200, { indexer_version: INDEXER_VERSION, ...(await indexCounty(client, countyCode)) }); }
  catch (error) { return out(503, { indexer_version: INDEXER_VERSION, county_code: countyCode, error: String((error as Error)?.message || error) }); }
});