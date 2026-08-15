import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const NJOGIS = "https://maps.nj.gov/arcgis/rest/services/Framework/Cadastral/MapServer/0/query";
const allowedOrigins = new Set([
  "https://njpropertytaxrelief.com",
  "https://www.njpropertytaxrelief.com",
]);

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://njpropertytaxrelief.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
function reply(req: Request, status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...cors(req),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}
function clean(v: unknown, max = 160) {
  return String(v ?? "").trim().replace(/[\u0000-\u001f]/g, "").slice(0, max);
}
function num(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function sqlText(v: string) {
  return v.replace(/'/g, "''");
}
function saleYear(v: unknown) {
  const x = String(v ?? "");
  const full = x.match(/(19|20)\d{2}/);
  if (full) return Number(full[0]);
  if (/^\d{6}$/.test(x)) {
    const y = Number(x.slice(-2));
    return y + (y > 50 ? 1900 : 2000);
  }
  return null;
}
function normalize(a: Record<string, unknown>) {
  return {
    pams_pin: clean(a.PAMS_PIN, 80),
    address: clean(a.PROP_LOC, 220),
    town: clean(a.MUN_NAME, 140),
    county: clean(a.COUNTY, 100),
    zip: clean(a.ZIP5 || a.ZIP_CODE, 10),
    block: clean(a.PCLBLOCK, 40),
    lot: clean(a.PCLLOT, 40),
    qualifier: clean(a.PCLQCODE, 40),
    prop_class: clean(a.PROP_CLASS, 12),
    year_built: num(a.YR_CONSTR),
    acres: num(a.CALC_ACRE),
    dwelling_units: num(a.DWELL) ?? num(a.COMM_DWELL),
    building_desc: clean(a.BLDG_DESC, 220),
    land_value: num(a.LAND_VAL),
    improvement_value: num(a.IMPRVT_VAL),
    assessed_value: num(a.NET_VALUE),
    last_year_tax: num(a.LAST_YR_TX),
    effective_rate: null,
    last_sale_price: num(a.SALE_PRICE),
    last_sale_year: saleYear(a.DEED_DATE),
    last_seen: new Date().toISOString(),
    history: {
      source: "NJ Office of GIS statewide Parcels and MOD-IV Composite",
      purpose: "dynamic_list_materialization",
      cached_at: new Date().toISOString(),
    },
  };
}
async function geocode(address: string) {
  const u = new URL("https://geocoding.geo.census.gov/geocoder/locations/onelineaddress");
  u.searchParams.set("address", `${address}, NJ`);
  u.searchParams.set("benchmark", "Public_AR_Current");
  u.searchParams.set("format", "json");
  const r = await fetch(u);
  if (!r.ok) return null;
  const j = await r.json();
  const c = j?.result?.addressMatches?.[0]?.coordinates;
  return c ? { lat: Number(c.y), lon: Number(c.x) } : null;
}
function definition(list: any) {
  return {
    scope_type: list.scope_type,
    scope_value: list.scope_value,
    criteria: list.criteria || {},
  };
}
function hasKeys(obj: unknown) {
  return !!obj && typeof obj === "object" && !Array.isArray(obj) && Object.keys(obj as Record<string, unknown>).length > 0;
}
function buildWhere(classes: string[], filters: Record<string, unknown>, scopeType: string, scopeValue: string) {
  let where = "1=1";
  if (scopeType === "municipality") where += ` AND UPPER(MUN_NAME) LIKE '%${sqlText(scopeValue.toUpperCase())}%'`;
  if (scopeType === "county") where += ` AND UPPER(COUNTY) LIKE '%${sqlText(scopeValue.toUpperCase().replace(/ COUNTY$/, ""))}%'`;
  if (scopeType === "zip") where += ` AND ZIP5='${sqlText(scopeValue.replace(/\D/g, "").slice(0, 5))}'`;
  const safeClasses = classes.filter((x) => /^[0-9A-Z.]{1,4}$/.test(x));
  if (safeClasses.length) where += ` AND PROP_CLASS IN (${safeClasses.map((x) => `'${sqlText(x)}'`).join(",")})`;
  const remote: Record<string, [string, string]> = {
    year_built_min: ["YR_CONSTR", ">="],
    year_built_max: ["YR_CONSTR", "<="],
    assessment_min: ["NET_VALUE", ">="],
    assessment_max: ["NET_VALUE", "<="],
    tax_min: ["LAST_YR_TX", ">="],
    tax_max: ["LAST_YR_TX", "<="],
    sale_price_min: ["SALE_PRICE", ">="],
    sale_price_max: ["SALE_PRICE", "<="],
    acres_min: ["CALC_ACRE", ">="],
    acres_max: ["CALC_ACRE", "<="],
    units_min: ["DWELL", ">="],
    units_max: ["DWELL", "<="],
  };
  for (const [key, [field, op]] of Object.entries(remote)) {
    const value = num(filters[key]);
    if (value !== null) where += ` AND ${field} ${op} ${value}`;
  }
  return where;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return reply(req, 405, { error: "POST required" });

  const origin = req.headers.get("origin") || "";
  if (origin && !allowedOrigins.has(origin)) return reply(req, 403, { error: "Origin not allowed" });

  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return reply(req, 401, { error: "Sign in required", code: "AUTH_REQUIRED" });

  const url = Deno.env.get("SUPABASE_URL") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return reply(req, 401, { error: "Session could not be verified", code: "AUTH_REQUIRED" });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return reply(req, 400, { error: "Invalid JSON" });
  }
  const listId = clean(body?.list_id, 80);
  if (!/^[0-9a-f-]{36}$/i.test(listId)) return reply(req, 400, { error: "A valid saved farm is required" });

  const { data: list, error: listError } = await admin
    .from("agent_dynamic_lists")
    .select("*")
    .eq("id", listId)
    .eq("user_id", authData.user.id)
    .single();
  if (listError || !list) return reply(req, 404, { error: "Saved farm not found" });

  const { data: plan } = await admin.rpc("watchdog_effective_plan", { p_user_id: authData.user.id });
  const { data: limits } = await admin.rpc("agent_plan_limits", { p_plan: plan || "standard" });
  const tier = String(plan || "standard");
  const capacity = Math.max(0, Number(limits?.properties || 0));
  const requestLimit = Math.max(1, Number(limits?.requests_5m || 20));
  if (capacity < 1) return reply(req, 403, { error: "Saved farm materialization requires an Agent or professional plan.", code: "PLAN_REQUIRED" });

  const criteria = list.criteria && typeof list.criteria === "object" ? list.criteria : {};
  const intelligence = criteria.intelligence_filters && typeof criteria.intelligence_filters === "object" ? criteria.intelligence_filters : {};
  const filters = criteria.filters && typeof criteria.filters === "object" ? criteria.filters : {};
  if (hasKeys(intelligence)) {
    return reply(req, 409, {
      error: "This Watchdog intelligence farm cannot be mailed until its full candidate set can be materialized without scan truncation.",
      code: "INTELLIGENCE_MATERIALIZATION_PENDING",
    });
  }
  if (Object.prototype.hasOwnProperty.call(filters, "sale_year_min") || Object.prototype.hasOwnProperty.call(filters, "sale_year_max")) {
    return reply(req, 409, {
      error: "Sale-year farms need exact upstream filtering before direct-mail materialization can be enabled.",
      code: "UNSUPPORTED_EXACT_FILTER",
    });
  }

  const scopeType = clean(list.scope_type, 20).toLowerCase();
  const scopeValue = clean(list.scope_value);
  if (!["municipality", "county", "zip", "radius", "polygon"].includes(scopeType)) {
    return reply(req, 400, { error: "This saved list type is not eligible for direct-mail materialization yet.", code: "UNSUPPORTED_SCOPE" });
  }

  const deliveryId = crypto.randomUUID();
  const { data: quota, error: quotaError } = await admin.rpc("consume_municipal_quota", {
    p_user_id: authData.user.id,
    p_endpoint: "materialize-dynamic-list",
    p_limit: requestLimit,
    p_rows: 0,
    p_delivery_id: deliveryId,
  });
  if (quotaError) return reply(req, 503, { error: "Materialization quota could not be checked", code: "SERVICE_UNAVAILABLE" });
  if (!quota?.allowed) {
    return reply(req, 429, {
      error: "Data refresh limit reached. Try again after the usage window resets.",
      code: "AGENT_QUOTA_REQUESTS",
      reset_at: quota?.reset_at,
    });
  }

  const classes = Array.isArray(criteria.property_classes) ? criteria.property_classes.map((x: unknown) => clean(x, 4)) : [];
  const where = buildWhere(classes, filters, scopeType, scopeValue);
  const common: Record<string, string> = { f: "json", where };

  if (scopeType === "radius") {
    const center = await geocode(scopeValue);
    if (!center) return reply(req, 404, { error: "Farm center address could not be geocoded", code: "LOCATION_NOT_FOUND" });
    Object.assign(common, {
      geometry: `${center.lon},${center.lat}`,
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      distance: String(Math.max(0.1, Math.min(num(criteria.radius_miles) || 2, 50))),
      units: "esriSRUnit_StatuteMile",
    });
  } else if (scopeType === "polygon") {
    const rings = criteria?.polygon?.rings;
    if (!Array.isArray(rings) || !rings.length || !Array.isArray(rings[0]) || rings[0].length < 4) {
      return reply(req, 400, { error: "Saved farm polygon is invalid", code: "INVALID_POLYGON" });
    }
    Object.assign(common, {
      geometry: JSON.stringify({ rings, spatialReference: { wkid: 4326 } }),
      geometryType: "esriGeometryPolygon",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
    });
  }

  const countParams = new URLSearchParams({ ...common, returnCountOnly: "true" });
  const countRes = await fetch(`${NJOGIS}?${countParams}`);
  if (!countRes.ok) return reply(req, 503, { error: "NJ statewide parcel service is temporarily unavailable", code: "SERVICE_UNAVAILABLE" });
  const countJson = await countRes.json();
  if (countJson.error) return reply(req, 503, { error: "NJ statewide parcel count failed", code: "SERVICE_UNAVAILABLE" });

  const sourceCount = Math.max(0, Number(countJson.count || 0));
  const targetCount = Math.min(sourceCount, capacity);
  const generation = crypto.randomUUID();
  const sourceName = "NJ Office of GIS statewide Parcels and MOD-IV Composite via Watchdog";
  const outFields = "PAMS_PIN,PCLBLOCK,PCLLOT,PCLQCODE,COUNTY,MUN_NAME,PROP_CLASS,PROP_LOC,ZIP_CODE,ZIP5,LAND_VAL,IMPRVT_VAL,NET_VALUE,LAST_YR_TX,BLDG_DESC,CALC_ACRE,YR_CONSTR,SALE_PRICE,DEED_DATE,DWELL,COMM_DWELL";
  const unique = new Map<string, any>();

  for (let offset = 0; offset < targetCount; offset += 1000) {
    const pageSize = Math.min(1000, targetCount - offset);
    const params = new URLSearchParams({
      ...common,
      outFields,
      returnGeometry: "false",
      resultOffset: String(offset),
      resultRecordCount: String(pageSize),
      orderByFields: "MUN_NAME ASC, PROP_LOC ASC, PAMS_PIN ASC",
    });
    const rowsRes = await fetch(`${NJOGIS}?${params}`);
    if (!rowsRes.ok) return reply(req, 503, { error: "NJ parcel materialization stopped before completion", code: "SERVICE_UNAVAILABLE" });
    const rowsJson = await rowsRes.json();
    if (rowsJson.error) return reply(req, 503, { error: "NJ parcel materialization query failed", code: "SERVICE_UNAVAILABLE" });
    const batch = (rowsJson.features || []).map((f: any) => normalize(f.attributes || {})).filter((r: any) => r.pams_pin);
    for (const row of batch) unique.set(row.pams_pin, row);
    if ((rowsJson.features || []).length < pageSize && offset + (rowsJson.features || []).length < targetCount) {
      return reply(req, 503, { error: "NJ parcel service returned an incomplete page; the previous durable farm set was preserved.", code: "INCOMPLETE_UPSTREAM_PAGE" });
    }
  }

  if (unique.size !== targetCount) {
    return reply(req, 503, {
      error: "The statewide parcel source did not return the complete expected property-key set; the previous durable farm set was preserved.",
      code: "INCOMPLETE_PROPERTY_SET",
      expected: targetCount,
      received: unique.size,
    });
  }

  const records = Array.from(unique.values());
  for (let i = 0; i < records.length; i += 500) {
    const batch = records.slice(i, i + 500);
    const { error } = await admin.from("property_lookups").upsert(batch, { onConflict: "pams_pin", ignoreDuplicates: false });
    if (error) return reply(req, 500, { error: "Watchdog could not cache the prepared mailing addresses", code: "CACHE_WRITE_FAILED" });
  }

  for (let i = 0; i < records.length; i += 500) {
    const members = records.slice(i, i + 500).map((row: any) => ({
      user_id: authData.user.id,
      dynamic_list_id: list.id,
      pams_pin: row.pams_pin,
      generation,
      matched_at: new Date().toISOString(),
    }));
    const { error } = await admin.from("agent_dynamic_list_properties").insert(members);
    if (error) {
      await admin.from("agent_dynamic_list_properties").delete().eq("dynamic_list_id", list.id).eq("generation", generation);
      return reply(req, 500, { error: "Watchdog could not persist the complete farm property set", code: "MATERIALIZATION_WRITE_FAILED" });
    }
  }

  const snapshot = definition(list);
  const capacityLimited = sourceCount > capacity;
  const status = capacityLimited ? "ready_capacity_limited" : "ready";
  const materializedAt = new Date().toISOString();
  const detail = capacityLimited
    ? `${targetCount} of ${sourceCount} matches are available under the ${tier} plan.`
    : `${targetCount} properties prepared from the live NJ statewide parcel source.`;

  const { error: metaError } = await admin.from("agent_dynamic_list_materializations").upsert({
    dynamic_list_id: list.id,
    user_id: authData.user.id,
    generation,
    definition_snapshot: snapshot,
    source_count: sourceCount,
    materialized_count: targetCount,
    source_complete: !capacityLimited,
    capacity_limited: capacityLimited,
    status,
    source_name: sourceName,
    detail,
    materialized_at: materializedAt,
    updated_at: materializedAt,
  }, { onConflict: "dynamic_list_id" });

  if (metaError) {
    await admin.from("agent_dynamic_list_properties").delete().eq("dynamic_list_id", list.id).eq("generation", generation);
    return reply(req, 500, { error: "Watchdog could not finalize the durable farm set", code: "MATERIALIZATION_FINALIZE_FAILED" });
  }

  await admin.from("agent_dynamic_list_properties").delete().eq("dynamic_list_id", list.id).neq("generation", generation);
  await admin.from("agent_dynamic_lists").update({
    last_count: sourceCount,
    last_checked_at: materializedAt,
    updated_at: materializedAt,
  }).eq("id", list.id).eq("user_id", authData.user.id);
  await admin.rpc("record_municipal_delivery", {
    p_user_id: authData.user.id,
    p_delivery_id: deliveryId,
    p_rows: targetCount,
  });

  return reply(req, 200, {
    list_id: list.id,
    label: list.name,
    plan: tier,
    status,
    source_count: sourceCount,
    materialized_count: targetCount,
    source_complete: !capacityLimited,
    capacity_limited: capacityLimited,
    generation,
    materialized_at: materializedAt,
    source: sourceName,
  });
});