const DATA_URL = 'https://www.watchdogindex.com/property/data/pilot-schedule.json';
const VERSION = 'nj-dca-pilot-schedule-2026-v1';
const SOURCE = `NJ DCA PILOT Database and Viewer 2026 · Raw Data from UFBs · ${VERSION}`;
const PREFIX = 'njplus.nj-dca-pilot-forecast.';
const FIELDS: Record<string, string> = {
  [`${PREFIX}pilot_payment_schedule`]: 'payment_schedule',
  [`${PREFIX}pilot_revenue_projection`]: 'revenue_projection',
  [`${PREFIX}pilot_forecast_year`]: 'forecast_year',
  [`${PREFIX}pilot_municipal_share`]: 'municipal_share_pct',
  'watchdog.njplus.pilot_forecast_confidence': 'dated_billing_share_pct',
};
const NEEDS_END_DATE = new Set(['payment_schedule', 'revenue_projection', 'forecast_year']);
const INTERPRETATION: Record<string, string> = {
  payment_schedule: 'Reported annual PILOT billing still under a dated agreement for each year, holding each agreement at its latest reported billing. PILOTs with no reported end date are left out.',
  revenue_projection: 'Sum of the reported PILOT billing still under a dated agreement over the next five years, at latest reported billing. Not a forecast of new agreements or changes.',
  forecast_year: 'Latest reported PILOT agreement end year in the town. Does not mean the agreement is still active or unchanged.',
  municipal_share_pct: 'Reported PILOT billing as a percent of the municipal budget.',
  dated_billing_share_pct: 'Percent of the town\'s reported PILOT billing that has a usable agreement end date. Higher means the schedule covers more of the money.',
};
const ELIGIBLE = new Set(['pro_plus', 'teams', 'developer']);
const TTL_MS = 6 * 60 * 60 * 1000;
let cache: any = null;
let cacheAt = 0;

function clean(value: unknown) {
  return String(value ?? '').trim();
}

function treasuryCode(pin: unknown) {
  return clean(pin).replace(/\D/g, '').slice(0, 4);
}

async function loadSchedule() {
  if (cache && Date.now() - cacheAt < TTL_MS) return cache;
  try {
    const response = await fetch(DATA_URL, { headers: { accept: 'application/json' } });
    if (!response.ok) return null;
    const payload = await response.json();
    if (Number(payload?.release_year) !== 2026 || Number(payload?.source_year) !== 2025 || payload?.district_key !== 'modiv_pams' || !payload?.municipalities) return null;
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

export async function enrichPilotSchedule(request: Request, response: Response) {
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

  const root = await loadSchedule();
  payload.markers ||= {};
  payload.meta ||= {};
  const base = { provider_kind: 'authoritative_reference', source: SOURCE, scope: 'municipality', provider_version: VERSION };

  for (const pin of pins) {
    payload.markers[pin] ||= {};
    payload.meta[pin] ||= {};
    const code = treasuryCode(pin);
    const town = /^\d{4}$/.test(code) ? root?.municipalities?.[code] : null;
    for (const id of ids) {
      if (clean(payload.meta?.[pin]?.[id]?.status) === 'not_entitled') continue;
      const field = FIELDS[id];
      if (!root) {
        delete payload.markers[pin][id];
        payload.meta[pin][id] = { ...base, status: 'provider_error', reason: 'The 2026 DCA PILOT schedule file could not be loaded.', checked_at: new Date().toISOString() };
        continue;
      }
      if (!town) {
        delete payload.markers[pin][id];
        payload.meta[pin][id] = { ...base, status: 'source_checked_no_value', reason: 'No PILOTs are reported for this town in the DCA 2026 PILOT database.', checked_at: new Date().toISOString() };
        continue;
      }
      const value = town[field];
      if (value === null || value === undefined || value === '') {
        delete payload.markers[pin][id];
        payload.meta[pin][id] = {
          ...base,
          status: 'source_checked_no_value',
          reason: NEEDS_END_DATE.has(field) ? 'End date not reported for this town\'s PILOTs.' : 'The DCA source was checked but this value is not reported for the town.',
          checked_at: new Date().toISOString(),
        };
        continue;
      }
      payload.markers[pin][id] = value;
      payload.meta[pin][id] = {
        ...base,
        status: 'available',
        source_year: 2025,
        release_year: 2026,
        observed_at: new Date().toISOString(),
        dated_rows: town.dated_rows,
        reported_rows: town.reported_rows,
        interpretation: INTERPRETATION[field],
      };
    }
  }

  payload.provider_summary = summarize(payload.meta);
  payload.provider_versions ||= {};
  payload.provider_versions.dca_pilot_schedule = VERSION;
  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'private, no-store');
  return new Response(JSON.stringify(payload), { status: response.status, statusText: response.statusText, headers });
}
