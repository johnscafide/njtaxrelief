const DCA_API = 'https://data.nj.gov/resource/w9se-dmra.json';
const PROVIDER_VERSION = 'nj-dca-permit-lifecycle-record-match-v1';
const SOURCE = 'NJ DCA Construction Permit Data (w9se-dmra)';
const TARGET_SUFFIX = '.open_permit_count';
const TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, { at: number; rows: any[]; ok: boolean }>();

function clean(value: unknown) {
  return String(value ?? '').trim();
}
function esc(value: unknown) {
  return clean(value).replace(/'/g, "''");
}
function treasuryCode(row: any) {
  const pin = clean(row?.pams_pin).replace(/\D/g, '');
  return pin.slice(0, 4) || clean(row?.cd_code).replace(/\D/g, '').slice(0, 4);
}
function normalizePermitNumber(value: unknown) {
  return clean(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
}
function isIssued(row: any) {
  return clean(row?.status).toUpperCase() === 'P';
}
function isCertificate(row: any) {
  return clean(row?.status).toUpperCase() === 'C';
}
function dateValue(value: unknown) {
  const parsed = Date.parse(clean(value));
  return Number.isFinite(parsed) ? parsed : null;
}
function sameLifecycleKey(row: any) {
  const permit = normalizePermitNumber(row?.permitno);
  return permit || '';
}

async function fetchParcelRows(propertyRow: any) {
  const tc = treasuryCode(propertyRow);
  const block = esc(propertyRow?.block);
  const lot = esc(propertyRow?.lot);
  if (!/^\d{4}$/.test(tc) || !block || !lot) {
    return { ok: true, rows: [], missingKey: true };
  }
  const key = `${tc}|${block}|${lot}`;
  const existing = cache.get(key);
  if (existing && Date.now() - existing.at < TTL_MS) return { ok: existing.ok, rows: existing.rows, missingKey: false };
  const query = new URLSearchParams({
    $where: `treasurycode='${tc}' AND block='${block}' AND lot='${lot}'`,
    $limit: '5000',
    $order: 'permitdate DESC',
  });
  try {
    const response = await fetch(`${DCA_API}?${query.toString()}`, { headers: { accept: 'application/json' } });
    if (!response.ok) {
      cache.set(key, { at: Date.now(), rows: [], ok: false });
      return { ok: false, rows: [], missingKey: false };
    }
    const payload = await response.json();
    const rows = Array.isArray(payload) ? payload : [];
    cache.set(key, { at: Date.now(), rows, ok: true });
    return { ok: true, rows, missingKey: false };
  } catch {
    cache.set(key, { at: Date.now(), rows: [], ok: false });
    return { ok: false, rows: [], missingKey: false };
  }
}

function lifecycleSummary(rows: any[]) {
  const groups = new Map<string, any[]>();
  let unmatchableIssued = 0;
  for (const row of rows) {
    const key = sameLifecycleKey(row);
    if (!key) {
      if (isIssued(row)) unmatchableIssued += 1;
      continue;
    }
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  }

  let issuedPermits = 0;
  let matchedCertificates = 0;
  let verificationCandidates = 0;
  let latestCandidatePermitDate: string | null = null;

  for (const group of groups.values()) {
    const issued = group.filter(isIssued);
    if (!issued.length) continue;
    issuedPermits += 1;
    const certs = group.filter(isCertificate);
    const earliestIssue = Math.min(...issued.map((row: any) => dateValue(row?.permitdate) ?? Number.MAX_SAFE_INTEGER));
    const hasMatchingCertificate = certs.some((row: any) => {
      const certDate = dateValue(row?.certdate);
      if (certDate === null || earliestIssue === Number.MAX_SAFE_INTEGER) return true;
      return certDate >= earliestIssue;
    });
    if (hasMatchingCertificate) {
      matchedCertificates += 1;
      continue;
    }
    verificationCandidates += 1;
    const dates = issued.map((row: any) => clean(row?.permitdate)).filter(Boolean).sort();
    const latest = dates.at(-1) || null;
    if (latest && (!latestCandidatePermitDate || latest > latestCandidatePermitDate)) latestCandidatePermitDate = latest;
  }

  return {
    issuedPermits,
    matchedCertificates,
    verificationCandidates,
    unmatchableIssued,
    latestCandidatePermitDate,
  };
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

export async function enrichPermitLifecycle(request: Request, response: Response) {
  if (request.method !== 'POST' || !response.ok) return response;
  let requestBody: any;
  try { requestBody = await request.json(); } catch { return response; }

  const requestedIds = [...new Set((Array.isArray(requestBody?.marker_ids) ? requestBody.marker_ids : [])
    .map((value: unknown) => clean(value))
    .filter((id: string) => id.endsWith(TARGET_SUFFIX) || id === 'preflight.open_permit_count')))] as string[];
  if (!requestedIds.length) return response;

  let payload: any;
  try { payload = await response.clone().json(); } catch { return response; }
  const pins = [...new Set((Array.isArray(requestBody?.pams_pins) ? requestBody.pams_pins : [])
    .map((value: unknown) => clean(value)).filter(Boolean))] as string[];
  if (!pins.length) return response;

  const records = new Map<string, any>((Array.isArray(payload?.records) ? payload.records : [])
    .map((row: any) => [clean(row?.pams_pin), row]));
  payload.markers ||= {};
  payload.meta ||= {};

  for (const pin of pins) {
    payload.markers[pin] ||= {};
    payload.meta[pin] ||= {};
    const propertyRow = records.get(pin);
    for (const markerId of requestedIds) {
      if (clean(payload.meta?.[pin]?.[markerId]?.status) === 'not_entitled') continue;
      const fetched = await fetchParcelRows(propertyRow);
      if (fetched.missingKey) {
        delete payload.markers[pin][markerId];
        payload.meta[pin][markerId] = {
          status: 'provider_missing', provider_kind: 'authoritative_source', source: SOURCE,
          provider_version: PROVIDER_VERSION, scope: 'property', checked_at: new Date().toISOString(),
          reason: 'Parcel municipality/block/lot keys are unavailable for an exact DCA permit lookup.',
        };
        continue;
      }
      if (!fetched.ok) {
        delete payload.markers[pin][markerId];
        payload.meta[pin][markerId] = {
          status: 'provider_error', provider_kind: 'authoritative_source', source: SOURCE,
          provider_version: PROVIDER_VERSION, scope: 'property', checked_at: new Date().toISOString(),
          reason: 'The NJ DCA permit provider could not be queried.',
        };
        continue;
      }
      if (!fetched.rows.length) {
        delete payload.markers[pin][markerId];
        payload.meta[pin][markerId] = {
          status: 'source_checked_no_value', provider_kind: 'authoritative_source', source: SOURCE,
          provider_version: PROVIDER_VERSION, scope: 'property', checked_at: new Date().toISOString(),
          reason: 'No DCA rows were returned. This is coverage information only and is not proof that no permit issue exists.',
          limitations: ['most_but_not_all_municipalities', 'monthly_refresh', 'recent_two_months_unreviewed', 'historical_rows_purged'],
        };
        continue;
      }

      const summary = lifecycleSummary(fetched.rows);
      payload.markers[pin][markerId] = summary.verificationCandidates;
      payload.meta[pin][markerId] = {
        status: 'available',
        provider_kind: 'derived_governed',
        source: SOURCE,
        provider_version: PROVIDER_VERSION,
        scope: 'property',
        observed_at: new Date().toISOString(),
        interpretation: 'permit_certificate_verification_candidates_not_legal_open_permits',
        display_label: 'Permit/certificate verification candidates',
        lifecycle: summary,
        limitations: ['most_but_not_all_municipalities', 'monthly_refresh', 'recent_two_months_unreviewed', 'historical_rows_purged'],
      };
    }
  }

  payload.provider_summary = recalculateProviderSummary(payload.meta);
  payload.provider_versions ||= {};
  payload.provider_versions.dca_permit_lifecycle = PROVIDER_VERSION;
  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'private, no-store');
  return new Response(JSON.stringify(payload), { status: response.status, statusText: response.statusText, headers });
}

export { PROVIDER_VERSION as DCA_PERMIT_LIFECYCLE_PROVIDER_VERSION };
