import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

type Obj = Record<string, any>;

const ALLOWED_PLANS = new Set(["pro_plus", "teams", "developer"]);
const ALLOWED_EVENTS = new Set([
  "property.signal.changed",
  "watchlist.alert",
  "report.ready",
  "intelligence.finding.created",
]);
const SUPPORTED_INTELLIGENCE_MODELS = new Set([
  "assessment_anomaly",
  "property_change_priority",
]);

function namedEnv(jsonName: string, legacyName: string) {
  const raw = Deno.env.get(jsonName) || "";
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.default) return String(parsed.default);
    } catch {}
  }
  return Deno.env.get(legacyName) || "";
}

function reply(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
    },
  });
}

function clean(value: unknown, max = 220) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f<>]/g, "")
    .trim()
    .slice(0, max);
}

function arr(value: unknown, max = 30) {
  return Array.isArray(value)
    ? [...new Set(value.map((item) => clean(item, 80)).filter(Boolean))].slice(0, max)
    : [];
}

function email(value: unknown) {
  const candidate = clean(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : null;
}

function phone(value: unknown) {
  const candidate = clean(value, 40);
  return /^[+()\d .-]{7,40}$/.test(candidate) ? candidate : null;
}

function publicHttps(value: unknown) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return null;
    if (/^127\.|^10\.|^192\.168\.|^169\.254\.|^0\./.test(host)) return null;
    const private172 = host.match(/^172\.(\d+)\./);
    if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return null;
    if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")) return null;
    url.username = "";
    url.password = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((part) => part.toString(16).padStart(2, "0"))
    .join("");
}

