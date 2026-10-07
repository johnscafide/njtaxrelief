const DATA_URL = 'https://www.watchdogindex.com/property/data/acs-rental-2024.json';
const VERSION = 'acs-rental-2024-v1';
const SOURCE = `U.S. Census Bureau ACS 2020-2024 5-year · B25003, B25004, B25070 · county subdivision · ${VERSION}`;
const FIELDS: Record<string, string> = {
  'watchdog.internal.acs_renter_households_v1': 'renter_households',
  'watchdog.internal.acs_rental_vacancy_rate_v1': 'rental_vacancy_rate',
  'watchdog.internal.acs_rent_burden_share_v1': 'rent_burden_share',
};
const ELIGIBLE = new Set(['pro_plus', 'teams', 'developer']);
const TTL_MS = 6 * 60 * 60 * 1000;
let cache: any = null;
let cacheAt = 0;

function clean(value: unknown) {
  return String(value ?? '').trim();
}

async function loadRental() {
  if (cache && Date.now() - cacheAt < TTL_MS) return cache;
  try {
    const response = await fetch(DATA_URL, { headers: { accept: 'application/json' } });
    if (!response.ok) return null;
    const payload = await response.json();
    const towns = payload?.municipalities;
    if (Number(payload?.schema_version) !== 1 || payload?.district_key !== 'modiv_pams' || payload?.vintage !== '2024 ACS 5-year' || !towns || Object.keys(towns).length !== 564) return null;
    if (Number(towns['0102']?.renter_households) !== 11545 || Number(towns['0102']?.rental_vacancy_rate) !== 4.65 || Number(towns['0102']?.rent_burden_share) !== 58.8) return null;
    cache = payload;
    cacheAt = Date.now();
    return payload;
  } catch {
    return null;
  }
}

function summarize(meta: Record<string, Record<string, any>>) {
  const out: Record<string, number> = { available: 0, source_checked_no_value: 0, dependency_missing: 0, provider_error: 0, not_computed: 0, provider_missing: 0, not_entitled: 0 };
  for (const pinMeta of Object.values(meta || {})) {
    for (const row of Object.values(pinMeta || {})) {
      const status = clean((row as any)?.status);
      out[status] = (out[status] || 0) + 1;
    }
  }
  return out;
}

export async function enrichAcsRental(request: Request, response: Response) {
  if (request.method !== 'POST' || !response.ok) return response;
  let body: any;
  try {
    body = await request.json();
  } catch {
    return response;
  }
  const ids = [...new Set((Array.isArray(body?.marker_ids) ? body.marker_ids : []).map(clean).filter((id: string) => Object.hasOwn(FIELDS, id)))] as string[];
  if (!ids.length) return response;
  let payload: any;
  try {
    payload = await response.clone().json();
  } catch {
    return response;
  }
  if (!ELIGIBLE.has(clean(payload?.plan))) return response;
  const pins = [...new Set((Array.isArray(body?.pams_pins) ? body.pams_pins : []).map(clean).filter(Boolean))] as string[];
  if (!pins.length) return response;

  const root = await loadRental();
  payload.markers ||= {};
  payload.meta ||= {};
  const base = { provider_kind: 'authoritative_reference', source: SOURCE, scope: 'municipality', provider_version: VERSION };
  for (const pin of pins) {
    payload.markers[pin] ||= {};
    payload.meta[pin] ||= {};
    const code = clean(pin).replace(/\D/g, '').slice(0, 4);
    const town = /^\d{4}$/.test(code) ? root?.municipalities?.[code] : null;
    for (const id of ids) {
      if (clean(payload.meta?.[pin]?.[id]?.status) === 'not_entitled') continue;
      delete payload.markers[pin][id];
      if (!root) {
        payload.meta[pin][id] = { ...base, status: 'provider_error', reason: 'The ACS 2024 rental file could not be loaded or failed its checks.' };
        continue;
      }
      const value = town ? town[FIELDS[id]] : null;
      if (value === null || value === undefined || !Number.isFinite(Number(value))) {
        payload.meta[pin][id] = { ...base, status: 'source_checked_no_value', reason: town ? 'ACS does not publish a usable estimate for this town.' : 'No ACS town record matches this parcel.' };
        continue;
      }
      payload.markers[pin][id] = Number(value);
      payload.meta[pin][id] = { ...base, status: 'available', vintage: root.vintage, geoid: town.geoid };
    }
  }
  payload.provider_summary = summarize(payload.meta);
  payload.provider_versions ||= {};
  payload.provider_versions.acs_rental = VERSION;
  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'private, no-store');
  return new Response(JSON.stringify(payload), { status: response.status, statusText: response.statusText, headers });
}
