import { createClient } from 'npm:@supabase/supabase-js@2.95.0';

const MARKER_ID = 'njplus.nj-dca-neighborhood-trends.walkability_score';
const PROVIDER_VERSION = 'epa-national-walkability-index-2021-v1';
const EPA_QUERY_URL = 'https://geodata.epa.gov/arcgis/rest/services/OA/WalkabilityIndex/MapServer/0/query';
const SOURCE = `U.S. EPA National Walkability Index · NatWalkInd · 2019 Census block group · 2021 release · ${PROVIDER_VERSION}`;
const ELIGIBLE_PLANS = new Set(['pro_plus', 'teams', 'developer']);
const MAX_PINS = 100;
const CONCURRENCY = 8;

type Coordinate = { pams_pin: string; lat: number | null; lon: number | null };
type EpaResult = { value: number | null; geoid20?: string; status: 'available' | 'source_checked_no_value' | 'provider_error'; reason?: string };

const epaCache = new Map<string, { at: number; result: EpaResult }>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function clean(value: unknown) { return String(value ?? '').trim(); }
function isNjCoordinate(lat: number, lon: number) { return lat >= 38.7 && lat <= 41.4 && lon >= -75.7 && lon <= -73.8; }

function recalculateProviderSummary(meta: Record<string, Record<string, any>>) {
  const out: Record<string, number> = { available: 0, source_checked_no_value: 0, dependency_missing: 0, provider_error: 0, not_computed: 0, provider_missing: 0, not_entitled: 0 };
  for (const pinMeta of Object.values(meta || {})) {
    for (const row of Object.values(pinMeta || {})) {
      const status = clean((row as any)?.status);
      out[status] = (out[status] || 0) + 1;
    }
  }
  return out;
}

