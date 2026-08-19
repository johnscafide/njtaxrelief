import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const ENGINE = "watchdog-closing-v4-structural-shadow-v1";
const PARCELS = "https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/arcgis/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0/query";
const DCA = "https://data.nj.gov/resource/w9se-dmra.json";
const FEMA = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer";
const ENV = "https://mapsdep.nj.gov/arcgis/rest/services/Features/Environmental_NJEMS/MapServer";
const ENVIRONMENTAL = "https://mapsdep.nj.gov/arcgis/rest/services/Features/Environmental/MapServer";
const RSP = "https://mapsdep.nj.gov/arcgis/rest/services/Applications/RSP_Query_Layers/MapServer";
const HYDRO = "https://mapsdep.nj.gov/arcgis/rest/services/Features/Hydrography/MapServer";
const LAND_LU = "https://mapsdep.nj.gov/arcgis/rest/services/Features/Land_lu/MapServer";
const LAND = "https://mapsdep.nj.gov/arcgis/rest/services/Features/Land/MapServer";

const WEIGHTS = {
  open_permit: 0.24,
  deed_notice: 0.16,
  cea: 0.16,
  contaminated_site: 0.12,
  ust: 0.08,
  tidelands: 0.10,
  flood_environment: 0.14,
} as const;

type O = Record<string, any>;
type Obs = { status: "available" | "source_checked_no_value" | "provider_error" | "dependency_missing"; value: any; reason?: string };

const clean = (v: unknown, n = 240) => String(v ?? "").replace(/[<>]/g, "").trim().slice(0, n);
const clamp = (v: number, a = 0, b = 100) => Math.max(a, Math.min(b, v));
const round = (v: number, p = 2) => Math.round(v * 10 ** p) / 10 ** p;
const out = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store, private" } });
async function sha(text: string) { const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)); return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join(""); }
function stableRank(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function esc(v: string) { return v.replace(/'/g, "''"); }
function pinOf(r: O) { const q = clean(r.qualifier_key, 40); return `${clean(r.district_code, 4)}_${clean(r.block_key, 50)}_${clean(r.lot_key, 50)}${q ? `_${q}` : ""}`; }
function num(v: unknown) { if (v === null || v === undefined || v === "") return null; const x = Number(v); return Number.isFinite(x) ? x : null; }
function boolScore(v: any) { return v === true || v === 1 || v === "1" || String(v).toLowerCase() === "true" ? 100 : 0; }
function countScore(v: any, cap: number) { const x = num(v); return x === null ? null : clamp(Math.max(0, x) / cap * 100); }
function floodBand(v: any) { const zone = String(v || "").toUpperCase(); if (!zone) return 0; if (/^(A|AE|AH|AO|AR|A99|V|VE)/.test(zone)) return 100; if (/^(X.*0\.2|B)/.test(zone)) return 66; if (/^(X|C)/.test(zone)) return 0; return 33; }

async function fetchJson(url: string, init: RequestInit = {}, timeout = 7000) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), timeout);
  try { const r = await fetch(url, { ...init, signal: c.signal }); if (!r.ok) return { ok: false, status: r.status, data: null }; return { ok: true, status: r.status, data: await r.json() }; }
  catch (e) { return { ok: false, status: 0, data: null, error: e instanceof DOMException && e.name === "AbortError" ? "timeout" : "unavailable" }; }
  finally { clearTimeout(t); }
}

async function parcelRows(pins: string[]) {
  const map = new Map<string, O>();
  for (let i = 0; i < pins.length; i += 35) {
    const part = pins.slice(i, i + 35);
    const q = new URLSearchParams({
      f: "json",
      where: `PAMS_PIN IN (${part.map((p) => `'${esc(p)}'`).join(",")})`,
      outFields: "PAMS_PIN,PCLBLOCK,PCLLOT,PCLQCODE,PCL_MUN,CD_CODE,PROP_LOC",
      returnGeometry: "false",
      returnCentroid: "true",
      outSR: "4326",
      resultRecordCount: String(Math.max(100, part.length * 3)),
    });
    const r = await fetchJson(`${PARCELS}?${q.toString()}`, { headers: { accept: "application/json" } }, 12000);
    if (!r.ok || r.data?.error) continue;
    for (const f of r.data?.features || []) {
      const a = f?.attributes || {}, c = f?.centroid || {}, p = clean(a.PAMS_PIN, 100);
      if (p) map.set(p, { pams_pin: p, block: clean(a.PCLBLOCK, 50), lot: clean(a.PCLLOT, 50), qualifier: clean(a.PCLQCODE, 40), district: clean(a.PCL_MUN || a.CD_CODE, 8), address: clean(a.PROP_LOC, 240), lat: num(c.y), lon: num(c.x) });
    }
  }
  return map;
}

