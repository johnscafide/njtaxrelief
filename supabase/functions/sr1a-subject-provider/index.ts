declare const Deno: any;
// @ts-ignore remote runtime import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PROVIDER_VERSION = 'sr1a-subject-provider-v1';
const SOURCE_ID = 'nj-sr1a-subject-evidence';
const ORIGINS = new Set([
  'https://njpropertytaxrelief.com',
  'https://www.njpropertytaxrelief.com',
]);

function cors(req: Request) {
  const origin = req.headers.get('origin') || '';
  return {
    'Access-Control-Allow-Origin': ORIGINS.has(origin) ? origin : 'https://njpropertytaxrelief.com',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    Vary: 'Origin',
  };
}
function out(req: Request, status: number, payload: any) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors(req), 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' },
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
function districtCode(v: any) {
  const s = String(v || '').replace(/\D/g, '');
  return s.length >= 4 ? s.slice(0, 4) : '';
}
function parcelPart(v: any) {
  return String(v ?? '').replace(/\s+/g, '').replace(/^0+/, '').toUpperCase();
}
function qualifierPart(v: any) {
  return String(v ?? '').trim().replace(/\s+/g, '').toUpperCase();
}
function cleanKey(v: any, fallback: string) {
  const s = String(v || '').trim().slice(0, 120);
  return s || fallback;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  const client = adminClient();

  if (req.method === 'GET') {
    const started = Date.now();
    const [{ data: runs, error: runError }, rowCount, sfCount] = await Promise.all([
      client.from('sr1a_subject_index_runs')
        .select('county_code,status,source_record_count,indexed_parcel_count,rows_with_living_space,refreshed_at,duration_ms')
        .order('county_code'),
      client.from('sr1a_subject_evidence').select('*', { count: 'exact', head: true }),
      client.from('sr1a_subject_evidence').select('*', { count: 'exact', head: true }).not('living_space', 'is', null),
    ]);
    if (runError || rowCount.error || sfCount.error) {
      return out(req, 503, { error: 'index health unavailable', provider_version: PROVIDER_VERSION, source_id: SOURCE_ID });
    }
    const ready = (runs || []).filter((row: any) => row.status === 'ready').length;
    return out(req, 200, {
      provider_version: PROVIDER_VERSION,
      source_id: SOURCE_ID,
      status: ready === 21 ? 'ready' : 'building',
      ready_counties: ready,
      county_count: 21,
      indexed_parcels: rowCount.count || 0,
      rows_with_living_space: sfCount.count || 0,
      counties: runs || [],
      response_ms: Date.now() - started,
    });
  }

  if (req.method !== 'POST') return out(req, 405, { error: 'GET or POST required' });
  let body: any = {};
  try { body = await req.json(); } catch { return out(req, 400, { error: 'Invalid JSON' }); }
  const input = Array.isArray(body?.subjects) ? body.subjects.slice(0, 500) : [];
  if (!input.length) return out(req, 200, { provider_version: PROVIDER_VERSION, source_id: SOURCE_ID, records: {}, meta: {}, requested_count: 0, matched_count: 0 });

  const subjects: any[] = [];
  const meta: Record<string, any> = {};
  for (let i = 0; i < input.length; i++) {
    const raw = input[i] || {};
    const district = districtCode(raw.district ?? raw.pams_pin);
    const block = parcelPart(raw.block);
    const lot = parcelPart(raw.lot);
    const qualifier = qualifierPart(raw.qualifier);
    const key = cleanKey(raw.key ?? raw.pams_pin, String(i + 1));
    if (!district || !block || !lot) {
      meta[key] = { status: 'invalid_subject_key' };
      continue;
    }
    subjects.push({ key, district, block, lot, qualifier });
  }
  if (!subjects.length) return out(req, 200, { provider_version: PROVIDER_VERSION, source_id: SOURCE_ID, records: {}, meta, requested_count: input.length, matched_count: 0 });

  const counties = [...new Set(subjects.map((subject) => subject.district.slice(0, 2)))];
  const { data: runs, error: runError } = await client
    .from('sr1a_subject_index_runs')
    .select('county_code,status,refreshed_at')
    .in('county_code', counties);
  if (runError) return out(req, 503, { error: 'index readiness unavailable', provider_version: PROVIDER_VERSION, source_id: SOURCE_ID });
  const ready = new Map((runs || []).map((row: any) => [String(row.county_code), row]));
  const unavailable = counties.filter((county) => ready.get(county)?.status !== 'ready');
  if (unavailable.length) {
    return out(req, 503, {
      error: 'SR-1A subject index incomplete for requested counties',
      unavailable_counties: unavailable,
      provider_version: PROVIDER_VERSION,
      source_id: SOURCE_ID,
    });
  }

  const started = Date.now();
  const { data, error } = await client.rpc('lookup_sr1a_subject_evidence', { p_subjects: subjects });
  if (error) return out(req, 503, { error: 'subject evidence lookup unavailable', detail: error.message, provider_version: PROVIDER_VERSION, source_id: SOURCE_ID });

  const records: Record<string, any> = {};
  for (const row of data || []) {
    const key = String(row.request_key);
    records[key] = {
      district: row.district_code,
      block: row.block_key,
      lot: row.lot_key,
      qualifier: row.qualifier_key || null,
      sf: row.living_space,
      y: row.sale_year,
      m: row.sale_month,
      yb: row.year_built,
      av: row.assessed_value,
      p: row.sale_price,
      r: row.sale_ratio == null ? null : Number(row.sale_ratio),
      ppsf: row.sale_ppsf == null ? null : Number(row.sale_ppsf),
      match_quality: row.match_quality,
    };
    meta[key] = {
      status: 'available',
      match_quality: row.match_quality,
      source: 'NJ Division of Taxation SR-1A verified usable sale index',
    };
  }
  for (const subject of subjects) {
    if (!records[subject.key] && !meta[subject.key]) {
      meta[subject.key] = { status: 'source_checked_no_value', source: 'NJ Division of Taxation SR-1A verified usable sale index' };
    }
  }

  return out(req, 200, {
    provider_version: PROVIDER_VERSION,
    source_id: SOURCE_ID,
    requested_count: input.length,
    valid_subject_count: subjects.length,
    matched_count: Object.keys(records).length,
    indexed_counties: counties,
    records,
    meta,
    response_ms: Date.now() - started,
  });
});