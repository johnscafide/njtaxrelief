import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

type Row = Record<string, any>;

const RANK: Record<string, number> = { standard: 0, agent: 1, pro: 2, pro_plus: 3, teams: 4, developer: 5 };
const DCA = "https://data.nj.gov/resource/w9se-dmra.json";
const DCA_PUBLIC = "https://data.nj.gov/resource/w9se-dmra";
const NJ_PARCEL_SOURCE = "https://maps.nj.gov/arcgis/rest/services/Framework/Cadastral/MapServer/0";
const ORIGINS = new Set([
  "https://watchdogindex.com",
  "https://www.watchdogindex.com",
  "https://njpropertytaxrelief.com",
  "https://www.njpropertytaxrelief.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

const COUNTY_SOURCES: Record<string, { label: string; url: string }> = {
  CAMDEN: {
    label: "Camden County Clerk Online Property Records",
    url: "https://www.camdencounty.com/service/county-clerk/",
  },
};

const MUNICIPAL_SOURCES: Record<string, {
  tax?: { label: string; url: string };
  construction?: { label: string; url: string };
  code?: { label: string; url: string };
}> = {
  "LINDENWOLD BORO": {
    tax: { label: "Lindenwold Tax Collector", url: "https://www.lindenwoldnj.gov/165/Tax-Collectors-Office" },
    construction: { label: "Lindenwold Construction Office", url: "https://www.lindenwoldnj.gov/177/Construction-Office" },
    code: { label: "Lindenwold Code Enforcement / Housing", url: "https://www.lindenwoldnj.gov/328/Code-Enforcement-Housing" },
  },
};

const clean = (v: unknown, n = 1000) => String(v ?? "").replace(/[<>]/g, "").trim().slice(0, n);
const esc = (v: string) => v.replace(/'/g, "''");
const money = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n) : null;
};
const safeObj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? v as Row : {});
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

