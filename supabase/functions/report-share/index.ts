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

function money(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "Not available";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}

function pdfFilename(title: unknown) {
  const clean = safeText(title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
  return `${clean || "watchdog-report"}.pdf`;
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
  const net = (content.seller_net_sheet && typeof content.seller_net_sheet === "object") ? content.seller_net_sheet : null;
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

  function wrap(text: unknown, size = 10, maxWidth = width, font = regular) {
    const words = safeText(text).split(/\s+/).filter(Boolean);
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
    page.drawText(rendered, {
      x: pageSize[0] - margin - (strong ? bold : regular).widthOfTextAtSize(rendered, strong ? 11 : 10),
      y,
      size: strong ? 11 : 10,
      font: strong ? bold : regular,
      color: strong ? navy : navy
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
  if (evidence.effective_rate != null) keyValue("Effective tax rate", `${Number(evidence.effective_rate).toFixed(3)}%`);
  rule();

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
  text("Watchdog reports are point-in-time informational snapshots. Public records and derived analytics can change after publication. Seller net figures are estimates from stated inputs and are not legal, tax, lending, title or closing advice.", { size: 7.5, color: muted, leading: 10 });

  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    const footer = `Watchdog | page ${i + 1} of ${pages.length}`;
    p.drawText(footer, { x: margin, y: 28, size: 7, font: regular, color: muted });
  });

  return pdf.save();
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