async function spatial(base: string, layer: string, lat: number, lon: number, distance?: number, mode: "hit" | "count" | "fema" = "hit"): Promise<Obs> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { status: "dependency_missing", value: null, reason: "parcel_coordinates_unavailable" };
  const q = new URLSearchParams({ f: "json", where: "1=1", geometry: `${lon},${lat}`, geometryType: "esriGeometryPoint", inSR: "4326", spatialRel: "esriSpatialRelIntersects", outFields: "*", returnGeometry: "false", resultRecordCount: "10" });
  if (distance) { q.set("distance", String(distance)); q.set("units", "esriSRUnit_Meter"); }
  const r = await fetchJson(`${base}/${layer}/query?${q.toString()}`, { headers: { accept: "application/json" } }, 6500);
  if (!r.ok || r.data?.error) return { status: "provider_error", value: null, reason: !r.ok ? `provider_http_${r.status || 0}` : "provider_arcgis_error" };
  const fs = Array.isArray(r.data?.features) ? r.data.features : [];
  if (mode === "count") return { status: "available", value: fs.length };
  if (mode === "hit") return { status: "available", value: fs.length > 0 };
  if (!fs.length) return { status: "source_checked_no_value", value: null };
  const a = fs[0]?.attributes || {}, zone = clean(a.FLD_ZONE, 40), sub = clean(a.ZONE_SUBTY, 100);
  return { status: "available", value: zone && sub && sub.toLowerCase() !== "null" ? `${zone} · ${sub}` : zone || (sub && sub.toLowerCase() !== "null" ? sub : "Mapped NFHL flood hazard") };
}

async function openPermits(row: O): Promise<Obs> {
  const district = clean(row.district, 8).replace(/\D/g, "").slice(0, 4), block = clean(row.block, 50), lot = clean(row.lot, 50);
  if (!/^\d{4}$/.test(district) || !block || !lot) return { status: "dependency_missing", value: null, reason: "parcel_permit_key_unavailable" };
  const where = `treasurycode='${esc(district)}' AND block='${esc(block)}' AND lot='${esc(lot)}'`;
  const q = new URLSearchParams({ "$where": where, "$limit": "5000", "$order": "permitdate DESC" });
  const r = await fetchJson(`${DCA}?${q.toString()}`, { headers: { accept: "application/json" } }, 8000);
  if (!r.ok || !Array.isArray(r.data)) return { status: "provider_error", value: null, reason: `dca_${r.status || 0}` };
  if (!r.data.length) return { status: "source_checked_no_value", value: null };
  const issued = r.data.filter((x: O) => String(x?.status || "").toUpperCase() === "P").length;
  const cert = r.data.filter((x: O) => String(x?.status || "").toUpperCase() === "C").length;
  return { status: "available", value: Math.max(0, issued - cert) };
}

