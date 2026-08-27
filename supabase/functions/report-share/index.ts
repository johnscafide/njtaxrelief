import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const DEFAULT_SITE = "https://njpropertytaxrelief.com";
const PRODUCTION_HOSTS = new Set([
  "njpropertytaxrelief.com",
  "www.njpropertytaxrelief.com",
  "watchdogindex.com",
  "www.watchdogindex.com"
]);
const ROBUST_SCORE_ID = "watchdog.watchdog_score";
const ROBUST_MODEL = "ROBUST-v1";
const CHAPTER123_SOURCE_ID = "nj-chapter123-2026";
const CHAPTER123_PROVIDER_VERSION = "chapter123-provider-v3";
const MODIV_SOURCE_ID = "treasury-modiv-2026";
const MODIV_SNAPSHOT_URL = "https://njpropertytaxrelief.com/property/data/statewide-intelligence.json";
const HOMEOWNER_CALC_VERSION = "njw62_homeowner_tax_position_v1";

function allowedOrigin(req: Request) {
  const origin = req.headers.get("origin") || "";
  try {
    const host = new URL(origin).hostname.toLowerCase();
    if (
      PRODUCTION_HOSTS.has(host) ||
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".vercel.app")
    ) return origin;
  } catch (_) {}
  return DEFAULT_SITE;
}

function requestSite(req: Request) {
  const origin = req.headers.get("origin") || "";
  try {
    const url = new URL(origin);
    if (url.protocol === "https:" && PRODUCTION_HOSTS.has(url.hostname.toLowerCase())) {
      return `${url.protocol}//${url.host}`;
    }
  } catch (_) {}
  return String(Deno.env.get("PUBLIC_SITE_URL") || DEFAULT_SITE).replace(/\/$/, "");
}

function cors(req: Request, contentType = "application/json") {
  return {
    "access-control-allow-origin": allowedOrigin(req),
    "access-control-allow-headers": "authorization, apikey, content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "content-type": contentType,
    "cache-control": "no-store",
    "vary": "Origin"
  };
}

const enc = new TextEncoder();

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors(req) });
}

async function hash(value: string) {
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(value));
  return Array.from(new Uint8Array(raw)).map(x => x.toString(16).padStart(2, "0")).join("");
}

function token() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function safeText(value: unknown) {
  return String(value ?? "")
    .replace(/[–—]/g, "-")
    .replace(/[•·]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "");
}

