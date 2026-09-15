import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const ORIGINS = new Set([
  "https://watchdogindex.com",
  "https://www.watchdogindex.com",
  "https://njpropertytaxrelief.com",
  "https://www.njpropertytaxrelief.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);
const RANK: Record<string, number> = { standard: 0, agent: 1, pro: 2, pro_plus: 3, teams: 4, developer: 5 };
const MARKERS = ["property.owner_name", "property.deed_book", "property.deed_page", "property.deed_date", "preflight.open_permit_count"];
const COVERAGE_GAP_KEYS = ["judgment_lien_search", "lis_pendens_title_exceptions", "property_tax_status", "tax_sale_delinquency", "water_sewer", "municipal_lien_clearance", "open_violations"];
const DIRECT_KEYS = ["ownership_vesting", "deed_recording_reference", "permit_certificate_lifecycle"];

const clean = (v: unknown, n = 1000) => String(v ?? "").replace(/[<>]/g, "").trim().slice(0, n);
const safeObj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, any> : {});
const env = (jsonName: string, legacyName: string) => {
  const raw = Deno.env.get(jsonName) || "";
  if (raw) {
    try { const parsed = JSON.parse(raw); if (parsed?.default) return String(parsed.default); } catch { /* noop */ }
  }
  return Deno.env.get(legacyName) || "";
};
const cors = (req: Request) => ({
  "Access-Control-Allow-Origin": ORIGINS.has(req.headers.get("origin") || "") ? (req.headers.get("origin") || "") : "https://www.watchdogindex.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});
const respond = (req: Request, status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "private, no-store" },
});

function metaFor(payload: any, pin: string, marker: string) {
  return safeObj(payload?.meta?.[pin]?.[marker]);
}
function markerValue(payload: any, pin: string, marker: string) {
  return payload?.markers?.[pin]?.[marker];
}
function checkedAt(meta: Record<string, any>, fallback: string) {
  return clean(meta.observed_at || meta.checked_at || fallback, 80) || fallback;
}
function sourceLabel(meta: Record<string, any>, fallback: string) {
  return clean(meta.source || meta.source_label || fallback, 240) || fallback;
}
function unavailable(status: string) {
  return ["provider_missing", "provider_error", "dependency_missing", "not_entitled", "not_computed"].includes(status);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return respond(req, 405, { error: "POST required" });

  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return respond(req, 401, { error: "Sign in required" });
  const url = Deno.env.get("SUPABASE_URL") || "";
  const publishable = env("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const secret = env("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !publishable || !secret) return respond(req, 503, { error: "Transaction preflight configuration incomplete" });

  const userClient = createClient(url, publishable, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData } = await userClient.auth.getUser();
  const user = authData?.user;
  if (!user) return respond(req, 401, { error: "Session invalid" });

  let body: any = {};
  try { body = await req.json(); } catch { return respond(req, 400, { error: "Invalid JSON" }); }
  const transactionIds = [...new Set((Array.isArray(body?.transaction_ids) ? body.transaction_ids : []).map((v: unknown) => clean(v, 80)).filter(Boolean))].slice(0, 50);
  if (!transactionIds.length) return respond(req, 400, { error: "transaction_ids required" });

  const [{ data: entitlement }, { data: profile }] = await Promise.all([
    admin.from("account_entitlements").select("plan_tier").eq("user_id", user.id).maybeSingle(),
    admin.from("profiles").select("account_role").eq("id", user.id).maybeSingle(),
  ]);
  const plan = String(profile?.account_role || "") === "developer" ? "developer" : String(entitlement?.plan_tier || "standard");
  if ((RANK[plan] ?? 0) < RANK.pro_plus) return respond(req, 403, { error: "Pro+ plan required", minimum_plan: "pro_plus" });

  const { data: txRows, error: txError } = await admin.from("transaction_workspaces").select("*").eq("user_id", user.id).in("id", transactionIds);
  if (txError) return respond(req, 503, { error: "Transactions could not be loaded" });
  const transactions = txRows || [];
  if (!transactions.length) return respond(req, 404, { error: "No matching transactions" });

  const ids = transactions.map((t: any) => t.id);
  const { data: itemRows, error: itemError } = await admin.from("transaction_items").select("id,transaction_id,item_key,evidence_state,source_type,state").eq("user_id", user.id).in("transaction_id", ids);
  if (itemError) return respond(req, 503, { error: "Transaction checklist could not be loaded" });
  const itemsByTx = new Map<string, Map<string, any>>();
  for (const item of itemRows || []) {
    if (!itemsByTx.has(item.transaction_id)) itemsByTx.set(item.transaction_id, new Map());
    itemsByTx.get(item.transaction_id)!.set(item.item_key, item);
  }

  const matched = transactions.filter((t: any) => clean(t.pams_pin));
  const pins = [...new Set(matched.map((t: any) => clean(t.pams_pin)).filter(Boolean))];
  let hydrated: any = { markers: {}, meta: {} };
  let closing: any = { findings: [] };
  let hydrateError: string | null = null;
  let closingError: string | null = null;

  if (pins.length) {
    const [hydrateResponse, closingResponse] = await Promise.all([
      fetch(`${url}/functions/v1/workbench-hydrate`, {
        method: "POST",
        headers: { Authorization: auth, apikey: publishable, "Content-Type": "application/json" },
        body: JSON.stringify({ pams_pins: pins, marker_ids: MARKERS }),
      }),
      fetch(`${url}/functions/v1/intelligence-closing-run-preview`, {
        method: "POST",
        headers: { Authorization: auth, apikey: publishable, "Content-Type": "application/json" },
        body: JSON.stringify({ scope_type: pins.length === 1 ? "property" : "custom", scope_value: { source: "transaction_auto_preflight", transaction_ids: ids }, pams_pins: pins, limit: Math.max(10, pins.length) }),
      }),
    ]);
    hydrated = await hydrateResponse.json().catch(() => ({}));
    closing = await closingResponse.json().catch(() => ({}));
    if (!hydrateResponse.ok) hydrateError = clean(hydrated?.error || `Hydration HTTP ${hydrateResponse.status}`, 300);
    if (!closingResponse.ok) closingError = clean(closing?.error || `Closing Review HTTP ${closingResponse.status}`, 300);
  }

  const findings = Array.isArray(closing?.findings) ? closing.findings : Array.isArray(closing?.results) ? closing.results : [];
  const findingByPin = new Map<string, any>();
  for (const finding of findings) if (finding?.pams_pin && !findingByPin.has(String(finding.pams_pin))) findingByPin.set(String(finding.pams_pin), finding);

  const now = new Date().toISOString();
  const summaries: any[] = [];

  for (const tx of transactions) {
    const pin = clean(tx.pams_pin);
    const itemMap = itemsByTx.get(tx.id) || new Map<string, any>();
    const updates: Promise<any>[] = [];

    const updateItem = (key: string, patch: Record<string, any>) => {
      const item = itemMap.get(key);
      if (!item) return;
      updates.push(admin.from("transaction_items").update({ ...patch, updated_at: now }).eq("id", item.id).eq("user_id", user.id));
    };

    if (!pin) {
      updates.push(admin.from("transaction_items").update({
        evidence_state: "provider_missing",
        severity: "review",
        source_type: "parcel_match",
        source_label: "NJ parcel match",
        source_checked_at: now,
        description: "Watchdog could not verify a New Jersey parcel key for this address, so automated public-record checks did not run. Review the address and verify this item manually.",
        updated_at: now,
      }).eq("transaction_id", tx.id).eq("user_id", user.id).in("item_key", [...DIRECT_KEYS, ...COVERAGE_GAP_KEYS]).eq("evidence_state", "unknown"));
      await Promise.all(updates);
      await admin.from("transaction_activity").insert({ transaction_id: tx.id, user_id: user.id, action: "auto_preflight", message: "Automatic transaction preflight needs a parcel match", detail: { parcel_matched: false } });
      summaries.push({ transaction_id: tx.id, pams_pin: null, status: "parcel_match_needed" });
      continue;
    }

    const ownerMeta = metaFor(hydrated, pin, "property.owner_name");
    const ownerStatus = clean(ownerMeta.status, 80);
    const owner = clean(markerValue(hydrated, pin, "property.owner_name"), 240);
    if (hydrateError) {
      updateItem("ownership_vesting", { evidence_state: "provider_missing", severity: "review", source_type: "public_record", source_label: "Watchdog property source", source_checked_at: now, description: `Owner-on-record evidence could not be refreshed automatically. ${hydrateError}` });
    } else if (ownerStatus === "available" && owner) {
      updateItem("ownership_vesting", { evidence_state: "verify", severity: "review", source_type: "public_record", source_label: sourceLabel(ownerMeta, "NJ parcel / MOD-IV baseline"), source_checked_at: checkedAt(ownerMeta, now), source_url: ownerMeta.source_url || null, description: `Public property records currently show “${owner}” as the owner name on record. Compare this with the contract parties and title commitment; Watchdog is not making a title or vesting determination.`, payload: { owner_name: owner, provider_status: ownerStatus } });
    } else if (unavailable(ownerStatus)) {
      updateItem("ownership_vesting", { evidence_state: "provider_missing", severity: "review", source_type: "public_record", source_label: sourceLabel(ownerMeta, "NJ parcel / MOD-IV baseline"), source_checked_at: checkedAt(ownerMeta, now), description: clean(ownerMeta.reason, 500) || "Owner-on-record evidence is unavailable from the checked provider. Verify ownership and vesting through title." });
    } else {
      updateItem("ownership_vesting", { evidence_state: "verify", severity: "review", source_type: "public_record", source_label: sourceLabel(ownerMeta, "NJ parcel / MOD-IV baseline"), source_checked_at: checkedAt(ownerMeta, now), description: "The checked public-record source did not return a usable owner name. Verify ownership and vesting through title." });
    }

    const deedMarkers = ["property.deed_book", "property.deed_page", "property.deed_date"];
    const deed = Object.fromEntries(deedMarkers.map((m) => [m, markerValue(hydrated, pin, m)]));
    const deedMeta = Object.fromEntries(deedMarkers.map((m) => [m, metaFor(hydrated, pin, m)]));
    const deedBook = clean(deed["property.deed_book"], 120);
    const deedPage = clean(deed["property.deed_page"], 120);
    const deedDate = clean(deed["property.deed_date"], 120);
    const deedStatuses = deedMarkers.map((m) => clean(deedMeta[m]?.status, 80));
    const deedSource = deedMarkers.map((m) => sourceLabel(deedMeta[m], "")).find(Boolean) || "NJ MOD-IV / parcel baseline";
    const deedChecked = deedMarkers.map((m) => checkedAt(deedMeta[m], "")).find(Boolean) || now;
    if (hydrateError) {
      updateItem("deed_recording_reference", { evidence_state: "provider_missing", severity: "review", source_type: "public_record", source_label: "Watchdog property source", source_checked_at: now, description: `Deed/recording-reference evidence could not be refreshed automatically. ${hydrateError}` });
    } else if (deedBook && deedPage) {
      updateItem("deed_recording_reference", { evidence_state: "clear_observed", severity: "info", source_type: "public_record", source_label: deedSource, source_checked_at: deedChecked, description: `The checked property baseline includes deed recording references: Book ${deedBook}, Page ${deedPage}${deedDate ? `, recorded ${deedDate}` : ""}. No missing recording-reference issue was observed in this source; title/county records remain authoritative.`, payload: { deed_book: deedBook, deed_page: deedPage, deed_date: deedDate || null, provider_statuses: deedStatuses } });
    } else if (deedBook || deedPage || deedDate || deedStatuses.includes("available") || deedStatuses.includes("source_checked_no_value")) {
      updateItem("deed_recording_reference", { evidence_state: "verify", severity: "attention", source_type: "public_record", source_label: deedSource, source_checked_at: deedChecked, description: `The checked property baseline has incomplete deed/recording-reference fields${deedBook ? ` (Book ${deedBook})` : ""}${deedPage ? ` (Page ${deedPage})` : ""}${deedDate ? ` (Date ${deedDate})` : ""}. Verify the recording reference with title or the county clerk.`, payload: { deed_book: deedBook || null, deed_page: deedPage || null, deed_date: deedDate || null, provider_statuses: deedStatuses } });
    } else {
      updateItem("deed_recording_reference", { evidence_state: "provider_missing", severity: "review", source_type: "public_record", source_label: deedSource, source_checked_at: deedChecked, description: "Watchdog could not obtain a usable deed/recording reference from the checked source. Verify with title or the county clerk." });
    }

    const permitMeta = metaFor(hydrated, pin, "preflight.open_permit_count");
    const permitStatus = clean(permitMeta.status, 80);
    const permitValueRaw = markerValue(hydrated, pin, "preflight.open_permit_count");
    const permitCandidates = Number.isFinite(Number(permitValueRaw)) ? Number(permitValueRaw) : null;
    const lifecycle = safeObj(permitMeta.lifecycle);
    const unmatchableIssued = Number(lifecycle.unmatchableIssued || 0);
    if (hydrateError) {
      updateItem("permit_certificate_lifecycle", { evidence_state: "provider_missing", severity: "review", source_type: "public_record", source_label: "NJ DCA Construction Permit Data", source_checked_at: now, description: `Permit/certificate evidence could not be refreshed automatically. ${hydrateError}` });
    } else if (permitStatus === "available" && permitCandidates !== null) {
      if (permitCandidates > 0 || unmatchableIssued > 0) {
        updateItem("permit_certificate_lifecycle", { evidence_state: "verify", severity: "attention", source_type: "public_record", source_label: sourceLabel(permitMeta, "NJ DCA Construction Permit Data"), source_checked_at: checkedAt(permitMeta, now), description: `NJ DCA lifecycle screening found ${permitCandidates} permit/certificate verification candidate${permitCandidates === 1 ? "" : "s"}${unmatchableIssued ? ` plus ${unmatchableIssued} issued row${unmatchableIssued === 1 ? "" : "s"} without a matchable permit number` : ""}. Verify with the municipality. These are not legal “open permit” determinations.`, payload: { verification_candidates: permitCandidates, lifecycle, interpretation: permitMeta.interpretation || null, limitations: permitMeta.limitations || [] } });
      } else {
        updateItem("permit_certificate_lifecycle", { evidence_state: "clear_observed", severity: "info", source_type: "public_record", source_label: sourceLabel(permitMeta, "NJ DCA Construction Permit Data"), source_checked_at: checkedAt(permitMeta, now), description: "NJ DCA lifecycle rows were checked and no permit/certificate verification candidates were observed in the available feed. Municipal records remain authoritative, and DCA coverage/history limitations still apply.", payload: { verification_candidates: 0, lifecycle, interpretation: permitMeta.interpretation || null, limitations: permitMeta.limitations || [] } });
      }
    } else if (permitStatus === "source_checked_no_value") {
      updateItem("permit_certificate_lifecycle", { evidence_state: "provider_missing", severity: "review", source_type: "public_record", source_label: sourceLabel(permitMeta, "NJ DCA Construction Permit Data"), source_checked_at: checkedAt(permitMeta, now), description: clean(permitMeta.reason, 500) || "No DCA rows were returned. That is coverage information only and is not proof that no permit issue exists.", payload: { limitations: permitMeta.limitations || [] } });
    } else {
      updateItem("permit_certificate_lifecycle", { evidence_state: "provider_missing", severity: "review", source_type: "public_record", source_label: sourceLabel(permitMeta, "NJ DCA Construction Permit Data"), source_checked_at: checkedAt(permitMeta, now), description: clean(permitMeta.reason, 500) || "The NJ DCA permit provider could not supply parcel-level lifecycle evidence. Verify with the municipality." });
    }

    updates.push(admin.from("transaction_items").update({
      evidence_state: "provider_missing",
      severity: "review",
      source_type: "coverage_registry",
      source_label: "Watchdog provider coverage",
      source_checked_at: now,
      description: "No governed parcel-level Watchdog provider is currently connected for this check. Verify with the authoritative title, county, municipal or utility source; missing coverage is not a clean result.",
      updated_at: now,
    }).eq("transaction_id", tx.id).eq("user_id", user.id).in("item_key", COVERAGE_GAP_KEYS).eq("evidence_state", "unknown"));

    const finding = findingByPin.get(pin);
    const findingCount = findings.filter((f: any) => String(f?.pams_pin || "") === pin).length;
    const topScore = finding?.score == null ? null : Number(finding.score);
    const coverage = finding?.evidence_coverage == null ? null : Number(finding.evidence_coverage);
    const closingDescription = closingError
      ? `Automatic Closing Review could not complete. ${closingError} Direct source checks above remain separately recorded.`
      : finding
        ? `Automatic public-record preflight completed. Closing Review priority score ${Number.isFinite(topScore as number) ? Math.round(topScore as number) : "available"}${Number.isFinite(coverage as number) ? ` with ${Math.round(coverage as number)}% model evidence coverage` : ""}. This prioritizes follow-up; it is not title, legal, code, tax or municipal clearance.`
        : "Automatic public-record preflight completed, but no customer-facing Closing Review finding was returned. Professional title and municipal verification remains required.";

    updates.push(admin.from("transaction_items").upsert({
      transaction_id: tx.id,
      user_id: user.id,
      category: "watchdog",
      item_key: "watchdog_closing_review",
      title: "Watchdog automatic transaction preflight",
      description: closingDescription,
      evidence_state: closingError ? "provider_missing" : "verify",
      severity: "review",
      state: "open",
      assigned_role: "tc",
      source_type: "watchdog_intelligence",
      source_label: "Watchdog governed Closing Review",
      source_checked_at: now,
      payload: { pipeline_engine: closing?.pipeline_engine || null, finding_count: findingCount, top_score: topScore, evidence_coverage: coverage, closing_error: closingError, hydrate_error: hydrateError },
      sort_order: 0,
      updated_at: now,
    }, { onConflict: "transaction_id,item_key" }));

    await Promise.all(updates);
    await Promise.all([
      admin.from("transaction_workspaces").update({ last_watch_at: now, updated_at: now }).eq("id", tx.id).eq("user_id", user.id),
      admin.from("transaction_activity").insert({ transaction_id: tx.id, user_id: user.id, action: "auto_preflight", message: `Automatic Watchdog transaction preflight completed for ${clean(tx.address, 240) || "property"}`, detail: { pams_pin: pin, hydrate_ok: !hydrateError, closing_review_ok: !closingError, finding_count: findingCount } }),
    ]);

    summaries.push({ transaction_id: tx.id, pams_pin: pin, status: hydrateError && closingError ? "partial_failure" : hydrateError || closingError ? "partial" : "checked", finding_count: findingCount });
  }

  return respond(req, 200, { checked_at: now, count: summaries.length, hydrate_error: hydrateError, closing_review_error: closingError, transactions: summaries });
});
