const PILOT_DATA_URL = 'https://www.watchdogindex.com/property/data/exempt-pilot.json';
const PILOT_PREFIX = 'njplus.nj-dca-pilot-forecast.';
const PILOT_PROVIDER_VERSION = 'nj-dca-pilot-observed-2026-v1';
const PILOT_SOURCE = `NJ DCA PILOT Database and Viewer 2026 · 2025 UFB municipal summary · ${PILOT_PROVIDER_VERSION}`;
const PILOT_FIELDS = new Set(['pilot_project_count', 'pilot_project_assessment']);
const PILOT_ELIGIBLE_PLANS = new Set(['pro_plus', 'teams', 'developer']);
const PILOT_TTL_MS = 6 * 60 * 60 * 1000;
let pilotCache: any = null;
let pilotCacheAt = 0;

function clean(value: unknown) {
  return String(value ?? '').trim();
}

function treasuryCode(pin: unknown) {
  const digits = clean(pin).replace(/\D/g, '');
  return digits.slice(0, 4);
}

async function loadPilotData() {
  if (pilotCache && Date.now() - pilotCacheAt < PILOT_TTL_MS) return pilotCache;
  try {
    const response = await fetch(PILOT_DATA_URL, { headers: { accept: 'application/json' } });
    if (!response.ok) return null;
    const payload = await response.json();
    if (
      Number(payload?.release_year) !== 2026 ||
      Number(payload?.source_year) !== 2025 ||
      !payload?.municipalities
    ) return null;
    pilotCache = payload;
    pilotCacheAt = Date.now();
    return payload;
  } catch {
    return null;
  }
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
      const status = clean((row as any)?.status);
      if (!(status in summary)) summary[status] = 0;
      summary[status] += 1;
    }
  }
  return summary;
}

export async function enrichPilotObserved(request: Request, response: Response) {
  if (request.method !== 'POST' || !response.ok) return response;

  let requestBody: any;
  try {
    requestBody = await request.json();
  } catch {
    return response;
  }

  const requestedIds = [...new Set((Array.isArray(requestBody?.marker_ids) ? requestBody.marker_ids : [])
    .map((value: unknown) => clean(value))
    .filter((id: string) => id.startsWith(PILOT_PREFIX) && PILOT_FIELDS.has(id.slice(PILOT_PREFIX.length))))] as string[];
  if (!requestedIds.length) return response;

  let payload: any;
  try {
    payload = await response.clone().json();
  } catch {
    return response;
  }

  if (!PILOT_ELIGIBLE_PLANS.has(clean(payload?.plan))) return response;

  const pins = [...new Set((Array.isArray(requestBody?.pams_pins) ? requestBody.pams_pins : [])
    .map((value: unknown) => clean(value))
    .filter(Boolean))] as string[];
  if (!pins.length) return response;

  const root = await loadPilotData();
  payload.markers ||= {};
  payload.meta ||= {};

  for (const pin of pins) {
    payload.markers[pin] ||= {};
    payload.meta[pin] ||= {};
    const code = treasuryCode(pin);
    const municipality = /^\d{4}$/.test(code) ? root?.municipalities?.[code] : null;

    for (const markerId of requestedIds) {
      if (clean(payload.meta?.[pin]?.[markerId]?.status) === 'not_entitled') continue;
      const field = markerId.slice(PILOT_PREFIX.length);

      if (!root) {
        delete payload.markers[pin][markerId];
        payload.meta[pin][markerId] = {
          status: 'provider_error',
          provider_kind: 'authoritative_reference',
          source: PILOT_SOURCE,
          scope: 'municipality',
          provider_version: PILOT_PROVIDER_VERSION,
          reason: 'Governed 2026 NJ DCA PILOT municipal snapshot could not be loaded.',
          checked_at: new Date().toISOString(),
        };
        continue;
      }

      if (!/^\d{4}$/.test(code) || !municipality || municipality?.coverage?.dca_pilot_2026 !== true) {
        delete payload.markers[pin][markerId];
        payload.meta[pin][markerId] = {
          status: 'source_checked_no_value',
          provider_kind: 'authoritative_reference',
          source: PILOT_SOURCE,
          scope: 'municipality',
          provider_version: PILOT_PROVIDER_VERSION,
          reason: 'No matching DCA PILOT municipal summary row is available for the parcel Treasury code.',
          checked_at: new Date().toISOString(),
        };
        continue;
      }

      const value = field === 'pilot_project_count'
        ? municipality?.pilot_count
        : municipality?.pilot_assessed_value;
      if (value === null || value === undefined || value === '') {
        delete payload.markers[pin][markerId];
        payload.meta[pin][markerId] = {
          status: 'source_checked_no_value',
          provider_kind: 'authoritative_reference',
          source: PILOT_SOURCE,
          scope: 'municipality',
          provider_version: PILOT_PROVIDER_VERSION,
          checked_at: new Date().toISOString(),
        };
        continue;
      }

      payload.markers[pin][markerId] = value;
      payload.meta[pin][markerId] = {
        status: 'available',
        provider_kind: 'authoritative_reference',
        source: PILOT_SOURCE,
        scope: 'municipality',
        provider_version: PILOT_PROVIDER_VERSION,
        source_year: 2025,
        release_year: 2026,
        observed_at: new Date().toISOString(),
        interpretation: field === 'pilot_project_count'
          ? 'DCA-reported municipal PILOT record count; not a legal count of distinct agreements or development projects.'
          : 'DCA-reported aggregate PILOT assessed value for the municipality.',
      };
    }
  }

  payload.provider_summary = recalculateProviderSummary(payload.meta);
  payload.provider_versions ||= {};
  payload.provider_versions.dca_pilot_observed = PILOT_PROVIDER_VERSION;

  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'private, no-store');
  return new Response(JSON.stringify(payload), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