function adminClient() {
  const url = Deno.env.get('SUPABASE_URL') || '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function fetchEpaWalkability(lat: number, lon: number): Promise<EpaResult> {
  const cacheKey = `${lat.toFixed(6)},${lon.toFixed(6)}`;
  const cached = epaCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.result;

  const params = new URLSearchParams({
    where: '1=1',
    geometry: `${lon},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'GEOID20,NatWalkInd',
    returnGeometry: 'false',
    f: 'json'
  });

  let result: EpaResult;
  try {
    const response = await fetch(`${EPA_QUERY_URL}?${params.toString()}`, { headers: { accept: 'application/json' } });
    if (!response.ok) {
      result = { value: null, status: 'provider_error', reason: `EPA service returned HTTP ${response.status}.` };
    } else {
      const payload: any = await response.json();
      if (payload?.error) {
        result = { value: null, status: 'provider_error', reason: 'EPA ArcGIS query returned an error response.' };
      } else {
        const features = Array.isArray(payload?.features) ? payload.features : [];
        if (features.length !== 1) {
          result = { value: null, status: 'source_checked_no_value', reason: features.length ? 'Property coordinate intersects more than one EPA block-group polygon; Watchdog fails closed on ambiguous spatial matches.' : 'No EPA National Walkability Index block group contains the stored property coordinate.' };
        } else {
          const value = Number(features[0]?.attributes?.NatWalkInd);
          const geoid20 = clean(features[0]?.attributes?.GEOID20);
          result = Number.isFinite(value) && value >= 1 && value <= 20
            ? { value, geoid20, status: 'available' }
            : { value: null, geoid20, status: 'source_checked_no_value', reason: 'EPA block group matched, but NatWalkInd was missing or outside the documented 1-20 range.' };
        }
      }
    }
  } catch {
    result = { value: null, status: 'provider_error', reason: 'EPA National Walkability Index service could not be reached.' };
  }

  epaCache.set(cacheKey, { at: Date.now(), result });
  return result;
}

async function resolveBatch(items: Coordinate[]) {
  const results = new Map<string, EpaResult>();
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const chunk = items.slice(i, i + CONCURRENCY);
    const values = await Promise.all(chunk.map(async (item) => {
      if (typeof item.lat !== 'number' || typeof item.lon !== 'number' || !isNjCoordinate(item.lat, item.lon)) {
        return [item.pams_pin, { value: null, status: 'source_checked_no_value', reason: 'A verified New Jersey property coordinate is not available for the EPA spatial lookup.' } as EpaResult] as const;
      }
      return [item.pams_pin, await fetchEpaWalkability(item.lat, item.lon)] as const;
    }));
    for (const [pin, value] of values) results.set(pin, value);
  }
  return results;
}

export async function enrichEpaWalkability(request: Request, response: Response) {
  if (request.method !== 'POST' || !response.ok) return response;

  let requestBody: any;
  try { requestBody = await request.json(); } catch { return response; }
  const requested = (Array.isArray(requestBody?.marker_ids) ? requestBody.marker_ids : []).map(clean).includes(MARKER_ID);
  if (!requested) return response;

  let payload: any;
  try { payload = await response.clone().json(); } catch { return response; }
  if (!ELIGIBLE_PLANS.has(clean(payload?.plan))) return response;

  const pins = [...new Set((Array.isArray(requestBody?.pams_pins) ? requestBody.pams_pins : []).map(clean).filter(Boolean))].slice(0, MAX_PINS) as string[];
  if (!pins.length) return response;

  payload.markers ||= {};
  payload.meta ||= {};

  const admin = adminClient();
  if (!admin) {
    for (const pin of pins) {
      payload.markers[pin] ||= {};
      payload.meta[pin] ||= {};
      delete payload.markers[pin][MARKER_ID];
      payload.meta[pin][MARKER_ID] = { status: 'provider_error', provider_kind: 'authoritative_spatial_reference', source: SOURCE, source_url: EPA_QUERY_URL, scope: 'property', provider_version: PROVIDER_VERSION, reason: 'Server-side coordinate resolver is unavailable.' };
    }
  } else {
    const { data, error } = await admin.from('property_lookups').select('pams_pin,lat,lon').in('pams_pin', pins);
    if (error) {
      for (const pin of pins) {
        payload.markers[pin] ||= {};
        payload.meta[pin] ||= {};
        delete payload.markers[pin][MARKER_ID];
        payload.meta[pin][MARKER_ID] = { status: 'provider_error', provider_kind: 'authoritative_spatial_reference', source: SOURCE, source_url: EPA_QUERY_URL, scope: 'property', provider_version: PROVIDER_VERSION, reason: 'Property coordinate lookup failed.' };
      }
    } else {
      const byPin = new Map((data || []).map((row: Coordinate) => [clean(row.pams_pin), row]));
      const coordinateRows = pins.map((pin) => byPin.get(pin) || { pams_pin: pin, lat: null, lon: null });
      const resolved = await resolveBatch(coordinateRows as Coordinate[]);
      for (const pin of pins) {
        payload.markers[pin] ||= {};
        payload.meta[pin] ||= {};
        if (clean(payload.meta?.[pin]?.[MARKER_ID]?.status) === 'not_entitled') continue;
        const result = resolved.get(pin) || { value: null, status: 'provider_error', reason: 'EPA result was not returned.' } as EpaResult;
        if (result.status !== 'available' || result.value === null) {
          delete payload.markers[pin][MARKER_ID];
          payload.meta[pin][MARKER_ID] = { status: result.status, provider_kind: 'authoritative_spatial_reference', source: SOURCE, source_url: EPA_QUERY_URL, scope: 'property', provider_version: PROVIDER_VERSION, reason: result.reason, checked_at: new Date().toISOString() };
          continue;
        }
        payload.markers[pin][MARKER_ID] = result.value;
        payload.meta[pin][MARKER_ID] = {
          status: 'available',
          provider_kind: 'authoritative_spatial_reference',
          source: SOURCE,
          source_url: EPA_QUERY_URL,
          scope: 'property',
          provider_version: PROVIDER_VERSION,
          census_block_group: result.geoid20,
          source_release_year: 2021,
          geography_vintage: 2019,
          checked_at: new Date().toISOString(),
          interpretation: 'EPA National Walkability Index score (1-20) for the 2019 Census block group containing the property coordinate. This is neighborhood context, not a parcel-specific measurement.'
        };
      }
    }
  }

  payload.provider_summary = recalculateProviderSummary(payload.meta);
  payload.provider_versions ||= {};
  payload.provider_versions.epa_walkability = PROVIDER_VERSION;
  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'private, no-store');
  return new Response(JSON.stringify(payload), { status: response.status, statusText: response.statusText, headers });
}
