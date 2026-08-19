import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const ORIGINS = new Set([
  "https://njpropertytaxrelief.com",
  "https://www.njpropertytaxrelief.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);
const BUCKET = "marketing-intelligence-visuals";
const ENGINE_VERSION = "watchdog-studio-visual-v1";
const PLAN_RANK: Record<string, number> = { standard: 0, agent: 1, pro: 2, pro_plus: 3, teams: 4, developer: 5 };
type O = Record<string, any>;

const clean = (v: unknown, n = 500) => String(v ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, n);
const safe = (v: unknown, max = 20000): O => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  try { return JSON.stringify(v).length <= max ? v as O : {}; } catch { return {}; }
};
const namedEnv = (jsonName: string, legacyName: string) => {
  const raw = Deno.env.get(jsonName) || "";
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.default) return String(parsed.default);
    } catch { /* fall through */ }
  }
  return Deno.env.get(legacyName) || "";
};
const cors = (req: Request) => {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.has(origin) ? origin : "https://njpropertytaxrelief.com",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "private, no-store",
    "Vary": "Origin",
  };
};
const reply = (req: Request, status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors(req), "Content-Type": "application/json" },
});
const allowed = (plan: string, minimum: string) => (PLAN_RANK[plan] ?? 0) >= (PLAN_RANK[minimum] ?? 99);
const base64Bytes = (value: string) => {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
};
async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function signed(admin: any, path: string | null, expires = 3600) {
  if (!path) return null;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, expires);
  return error ? null : data?.signedUrl || null;
}
function imageResult(data: O) {
  for (const item of Array.isArray(data?.output) ? data.output : []) {
    if (item?.type === "image_generation_call" && typeof item?.result === "string" && item.result.length > 100) return item.result;
  }
  return "";
}
function stylePrompt(campaign: O, briefRow: O, variant: O, preset: O) {
  const art = safe(preset?.art_direction, 5000);
  const brief = safe(briefRow?.brief, 7000);
  const manifest = safe(briefRow?.input_manifest, 12000);
  const brand = safe(manifest?.brand, 5000);
  const brandName = clean(brand?.company || brand?.brokerage || brand?.display_name || brand?.name || "", 120);
  const profession = clean(briefRow?.profession || campaign?.profession || "real estate professional", 80);
  const goal = clean(briefRow?.goal || campaign?.goal || "local property campaign", 100).replaceAll("_", " ");
  const direction = clean(variant?.visual_prompt || variant?.visual_direction || brief?.visual_direction || "premium local property visual", 1200);
  return [
    "Create a premium BACKGROUND ART ASSET for a professional direct-mail postcard campaign.",
    "The final postcard format is landscape 6 x 8.5 inches, but PCM will control all mechanical print layout, bleed, safe zones, address blocks, barcode areas and postal indicia later.",
    "This image is preview art only and must work as a flexible hero/background crop with useful negative space for copy that will be placed separately.",
    `Campaign profession: ${profession}.`,
    `Campaign objective: ${goal}.`,
    brandName ? `Brand context: ${brandName}. Do not draw or invent a logo.` : "Brand context: professional and locally credible.",
    `Creative concept: ${direction}.`,
    `Style preset: ${clean(preset?.label || preset?.preset_key || "Studio", 100)}.`,
    art?.mood ? `Mood: ${clean(art.mood, 300)}.` : "",
    art?.composition ? `Composition: ${clean(art.composition, 500)}.` : "",
    art?.texture ? `Texture/light: ${clean(art.texture, 300)}.` : "",
    "Hard requirements: no words, no typography, no letters, no numbers, no logos, no QR codes, no watermarks, no postal marks, no indicia, no barcodes, no readable house numbers, no identifiable street address, no identifiable people, no faces, no political signs, no discriminatory or demographic cues.",
    "Do not depict distress, foreclosure, death, divorce, illness, financial hardship, or a person's likelihood to sell.",
    "Do not visualize a guaranteed property value, tax savings, legal result, financing result, profit or response rate.",
    "For literal residential imagery, use a non-identifiable New Jersey / Northeast suburban home or streetscape atmosphere rather than a specific real property. For analytical concepts, use abstract parcel/map/property geometry without literal data values.",
    "Aim for sophisticated commercial-advertising quality, natural composition, believable materials and lighting, and enough visual restraint for professional postcard copy to remain readable when composited later.",
  ].filter(Boolean).join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return reply(req, 405, { error: "POST required" });
  const origin = req.headers.get("origin") || "";
  if (origin && !ORIGINS.has(origin)) return reply(req, 403, { error: "Origin not allowed" });
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return reply(req, 401, { error: "Sign in required" });

  const url = Deno.env.get("SUPABASE_URL") || "";
  const pub = namedEnv("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
  const secret = namedEnv("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !pub || !secret) return reply(req, 503, { error: "Visual Engine configuration incomplete" });
  const userClient = createClient(url, pub, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData } = await userClient.auth.getUser();
  const user = authData?.user;
  if (!user) return reply(req, 401, { error: "Session invalid" });

  const bootstrap = await userClient.rpc("marketing_studio_bootstrap");
  if (bootstrap.error) return reply(req, 403, { error: "Marketing Studio access required" });
  const plan = clean(bootstrap.data?.plan || "standard", 30);
  let body: O = {};
  try { body = await req.json(); } catch { return reply(req, 400, { error: "Invalid JSON" }); }
  const action = clean(body.action || "status", 40);
  const openaiKey = Deno.env.get("OPENAI_API_KEY") || "";

  if (action === "status") return reply(req, 200, {
    ok: true,
    engine_version: ENGINE_VERSION,
    configured: Boolean(openaiKey),
    bucket: BUCKET,
    production_boundary: "preview_only_until_pcm_mapping_and_proof",
    actions: ["styles", "list", "generate", "select"],
  });

  if (action === "styles") {
    const q = await admin.from("marketing_visual_style_presets")
      .select("preset_key,label,description,minimum_tier,art_direction,sort_order")
      .eq("active", true)
      .order("sort_order", { ascending: true });
    if (q.error) return reply(req, 503, { error: "Visual styles unavailable" });
    return reply(req, 200, { styles: (q.data || []).filter((x: O) => allowed(plan, x.minimum_tier === "studio" ? "pro" : "agent")) });
  }

  const campaignId = clean(body.campaign_id, 80);
  if (!campaignId) return reply(req, 400, { error: "campaign_id is required" });
  const campaignQ = await admin.from("marketing_campaigns")
    .select("id,user_id,name,goal,profession,settings")
    .eq("id", campaignId)
    .eq("user_id", user.id)
    .maybeSingle();
  const campaign = campaignQ.data;
  if (!campaign) return reply(req, 404, { error: "Campaign not found" });

  if (action === "list") {
    const q = await admin.from("marketing_intelligence_visual_assets")
      .select("id,campaign_id,brief_id,creative_id,variant_index,style_preset_key,asset_kind,status,production_status,provider,model,storage_path,mime_type,width,height,bytes,metadata,selected_at,created_at")
      .eq("user_id", user.id)
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (q.error) return reply(req, 503, { error: "Visual assets unavailable" });
    const assets = await Promise.all((q.data || []).map(async (x: O) => ({ ...x, signed_url: await signed(admin, x.storage_path) })));
    return reply(req, 200, { assets });
  }

  if (action === "select") {
    const assetId = clean(body.asset_id, 80);
    if (!assetId) return reply(req, 400, { error: "asset_id is required" });
    const assetQ = await admin.from("marketing_intelligence_visual_assets")
      .select("*")
      .eq("id", assetId)
      .eq("user_id", user.id)
      .eq("campaign_id", campaignId)
      .maybeSingle();
    const asset = assetQ.data;
    if (!asset || asset.status === "failed") return reply(req, 404, { error: "Visual asset not found" });

    await admin.from("marketing_intelligence_visual_assets")
      .update({ status: "superseded", updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("campaign_id", campaignId)
      .eq("status", "selected")
      .neq("id", assetId);
    const selected = await admin.from("marketing_intelligence_visual_assets")
      .update({ status: "selected", production_status: "preview_only", selected_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", assetId)
      .eq("user_id", user.id)
      .select("*")
      .single();
    if (selected.error) return reply(req, 503, { error: "Visual selection could not be saved" });

    const nextSettings = {
      ...safe(campaign.settings),
      direct_mail: {
        ...safe(campaign.settings?.direct_mail),
        studio_visual_asset_id: assetId,
        studio_visual_status: "preview_only",
        studio_visual_style: selected.data.style_preset_key,
      },
    };
    await admin.from("marketing_campaigns").update({ settings: nextSettings, updated_at: new Date().toISOString() }).eq("id", campaignId).eq("user_id", user.id);

    const creativeQ = await admin.from("marketing_creatives")
      .select("id,content")
      .eq("user_id", user.id)
      .eq("campaign_id", campaignId)
      .eq("channel", "direct_mail")
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (creativeQ.data) {
      const content = {
        ...safe(creativeQ.data.content),
        visual_asset_id: assetId,
        visual_storage_path: selected.data.storage_path,
        visual_asset_status: "preview_only",
        visual_style_preset: selected.data.style_preset_key,
      };
      await admin.from("marketing_creatives")
        .update({ visual_asset_id: assetId, content, updated_at: new Date().toISOString() })
        .eq("id", creativeQ.data.id)
        .eq("user_id", user.id);
      await admin.from("marketing_intelligence_visual_assets").update({ creative_id: creativeQ.data.id }).eq("id", assetId).eq("user_id", user.id);
    }
    await admin.from("marketing_events").insert({
      user_id: user.id,
      campaign_id: campaignId,
      event_type: "creative.studio_visual_selected",
      source: "watchdog_intelligence",
      payload: { asset_id: assetId, brief_id: selected.data.brief_id, variant_index: selected.data.variant_index, style_preset_key: selected.data.style_preset_key, production_status: "preview_only" },
    });
    return reply(req, 200, { asset: { ...selected.data, signed_url: await signed(admin, selected.data.storage_path) }, production_boundary: "PCM proof still required" });
  }

  if (action !== "generate") return reply(req, 400, { error: "Unsupported action" });
  if (!openaiKey) return reply(req, 503, { error: "Studio image provider is not configured" });

  let briefQ;
  const requestedBrief = clean(body.brief_id, 80);
  if (requestedBrief) {
    briefQ = await admin.from("marketing_intelligence_creative_briefs").select("*").eq("id", requestedBrief).eq("campaign_id", campaignId).eq("user_id", user.id).maybeSingle();
  } else {
    briefQ = await admin.from("marketing_intelligence_creative_briefs").select("*").eq("campaign_id", campaignId).eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  }
  const briefRow = briefQ.data;
  if (!briefRow) return reply(req, 409, { error: "Generate a Watchdog creative brief first" });
  if (briefRow.creative_tier !== "studio") return reply(req, 403, { error: "Generated preview art is available with Studio creative" });
  const tierQ = await admin.from("marketing_creative_service_tiers").select("minimum_plan,image_generation_eligible,active").eq("tier_key", "studio").maybeSingle();
  const tier = tierQ.data;
  if (!tier?.active || !tier.image_generation_eligible) return reply(req, 503, { error: "Studio visual generation is disabled" });
  if (!allowed(plan, clean(tier.minimum_plan || "pro", 30))) return reply(req, 403, { error: `Studio creative requires ${tier.minimum_plan || "pro"} or higher` });

  const variants = Array.isArray(briefRow.variants) ? briefRow.variants : [];
  const variantIndex = Math.max(0, Math.min(Number(body.variant_index ?? 0), 9));
  const variant = variants[variantIndex];
  if (!variant) return reply(req, 400, { error: "Creative variant not found" });
  const styleKey = clean(body.style_preset_key || "architectural_gallery", 80);
  const presetQ = await admin.from("marketing_visual_style_presets").select("*").eq("preset_key", styleKey).eq("active", true).maybeSingle();
  const preset = presetQ.data;
  if (!preset) return reply(req, 400, { error: "Visual style not found" });
  if (preset.minimum_tier !== "studio") return reply(req, 400, { error: "Choose a Studio visual style for generated preview art" });

  const maxBrief = plan === "developer" ? 25 : 8;
  const maxVariant = plan === "developer" ? 8 : 2;
  const countBrief = await admin.from("marketing_intelligence_visual_assets").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("brief_id", briefRow.id).neq("status", "failed");
  const countVariant = await admin.from("marketing_intelligence_visual_assets").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("brief_id", briefRow.id).eq("variant_index", variantIndex).neq("status", "failed");
  if (Number(countBrief.count || 0) >= maxBrief) return reply(req, 429, { error: `Studio preview limit reached for this creative brief (${maxBrief})` });
  if (Number(countVariant.count || 0) >= maxVariant) return reply(req, 429, { error: `Studio preview limit reached for this concept (${maxVariant})` });

  const prompt = stylePrompt(campaign, briefRow, variant, preset);
  const promptHash = await sha256(prompt);
  const pending = await admin.from("marketing_intelligence_visual_assets").insert({
    user_id: user.id,
    campaign_id: campaignId,
    brief_id: briefRow.id,
    variant_index: variantIndex,
    style_preset_key: styleKey,
    asset_kind: "generated_preview",
    status: "generating",
    production_status: "preview_only",
    provider: "openai",
    model: clean(Deno.env.get("WATCHDOG_IMAGE_MODEL") || "gpt-image-2", 80),
    prompt,
    prompt_hash: promptHash,
    metadata: { engine_version: ENGINE_VERSION, creative_tier: "studio", mechanical_spec_owner: "pcm" },
  }).select("id").single();
  if (pending.error) return reply(req, 503, { error: "Visual generation could not be started" });
  const assetId = pending.data.id;

  try {
    const orchestrationModel = clean(Deno.env.get("WATCHDOG_VISUAL_MODEL") || "gpt-5", 80);
    const imageModel = clean(Deno.env.get("WATCHDOG_IMAGE_MODEL") || "gpt-image-2", 80);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 120000);
    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        signal: ctl.signal,
        headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: orchestrationModel,
          store: false,
          input: prompt,
          tools: [{ type: "image_generation", model: imageModel, size: "1536x1024", quality: "medium", output_format: "webp", background: "opaque", moderation: "auto" }],
          tool_choice: "required",
        }),
      });
    } finally { clearTimeout(timer); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(clean(data?.error?.message || `Image provider failed (${response.status})`, 500));
    const encoded = imageResult(data);
    if (!encoded) throw new Error("Image provider returned no generated image");
    const bytes = base64Bytes(encoded);
    const path = `${user.id}/${campaignId}/${briefRow.id}/${variantIndex}/${crypto.randomUUID()}.webp`;
    const upload = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: "image/webp", cacheControl: "3600", upsert: false });
    if (upload.error) throw new Error(clean(upload.error.message || "Visual storage upload failed", 500));

    const done = await admin.from("marketing_intelligence_visual_assets").update({
      status: "generated",
      storage_path: path,
      mime_type: "image/webp",
      width: 1536,
      height: 1024,
      bytes: bytes.byteLength,
      metadata: {
        engine_version: ENGINE_VERSION,
        creative_tier: "studio",
        mechanical_spec_owner: "pcm",
        openai_response_id: clean(data?.id, 120) || null,
        usage: safe(data?.usage, 5000),
        output_format: "webp",
        quality: "medium",
        size: "1536x1024",
      },
      updated_at: new Date().toISOString(),
    }).eq("id", assetId).eq("user_id", user.id).select("*").single();
    if (done.error) throw new Error("Generated visual could not be recorded");
    await admin.from("marketing_events").insert({
      user_id: user.id,
      campaign_id: campaignId,
      event_type: "creative.studio_visual_generated",
      source: "watchdog_intelligence",
      payload: { asset_id: assetId, brief_id: briefRow.id, variant_index: variantIndex, style_preset_key: styleKey, provider: "openai", model: imageModel, production_status: "preview_only" },
    });
    return reply(req, 200, {
      ok: true,
      asset: { ...done.data, signed_url: await signed(admin, path) },
      production_boundary: "Watchdog preview only. PCM mapping and provider proof are still required before production.",
    });
  } catch (error) {
    const message = clean((error as any)?.message || error, 500);
    await admin.from("marketing_intelligence_visual_assets").update({ status: "failed", metadata: { engine_version: ENGINE_VERSION, error: message }, updated_at: new Date().toISOString() }).eq("id", assetId).eq("user_id", user.id);
    return reply(req, 502, { error: message, asset_id: assetId });
  }
});