async function featureVector(row: O) {
  const lat = Number(row.lat), lon = Number(row.lon);
  const [permit, deed, cea, contaminated, ust, tidelands, fema, tidal, wetlands, priorityWetlands] = await Promise.all([
    openPermits(row),
    spatial(ENVIRONMENTAL, "40", lat, lon, undefined, "hit"),
    spatial(RSP, "5", lat, lon, undefined, "hit"),
    spatial(ENV, "0", lat, lon, 500, "count"),
    spatial(ENV, "9", lat, lon, 250, "count"),
    spatial(HYDRO, "30", lat, lon, undefined, "hit"),
    spatial(FEMA, "28", lat, lon, undefined, "fema"),
    spatial(HYDRO, "48", lat, lon, undefined, "hit"),
    spatial(LAND_LU, "2", lat, lon, undefined, "hit"),
    spatial(LAND, "79", lat, lon, undefined, "hit"),
  ]);

  const providerFailure = [deed, cea, contaminated, ust, tidelands, fema, tidal, wetlands, priorityWetlands].some((x) => x.status === "provider_error" || x.status === "dependency_missing");
  let flood: Obs;
  if (providerFailure && [fema, tidal, wetlands, priorityWetlands].some((x) => x.status === "provider_error" || x.status === "dependency_missing")) flood = { status: "provider_error", value: null, reason: "flood_family_incomplete" };
  else flood = { status: "available", value: clamp(floodBand(fema.status === "source_checked_no_value" ? "" : fema.value) * 0.66 + boolScore(tidal.value) * 0.18 + boolScore(wetlands.value) * 0.10 + boolScore(priorityWetlands.value) * 0.06) };

  // Important: this mirrors the current v4 adapter semantics. DCA's authoritative
  // source_checked_no_value is not silently converted to zero for a direct count feature.
  const scores: O = {
    open_permit: permit.status === "available" ? countScore(permit.value, 3) : null,
    deed_notice: deed.status === "available" ? boolScore(deed.value) : null,
    cea: cea.status === "available" ? boolScore(cea.value) : null,
    contaminated_site: contaminated.status === "available" ? countScore(contaminated.value, 3) : null,
    ust: ust.status === "available" ? countScore(ust.value, 3) : null,
    tidelands: tidelands.status === "available" ? boolScore(tidelands.value) : null,
    flood_environment: flood.status === "available" ? Number(flood.value) : null,
  };
  const available = Object.values(scores).filter((x) => typeof x === "number" && Number.isFinite(x as number)).length;
  const complete = available === Object.keys(WEIGHTS).length;
  const score = complete ? Object.entries(WEIGHTS).reduce((sum, [k, w]) => sum + Number(scores[k]) * w, 0) : null;
  return { scores, score: score === null ? null : round(score), complete, permit_status: permit.status };
}

