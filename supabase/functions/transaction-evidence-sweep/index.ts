import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

type Row = Record<string, any>;

const RANK: Record<string, number> = { standard: 0, agent: 1, pro: 2, pro_plus: 3, teams: 4, developer: 5 };
const ORIGINS = new Set([
  "https://watchdogindex.com",
  "https://www.watchdogindex.com",
  "https://njpropertytaxrelief.com",
  "https://www.njpropertytaxrelief.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

const CAMDEN_RECORDS_PAGE = "https://www.camdencounty.com/service/county-clerk/online-property-records/";
const CAMDEN_SEARCH = "https://camden.newvisionsystems.com/SearchAnywhere/";
const NJ_COURTS_JUDGMENT_GUIDE = "https://www.njcourts.gov/sites/default/files/attorneys/ecourts/civil-judgement-order-docket.pdf";
const LINDENWOLD_CODE = "https://www.lindenwoldnj.gov/328/Code-Enforcement-Housing";
const LINDENWOLD_CO_APP = "https://www.lindenwoldnj.gov/code-enforcement-housing/files/residential-property-sales-inspection-application-cco-certificate";
const LINDENWOLD_FIRE_REQ = "https://www.lindenwoldnj.gov/code-enforcement-housing/files/residential-resale-requirements-one-two-famil-y-dwellings-certificate";

const LINDENWOLD_CO_REQUIREMENTS = [
  "Apply for the Borough resale/occupancy inspection before settlement.",
  "No unresolved building or zoning permits may remain before the Borough issues approval.",
  "Work that required a construction or zoning permit must have the required permits and inspections.",
  "No unsafe structure or unsafe condition may remain unresolved.",
  "Smoke alarms are required on each level and outside separated sleeping areas.",
  "Carbon-monoxide alarms must be installed within 10 feet of sleeping areas.",
  "A compliant fire extinguisher must be mounted near the kitchen and have current proof/tagging.",
  "Street address numbers must be at least 4 inches and visible from the street.",
  "Handrails are required where the Borough checklist calls for them, including stairs with 3 or more risers.",
  "Guardrails are required for elevated porches/decks where applicable.",
  "GFCI protection is required near water sources and the electrical panel must be safely maintained.",
  "Ceilings, walls and floors must not have unsafe holes, severe cracking, water damage or deteriorated paint conditions.",
  "Entry doors must use appropriate key locks and doors/windows/screens must operate properly.",
  "Heating must operate and required appliances must be working; ranges require anti-tip protection.",
  "Plumbing hot/cold water must operate and toilets must flush.",
  "Water-heater relief discharge must terminate between 2 and 6 inches above the floor/ground as required by the Borough checklist.",
  "Grounds must be free of unresolved code/ordinance violations, hazardous conditions, debris and rubbish.",
  "Bathrooms must have a window or working exhaust ventilation.",
  "Utilities must be on for the inspection.",
  "Exterior conditions, roof leakage, exposed/bare electrical wiring and similar visible hazards must be corrected.",
];

const LINDENWOLD_CO_FEES = [
  { label: "10 or more business days", amount: "$75 per unit" },
  { label: "4 to 10 business days", amount: "$100 per unit" },
  { label: "Reinspection", amount: "$50 per unit" },
];

const LINDENWOLD_FIRE_REQUIREMENTS = [
  "Request the one- or two-family resale fire inspection through the Lindenwold Fire District process.",
  "The Fire District recommends submitting the request 3 to 4 weeks before settlement.",
  "Smoke and carbon-monoxide devices must comply with the resale inspection requirements.",
  "Payment is due at inspection by check or money order; no cash.",
];

const clean = (v: unknown, n = 1000) => String(v ?? "").replace(/[<>]/g, "").trim().slice(0, n);
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return respond(req, 405, { error: "POST required" });

  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return respond(req, 401, { error: "Sign in required" });
  const url = Deno.env.get("SUPABASE_URL") || "";
  const publishable = env("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const secret = env("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !publishable || !secret) return respond(req, 503, { error: "Evidence sweep configuration incomplete" });

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

  const sourceSweep = await invoke(url, "transaction-source-sweep", auth, publishable, { transaction_ids: transactionIds });

  const { data: transactions, error: txError } = await admin.from("transaction_workspaces").select("id,user_id,address,county,municipality,pams_pin,block,lot").eq("user_id", user.id).in("id", transactionIds);
  if (txError) return respond(req, 503, { error: "Transactions could not be loaded" });
  const ids = (transactions || []).map((t: Row) => t.id);
  const { data: items, error: itemError } = await admin.from("transaction_items").select("*").eq("user_id", user.id).in("transaction_id", ids);
  if (itemError) return respond(req, 503, { error: "Transaction evidence could not be loaded" });

  const byTx = new Map<string, Map<string, Row>>();
  for (const item of items || []) {
    if (!byTx.has(item.transaction_id)) byTx.set(item.transaction_id, new Map());
    byTx.get(item.transaction_id)!.set(item.item_key, item);
  }

  const now = new Date().toISOString();
  const summaries: Row[] = [];

  for (const tx of transactions || []) {
    const map = byTx.get(tx.id) || new Map<string, Row>();
    const county = clean(tx.county, 80).toUpperCase();
    const municipality = clean(tx.municipality, 140).toUpperCase();

    const patch = async (key: string, values: Row) => {
      const item = map.get(key);
      if (!item) return;
      const result = await admin.from("transaction_items").update({ ...values, updated_at: now }).eq("id", item.id).eq("user_id", user.id).select("*").single();
      if (!result.error && result.data) map.set(key, result.data);
    };

    const deed = map.get("deed_recording_reference");
    if (deed) {
      const payload = safeObj(deed.payload);
      const evidence = {
        book: clean(payload.deed_book, 120) || null,
        page: clean(payload.deed_page, 120) || null,
        deed_date: clean(payload.deed_date, 120) || null,
        pams_pin: clean(tx.pams_pin, 100) || null,
        block: clean(tx.block, 60) || null,
        lot: clean(tx.lot, 60) || null,
      };
      await patch("deed_recording_reference", {
        payload: {
          ...payload,
          evidence_kind: "state_parcel_deed_reference",
          evidence,
          official_record_source: county === "CAMDEN" ? { label: "Camden County Clerk Property Records", url: CAMDEN_SEARCH, access: "free_basic_for_deeds" } : null,
          result_contract: "Show the deed reference Watchdog actually retrieved; county image/detail remains the recording authority.",
        },
      });
    }

    if (county === "CAMDEN") {
      const searchContract = {
        search_state: "not_run",
        can_report_none: false,
        reason: "Camden County places Lis Pendens and federal/municipal/construction lien records in Premium access. Watchdog has no authorized automated Premium provider configured yet.",
        official_sources: [
          { label: "Camden County Clerk Online Property Records", url: CAMDEN_RECORDS_PAGE, access: "official_information" },
          { label: "Camden County Clerk Public Search", url: CAMDEN_SEARCH, access: "free_basic_deeds_mortgages_discharges_cancellations" },
          { label: "NJ Courts Civil Judgment / Order Docket", url: NJ_COURTS_JUDGMENT_GUIDE, access: "public_name_search_requires_human_verification" },
        ],
        result_semantics: "Do not say none unless an authoritative search actually completed for the relevant record family and identity/parcel.",
      };

      await patch("judgment_lien_search", {
        title: "Judgments & recorded liens",
        evidence_state: "verify",
        severity: "review",
        source_type: "official_search_required",
        source_label: "Camden County Clerk + NJ Courts",
        source_url: CAMDEN_RECORDS_PAGE,
        source_checked_at: null,
        description: "Official sources are identified, but Watchdog has not completed an authoritative judgment/lien search for this transaction. A clean result cannot be reported until the required county/court searches run.",
        payload: { ...safeObj(map.get("judgment_lien_search")?.payload), ...searchContract, record_family: "judgments_and_liens", records: [] },
      });

      await patch("lis_pendens_title_exceptions", {
        title: "Lis pendens / title filings",
        evidence_state: "verify",
        severity: "review",
        source_type: "official_search_required",
        source_label: "Camden County Clerk Premium Property Records",
        source_url: CAMDEN_RECORDS_PAGE,
        source_checked_at: null,
        description: "Camden County identifies Lis Pendens as a Premium-record family. Watchdog has not completed that Premium search, so it cannot report either a filing or 'none found' yet.",
        payload: { ...safeObj(map.get("lis_pendens_title_exceptions")?.payload), ...searchContract, record_family: "lis_pendens", records: [] },
      });
    }

    if (municipality === "LINDENWOLD BORO") {
      await patch("resale_cco", {
        title: "Certificate of Occupancy (CO)",
        evidence_state: "verify",
        severity: "review",
        source_type: "official_requirement",
        source_label: "Borough of Lindenwold Code Enforcement / Housing",
        source_url: LINDENWOLD_CO_APP,
        source_checked_at: now,
        description: "Lindenwold requires a resale occupancy inspection before transfer/settlement. Watchdog now shows the Borough's concrete inspection requirements and application instead of only linking the department page.",
        payload: {
          ...safeObj(map.get("resale_cco")?.payload),
          requirement_observed: "resale_certificate_of_occupancy",
          official_form_name: "Continued Certification of Occupancy (CCO)",
          display_name: "Certificate of Occupancy (CO)",
          application_url: LINDENWOLD_CO_APP,
          department_url: LINDENWOLD_CODE,
          requirements: LINDENWOLD_CO_REQUIREMENTS,
          fees: LINDENWOLD_CO_FEES,
          source_state: "official_requirements_retrieved",
          clearance_state: "not_determined",
        },
      });

      await patch("smoke_fire_cert", {
        title: "Smoke / CO / fire certificate",
        evidence_state: "verify",
        severity: "review",
        source_type: "official_requirement",
        source_label: "Lindenwold Fire District No. 1",
        source_url: LINDENWOLD_FIRE_REQ,
        source_checked_at: now,
        description: "Lindenwold publishes a separate residential resale smoke/carbon-monoxide compliance process. Requirements and current fee timing are attached to this transaction item.",
        payload: {
          ...safeObj(map.get("smoke_fire_cert")?.payload),
          requirements: LINDENWOLD_FIRE_REQUIREMENTS,
          fees: [
            { label: "8+ calendar days before settlement", amount: "$45" },
            { label: "7 calendar days before settlement", amount: "$90" },
            { label: "3 calendar days or less before settlement", amount: "$161" },
            { label: "Reinspection", amount: "$50" },
          ],
          source_state: "official_requirements_retrieved",
          clearance_state: "not_determined",
        },
      });
    }

    await admin.from("transaction_activity").insert({
      transaction_id: tx.id,
      user_id: user.id,
      action: "evidence_sweep",
      message: `Concrete evidence/result layer refreshed for ${clean(tx.address, 240) || "property"}`,
      detail: {
        county,
        municipality,
        camden_restricted_record_search: county === "CAMDEN",
        lindenwold_co_requirements: municipality === "LINDENWOLD BORO",
      },
    });

    summaries.push({ transaction_id: tx.id, county, municipality, evidence_enriched: true });
  }

  return respond(req, 200, {
    checked_at: now,
    count: summaries.length,
    source_sweep_ok: sourceSweep.ok,
    source_sweep_status: sourceSweep.status,
    transactions: summaries,
  });
});
