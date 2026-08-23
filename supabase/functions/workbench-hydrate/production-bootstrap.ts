// Git-pinned production bootstrap for Watchdog Workbench hydration.
// Supabase bundles this exact reviewed module graph at deploy time.
//
// Domain-cutover compatibility shim:
// - preserve the two legacy NJPropertyTaxRelief browser origins handled by the pinned Workbench module;
// - additionally allow the canonical WatchdogIndex browser origins;
// - never use wildcard CORS;
// - do not change the legacy NJPropertyTaxRelief static-data base used by the Workbench module.
//
// New Home Warranty compatibility provider:
// - DCA's latest accessible quarterly tables are county-level, not municipality-level;
// - enrich only authenticated Pro+/Teams/Developer responses after the certified resolver has enforced entitlement;
// - direct values come from DCA Q4 2025 preliminary data; exact Q3->Q4 changes/rank are governed derivations;
// - the unsupported municipality-rank marker remains missing rather than being synthesized.

const WATCHDOG_INDEX_ORIGINS = new Set([
  'https://watchdogindex.com',
  'https://www.watchdogindex.com',
]);

const NHW_DATA_URL = 'https://www.watchdogindex.com/property/data/new-home-warranty.json';
const NHW_PREFIX = 'njplus.nj-dca-new-home-warranty.';
const NHW_PROVIDER_VERSION = 'nj-dca-new-home-warranty-q4-2025-v1';
const NHW_DIRECT_SOURCE = `NJ DCA New Home Warranties Q4 2025 preliminary county table · ${NHW_PROVIDER_VERSION}`;
const NHW_DERIVED_SOURCE = `Watchdog exact Q3-to-Q4 2025 derivation over NJ DCA New Home Warranties · ${NHW_PROVIDER_VERSION}`;
const NHW_FIELDS = new Set([
  'new_home_warranty_enrollments',
  'new_home_warranty_average_price',
  'new_home_warranty_median_price',
  'new_home_warranty_sales_count',
  'new_home_warranty_quarter',
  'new_home_warranty_year',
  'new_home_warranty_price_change',
  'new_home_warranty_enrollment_change',
  'new_home_warranty_county_rank',
  'new_home_warranty_municipal_rank',
]);
const NHW_DERIVED_FIELDS = new Set([
  'new_home_warranty_price_change',
  'new_home_warranty_enrollment_change',
  'new_home_warranty_county_rank',
]);
const NHW_ELIGIBLE_PLANS = new Set(['pro_plus', 'teams', 'developer']);
const NHW_TTL_MS = 6 * 60 * 60 * 1000;
let nhwCache: any = null;
let nhwCacheAt = 0;

const nativeServe = Deno.serve.bind(Deno);