function stats(values: number[]) {
  const a = values.slice().sort((x, y) => x - y); if (!a.length) return { observations: 0, distinct: 0, min: null, max: null, mean: null, p25: null, p50: null, p75: null };
  const q = (p: number) => { const i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return round(lo === hi ? a[lo] : a[lo] + (a[hi] - a[lo]) * (i - lo)); };
  return { observations: a.length, distinct: new Set(a.map((x) => x.toFixed(2))).size, min: round(a[0]), max: round(a[a.length - 1]), mean: round(a.reduce((s, x) => s + x, 0) / a.length), p25: q(0.25), p50: q(0.5), p75: q(0.75) };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const out: R[] = new Array(items.length); let next = 0;
  async function worker() { while (true) { const i = next++; if (i >= items.length) return; out[i] = await fn(items[i]); } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker)); return out;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return out(405, { error: "POST required" });
  const url = Deno.env.get("SUPABASE_URL") || "", secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !secret) return out(503, { error: "Shadow configuration incomplete" });
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = clean(req.headers.get("x-watchdog-shadow-token"), 200);
  if (!token) return out(401, { error: "Internal shadow token required" });
  const control = await admin.from("intelligence_closing_shadow_control").select("enabled,token_hash,per_county").eq("id", true).maybeSingle();
  if (control.error || !control.data) return out(503, { error: "Shadow control unavailable" });
  if (await sha(token) !== String(control.data.token_hash || "")) return out(403, { error: "Invalid internal shadow token" });
  if (control.data.enabled !== true) return out(202, { ok: true, status: "disabled", engine: ENGINE });

  let body: O = {}; try { body = await req.json(); } catch {}
  const perCounty = Math.min(4, Math.max(2, Math.trunc(Number(body.per_county || control.data.per_county || 3))));
  const thresholds = [...new Set((Array.isArray(body.thresholds) ? body.thresholds : [20, 25, 30, 35, 40, 45, 50]).map(Number).filter((x) => Number.isFinite(x) && x >= 0 && x <= 100))].sort((a, b) => a - b);

  const model = await admin.from("intelligence_model_versions").select("version,status,calibration_state,signal_config").eq("model_key", "closing_review").eq("version", 4).maybeSingle();
  const current = await admin.from("intelligence_models").select("version").eq("model_key", "closing_review").maybeSingle();
  if (model.error || !model.data || model.data.status !== "draft" || model.data.calibration_state !== "uncalibrated") return out(409, { error: "Closing v4 is not the expected draft" });
  if (Number(current.data?.version) !== 2) return out(409, { error: "Customer Closing version changed; shadow refused" });

  const prior = await admin.from("intelligence_calibration_cases").select("pams_pin,intelligence_calibration_sets!inner(model_key)").eq("intelligence_calibration_sets.model_key", "closing_review").not("pams_pin", "is", null).limit(5000);
  const excluded = new Set((prior.data || []).map((x: O) => clean(x.pams_pin, 100)).filter(Boolean));
  const selected: string[] = [], countyCounts: O = {};
  for (let c = 1; c <= 21; c++) {
    const county = String(c).padStart(2, "0");
    const r = await admin.from("sr1a_subject_evidence").select("district_code,block_key,lot_key,qualifier_key").eq("county_code", county).not("block_key", "is", null).not("lot_key", "is", null).limit(800);
    if (r.error) return out(503, { error: "Statewide source sample unavailable", county });
    const candidates = (r.data || []).map((x: O) => ({ ...x, pin: pinOf(x) })).filter((x: O) => x.pin && !excluded.has(x.pin)).sort((a: O, b: O) => stableRank(a.pin) - stableRank(b.pin));
    const seenDistrict = new Set<string>(); let n = 0;
    for (const x of candidates) { const d = clean(x.district_code, 4); if (!d || seenDistrict.has(d)) continue; selected.push(x.pin); seenDistrict.add(d); n++; if (n >= perCounty) break; }
    countyCounts[county] = n;
  }

  const parcels = await parcelRows(selected);
  const resolvedRows = selected.map((p) => parcels.get(p)).filter(Boolean) as O[];
  const vectors = await mapLimit(resolvedRows, 5, async (row) => ({ pin: row.pams_pin, county: String(row.pams_pin).slice(0, 2), ...(await featureVector(row)) }));
  const complete = vectors.filter((x: O) => x.complete && typeof x.score === "number");
  const scores = complete.map((x: O) => Number(x.score));
  const featureHealth: O = {};
  for (const key of Object.keys(WEIGHTS)) {
    const vals = vectors.map((x: O) => x.scores?.[key]).filter((x: any) => typeof x === "number" && Number.isFinite(x));
    featureHealth[key] = { available: vals.length, availability_pct: vectors.length ? round(vals.length / vectors.length * 100, 1) : 0, distinct: new Set(vals.map((x: number) => x.toFixed(2))).size, min: vals.length ? Math.min(...vals) : null, max: vals.length ? Math.max(...vals) : null };
  }
  const uniqueVectors = new Set(complete.map((x: O) => JSON.stringify(Object.keys(WEIGHTS).map((k) => round(Number(x.scores[k])))))).size;
  const variable = Object.values(featureHealth).filter((x: any) => x.distinct >= 2 && x.availability_pct >= 50).length;
  const sensitivity = thresholds.map((threshold) => ({ threshold, priority: scores.filter((s) => s >= threshold).length, not_priority: scores.filter((s) => s < threshold).length, structurally_ready: complete.length >= 25 && new Set(scores.map((x) => x.toFixed(2))).size >= 8 && uniqueVectors >= 8 && scores.filter((s) => s >= threshold).length >= 5 && scores.filter((s) => s < threshold).length >= 5 && variable >= 2 }));
  const permitStatus = vectors.reduce((m: O, x: O) => { m[x.permit_status] = (m[x.permit_status] || 0) + 1; return m; }, {});

  return out(200, {
    ok: true,
    engine: ENGINE,
    model: { key: "closing_review", draft_version: 4, current_customer_version: 2 },
    source: { requested: selected.length, resolved: resolvedRows.length, counties: Object.keys(countyCounts).filter((k) => countyCounts[k] > 0).length, per_county: perCounty, excluded_prior_calibration_pins: excluded.size },
    scorable: complete.length,
    insufficient_evidence: vectors.length - complete.length,
    score_distribution: stats(scores),
    unique_feature_vectors: uniqueVectors,
    variable_score_features: variable,
    feature_health: featureHealth,
    permit_source_status: permitStatus,
    threshold_sensitivity: sensitivity,
    safety: { persisted_property_results: false, human_labels_used: false, prior_closing_cases_excluded: true, current_pointer_changed: false, promotion_available: false },
  });
});