async function invoke(url: string, slug: string, auth: string, publishable: string, body: unknown) {
  const response = await fetch(`${url}/functions/v1/${slug}`, {
    method: "POST",
    headers: { Authorization: auth, apikey: publishable, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

function normalizePermitNumber(v: unknown) {
  return clean(v, 120).toUpperCase().replace(/[^A-Z0-9]/g, "");
}
function permitDescription(row: Row) {
  for (const key of ["descriptionofwork", "workdescription", "workdesc", "description", "worktype", "consttype", "permit_type"]) {
    const value = clean(row?.[key], 280);
    if (value) return value;
  }
  return null;
}
async function dcaPermitDetails(pin: string, baseline: Row) {
  const parts = pin.split("_");
  const district = clean(parts[0], 8).replace(/\D/g, "").slice(0, 4);
  const block = clean(baseline.block || parts[1], 50);
  const lot = clean(baseline.lot || parts[2], 50);
  if (!/^\d{4}$/.test(district) || !block || !lot) return { status: "provider_missing", candidates: [], rows: 0 };
  const query = new URLSearchParams({
    $where: `treasurycode='${esc(district)}' AND block='${esc(block)}' AND lot='${esc(lot)}'`,
    $limit: "5000",
    $order: "permitdate DESC",
  });
  try {
    const response = await fetch(`${DCA}?${query.toString()}`, { headers: { accept: "application/json" } });
    if (!response.ok) return { status: "provider_error", candidates: [], rows: 0 };
    const rows = await response.json();
    if (!Array.isArray(rows) || !rows.length) return { status: "source_checked_no_value", candidates: [], rows: 0 };
    const groups = new Map<string, Row[]>();
    for (const row of rows) {
      const key = normalizePermitNumber(row?.permitno);
      if (!key) continue;
      const group = groups.get(key) || [];
      group.push(row);
      groups.set(key, group);
    }
    const candidates: Row[] = [];
    for (const [permitNumber, group] of groups) {
      const certified = group.some((r) => clean(r?.status, 8).toUpperCase() === "C" && clean(r?.certdate, 80));
      const issued = group.filter((r) => clean(r?.status, 8).toUpperCase() === "P");
      if (certified || !issued.length) continue;
      issued.sort((a, b) => clean(b?.permitdate, 80).localeCompare(clean(a?.permitdate, 80)));
      const latest = issued[0] || {};
      candidates.push({
        permit_number: clean(latest?.permitno || permitNumber, 120),
        permit_date: clean(latest?.permitdate, 80) || null,
        certificate_date: null,
        description: permitDescription(latest),
      });
    }
    candidates.sort((a, b) => clean(b.permit_date, 80).localeCompare(clean(a.permit_date, 80)));
    return { status: "available", candidates: candidates.slice(0, 25), rows: rows.length };
  } catch {
    return { status: "provider_error", candidates: [], rows: 0 };
  }
}

async function mapLimit<T, R>(rows: T[], concurrency: number, fn: (row: T) => Promise<R>) {
  const output = new Array<R>(rows.length);
  let index = 0;
  async function worker() {
    while (true) {
      const i = index++;
      if (i >= rows.length) return;
      output[i] = await fn(rows[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length || 1) }, worker));
  return output;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return respond(req, 405, { error: "POST required" });

  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return respond(req, 401, { error: "Sign in required" });
  const url = Deno.env.get("SUPABASE_URL") || "";
  const publishable = env("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const secret = env("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !publishable || !secret) return respond(req, 503, { error: "Source sweep configuration incomplete" });

  const userClient = createClient(url, publishable, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData } = await userClient.auth.getUser();
  const user = authData?.user;
  if (!user) return respond(req, 401, { error: "Session invalid" });

  let body: Row = {};
  try { body = await req.json(); } catch { return respond(req, 400, { error: "Invalid JSON" }); }
  const transactionIds = [...new Set((Array.isArray(body.transaction_ids) ? body.transaction_ids : []).map((v: unknown) => clean(v, 80)).filter(Boolean))].slice(0, 50);
  if (!transactionIds.length) return respond(req, 400, { error: "transaction_ids required" });

  const [{ data: entitlement }, { data: profile }] = await Promise.all([
    admin.from("account_entitlements").select("plan_tier").eq("user_id", user.id).maybeSingle(),
    admin.from("profiles").select("account_role").eq("id", user.id).maybeSingle(),
  ]);
  const plan = String(profile?.account_role || "") === "developer" ? "developer" : String(entitlement?.plan_tier || "standard");
  if ((RANK[plan] ?? 0) < RANK.pro_plus) return respond(req, 403, { error: "Pro+ plan required", minimum_plan: "pro_plus" });

  // Preserve the governed scoring/checklist behavior, then enrich it with a fuller source sweep.
  const baseSweep = await invoke(url, "transaction-auto-check", auth, publishable, { transaction_ids: transactionIds });

  const { data: transactions, error: txError } = await admin.from("transaction_workspaces").select("*").eq("user_id", user.id).in("id", transactionIds);
  if (txError) return respond(req, 503, { error: "Transactions could not be loaded" });
  const txRows = transactions || [];
  const ids = txRows.map((t: Row) => t.id);
  const { data: itemRows, error: itemError } = await admin.from("transaction_items").select("id,transaction_id,item_key,title,evidence_state,state,severity,source_type,source_label,source_url,source_checked_at,description,payload").eq("user_id", user.id).in("transaction_id", ids);
  if (itemError) return respond(req, 503, { error: "Transaction checklist could not be loaded" });
  const itemMaps = new Map<string, Map<string, Row>>();
  for (const item of itemRows || []) {
    if (!itemMaps.has(item.transaction_id)) itemMaps.set(item.transaction_id, new Map());
    itemMaps.get(item.transaction_id)!.set(item.item_key, item);
  }

  const pins = [...new Set(txRows.map((t: Row) => clean(t.pams_pin, 100)).filter(Boolean))];
  let baseline: Row = { records: [] };
  let baselineError: string | null = null;
  if (pins.length) {
    const result = await invoke(url, "workbench-baseline", auth, publishable, { pams_pins: pins, source: "transaction_source_sweep" });
    baseline = result.data || { records: [] };
    if (!result.ok) baselineError = clean(result.data?.error || `Baseline HTTP ${result.status}`, 300);
  }
  const baselineByPin = new Map<string, Row>((Array.isArray(baseline.records) ? baseline.records : []).map((r: Row) => [clean(r.pams_pin, 100), r]));

  const permitResults = await mapLimit(txRows, 5, async (tx: Row) => {
    const pin = clean(tx.pams_pin, 100);
    return pin ? dcaPermitDetails(pin, baselineByPin.get(pin) || tx) : { status: "provider_missing", candidates: [], rows: 0 };
  });

  const now = new Date().toISOString();
  const summaries: Row[] = [];
  for (let index = 0; index < txRows.length; index++) {
    const tx = txRows[index];
    const pin = clean(tx.pams_pin, 100);
    const record = baselineByPin.get(pin) || {};
    const items = itemMaps.get(tx.id) || new Map<string, Row>();
    const permit = permitResults[index] || { status: "provider_missing", candidates: [], rows: 0 };

    const updateItem = async (key: string, patch: Row, onlyIf?: (item: Row) => boolean) => {
      const item = items.get(key);
      if (!item || (onlyIf && !onlyIf(item))) return;
      const next = { ...patch, updated_at: now };
      const result = await admin.from("transaction_items").update(next).eq("id", item.id).eq("user_id", user.id).select("*").single();
      if (!result.error && result.data) items.set(key, result.data);
    };

    if (pin && record && Object.keys(record).length) {
      const workspacePatch: Row = { updated_at: now };
      if (!clean(tx.block) && clean(record.block)) workspacePatch.block = clean(record.block, 60);
      if (!clean(tx.lot) && clean(record.lot)) workspacePatch.lot = clean(record.lot, 60);
      if (!clean(tx.qualifier) && clean(record.qualifier)) workspacePatch.qualifier = clean(record.qualifier, 60);
      if (!clean(tx.county) && clean(record.county)) workspacePatch.county = clean(record.county, 80);
      if (!clean(tx.municipality) && clean(record.town)) workspacePatch.municipality = clean(record.town, 120);
      if (!clean(tx.postal_code) && clean(record.zip)) workspacePatch.postal_code = clean(record.zip, 20);
      if (Object.keys(workspacePatch).length > 1) await admin.from("transaction_workspaces").update(workspacePatch).eq("id", tx.id).eq("user_id", user.id);

      const owner = clean(record.owner_name, 240);
      if (owner) {
        await updateItem("ownership_vesting", {
          evidence_state: "verify",
          severity: "review",
          source_type: "public_record",
          source_label: "NJOGIS Parcels / MOD-IV Composite",
          source_url: NJ_PARCEL_SOURCE,
          source_checked_at: baseline.checked_at || now,
          description: `NJ parcel/MOD-IV records show “${owner}” as owner name on record. Compare it with the contract and title commitment; this is not a title or vesting determination.`,
          payload: { ...(safeObj(items.get("ownership_vesting")?.payload)), owner_name: owner, pams_pin: pin, block: record.block || null, lot: record.lot || null },
        });
      }

      const deedBook = clean(record.deed_book, 120);
      const deedPage = clean(record.deed_page, 120);
      const deedDate = clean(record.deed_date, 120);
      if (deedBook && deedPage) {
        await updateItem("deed_recording_reference", {
          evidence_state: "clear_observed",
          severity: "info",
          source_type: "public_record",
          source_label: "NJOGIS Parcels / MOD-IV Composite",
          source_url: NJ_PARCEL_SOURCE,
          source_checked_at: baseline.checked_at || now,
          description: `State parcel records include deed reference Book ${deedBook}, Page ${deedPage}${deedDate ? `, date ${deedDate}` : ""}. No missing reference was observed in this source; county/title records remain authoritative.`,
          payload: { ...(safeObj(items.get("deed_recording_reference")?.payload)), deed_book: deedBook, deed_page: deedPage, deed_date: deedDate || null },
        });
      }
    }

    const permitItem = items.get("permit_certificate_lifecycle");
    if (permitItem) {
      const existingPayload = safeObj(permitItem.payload);
      if (permit.status === "available" && permit.candidates.length) {
        const details = permit.candidates.slice(0, 3).map((r: Row) => `${r.permit_number || "Permit"}${r.permit_date ? ` (${String(r.permit_date).slice(0, 10)})` : ""}`).join(", ");
        await updateItem("permit_certificate_lifecycle", {
          evidence_state: "verify",
          severity: "attention",
          source_type: "public_record",
          source_label: "NJ DCA Construction Permit Data",
          source_url: DCA_PUBLIC,
          source_checked_at: now,
          description: `NJ DCA returned ${permit.candidates.length} permit/certificate verification candidate${permit.candidates.length === 1 ? "" : "s"}: ${details}. Verify final closure with the municipality; these are not legal “open permit” determinations.`,
          payload: { ...existingPayload, dca_rows: permit.rows, candidate_records: permit.candidates, verification_candidates: permit.candidates.length },
        });
      } else if (permit.status === "source_checked_no_value") {
        await updateItem("permit_certificate_lifecycle", {
          evidence_state: "verify",
          severity: "review",
          source_type: "public_record",
          source_label: "NJ DCA Construction Permit Data",
          source_url: DCA_PUBLIC,
          source_checked_at: now,
          description: "The NJ DCA source was checked and returned no parcel rows. Because DCA coverage is not a municipal clearance, verify permits/certificates with the local construction office.",
          payload: { ...existingPayload, dca_rows: 0, candidate_records: [] },
        });
      }
    }

    const county = clean(record.county || tx.county, 80).toUpperCase();
    const countySource = COUNTY_SOURCES[county];
    if (countySource) {
      const countyDescription = `${countySource.label} is the official recording authority for deeds, mortgages and recorded filings. Watchdog has not enabled automated parcel-level lien/lis-pendens classification for this county yet, so use the official record search or title provider for verification.`;
      for (const key of ["judgment_lien_search", "lis_pendens_title_exceptions"]) {
        await updateItem(key, {
          evidence_state: "verify",
          severity: "review",
          source_type: "official_manual",
          source_label: countySource.label,
          source_url: countySource.url,
          source_checked_at: now,
          description: countyDescription,
          payload: { county, automation_state: "official_source_manual_verification", pams_pin: pin },
        }, (item) => !["issue_observed", "clear_observed"].includes(clean(item.evidence_state, 40)));
      }
    }

    const municipality = clean(record.town || tx.municipality, 140).toUpperCase();
    const muni = MUNICIPAL_SOURCES[municipality];
    if (muni?.tax) {
      const priorTax = money(record.last_year_tax);
      await updateItem("property_tax_status", {
        evidence_state: "verify",
        severity: "review",
        source_type: "official_manual",
        source_label: muni.tax.label,
        source_url: muni.tax.url,
        source_checked_at: now,
        description: `${priorTax ? `Watchdog’s parcel baseline shows prior-year tax of ${priorTax}. ` : ""}Current payment status must be verified with the municipal Tax Collector; the baseline tax amount is not proof the account is current.`,
        payload: { prior_year_tax: record.last_year_tax ?? null, municipality, automation_state: "official_source_manual_verification" },
      });
      await updateItem("tax_sale_delinquency", {
        evidence_state: "verify",
        severity: "review",
        source_type: "official_manual",
        source_label: muni.tax.label,
        source_url: muni.tax.url,
        source_checked_at: now,
        description: "The municipality’s official Tax Collector source is available for tax-sale/delinquency verification. Watchdog does not treat absence of an automated feed as a clean result.",
        payload: { municipality, automation_state: "official_source_manual_verification" },
      });
      await updateItem("water_sewer", {
        evidence_state: "verify",
        severity: "review",
        source_type: "official_manual",
        source_label: muni.tax.label,
        source_url: muni.tax.url,
        source_checked_at: now,
        description: "The official Lindenwold Tax Collector page covers tax and sewer billing. Verify the current sewer/utility balance and any final-reading requirement with the municipality.",
        payload: { municipality, automation_state: "official_source_manual_verification" },
      });
    }
    if (muni?.code) {
      await updateItem("resale_cco", {
        evidence_state: "verify",
        severity: "review",
        source_type: "official_manual",
        source_label: muni.code.label,
        source_url: muni.code.url,
        source_checked_at: now,
        description: "Lindenwold’s official Code Enforcement page states that property sales require a C/O inspection. Track the application, inspection, reinspection and final approval here.",
        payload: { municipality, requirement_observed: "sale_co_inspection", automation_state: "official_source_requirement" },
      });
      await updateItem("smoke_fire_cert", {
        evidence_state: "verify",
        severity: "review",
        source_type: "official_manual",
        source_label: muni.code.label,
        source_url: muni.code.url,
        source_checked_at: now,
        description: "Lindenwold’s sale inspection includes smoke detectors, carbon-monoxide detectors, fire extinguisher and house-number requirements. Verify completion with Code Enforcement.",
        payload: { municipality, automation_state: "official_source_requirement" },
      });
      await updateItem("open_violations", {
        evidence_state: "verify",
        severity: "review",
        source_type: "official_manual",
        source_label: muni.code.label,
        source_url: muni.code.url,
        source_checked_at: now,
        description: "The official municipal Code Enforcement source is available, but no governed parcel-level violation feed is connected. Verify unresolved violations directly with the Borough.",
        payload: { municipality, automation_state: "official_source_manual_verification" },
      }, (item) => clean(item.evidence_state, 40) !== "issue_observed");
    }
    if (muni?.construction && permitItem) {
      const current = items.get("permit_certificate_lifecycle") || permitItem;
      await updateItem("permit_certificate_lifecycle", {
        source_url: DCA_PUBLIC,
        payload: { ...(safeObj(current.payload)), municipal_verification: { label: muni.construction.label, url: muni.construction.url } },
      });
    }

    await admin.from("transaction_activity").insert({
      transaction_id: tx.id,
      user_id: user.id,
      action: "source_sweep",
      message: `Watchdog source sweep refreshed for ${clean(tx.address, 240) || "property"}`,
      detail: {
        pams_pin: pin || null,
        baseline_ok: !baselineError,
        baseline_source: baseline.source || null,
        county_source: countySource?.label || null,
        municipal_sources: muni ? Object.values(muni).map((v: any) => v?.label).filter(Boolean) : [],
        dca_status: permit.status,
        dca_candidates: permit.candidates.length,
      },
    });

    summaries.push({
      transaction_id: tx.id,
      pams_pin: pin || null,
      baseline_resolved: !!Object.keys(record).length,
      owner_found: !!clean(record.owner_name, 240),
      block: clean(record.block || tx.block, 60) || null,
      lot: clean(record.lot || tx.lot, 60) || null,
      permit_status: permit.status,
      permit_candidates: permit.candidates.length,
      county_source: countySource?.label || null,
      municipal_source_count: muni ? Object.keys(muni).length : 0,
    });
  }

  return respond(req, 200, {
    checked_at: now,
    count: summaries.length,
    base_preflight_ok: baseSweep.ok,
    base_preflight_status: baseSweep.status,
    baseline_error: baselineError,
    transactions: summaries,
  });
});
