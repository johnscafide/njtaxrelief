import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const ORIGINS = new Set(["https://njpropertytaxrelief.com", "https://www.njpropertytaxrelief.com"]);
const BASE = "https://njpropertytaxrelief.com";
const URLS = {
  uniformity: BASE + "/property/uniformity.json",
  appeals: BASE + "/property/appeals.json",
  sr1a: BASE + "/property/sr1a-ratios.json",
  equalization: BASE + "/equalization-ratios.json",
  tax: BASE + "/tax-rates.json"
};
const SCORE_ID = "watchdog.watchdog_score";
const SCORE_MODEL = "ROBUST-v1";
const SIGNAL_MODEL = "workbench-signals-v2.1.0";
const OBS_IDS = [SCORE_ID, "watchdog.tax_pressure", "watchdog.revaluation_risk", "uniformity.score"];

function cors(req) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.has(origin) ? origin : "https://njpropertytaxrelief.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
}
function out(req, status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "private, no-store" }
  });
}
function clean(value, max = 120) { return String(value || "").trim().slice(0, max); }
function num(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function clamp01(value) { return Math.max(0, Math.min(1, value)); }
function clamp(value, min = 0, max = 100) { return Math.max(min, Math.min(max, value)); }
function round1(value) { return Math.round(value * 10) / 10; }
function rank(plan) { return ({ standard: 0, agent: 1, pro: 2, pro_plus: 3, teams: 4, developer: 5 })[plan] ?? 0; }
function stripZero(value) {
  if (!value) return value;
  const m = value.match(/^(\d+)(\.\d+)?$/);
  if (!m) return value;
  return String(Number(m[1])) + (m[2] || "");
}
function canonicalPin(pin) {
  const p = String(pin || "").trim(), parts = p.split("_");
  return parts.length < 3 ? p : [parts[0], stripZero(parts[1]), stripZero(parts[2]), ...parts.slice(3)].join("_");
}
function district(pin) { return String(pin || "").slice(0, 4); }
function countyCode(pin) { return String(pin || "").slice(0, 2); }
function norm(value) { return String(value || "").toUpperCase().replace(/\s+/g, " ").trim(); }
function confidence(coverage) { return coverage >= 85 ? "high" : coverage >= 60 ? "medium" : "low"; }
function verdict(score) {
  if (score >= 80) return "Strong tax position";
  if (score >= 65) return "Favorable tax position";
  if (score >= 50) return "Typical or mixed tax position";
  if (score >= 35) return "Pressured tax position";
  return "Highly pressured tax position";
}
function medianLatest(series) {
  const years = Object.keys(series || {}).map(Number).filter(y => y > 1990).sort((a, b) => a - b);
  if (!years.length) return null;
  const row = series[String(years[years.length - 1])];
  const pct = row && typeof row === "object" ? num(row.ratio) : num(row);
  return pct && pct > 0 ? { ratio: pct / 100, year: years[years.length - 1], upper: row?.upper ? num(row.upper) / 100 : null } : null;
}
let sourceCache = null, sourceCacheAt = 0;
async function sources() {
  if (sourceCache && Date.now() - sourceCacheAt < 3600000) return sourceCache;
  const keys = Object.keys(URLS);
  const responses = await Promise.all(keys.map(key => fetch(URLS[key], { headers: { accept: "application/json" } })));
  if (responses.some(r => !r.ok)) throw new Error("Canonical scoring source unavailable");
  const values = await Promise.all(responses.map(r => r.json()));
  sourceCache = Object.fromEntries(keys.map((key, i) => [key, values[i]]));
  sourceCacheAt = Date.now();
  return sourceCache;
}
function sr1aFor(src, pin) {
  const row = src?.districts?.[district(pin)];
  return row && num(row.ratio) && num(row.n) >= 10 ? row : null;
}
function uniFor(src, pin) { return src?.districts?.[district(pin)] || null; }
function appealFor(src, pin) { return src?.counties?.[countyCode(pin)] || null; }
function ratioFor(src, town, county) {
  const ratios = src?.ratios || {}, townKey = norm(town), exact = townKey + " (" + norm(county) + ")", keys = Object.keys(ratios);
  let hit = null;
  for (const key of keys) if (norm(key) === exact) { hit = ratios[key]; break; }
  if (!hit) for (const key of keys) if (norm(key) === townKey) { hit = ratios[key]; break; }
  return hit ? medianLatest(hit) : null;
}
function marketValue(row, src, stored) {
  const verified = sr1aFor(src.sr1a, row.pams_pin);
  if (verified && num(row.assessed_value)) return { v: Number(row.assessed_value) / Number(verified.ratio), ratio: Number(verified.ratio), n: Number(verified.n), src: "verified" };
  const published = ratioFor(src.equalization, row.town, row.county);
  if (published && num(row.assessed_value)) return { v: Number(row.assessed_value) / published.ratio, ratio: published.ratio, n: null, src: "published" };
  const saved = num(stored);
  return saved && saved > 0 ? { v: saved, ratio: null, n: null, src: "stored" } : null;
}
function usableSale(row, verified) {
  const sale = num(row.last_sale_price), assessed = num(row.assessed_value), year = num(row.last_sale_year);
  if (sale == null || sale < 1000 || year == null || year < 1900 || year > new Date().getFullYear() + 1) return false;
  if (assessed != null && assessed > 0) {
    const raw = assessed / sale;
    if (raw < 0.05 || raw > 5) return false;
  }
  if (verified && num(verified.ratio)) {
    const implied = assessed != null && assessed > 0 ? assessed / sale : null;
    if (implied != null && (implied < Number(verified.ratio) * 0.12 || implied > Number(verified.ratio) * 8)) return false;
  }
  return true;
}
function chapter123(row, market, stored, sr1a) {
  if (!market || !num(row.assessed_value)) return null;
  let independent = null, basis = null;
  const saved = num(stored);
  if (saved && Math.abs(saved - market.v) / market.v > 0.001) { independent = saved; basis = "comparable sales from the saved property record"; }
  else if (sr1a && num(sr1a.ppsf) && num(row.living_sqft)) { independent = Number(sr1a.ppsf) * Number(row.living_sqft); basis = "median price per square foot in this municipality"; }
  const result = { market: market.v, ratio: market.ratio, src: market.src, n: market.n, testable: false, hasCase: false, indep: independent, basis };
  if (independent == null || market.ratio == null) return result;
  const fair = independent * market.ratio, limit = fair * 1.15;
  result.testable = true; result.fair = fair; result.limit = limit; result.over = Number(row.assessed_value) - limit; result.hasCase = result.over > 0;
  return result;
}
function revalRadar(row, src) {
  const sr1a = sr1aFor(src.sr1a, row.pams_pin), uniformity = uniFor(src.uniformity, row.pams_pin), published = ratioFor(src.equalization, row.town, row.county);
  if (!sr1a || !published) return null;
  const pub = published.ratio, ver = Number(sr1a.ratio), drift = pub - ver, coeff = uniformity ? num(uniformity.coefficient) : null;
  const level = clamp01((0.85 - pub) / 0.35), spread = coeff == null ? null : clamp01((coeff - 15) / 20), decay = clamp01(drift / 0.20);
  const parts = [[level, .45], [decay, .25]];
  if (spread != null) parts.push([spread, .30]);
  const weight = parts.reduce((sum, p) => sum + p[1], 0), raw = parts.reduce((sum, p) => sum + p[0] * p[1], 0) / weight;
  let score = Math.round(raw * 100);
  if (pub >= .98) score = Math.min(score, 8);
  return { score, pub, ver, drift, coeff, level, spread, decay };
}
function taxSeries(src, town, county) {
  const rates = src?.rates || {}, t = norm(town), c = norm(county), exact = t + " (" + c + ")";
  if (rates[exact]) return { key: exact, series: rates[exact] };
  const hits = Object.entries(rates).filter(([key]) => {
    const x = norm(key);
    return x.includes("(" + c + ")") && (x.startsWith(t + " (") || x.startsWith(t + " CITY (") || x.startsWith(t + " TWP (") || x.startsWith(t + " TOWNSHIP (") || x.startsWith(t + " BORO (") || x.startsWith(t + " BOROUGH ("));
  });
  return hits.length === 1 ? { key: hits[0][0], series: hits[0][1] } : null;
}
function taxPressure(series) {
  const points = Object.entries(series || {}).map(([year, value]) => [Number(year), Number(value)]).filter(([year, value]) => Number.isFinite(year) && Number.isFinite(value) && value > 0).sort((a, b) => a[0] - b[0]);
  if (points.length < 2) return null;
  const recent = points.slice(-5), first = recent[0], last = recent.at(-1), prev = recent.at(-2), years = Math.max(1, last[0] - first[0]);
  const cagr = Math.pow(last[1] / first[1], 1 / years) - 1, yoy = last[1] / prev[1] - 1;
  return { score: round1(.70 * clamp(Math.max(0, cagr) / .04 * 100) + .30 * clamp(Math.max(0, yoy) / .06 * 100)), latest_year: last[0], latest_rate: last[1], cagr: round1(cagr * 100), yoy: round1(yoy * 100) };
}
function robustScore(row, src, stored) {
  const parts = [], detail = {};
  const add = (key, weight, value, note) => {
    if (value == null) { detail[key] = { score: null, weight, note }; return; }
    const normalized = clamp01(Number(value));
    parts.push({ weight, value: normalized });
    detail[key] = { score: Math.round(normalized * 100), weight, note };
  };
  const market = marketValue(row, src, stored), sr1a = sr1aFor(src.sr1a, row.pams_pin), uniformity = uniFor(src.uniformity, row.pams_pin), appeal = appealFor(src.appeals, row.pams_pin), stability = revalRadar(row, src), c123 = chapter123(row, market, stored, sr1a);
  if (market?.v && num(row.last_year_tax) != null) {
    const effectiveRate = Number(row.last_year_tax) / market.v;
    add("burden", 30, (.036 - effectiveRate) / (.036 - .012), { effective_market_tax_rate: effectiveRate, market_value: market.v, market_source: market.src });
  } else add("burden", 30, null, { reason: "tax or supported market value unavailable" });
  if (c123?.testable && c123.limit) {
    const assessed = Number(row.assessed_value), over = (assessed - c123.limit) / c123.limit;
    const position = over <= 0 ? clamp01(1 - (assessed - c123.fair) / Math.max(c123.fair, 1) * .5) : clamp01(1 - over / .30) * .5;
    add("fairness", 20, position, { public_name: "Overassessment Position", fair: c123.fair, limit: c123.limit, independent_value: c123.indep, basis: c123.basis });
  } else add("fairness", 20, null, { public_name: "Overassessment Position", reason: "independent value evidence unavailable" });
  if (uniformity && num(uniformity.coefficient) != null) add("uniformity", 15, 1 - clamp01((Number(uniformity.coefficient) - 7) / 23), { coefficient: Number(uniformity.coefficient), uniformity_score: num(uniformity.score) });
  else add("uniformity", 15, null, { reason: "uniformity evidence unavailable" });
  if (stability && num(stability.score) != null) add("stability", 15, 1 - clamp01(stability.score / 100), stability);
  else add("stability", 15, null, { reason: "revaluation stability evidence unavailable" });
  if (sr1a && usableSale(row, sr1a) && num(row.assessed_value)) {
    const sale = Number(row.last_sale_price), implied = Number(row.assessed_value) / sale, relative = implied / Number(sr1a.ratio);
    const trajectory = relative < .85 ? clamp01(.35 + relative * .4) : relative > 1.15 ? clamp01(1.15 - (relative - 1) * .8) : 1;
    add("trajectory", 10, trajectory, { sale, year: Number(row.last_sale_year), implied_ratio: implied, town_verified_ratio: Number(sr1a.ratio), validation: "defensible_sale_guard_v1" });
  } else add("trajectory", 10, null, { reason: "defensible arm's-length sale evidence unavailable" });
  const winRate = num(appeal?.latest?.win_rate_filed);
  if (winRate != null) add("recourse", 10, clamp01((winRate - 20) / 45), { win_rate_filed: winRate, county: row.county });
  else add("recourse", 10, null, { reason: "appeal recourse evidence unavailable" });
  if (!parts.length) return null;
  const availableWeight = parts.reduce((sum, p) => sum + p.weight, 0), raw = parts.reduce((sum, p) => sum + p.value * p.weight, 0) / availableWeight, score = Math.round(raw * 100);
  return { score, coverage: availableWeight, confidence: confidence(availableWeight), verdict: verdict(score), framework: "ROBUST", model_version: SCORE_MODEL, detail, market, chapter: c123, revaluation: stability };
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return out(req, 405, { error: "POST required" });
  const auth = req.headers.get("authorization") || "", url = Deno.env.get("SUPABASE_URL") || "", anon = Deno.env.get("SUPABASE_ANON_KEY") || "", service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!auth.startsWith("Bearer ")) return out(req, 401, { error: "Sign in required" });
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData } = await userClient.auth.getUser();
  if (!authData.user) return out(req, 401, { error: "Session invalid" });
  const { data: planData } = await admin.rpc("watchdog_effective_plan", { p_user_id: authData.user.id }), plan = String(planData || "standard");
  if (rank(plan) < 1) return out(req, 403, { error: "Paid plan required" });
  let body = {};
  try { body = await req.json(); } catch { return out(req, 400, { error: "Invalid JSON" }); }
  const pins = [...new Set((Array.isArray(body.pams_pins) ? body.pams_pins : []).map(x => clean(x, 80)).filter(Boolean))].slice(0, 1000);
  if (!pins.length) return out(req, 200, { markers: {}, meta: {}, summary: { requested: 0, scored: 0 }, framework: "ROBUST", model_version: SCORE_MODEL });
  const aliases = new Map(pins.map(pin => [pin, canonicalPin(pin)])), queryPins = [...new Set([...pins, ...aliases.values()])], src = await sources();
  const [{ data: rows, error: propertyError }, { data: saved }] = await Promise.all([
    admin.from("property_lookups").select("pams_pin,town,county,assessed_value,last_year_tax,last_sale_price,last_sale_year,living_sqft,history").in("pams_pin", queryPins),
    admin.from("saved_properties").select("pams_pin,watchdog_value").eq("user_id", authData.user.id).in("pams_pin", queryPins)
  ]);
  if (propertyError) return out(req, 503, { error: "Property warehouse unavailable" });
  const byPin = new Map((rows || []).map(row => [String(row.pams_pin), row])), savedByPin = new Map((saved || []).map(row => [String(row.pams_pin), row.watchdog_value]));
  const markers = {}, meta = {}, inserts = [], now = new Date().toISOString(), today = now.slice(0, 10);
  let scored = 0;
  for (const requestedPin of pins) {
    const canonical = aliases.get(requestedPin) || requestedPin, row = byPin.get(requestedPin) || byPin.get(canonical);
    markers[requestedPin] = {}; meta[requestedPin] = {};
    if (!row) continue;
    row.pams_pin = canonical;
    const stored = savedByPin.get(requestedPin) ?? savedByPin.get(canonical) ?? null, wd = robustScore(row, src, stored), uniformity = uniFor(src.uniformity, canonical), revaluation = revalRadar(row, src), tax = taxSeries(src.tax, row.town, row.county), pressure = tax ? taxPressure(tax.series) : null, market = marketValue(row, src, stored);
    if (market?.v) {
      markers[requestedPin]["watchdog.market_value_estimate"] = Math.round(market.v);
      meta[requestedPin]["watchdog.market_value_estimate"] = { status: "available", provider_kind: "canonical_intelligence", source: market.src === "verified" ? "NJ verified SR-1A sales ratio" : market.src === "published" ? "NJ published equalization ratio" : "stored comparable-sale estimate", observed_at: now, model_version: SIGNAL_MODEL };
    }
    const values = { "uniformity.score": num(uniformity?.score), "watchdog.revaluation_risk": num(revaluation?.score), "watchdog.tax_pressure": num(pressure?.score), [SCORE_ID]: num(wd?.score) };
    for (const id of OBS_IDS) {
      const value = values[id], isScore = id === SCORE_ID, modelVersion = isScore ? SCORE_MODEL : SIGNAL_MODEL;
      if (value == null) { meta[requestedPin][id] = { status: "not_computed", provider_kind: isScore ? "canonical_watchdog_score" : "canonical_signal", framework: isScore ? "ROBUST" : null, model_version: modelVersion }; continue; }
      markers[requestedPin][id] = value;
      let inputs = { canonical_pams_pin: canonical, town: row.town, county: row.county };
      if (id === "uniformity.score") inputs = { ...inputs, coefficient: num(uniformity?.coefficient), source_year: uniformity?.latest_year ?? null, volatility: num(uniformity?.volatility), sales: num(uniformity?.sales) };
      if (id === "watchdog.revaluation_risk") inputs = { ...inputs, ...revaluation };
      if (id === "watchdog.tax_pressure") inputs = { ...inputs, ...pressure, tax_rate_key: tax?.key ?? null };
      if (isScore) inputs = { ...inputs, framework: "ROBUST", components: wd?.detail, coverage_weight: wd?.coverage, confidence: wd?.confidence, verdict: wd?.verdict, market: wd?.market, chapter123: wd?.chapter };
      meta[requestedPin][id] = { status: "available", provider_kind: isScore ? "canonical_watchdog_score" : "canonical_signal", source: isScore ? "Watchdog Score powered by the ROBUST Framework" : "Watchdog governed signal engine", framework: isScore ? "ROBUST" : null, model_version: modelVersion, evidence_coverage: isScore ? wd?.coverage ?? null : 100, confidence: isScore ? wd?.confidence ?? null : "high", observed_at: now };
      inserts.push({ user_id: authData.user.id, pams_pin: requestedPin, marker_id: id, score: value, observed_on: today, observed_at: now, model_version: modelVersion, evidence_coverage: isScore ? wd?.coverage ?? 0 : 100, inputs, formula: isScore ? "ROBUST-v1: Recourse 10 + Overassessment Position 20 + Burden 30 + Uniformity 15 + Stability 15 + Trajectory 10. Missing dimensions are omitted and remaining weights are renormalized; evidence coverage is reported separately. Trajectory requires a defensible sale signal." : id === "watchdog.revaluation_risk" ? "Revaluation pressure from published ratio level, verified SR-1A ratio decay and coefficient of deviation." : id === "uniformity.score" ? "Sourced assessment-uniformity score." : "Municipal tax pressure signal." });
    }
    if (wd) scored++;
  }
  if (inserts.length) {
    await admin.from("score_observations").delete().eq("user_id", authData.user.id).eq("observed_on", today).in("pams_pin", pins).in("marker_id", OBS_IDS);
    const { error } = await admin.from("score_observations").insert(inserts);
    if (error) return out(req, 503, { error: "ROBUST scores calculated but could not be recorded", code: "SCORE_WRITE_FAILED" });
  }
  return out(req, 200, { markers, meta, summary: { requested: pins.length, scored, observations_written: inserts.length }, framework: "ROBUST", model_version: SCORE_MODEL, signal_model_version: SIGNAL_MODEL, legacy_alias: "retired", checked_at: now });
});