function clean(value: unknown, max = 180) {
  return String(value ?? "").trim().slice(0, max);
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function money(value: unknown) {
  const n = finite(value);
  if (n == null) return "Not available";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}

function percentFraction(value: unknown, digits = 1) {
  const n = finite(value);
  return n == null ? "Not available" : `${(n * 100).toFixed(digits)}%`;
}

function pdfFilename(title: unknown) {
  const cleanTitle = safeText(title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
  return `${cleanTitle || "watchdog-report"}.pdf`;
}

function planRank(plan: unknown) {
  return ({ standard: 0, agent: 1, pro: 2, pro_plus: 3, teams: 4, developer: 5 } as Record<string, number>)[String(plan || "standard")] ?? 0;
}

function districtCode(pin: unknown) {
  return clean(pin, 80).replace(/\D/g, "").slice(0, 4);
}

function evidenceSource(marker_id: string, source: string, source_url: string, captured_at: string, extra: Record<string, unknown> = {}) {
  return { marker_id, source, source_url, captured_at, ...extra };
}

type ReportVersion = {
  id: string;
  report_id: string;
  version_no?: number | null;
  version_number?: number | null;
  content?: Record<string, unknown> | null;
  source_manifest?: Array<Record<string, unknown>> | null;
  created_at?: string | null;
};

async function buildPdf(version: ReportVersion) {
  const content = (version.content && typeof version.content === "object") ? version.content as Record<string, any> : {};
  const evidence = (content.evidence_snapshot && typeof content.evidence_snapshot === "object") ? content.evidence_snapshot : {};
  const brand = (content.agent_branding && typeof content.agent_branding === "object") ? content.agent_branding : {};
  const homeowner = (content.homeowner_one_pager && typeof content.homeowner_one_pager === "object") ? content.homeowner_one_pager : null;
  const net = (content.seller_net_sheet && typeof content.seller_net_sheet === "object") ? content.seller_net_sheet : null;
  const municipal = (content.municipality_tax_context && typeof content.municipality_tax_context === "object") ? content.municipality_tax_context : null;
  const sources = Array.isArray(version.source_manifest) ? version.source_manifest : [];

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [612, 792];
  const margin = 48;
  const width = pageSize[0] - margin * 2;
  const lineHeight = 14;
  let page = pdf.addPage(pageSize);
  let y = 744;

  const navy = rgb(0.063, 0.165, 0.298);
  const teal = rgb(0.024, 0.561, 0.561);
  const muted = rgb(0.35, 0.42, 0.50);
  const line = rgb(0.86, 0.90, 0.94);

  function ensure(space = 40) {
    if (y - space < 54) {
      page = pdf.addPage(pageSize);
      y = 744;
    }
  }

  function wrap(textValue: unknown, size = 10, maxWidth = width, font = regular) {
    const words = safeText(textValue).split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) current = candidate;
      else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [""];
  }

  function text(textValue: unknown, opts: { size?: number; font?: any; color?: any; x?: number; maxWidth?: number; leading?: number } = {}) {
    const size = opts.size ?? 10;
    const font = opts.font ?? regular;
    const color = opts.color ?? navy;
    const x = opts.x ?? margin;
    const maxWidth = opts.maxWidth ?? width;
    const leading = opts.leading ?? lineHeight;
    const lines = wrap(textValue, size, maxWidth, font);
    ensure(lines.length * leading + 6);
    for (const lineText of lines) {
      page.drawText(lineText, { x, y, size, font, color });
      y -= leading;
    }
    return lines.length;
  }

  function rule(gap = 12) {
    y -= 4;
    page.drawLine({ start: { x: margin, y }, end: { x: pageSize[0] - margin, y }, thickness: 1, color: line });
    y -= gap;
  }

  function keyValue(label: string, value: unknown, strong = false) {
    ensure(24);
    page.drawText(safeText(label), { x: margin, y, size: 9, font: regular, color: muted });
    const rendered = safeText(value);
    const valueFont = strong ? bold : regular;
    const size = strong ? 11 : 10;
    page.drawText(rendered, {
      x: pageSize[0] - margin - valueFont.widthOfTextAtSize(rendered, size),
      y,
      size,
      font: valueFont,
      color: navy
    });
    y -= 18;
  }

  page.drawText("PREPARED BY", { x: margin, y, size: 8, font: bold, color: teal });
  page.drawText("DATA BY WATCHDOG", { x: 432, y, size: 8, font: bold, color: teal });
  y -= 18;
  text(brand.agent_name || "Watchdog professional", { size: 17, font: bold, maxWidth: 320, leading: 18 });
  const brandBits = [brand.brokerage_name, brand.license_number ? `NJ license ${brand.license_number}` : "", brand.business_phone, brand.business_email].filter(Boolean);
  if (brandBits.length) text(brandBits.join(" | "), { size: 9, color: muted, maxWidth: 360, leading: 12 });
  page.drawText("Governed New Jersey property intelligence", { x: 355, y: Math.min(724, y + 26), size: 8, font: regular, color: muted });
  rule();

  text(content.title || "Professional report", { size: 22, font: bold, leading: 24 });
  if (evidence.address) text(evidence.address, { size: 11, color: muted, leading: 14 });
  text(`Immutable version ${version.version_no || version.version_number || "1"} | ${safeText(content.preset || "")}`, { size: 8, color: muted, leading: 11 });
  y -= 4;

  if (content.summary) {
    text("EXECUTIVE SUMMARY", { size: 8, font: bold, color: teal, leading: 12 });
    text(content.summary, { size: 10, leading: 14 });
    y -= 6;
  }

  text("PROPERTY EVIDENCE SNAPSHOT", { size: 8, font: bold, color: teal, leading: 12 });
  keyValue("Assessed value", money(evidence.assessed));
  keyValue("Recorded annual property tax", money(evidence.last_year_tax));
  keyValue("Watchdog market value", money(evidence.watchdog_value));
  if (finite(evidence.effective_rate) != null) keyValue("Effective tax rate", `${Number(evidence.effective_rate).toFixed(3)}%`);
  rule();

  if (homeowner) {
    const chapter = homeowner.chapter123 && typeof homeowner.chapter123 === "object" ? homeowner.chapter123 : {};
    const economics = homeowner.appeal_economics && typeof homeowner.appeal_economics === "object" ? homeowner.appeal_economics : {};
    text("HOMEOWNER TAX POSITION", { size: 8, font: bold, color: teal, leading: 12 });
    keyValue("Watchdog Score", finite(homeowner.watchdog_score) == null ? "Not available" : `${Math.round(Number(homeowner.watchdog_score))} / 100`);
    keyValue("Official 2026 Chapter 123 ratio", finite(chapter.official_ratio_pct) == null ? "Not available" : `${Number(chapter.official_ratio_pct).toFixed(2)}%`);
    keyValue("Official 2026 upper ratio", finite(chapter.official_upper_pct) == null ? "Not available" : `${Number(chapter.official_upper_pct).toFixed(2)}%`);
    keyValue("Independent governed value anchor", money(chapter.independent_value_anchor));
    keyValue("Chapter 123 upper-bound assessment", money(chapter.upper_supported_assessment));
    keyValue("Assessment above upper bound", money(chapter.gap_amount));
    keyValue("Assessment gap", percentFraction(chapter.gap_fraction));
    keyValue("Annual dollars at stake", money(economics.annual_dollars_at_stake), true);
    y -= 4;
    text(homeowner.disclaimer || "Screening estimate only. This report does not determine appeal eligibility, legal outcome, exemption status or guaranteed savings.", { size: 8.5, color: muted, leading: 12 });
    rule();
  }

  if (net) {
    text("SELLER NET SHEET ESTIMATE", { size: 8, font: bold, color: teal, leading: 12 });
    keyValue("Sale price", money(net.sale_price));
    keyValue(`Commission (${Number(net.commission_rate || 0).toFixed(2)}%)`, money(net.commission_amount));
    keyValue("NJ Realty Transfer Fee", money(net.realty_transfer_fee));
    keyValue("Graduated Percent Fee", money(net.graduated_percent_fee));
    keyValue("Mortgage / lien payoff", money(net.mortgage_payoff));
    keyValue("Other seller costs entered", money(net.other_seller_costs));
    y -= 2;
    keyValue("Estimated seller net", money(net.estimated_net), true);
    y -= 4;
    text("Tax context: the recorded annual property tax shown above is a property snapshot, not a prediction of the buyer's future tax bill. Buyer taxes can change after sale, reassessment, exemption changes or municipal updates.", { size: 8.5, color: muted, leading: 12 });
    text(net.disclaimer || "Estimate only. Confirm all closing figures with the applicable professionals and county recording office.", { size: 8.5, color: muted, leading: 12 });
    rule();
  }

  if (municipal) {
    text("MUNICIPALITY TAX CONTEXT", { size: 8, font: bold, color: teal, leading: 12 });
    if (municipal.status === "available") {
      keyValue("Recorded annual property tax", money(municipal.property_annual_tax));
      keyValue("2026 municipal median annual tax", money(municipal.median_annual_tax));
      keyValue("Difference vs municipal median", money(municipal.delta_amount), true);
      if (finite(municipal.delta_fraction) != null) keyValue("Difference vs municipal median (%)", percentFraction(municipal.delta_fraction));
    } else {
      text("No governed 2026 municipal median annual-tax value was available for this property. Watchdog did not substitute a proxy.", { size: 8.5, color: muted, leading: 12 });
    }
    text(municipal.disclaimer || "Descriptive municipality context only. This is not a forecast of a future buyer tax bill.", { size: 8.5, color: muted, leading: 12 });
    rule();
  }

  if (brand.disclosure) {
    text("BROKERAGE DISCLOSURE", { size: 8, font: bold, color: teal, leading: 12 });
    text(brand.disclosure, { size: 8.5, color: muted, leading: 12 });
    rule();
  }

  text("SOURCE MANIFEST", { size: 8, font: bold, color: teal, leading: 12 });
  if (!sources.length) text("No source manifest was saved with this version.", { size: 8.5, color: muted, leading: 12 });
  for (const source of sources.slice(0, 30)) {
    const marker = safeText(source.marker_id || "source");
    const sourceName = safeText(source.source || "");
    const sourceUrl = safeText(source.source_url || "");
    text(`${marker}: ${sourceName}${sourceUrl ? ` | ${sourceUrl}` : ""}`, { size: 7.5, color: muted, leading: 10 });
  }

  rule(10);
  text("Watchdog reports are point-in-time informational snapshots. Public records and derived analytics can change after publication. Homeowner tax-position figures are screening estimates, and seller net figures are estimates from stated inputs. They are not legal, tax, lending, title or closing advice.", { size: 7.5, color: muted, leading: 10 });

  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    const footer = `Watchdog | page ${i + 1} of ${pages.length}`;
    p.drawText(footer, { x: margin, y: 28, size: 7, font: regular, color: muted });
  });

  return pdf.save();
}