function randomToken(bytes = 32) {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  let raw = "";
  for (const value of buffer) raw += String.fromCharCode(value);
  return btoa(raw).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function planName(value: unknown) {
  return clean(value, 30).toLowerCase().replace("pro+", "pro_plus") || "standard";
}

function sample(eventType: string) {
  const now = new Date().toISOString();
  if (eventType === "report.ready") {
    return {
      id: "sample-report",
      event_type: eventType,
      occurred_at: now,
      data: {
        report_id: "00000000-0000-0000-0000-000000000001",
        version_number: 1,
        pams_pin: "sample-pin",
        title: "Sample Watchdog report",
        status: "ready",
        created_at: now,
      },
    };
  }
  if (eventType === "intelligence.finding.created") {
    return {
      id: "sample-finding",
      event_type: eventType,
      occurred_at: now,
      data: {
        finding_id: "00000000-0000-0000-0000-000000000002",
        pams_pin: "sample-pin",
        property_address: "100 Sample Ave, Sample, NJ",
        opportunity_type: "assessment_review",
        score: 82,
        confidence: 88,
        evidence_coverage: 91,
        created_at: now,
      },
    };
  }
  if (eventType === "watchlist.alert") {
    return {
      id: "sample-watch",
      event_type: eventType,
      occurred_at: now,
      data: {
        pams_pin: "sample-pin",
        severity: "medium",
        title: "Watchlist property changed",
        summary: "A governed property marker changed.",
        occurred_at: now,
      },
    };
  }
  return {
    id: "sample-signal",
    event_type: "property.signal.changed",
    occurred_at: now,
    data: {
      pams_pin: "sample-pin",
      severity: "medium",
      title: "Property signal changed",
      summary: "A governed property signal changed.",
      marker_id: "property.assessed_value",
      old_value: "300000",
      new_value: "325000",
      occurred_at: now,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" });

  const url = Deno.env.get("SUPABASE_URL") || "";
  const secret = namedEnv("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !secret) return reply(503, { error: "Zapier service unavailable" });

  const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const supplied = clean(
    req.headers.get("x-watchdog-key") || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""),
    500,
  );
  if (!supplied.startsWith("wdg_zap_")) return reply(401, { error: "Valid Watchdog Zapier API key required" });

  const hash = await sha256(supplied);
  const { data: key, error: keyError } = await db
    .from("integration_api_keys")
    .select("id,user_id,provider,label,scopes,status")
    .eq("key_hash", hash)
    .eq("provider", "zapier")
    .eq("status", "active")
    .maybeSingle();
  if (keyError || !key) return reply(401, { error: "Zapier API key is invalid or revoked" });

  const [{ data: profile }, { data: entitlement }] = await Promise.all([
    db.from("profiles").select("account_role,plan_tier").eq("id", key.user_id).maybeSingle(),
    db.from("account_entitlements").select("plan_tier,subscription_status").eq("user_id", key.user_id).maybeSingle(),
  ]);
  const developer = profile?.account_role === "developer";
  const paid = ["active", "trialing", "past_due", "cancel_scheduled"].includes(
    String(entitlement?.subscription_status || ""),
  );
  const plan = developer ? "developer" : paid ? planName(entitlement?.plan_tier) : "standard";
  if (!ALLOWED_PLANS.has(plan)) {
    return reply(403, {
      error: "Watchdog Zapier access requires an active Pro+ or Teams plan",
      required_plan: "pro_plus",
      plan,
    });
  }

  db.from("integration_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id).then(() => {});

  let body: Obj = {};
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: "Invalid JSON" });
  }

  const action = clean(body.action, 80);
  const scopes = new Set<string>(key.scopes || []);
  const need = (scope: string) => scopes.has(scope);
  const audit = async (kind: string, details: Obj = {}) => {
    await db.from("integration_audit_log").insert({
      user_id: key.user_id,
      action: kind,
      actor: "zapier",
      details: { api_key_id: key.id, ...details },
    });
  };

  if (action === "auth.test") {
    if (!need("zapier.auth")) return reply(403, { error: "Key scope denied" });
    return reply(200, {
      id: key.user_id,
      account: "Watchdog",
      plan,
      key_label: key.label,
      capabilities: [...scopes],
    });
  }

  if (action === "trigger.subscribe") {
    if (!need("triggers.manage")) return reply(403, { error: "Key scope denied" });
    const eventType = clean(body.event_type, 100);
    const target = publicHttps(body.target_url);
    if (!ALLOWED_EVENTS.has(eventType) || !target) {
      return reply(400, { error: "Valid event_type and public HTTPS target_url are required" });
    }
    const intelligenceEvent = eventType === "intelligence.finding.created";
    if (intelligenceEvent && !need("intelligence.read")) {
      return reply(403, { error: "Intelligence trigger requires intelligence.read scope" });
    }

    const signingSecret = randomToken();
    const connectionId = crypto.randomUUID();
    const stored = await db.rpc("integration_store_secret", {
      p_secret: signingSecret,
      p_name: `zapier:${connectionId}`,
      p_description: `Watchdog outbound signing secret for Zapier ${eventType}`,
    });
    if (stored.error || !stored.data) return reply(503, { error: "Subscription secret could not be stored" });

    const inserted = await db
      .from("integration_connections")
      .insert({
        id: connectionId,
        user_id: key.user_id,
        provider: "zapier",
        name: `Zapier · ${eventType}`,
        status: "active",
        direction: "outbound",
        outbound_url: target,
        outbound_secret_id: String(stored.data),
        event_types: [eventType],
        scopes: intelligenceEvent ? ["property.links.read", "intelligence.findings.read"] : ["property.links.read"],
        intelligence_access: intelligenceEvent,
        external_account_label: "Zapier",
        metadata: { phase: 7, api_key_id: key.id, zapier_event_type: eventType },
      })
      .select("id,status,event_types,created_at")
      .single();
    if (inserted.error) {
      await db.rpc("integration_delete_secret", { p_secret_id: String(stored.data) });
      return reply(503, { error: "Zapier subscription could not be created" });
    }
    await audit("zapier.subscription.created", { connection_id: connectionId, event_type: eventType });
    return reply(201, {
      id: connectionId,
      event_type: eventType,
      status: "active",
      created_at: inserted.data.created_at,
    });
  }

  if (action === "trigger.unsubscribe") {
    if (!need("triggers.manage")) return reply(403, { error: "Key scope denied" });
    const id = clean(body.subscription_id, 80);
    const { data: connection } = await db
      .from("integration_connections")
      .select("id,outbound_secret_id,status,metadata")
      .eq("id", id)
      .eq("user_id", key.user_id)
      .eq("provider", "zapier")
      .maybeSingle();
    if (!connection) return reply(404, { error: "Subscription not found" });
    if (String(connection.metadata?.api_key_id || "") !== String(key.id)) {
      return reply(403, { error: "Subscription belongs to another integration key" });
    }
    await db
      .from("integration_connections")
      .update({ status: "revoked", outbound_secret_id: null, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", key.user_id);
    await db
      .from("integration_deliveries")
      .update({ status: "canceled", updated_at: new Date().toISOString() })
      .eq("connection_id", id)
      .in("status", ["pending", "processing"]);
    if (connection.outbound_secret_id) {
      await db.rpc("integration_delete_secret", { p_secret_id: connection.outbound_secret_id });
    }
    await audit("zapier.subscription.revoked", { connection_id: id });
    return reply(200, { id, status: "revoked" });
  }

  if (action === "trigger.sample") {
    if (!need("triggers.manage")) return reply(403, { error: "Key scope denied" });
    const eventType = clean(body.event_type, 100);
    if (!ALLOWED_EVENTS.has(eventType)) return reply(400, { error: "Unsupported event_type" });
    if (eventType === "intelligence.finding.created" && !need("intelligence.read")) {
      return reply(403, { error: "Intelligence trigger requires intelligence.read scope" });
    }
    const { data } = await db
      .from("integration_events")
      .select("id,event_type,event_key,payload,occurred_at")
      .eq("user_id", key.user_id)
      .eq("direction", "outbound")
      .eq("event_type", eventType)
      .order("occurred_at", { ascending: false })
      .limit(3);
    const items = (data || []).map((item: Obj) => ({
      id: item.id,
      event_type: item.event_type,
      event_key: item.event_key,
      occurred_at: item.occurred_at,
      data: item.payload || {},
    }));
    return reply(200, { items: items.length ? items : [sample(eventType)] });
  }

  if (action === "property.find") {
    if (!need("property.read")) return reply(403, { error: "Key scope denied" });
    const pin = clean(body.pams_pin, 100);
    const query = clean(body.query, 180);
    const town = clean(body.town, 120);
    if (!pin && !query) return reply(400, { error: "Provide pams_pin or query" });
    let propertyQuery = db
      .from("property_lookups")
      .select("pams_pin,address,town,county,zip,block,lot,prop_class,assessed_value,last_year_tax,last_seen")
      .limit(10);
    if (pin) propertyQuery = propertyQuery.eq("pams_pin", pin);
    else propertyQuery = propertyQuery.ilike("address", `%${query.replace(/[%_]/g, "\\$&")}%`);
    if (town) propertyQuery = propertyQuery.ilike("town", town);
    const { data, error } = await propertyQuery;
    if (error) return reply(503, { error: "Property search failed" });
    return reply(200, { items: data || [] });
  }

  if (action === "property.snapshot") {
    if (!need("property.read")) return reply(403, { error: "Key scope denied" });
    const pin = clean(body.pams_pin, 100);
    if (!pin) return reply(400, { error: "pams_pin required" });
    const [record, score] = await Promise.all([
      db
        .from("property_lookups")
        .select("pams_pin,address,town,county,zip,block,lot,qualifier,prop_class,year_built,acres,dwelling_units,building_desc,land_value,improvement_value,assessed_value,last_year_tax,effective_rate,last_sale_price,last_sale_year,last_seen")
        .eq("pams_pin", pin)
        .maybeSingle(),
      db
        .from("property_watchdog_scores")
        .select("watchdog_score,observed_on,observed_at")
        .eq("pams_pin", pin)
        .order("observed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (record.error || !record.data) return reply(404, { error: "Property not found" });
    return reply(200, {
      id: pin,
      ...record.data,
      watchdog_score: score.data?.watchdog_score ?? null,
      score_observed_at: score.data?.observed_at ?? null,
      truth_policy: "Governed Watchdog property facts; missing values remain null and are not inferred.",
    });
  }

  if (action === "watchlist.add") {
    if (!need("watchlist.write")) return reply(403, { error: "Key scope denied" });
    const pin = clean(body.pams_pin, 100);
    if (!pin) return reply(400, { error: "pams_pin required" });
    const { data: property } = await db
      .from("property_lookups")
      .select("pams_pin,address,town,county,zip,block,lot,assessed_value,last_year_tax,effective_rate,lat,lon")
      .eq("pams_pin", pin)
      .maybeSingle();
    if (!property) return reply(404, { error: "Property not found" });
    const saved = await db
      .from("saved_properties")
      .upsert(
        {
          user_id: key.user_id,
          pams_pin: property.pams_pin,
          kind: "watch",
          address: property.address,
          town: property.town,
          county: property.county,
          zip: property.zip,
          block: property.block,
          lot: property.lot,
          assessed: property.assessed_value,
          last_year_tax: property.last_year_tax,
          effective_rate: property.effective_rate,
          lat: property.lat,
          lon: property.lon,
          nickname: clean(body.nickname, 120) || null,
          notes: clean(body.notes, 1000) || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,pams_pin,kind" },
      )
      .select("id,pams_pin,address,town,county,kind,nickname,created_at,updated_at")
      .single();
    if (saved.error) return reply(503, { error: "Property could not be added to Watchlist" });
    await audit("zapier.watchlist.added", { pams_pin: pin });
    return reply(200, { item: saved.data });
  }

  if (action === "watchlist.remove") {
    if (!need("watchlist.write")) return reply(403, { error: "Key scope denied" });
    const pin = clean(body.pams_pin, 100);
    if (!pin) return reply(400, { error: "pams_pin required" });
    const removed = await db
      .from("saved_properties")
      .delete()
      .eq("user_id", key.user_id)
      .eq("pams_pin", pin)
      .eq("kind", "watch")
      .select("id,pams_pin,address,town,county");
    if (removed.error) return reply(503, { error: "Property could not be removed from Watchlist" });
    await audit("zapier.watchlist.removed", { pams_pin: pin, removed: (removed.data || []).length > 0 });
    return reply(200, {
      item: {
        id: pin,
        pams_pin: pin,
        removed: (removed.data || []).length > 0,
        removed_at: new Date().toISOString(),
      },
    });
  }

  if (action === "intelligence.run") {
    if (!need("intelligence.run")) return reply(403, { error: "Key scope denied" });
    const pin = clean(body.pams_pin, 100);
    const modelKey = clean(body.model_key || "assessment_anomaly", 100);
    const sourceEventId = clean(body.source_event_id, 180) || null;
    if (!pin) return reply(400, { error: "pams_pin required" });
    if (!SUPPORTED_INTELLIGENCE_MODELS.has(modelKey)) {
      return reply(409, {
        error: "Unsupported governed Intelligence model",
        supported_models: [...SUPPORTED_INTELLIGENCE_MODELS],
      });
    }

    const [{ data: property }, { data: limits }, { data: model }] = await Promise.all([
      db.from("property_lookups").select("pams_pin,address,town,county").eq("pams_pin", pin).maybeSingle(),
      db.from("intelligence_plan_limits").select("max_jobs_per_day,max_concurrent_jobs").eq("plan_tier", plan).maybeSingle(),
      db.from("intelligence_models").select("model_key,version,status,calibration_state").eq("model_key", modelKey).maybeSingle(),
    ]);
    if (!property) return reply(404, { error: "Property not found" });
    if (!limits) return reply(503, { error: "Intelligence plan limits unavailable" });
    if (!model) return reply(409, { error: "Governed Intelligence model is unavailable" });

    const since = new Date(Date.now() - 86400000).toISOString();
    const [{ count: jobsToday }, { count: activeJobs }] = await Promise.all([
      db
        .from("intelligence_jobs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", key.user_id)
        .gte("created_at", since),
      db
        .from("intelligence_jobs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", key.user_id)
        .in("status", ["queued", "running", "partial"]),
    ]);
    if (Number(jobsToday || 0) + 1 > Number(limits.max_jobs_per_day)) {
      return reply(429, { error: "Daily Intelligence job quota reached for this plan." });
    }
    if (Number(activeJobs || 0) >= Number(limits.max_concurrent_jobs)) {
      return reply(429, { error: "Concurrent Intelligence job quota reached for this plan." });
    }

    const scopeValue = {
      pams_pins: [pin],
      source: "zapier.action",
      source_event_id: sourceEventId,
      resolution_manifest: { source: "custom", requested_count: 1 },
    };
    const scopeFingerprint = await sha256(
      JSON.stringify({ scope_type: "custom", scope_value: { pams_pins: [pin] }, pams_pins: [pin] }),
    );
    const idempotencyKey = clean(body.idempotency_key, 180) ||
      await sha256(
        JSON.stringify({
          user_id: key.user_id,
          pams_pin: pin,
          model_key: modelKey,
          model_version: model.version,
          source_event_id: sourceEventId || null,
          window: sourceEventId ? null : new Date().toISOString().slice(0, 13),
        }),
      );

    const queued = await db
      .from("intelligence_jobs")
      .upsert(
        {
          user_id: key.user_id,
          scope_id: null,
          model_key: modelKey,
          model_version: model.version,
          scope_type: "custom",
          scope_value: scopeValue,
          scope_fingerprint: scopeFingerprint,
          pams_pins: [pin],
          idempotency_key: idempotencyKey,
          trigger_type: "manual",
          status: "queued",
          candidate_count: 1,
          batch_size: 100,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,idempotency_key", ignoreDuplicates: true },
      )
      .select("id,status,model_key,model_version,candidate_count,created_at")
      .maybeSingle();
    if (queued.error) return reply(503, { error: "Could not queue Intelligence job" });

    let job = queued.data;
    let deduplicated = false;
    if (!job) {
      deduplicated = true;
      const existing = await db
        .from("intelligence_jobs")
        .select("id,status,model_key,model_version,candidate_count,created_at")
        .eq("user_id", key.user_id)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      job = existing.data;
    } else {
      await db.from("intelligence_job_events").insert({
        job_id: job.id,
        user_id: key.user_id,
        event_type: "queued",
        message: "Property Intelligence job queued from Zapier.",
        payload: {
          scope_type: "custom",
          candidate_count: 1,
          model_key: modelKey,
          source: "zapier.action",
          source_event_id: sourceEventId,
        },
      });
    }

    if (!job) return reply(503, { error: "Intelligence job could not be resolved after queueing" });
    await audit("zapier.intelligence.queued", {
      job_id: job.id,
      pams_pin: pin,
      model_key: modelKey,
      source_event_id: sourceEventId,
      deduplicated,
    });
    return reply(200, {
      job: {
        ...job,
        pams_pin: pin,
        property_address: property.address,
        deduplicated,
        idempotency_key: idempotencyKey,
      },
    });
  }

  if (action === "crm.context.attach") {
    if (!need("crm.context.write")) return reply(403, { error: "Key scope denied" });
    const externalId = clean(body.external_contact_id, 180);
    const propertyRef = clean(body.pams_pin || body.property_ref, 180) || null;
    if (!externalId) return reply(400, { error: "external_contact_id required" });

    let { data: contextConnection } = await db
      .from("integration_connections")
      .select("id")
      .eq("user_id", key.user_id)
      .eq("provider", "zapier")
      .eq("direction", "inbound")
      .contains("metadata", { api_key_id: key.id, context_bridge: true })
      .neq("status", "revoked")
      .limit(1)
      .maybeSingle();
    if (!contextConnection) {
      const created = await db
        .from("integration_connections")
        .insert({
          user_id: key.user_id,
          provider: "zapier",
          name: "Zapier · CRM context",
          status: "active",
          direction: "inbound",
          event_types: [],
          scopes: ["crm.context.ingest"],
          intelligence_access: false,
          external_account_label: "Zapier",
          metadata: { phase: 7, api_key_id: key.id, context_bridge: true },
        })
        .select("id")
        .single();
      if (created.error) return reply(503, { error: "CRM context bridge could not be created" });
      contextConnection = created.data;
    }

    const { data: property } = propertyRef
      ? await db.from("property_lookups").select("pams_pin,address,town,county").eq("pams_pin", propertyRef).maybeSingle()
      : { data: null };
    let existingQuery = db
      .from("integration_crm_context")
      .select("id")
      .eq("user_id", key.user_id)
      .eq("connection_id", contextConnection.id)
      .eq("external_contact_id", externalId);
    existingQuery = propertyRef ? existingQuery.eq("property_ref", propertyRef) : existingQuery.is("property_ref", null);
    const existing = await existingQuery.limit(1).maybeSingle();

    const patch = {
      user_id: key.user_id,
      connection_id: contextConnection.id,
      external_contact_id: externalId,
      property_ref: propertyRef,
      property_address: clean(body.property_address, 220) || property?.address || null,
      contact_name: clean(body.contact_name, 180) || null,
      contact_email: email(body.contact_email),
      contact_phone: phone(body.contact_phone),
      lead_stage: clean(body.lead_stage, 100) || null,
      relationship: clean(body.relationship, 100) || null,
      last_activity_at:
        body.last_activity_at && Number.isFinite(new Date(String(body.last_activity_at)).getTime())
          ? new Date(String(body.last_activity_at)).toISOString()
          : null,
      tags: arr(body.tags),
      context: {
        municipality: property?.town || null,
        county: property?.county || null,
        source: "zapier.action",
        intelligence_eligible: false,
      },
      source_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const saved = existing.data?.id
      ? await db
          .from("integration_crm_context")
          .update(patch)
          .eq("id", existing.data.id)
          .select("id,external_contact_id,property_ref,updated_at")
          .single()
      : await db
          .from("integration_crm_context")
          .insert(patch)
          .select("id,external_contact_id,property_ref,updated_at")
          .single();
    if (saved.error) return reply(503, { error: "CRM context could not be saved" });
    await audit("zapier.crm_context.saved", { context_id: saved.data.id, property_ref: propertyRef });
    return reply(200, { context: saved.data });
  }

  return reply(400, { error: "Unknown action" });
});
