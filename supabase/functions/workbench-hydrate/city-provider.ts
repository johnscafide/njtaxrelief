const CITY_MARKER_ID = 'property.city';
const CITY_PROVIDER_VERSION = 'nj-ogis-geocoder-city-v1';
const CITY_SOURCE = 'NJ Office of GIS statewide geocoder';
const GEOCODER = 'https://geo.nj.gov/arcgis/rest/services/Tasks/NJ_Geocode/GeocodeServer/findAddressCandidates';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cityCache = new Map<string, { at: number; city: string; status: 'available' | 'source_checked_no_value' | 'provider_error' }>();

function clean(value: unknown) {
  return String(value ?? '').trim();
}

function cacheKey(row: any) {
  return [row?.address, row?.town, 'NJ', row?.zip]
    .map(clean)
    .filter(Boolean)
    .join(', ')
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

async function geocodeCity(row: any) {
  const key = cacheKey(row);
  if (!key) return { city: '', status: 'source_checked_no_value' as const };
  const cached = cityCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached;

  const params = new URLSearchParams({
    SingleLine: [row?.address, row?.town, 'NJ', row?.zip].map(clean).filter(Boolean).join(', '),
    outFields: 'City,Postal,Addr_type',
    outSR: '4326',
    maxLocations: '1',
    f: 'json',
  });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(`${GEOCODER}?${params.toString()}`, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!response.ok) {
      const result = { at: Date.now(), city: '', status: 'provider_error' as const };
      cityCache.set(key, result);
      return result;
    }
    const payload = await response.json();
    const candidate = payload?.candidates?.[0];
    const city = clean(candidate?.attributes?.City ?? candidate?.attributes?.city);
    const status = candidate && Number(candidate?.score || 0) >= 70 && city ? 'available' : 'source_checked_no_value';
    const result = { at: Date.now(), city: status === 'available' ? city : '', status } as const;
    if (cityCache.size > 1500) cityCache.clear();
    cityCache.set(key, result);
    return result;
  } catch {
    const result = { at: Date.now(), city: '', status: 'provider_error' as const };
    cityCache.set(key, result);
    return result;
  }
}

async function pool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let next = 0;
  async function runner() {
    while (next < items.length) {
      const index = next++;
      try { await worker(items[index]); } catch { /* marker-level failure is recorded by worker */ }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runner()));
}

function recalculateProviderSummary(meta: Record<string, Record<string, any>>) {
  const summary: Record<string, number> = {
    available: 0,
    source_checked_no_value: 0,
    dependency_missing: 0,
    provider_error: 0,
    not_computed: 0,
    provider_missing: 0,
    not_entitled: 0,
  };
  for (const pinMeta of Object.values(meta || {})) {
    for (const row of Object.values(pinMeta || {})) {
      const status = String((row as any)?.status || '');
      if (!(status in summary)) summary[status] = 0;
      summary[status] += 1;
    }
  }
  return summary;
}

export async function enrichCityAddress(request: Request, response: Response) {
  if (request.method !== 'POST' || !response.ok) return response;

  let requestBody: any;
  try { requestBody = await request.json(); } catch { return response; }
  const requested = Array.isArray(requestBody?.marker_ids) && requestBody.marker_ids
    .map((value: unknown) => clean(value))
    .includes(CITY_MARKER_ID);
  if (!requested) return response;

  let payload: any;
  try { payload = await response.clone().json(); } catch { return response; }

  const pins = [...new Set((Array.isArray(requestBody?.pams_pins) ? requestBody.pams_pins : [])
    .map((value: unknown) => clean(value))
    .filter(Boolean))] as string[];
  if (!pins.length) return response;

  const records = new Map<string, any>((Array.isArray(payload?.records) ? payload.records : [])
    .map((row: any) => [clean(row?.pams_pin), row]));
  payload.markers ||= {};
  payload.meta ||= {};

  await pool(pins, 8, async (pin) => {
    payload.markers[pin] ||= {};
    payload.meta[pin] ||= {};
    if (String(payload.meta[pin]?.[CITY_MARKER_ID]?.status || '') === 'not_entitled') return;

    const row = records.get(pin);
    if (!row || !clean(row.address)) {
      delete payload.markers[pin][CITY_MARKER_ID];
      payload.meta[pin][CITY_MARKER_ID] = {
        status: 'dependency_missing',
        provider_kind: 'authoritative_source',
        source: CITY_SOURCE,
        source_field: 'City',
        scope: 'property',
        provider_version: CITY_PROVIDER_VERSION,
        reason: 'Property street address is unavailable for the NJOGIS address-locality lookup.',
        checked_at: new Date().toISOString(),
      };
      return;
    }

    const result = await geocodeCity(row);
    if (result.status === 'available' && result.city) {
      row.city = result.city;
      payload.markers[pin][CITY_MARKER_ID] = result.city;
      payload.meta[pin][CITY_MARKER_ID] = {
        status: 'available',
        provider_kind: 'authoritative_source',
        source: CITY_SOURCE,
        source_field: 'City',
        scope: 'property',
        provider_version: CITY_PROVIDER_VERSION,
        observed_at: new Date().toISOString(),
      };
      return;
    }

    delete payload.markers[pin][CITY_MARKER_ID];
    payload.meta[pin][CITY_MARKER_ID] = {
      status: result.status,
      provider_kind: 'authoritative_source',
      source: CITY_SOURCE,
      source_field: 'City',
      scope: 'property',
      provider_version: CITY_PROVIDER_VERSION,
      reason: result.status === 'provider_error'
        ? 'NJOGIS geocoder request failed or timed out.'
        : 'NJOGIS geocoder checked the property address but did not return a sufficiently confident City value.',
      checked_at: new Date().toISOString(),
    };
  });

  payload.records = Array.from(records.values());
  payload.provider_summary = recalculateProviderSummary(payload.meta);
  payload.provider_versions ||= {};
  payload.provider_versions.city_address = CITY_PROVIDER_VERSION;

  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'private, no-store');
  return new Response(JSON.stringify(payload), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export { CITY_MARKER_ID, CITY_PROVIDER_VERSION, CITY_SOURCE };