async function getPlan(userClient: any) {
  const { data, error } = await userClient.rpc("get_my_entitlement");
  if (error) throw new Error("Entitlement resolver unavailable");
  const row = Array.isArray(data) ? data[0] : data;
  return clean(row?.plan_tier || "standard", 30);
}

async function getOwnedProperty(userClient: any, pin: string) {
  const { data, error } = await userClient
    .from("saved_properties")
    .select("pams_pin,address,town,county,block,lot,assessed,last_year_tax,effective_rate,watchdog_value,updated_at")
    .eq("pams_pin", pin)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function officialChapter123(url: string, pin: string) {
  const district = districtCode(pin);
  if (!/^\d{4}$/.test(district)) return null;
  const response = await fetch(`${url}/functions/v1/chapter123-provider`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ districts: [district] })
  });
  if (!response.ok) throw new Error("Official Chapter 123 provider unavailable");
  const payload = await response.json();
  if (
    payload?.source_id !== CHAPTER123_SOURCE_ID ||
    payload?.provider_version !== CHAPTER123_PROVIDER_VERSION ||
    Number(payload?.district_count) !== 564 ||
    Number(payload?.county_count) !== 21
  ) throw new Error("Official Chapter 123 provider validation failed");
  const row = payload?.districts?.[district] || null;
  return row ? {
    district,
    row,
    source_url: clean(payload?.source_url, 500),
    source_observed_at: clean(payload?.source_observed_at, 80),
    provider_version: payload?.provider_version
  } : null;
}