function normalizeCounty(value: unknown) {
  return String(value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function loadNewHomeWarranty() {
  if (nhwCache && Date.now() - nhwCacheAt < NHW_TTL_MS) return nhwCache;
  try {
    const response = await fetch(NHW_DATA_URL, { headers: { accept: 'application/json' } });
    if (!response.ok) return null;
    const payload = await response.json();
    if (
      String(payload?.source_id || '') !== 'nj-dca-new-home-warranty' ||
      String(payload?.provider_version || '') !== NHW_PROVIDER_VERSION ||
      String(payload?.geography_scope || '') !== 'county' ||
      !payload?.counties
    ) return null;
    nhwCache = payload;
    nhwCacheAt = Date.now();
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
      const status = String((row as any)?.status || '');
      if (!(status in summary)) summary[status] = 0;
      summary[status] += 1;
    }
  }
  return summary;
}

async function enrichNewHomeWarranty(request: Request, response: Response) {
  if (request.method !== 'POST' || !response.ok) return response;

  let requestBody: any = null;
  try {
    requestBody = await request.json();
  } catch {
    return response;
  }

  const requestedIds = [...new Set((Array.isArray(requestBody?.marker_ids) ? requestBody.marker_ids : [])
    .map((value: unknown) => String(value || '').trim())
    .filter((id: string) => id.startsWith(NHW_PREFIX) && NHW_FIELDS.has(id.slice(NHW_PREFIX.length))))];
  if (!requestedIds.length) return response;

  let payload: any = null;
  try {
    payload = await response.clone().json();
  } catch {
    return response;
  }
  if (!NHW_ELIGIBLE_PLANS.has(String(payload?.plan || ''))) return response;

  const pins = [...new Set((Array.isArray(requestBody?.pams_pins) ? requestBody.pams_pins : [])
    .map((value: unknown) => String(value || '').trim())
    .filter(Boolean))];
  if (!pins.length) return response;

  const root = await loadNewHomeWarranty();
  const records = new Map((Array.isArray(payload?.records) ? payload.records : [])
    .map((row: any) => [String(row?.pams_pin || ''), row]));
  payload.markers ||= {};
  payload.meta ||= {};

  for (const pin of pins) {
    payload.markers[pin] ||= {};
    payload.meta[pin] ||= {};
    const propertyRow: any = records.get(pin);
    const countyKey = normalizeCounty(propertyRow?.county);
    const county = root?.counties?.[countyKey] || null;

    for (const markerId of requestedIds) {
      if (String(payload.meta?.[pin]?.[markerId]?.status || '') === 'not_entitled') continue;
      const field = markerId.slice(NHW_PREFIX.length);

      if (field === 'new_home_warranty_municipal_rank') {
        delete payload.markers[pin][markerId];
        payload.meta[pin][markerId] = {
          status: 'source_checked_no_value',
          provider_kind: 'authoritative_reference',
          source: 'NJ DCA New Home Warranties quarterly reports',
          scope: 'county',
          provider_version: NHW_PROVIDER_VERSION,
          reason: 'Official DCA quarterly New Home Warranty data is county-level; no municipality-level warranty enrollment rank is published.',
          checked_at: new Date().toISOString(),
        };
        continue;
      }

      if (!root) {
        delete payload.markers[pin][markerId];
        payload.meta[pin][markerId] = {
          status: 'provider_error',
          provider_kind: NHW_DERIVED_FIELDS.has(field) ? 'derived_governed' : 'authoritative_reference',
          source: 'NJ DCA New Home Warranties quarterly reports',
          scope: 'county',
          provider_version: NHW_PROVIDER_VERSION,
          reason: 'Governed New Home Warranty snapshot could not be loaded.',
          checked_at: new Date().toISOString(),
        };
        continue;
      }

      if (!countyKey || !county) {
        delete payload.markers[pin][markerId];
        payload.meta[pin][markerId] = {
          status: 'source_checked_no_value',
          provider_kind: NHW_DERIVED_FIELDS.has(field) ? 'derived_governed' : 'authoritative_reference',
          source: NHW_DERIVED_FIELDS.has(field) ? NHW_DERIVED_SOURCE : NHW_DIRECT_SOURCE,
          scope: 'county',
          provider_version: NHW_PROVIDER_VERSION,
          reason: countyKey ? 'No matching county row exists in the governed DCA quarter.' : 'Property county is unavailable for the county-level DCA join.',
          checked_at: new Date().toISOString(),
        };
        continue;
      }

      const value = county?.[field];
      if (value === null || value === undefined || value === '') {
        delete payload.markers[pin][markerId];
        payload.meta[pin][markerId] = {
          status: 'source_checked_no_value',
          provider_kind: NHW_DERIVED_FIELDS.has(field) ? 'derived_governed' : 'authoritative_reference',
          source: NHW_DERIVED_FIELDS.has(field) ? NHW_DERIVED_SOURCE : NHW_DIRECT_SOURCE,
          scope: 'county',
          provider_version: NHW_PROVIDER_VERSION,
          checked_at: new Date().toISOString(),
        };
        continue;
      }

      payload.markers[pin][markerId] = value;
      payload.meta[pin][markerId] = {
        status: 'available',
        provider_kind: NHW_DERIVED_FIELDS.has(field) ? 'derived_governed' : 'authoritative_reference',
        source: NHW_DERIVED_FIELDS.has(field) ? NHW_DERIVED_SOURCE : NHW_DIRECT_SOURCE,
        scope: 'county',
        provider_version: NHW_PROVIDER_VERSION,
        source_year: 2025,
        source_quarter: 4,
        source_preliminary: true,
        current_2026_source_health: 'q1_pdf_and_xls_404',
        observed_at: new Date().toISOString(),
      };
    }
  }

  payload.provider_summary = recalculateProviderSummary(payload.meta);
  payload.provider_versions ||= {};
  payload.provider_versions.new_home_warranty = NHW_PROVIDER_VERSION;

  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'private, no-store');
  return new Response(JSON.stringify(payload), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function applyWatchdogIndexCors(origin: string, response: Response) {
  if (!WATCHDOG_INDEX_ORIGINS.has(origin)) return response;
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  const vary = headers.get('Vary') || '';
  const varyParts = vary.split(',').map((part) => part.trim().toLowerCase()).filter(Boolean);
  if (!varyParts.includes('origin')) headers.set('Vary', vary ? `${vary}, Origin` : 'Origin');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function withWatchdogIndexCors(handler: Deno.ServeHandler): Deno.ServeHandler {
  return async (request, info) => {
    const origin = request.headers.get('origin') || '';
    const enrichmentRequest = request.clone();
    const baseResponse = await handler(request, info);
    const enrichedResponse = await enrichNewHomeWarranty(enrichmentRequest, baseResponse);
    return applyWatchdogIndexCors(origin, enrichedResponse);
  };
}

const wrappedServe = ((first: unknown, second?: unknown) => {
  if (typeof first === 'function') {
    return nativeServe(withWatchdogIndexCors(first as Deno.ServeHandler));
  }
  if (typeof second === 'function') {
    return nativeServe(first as Deno.ServeOptions, withWatchdogIndexCors(second as Deno.ServeHandler));
  }
  return nativeServe(first as Deno.ServeOptions);
}) as typeof Deno.serve;

Object.defineProperty(Deno, 'serve', {
  configurable: true,
  writable: true,
  value: wrappedServe,
});

// Keep the current certified Workbench provider graph pinned. This is the same
// provider graph used by production v49; the wrapper only adds canonical WatchdogIndex CORS
// and the bounded county-level New Home Warranty provider after entitlement enforcement.
await import('https://raw.githubusercontent.com/johnscafide/njtaxrelief/666fe7392ae43a8be7b7f2512b76894dc64262a2/supabase/functions/workbench-hydrate/index.ts');