async function homeownerEvidence(req: Request, url: string, anon: string, admin: any, userClient: any, user: any, jwt: string, property: any) {
  const pin = clean(property?.pams_pin, 80);
  const refreshStartedAt = new Date(Date.now() - 2000).toISOString();
  const scoreResponse = await fetch(`${url}/functions/v1/workbench-score`, {
    method: "POST",
    headers: { authorization: `Bearer ${jwt}`, apikey: anon, "content-type": "application/json" },
    body: JSON.stringify({ pams_pins: [pin] })
  });
  if (!scoreResponse.ok) {
    const detail = await scoreResponse.text().catch(() => "");
    console.error("NJW-62 score refresh failed", scoreResponse.status, detail.slice(0, 400));
    throw new Error("Watchdog Score evidence refresh unavailable");
  }
  const scorePayload = await scoreResponse.json();
  if (scorePayload?.framework !== "ROBUST" || scorePayload?.model_version !== ROBUST_MODEL) {
    throw new Error("Watchdog Score evidence validation failed");
  }

  const chapter = await officialChapter123(url, pin);
  const { data: observation, error: obsError } = await admin
    .from("score_observations")
    .select("score,model_version,evidence_coverage,inputs,formula,observed_at")
    .eq("user_id", user.id)
    .eq("pams_pin", pin)
    .eq("marker_id", ROBUST_SCORE_ID)
    .gte("observed_at", refreshStartedAt)
    .order("observed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (obsError) throw obsError;

  const score = finite(scorePayload?.markers?.[pin]?.[ROBUST_SCORE_ID]);
  const obsScore = finite(observation?.score);
  const modelValid = observation?.model_version === ROBUST_MODEL;
  const inputs = modelValid && observation?.inputs && typeof observation.inputs === "object" ? observation.inputs : {};
  const anchorInput = inputs?.chapter123 && typeof inputs.chapter123 === "object" ? inputs.chapter123 : {};
  const independent = finite(anchorInput?.indep);
  const assessed = finite(property?.assessed);
  const annualTax = finite(property?.last_year_tax);
  const officialRatio = finite(chapter?.row?.ratio);
  const officialLower = finite(chapter?.row?.lower);
  const officialUpper = finite(chapter?.row?.upper);

  let upperSupported: number | null = null;
  let gapAmount: number | null = null;
  let gapFraction: number | null = null;
  let fairAssessment: number | null = null;
  let annualDollarsAtStake: number | null = null;
  if (independent != null && independent > 0 && assessed != null && assessed > 0 && officialRatio != null && officialUpper != null) {
    upperSupported = independent * (officialUpper / 100);
    gapAmount = Math.max(0, assessed - upperSupported);
    gapFraction = gapAmount / assessed;
    fairAssessment = independent * (officialRatio / 100);
    if (annualTax != null && annualTax >= 0) {
      annualDollarsAtStake = Math.max(0, assessed - fairAssessment) * (annualTax / assessed);
    }
  }

  const now = new Date().toISOString();
  const complete = score != null && obsScore != null && modelValid && independent != null && chapter != null && assessed != null && officialRatio != null && officialUpper != null;
  const homeowner = {
    status: complete ? "available" : "dependency_missing",
    pams_pin: pin,
    assessment: assessed,
    recorded_annual_tax: annualTax,
    watchdog_score: score ?? obsScore,
    watchdog_score_model: ROBUST_MODEL,
    watchdog_score_evidence_coverage: finite(observation?.evidence_coverage),
    watchdog_score_confidence: inputs?.confidence || null,
    watchdog_score_verdict: inputs?.verdict || null,
    chapter123: {
      status: chapter && independent != null && assessed != null ? "available" : "dependency_missing",
      tax_year: 2026,
      district: chapter?.district || districtCode(pin),
      municipality: chapter?.row?.municipality || property?.town || null,
      county: chapter?.row?.county || property?.county || null,
      official_ratio_pct: officialRatio,
      official_lower_pct: officialLower,
      official_upper_pct: officialUpper,
      official_amended_by_tax_court: chapter?.row?.amended_by_tax_court === true,
      independent_value_anchor: independent,
      independent_value_basis: anchorInput?.basis || null,
      independent_value_source: anchorInput?.independent_source || null,
      subject_evidence: anchorInput?.subject_evidence || null,
      upper_supported_assessment: upperSupported == null ? null : Math.round(upperSupported),
      gap_amount: gapAmount == null ? null : Math.round(gapAmount),
      gap_fraction: gapFraction,
      source_id: CHAPTER123_SOURCE_ID,
      provider_version: CHAPTER123_PROVIDER_VERSION,
      source_url: chapter?.source_url || null,
      source_observed_at: chapter?.source_observed_at || null
    },
    appeal_economics: {
      status: annualDollarsAtStake == null ? "dependency_missing" : "available",
      fair_assessment_at_official_ratio: fairAssessment == null ? null : Math.round(fairAssessment),
      annual_dollars_at_stake: annualDollarsAtStake == null ? null : Math.round(annualDollarsAtStake),
      formula_version: HOMEOWNER_CALC_VERSION,
      formula: "max(0, recorded assessment - independent value anchor × official Chapter 123 common ratio) × recorded annual tax / recorded assessment",
      guaranteed_savings: false,
      eligibility_determination: false
    },
    refreshed_at: now,
    disclaimer: "Screening estimate only. Watchdog does not determine appeal eligibility, legal outcome, exemption status or guaranteed savings. Confirm any appeal strategy and filing requirements with the appropriate New Jersey professionals and public authorities."
  };

  const manifest: Array<Record<string, unknown>> = [
    evidenceSource(ROBUST_SCORE_ID, "Watchdog Score powered by the ROBUST Framework", "/property/marker?id=watchdog.watchdog_score", now, { model_version: ROBUST_MODEL }),
    evidenceSource("watchdog.chapter123_upper_bound", "NJ Division of Taxation 2026 Chapter 123 common level range", chapter?.source_url || "https://www.nj.gov/treasury/taxation/pdf/lpt/chap123/2026CH123.pdf", chapter?.source_observed_at || now, { source_id: CHAPTER123_SOURCE_ID, provider_version: CHAPTER123_PROVIDER_VERSION }),
    evidenceSource("watchdog.appeal_opportunity_index", "Watchdog governed homeowner tax-position screening calculation over current ROBUST independent-value evidence and official 2026 Chapter 123", "/property/marker?id=watchdog.appeal_opportunity_index", now, { calculation_version: HOMEOWNER_CALC_VERSION })
  ];
  if (anchorInput?.independent_source === "nj_sr1a_subject_living_space") {
    manifest.push(evidenceSource("watchdog.independent_value_anchor", "NJ Division of Taxation SR-1A verified sales evidence used by ROBUST", "/property/marker?id=watchdog.watchdog_score", observation?.observed_at || now, { basis: anchorInput?.basis || null }));
  } else if (independent != null) {
    manifest.push(evidenceSource("watchdog.independent_value_anchor", "Governed independent value anchor saved with the current Watchdog property evidence", "/property/marker?id=watchdog.watchdog_score", observation?.observed_at || now, { basis: anchorInput?.basis || null, independent_source: anchorInput?.independent_source || null }));
  }

  return { homeowner_one_pager: homeowner, source_manifest: manifest };
}

async function municipalityTaxEvidence(property: any) {
  const district = districtCode(property?.pams_pin);
  const now = new Date().toISOString();
  if (!/^\d{4}$/.test(district)) {
    return {
      municipality_tax_context: {
        status: "source_checked_no_value",
        district: null,
        municipality: property?.town || null,
        county: property?.county || null,
        property_annual_tax: finite(property?.last_year_tax),
        median_annual_tax: null,
        delta_amount: null,
        delta_fraction: null,
        buyer_tax_prediction: false,
        disclaimer: "Descriptive municipality context only. No governed municipal median was available, so Watchdog did not substitute a proxy or forecast a future buyer tax bill."
      },
      source_manifest: []
    };
  }

  const response = await fetch(MODIV_SNAPSHOT_URL, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error("Governed 2026 MOD-IV municipal snapshot unavailable");
  const root = await response.json();
  if (root?.source_id !== MODIV_SOURCE_ID || !root?.municipalities || typeof root.municipalities !== "object") {
    throw new Error("Governed 2026 MOD-IV municipal snapshot validation failed");
  }
  const signal = root?.municipalities?.[district]?.signals?.median_annual_tax || null;
  const median = finite(signal?.value);
  const annualTax = finite(property?.last_year_tax);
  const delta = median != null && annualTax != null ? annualTax - median : null;
  const deltaFraction = delta != null && median != null && median > 0 ? delta / median : null;
  const observed = clean(root?.generated_at || root?.observed_at || root?.built_at || signal?.observed_at || now, 80);
  const available = median != null;
  return {
    municipality_tax_context: {
      status: available ? "available" : "source_checked_no_value",
      district,
      municipality: root?.municipalities?.[district]?.municipality || root?.municipalities?.[district]?.name || property?.town || null,
      county: root?.municipalities?.[district]?.county || property?.county || null,
      property_annual_tax: annualTax,
      median_annual_tax: median,
      delta_amount: delta,
      delta_fraction: deltaFraction,
      source_id: MODIV_SOURCE_ID,
      signal_id: "median_annual_tax",
      source_url: MODIV_SNAPSHOT_URL,
      source_observed_at: observed,
      buyer_tax_prediction: false,
      disclaimer: available
        ? "Descriptive municipality context from the governed 2026 MOD-IV municipal median annual-tax signal. This is not a forecast of a future buyer tax bill and does not determine exemption or legal eligibility."
        : "The governed 2026 MOD-IV source was checked but did not publish a usable municipal median annual-tax value for this property. Watchdog did not substitute a proxy."
    },
    source_manifest: [
      evidenceSource("modiv_intel.median_annual_tax", "Watchdog governed 2026 MOD-IV municipal annual-tax median (Treasury/MOD-IV source contract)", MODIV_SNAPSHOT_URL, observed, { source_id: MODIV_SOURCE_ID, value_status: available ? "available" : "source_checked_no_value" })
    ]
  };
}

async function evidenceAction(req: Request, body: any, url: string, anon: string, admin: any, userClient: any, user: any, jwt: string) {
  const purpose = clean(body?.purpose, 60);
  const pin = clean(body?.pams_pin, 80);
  if (!pin) return json(req, { error: "Saved property required" }, 400);
  const plan = await getPlan(userClient);
  if (purpose === "homeowner_one_pager") {
    if (planRank(plan) < 1) return json(req, { error: "Agent plan required" }, 403);
  } else if (purpose === "seller_net_sheet") {
    if (planRank(plan) < 2) return json(req, { error: "Pro plan required" }, 403);
  } else {
    return json(req, { error: "Unsupported evidence request" }, 400);
  }

  const property = await getOwnedProperty(userClient, pin);
  if (!property) return json(req, { error: "Saved property not found" }, 404);

  if (purpose === "homeowner_one_pager") {
    const result = await homeownerEvidence(req, url, anon, admin, userClient, user, jwt, property);
    return json(req, { ...result, plan_tier: plan });
  }
  const result = await municipalityTaxEvidence(property);
  return json(req, { ...result, plan_tier: plan });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json(req, { error: "Service unavailable" }, 503);

  const admin = createClient(url, service, { auth: { persistSession: false } });

  try {
    if (req.method === "GET") {
      const raw = new URL(req.url).searchParams.get("token") || "";
      if (raw.length < 32) return json(req, { error: "Report unavailable" }, 404);

      const h = await hash(raw);
      const { data: share } = await admin
        .from("professional_report_shares")
        .select("id,version_id,expires_at,revoked_at,view_count")
        .eq("token_hash", h)
        .maybeSingle();
      if (!share || share.revoked_at || new Date(share.expires_at) <= new Date()) {
        return json(req, { error: "Report unavailable" }, 404);
      }

      const { data: v, error } = await admin
        .from("professional_report_versions")
        .select("version_no,version_number,content,source_manifest,created_at")
        .eq("id", share.version_id)
        .single();
      if (error || !v) return json(req, { error: "Report unavailable" }, 404);

      await admin
        .from("professional_report_shares")
        .update({ view_count: (share.view_count || 0) + 1 })
        .eq("id", share.id);
      return json(req, { ...v, expires_at: share.expires_at });
    }

    if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

    const auth = req.headers.get("authorization") || "";
    const jwt = auth.replace(/^Bearer\s+/i, "");
    if (!jwt) return json(req, { error: "Authentication required" }, 401);

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false }
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json(req, { error: "Authentication required" }, 401);

    const body = await req.json();
    if (body?.action === "evidence") {
      return await evidenceAction(req, body, url, anon, admin, userClient, user, jwt);
    }

    const { data: v } = await userClient
      .from("professional_report_versions")
      .select("id,report_id,version_no,version_number,content,source_manifest,created_at")
      .eq("id", body.version_id)
      .eq("report_id", body.report_id)
      .maybeSingle();
    if (!v) return json(req, { error: "Report version not found" }, 404);

    if (body.action === "pdf") {
      const bytes = await buildPdf(v as ReportVersion);
      const title = (v.content && typeof v.content === "object") ? (v.content as Record<string, unknown>).title : "watchdog-report";
      return new Response(bytes, {
        status: 200,
        headers: {
          ...cors(req, "application/pdf"),
          "content-disposition": `attachment; filename="${pdfFilename(title)}"`,
          "content-length": String(bytes.byteLength)
        }
      });
    }

    const days = Math.max(1, Math.min(30, Number(body.days) || 14));
    const raw = token();
    const expires = new Date(Date.now() + days * 86400000).toISOString();
    const { error } = await userClient.from("professional_report_shares").insert({
      report_id: v.report_id,
      version_id: v.id,
      user_id: user.id,
      token_hash: await hash(raw),
      expires_at: expires
    });
    if (error) throw error;

    const site = requestSite(req);
    return json(req, {
      url: `${site}/property/report?token=${encodeURIComponent(raw)}`,
      expires_at: expires
    }, 201);
  } catch (e) {
    console.error(e);
    return json(req, { error: "Request could not be completed" }, 500);
  }
});