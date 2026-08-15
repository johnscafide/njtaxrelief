import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const NJOGIS = "https://maps.nj.gov/arcgis/rest/services/Framework/Cadastral/MapServer/0/query";
const ORIGINS = new Set(["https://njpropertytaxrelief.com", "https://www.njpropertytaxrelief.com"]);

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.has(origin) ? origin : "https://njpropertytaxrelief.com",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "private, no-store",
    "Vary": "Origin",
  };
}

function reply(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json; charset=utf-8" },
  });
}

function clean(value: unknown, max = 220) {
  return String(value ?? "").trim().replace(/[\u0000-\u001f]/g, "").slice(0, max);
}

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function saleYear(value: unknown) {
  const text = String(value ?? "");
  const full = text.match(/(19|20)\d{2}/);
  if (full) return Number(full[0]);
  if (/^\d{6}$/.test(text)) {
    const year = Number(text.slice(-2));
    return year + (year > 50 ? 1900 : 2000);
  }
  return null;
}

function normalize(attributes: any, geometry: any) {
  let lon: number | null = null;
  let lat: number | null = null;

  if (geometry && Number.isFinite(Number(geometry.x)) && Number.isFinite(Number(geometry.y))) {
    lon = Number(geometry.x);
    lat = Number(geometry.y);
  } else if (geometry && Array.isArray(geometry.rings) && geometry.rings.length) {
    const points = geometry.rings.flat().filter((point: any) => Array.isArray(point) && point.length >= 2);
    if (points.length) {
      lon = points.reduce((sum: number, point: any) => sum + Number(point[0]), 0) / points.length;
      lat = points.reduce((sum: number, point: any) => sum + Number(point[1]), 0) / points.length;
    }
  }

  return {
    pams_pin: clean(attributes.PAMS_PIN, 100),
    address: clean(attributes.PROP_LOC),
    town: clean(attributes.MUN_NAME, 120),
    county: clean(attributes.COUNTY, 80),
    zip: clean(attributes.ZIP5 || attributes.ZIP_CODE, 10),
    block: clean(attributes.PCLBLOCK, 40),
    lot: clean(attributes.PCLLOT, 40),
    qualifier: clean(attributes.PCLQCODE, 40),
    prop_class: clean(attributes.PROP_CLASS, 10),
    year_built: num(attributes.YR_CONSTR),
    acres: num(attributes.CALC_ACRE),
    dwelling_units: num(attributes.DWELL),
    building_desc: clean(attributes.BLDG_DESC, 220),
    land_value: num(attributes.LAND_VAL),
    improvement_value: num(attributes.IMPRVT_VAL),
    assessed_value: num(attributes.NET_VALUE),
    last_year_tax: num(attributes.LAST_YR_TX),
    last_sale_price: num(attributes.SALE_PRICE),
    last_sale_year: saleYear(attributes.DEED_DATE),
    lat,
    lon,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return reply(req, 405, { error: "POST required" });

  try {
    const origin = req.headers.get("origin") || "";
    if (origin && !ORIGINS.has(origin)) return reply(req, 403, { error: "Origin not allowed" });

    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return reply(req, 401, { error: "Sign in required" });

    const userClient = createClient(URL, ANON, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    });
    const admin = createClient(URL, SERVICE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return reply(req, 401, { error: "Session could not be verified" });

    const access = await userClient.rpc("marketing_studio_bootstrap");
    if (access.error) return reply(req, 403, { error: "Marketing Studio access required" });

    const planResult = await admin.rpc("watchdog_effective_plan", { p_user_id: user.id });
    if (planResult.error) {
      console.error("AUDIENCE_MAP_PLAN", planResult.error);
      return reply(req, 500, { error: "Watchdog could not check your plan. Try again." });
    }

    const plan = planResult.data || "standard";
    const limitResult = await admin.rpc("agent_plan_limits", { p_plan: plan });
    if (limitResult.error) {
      console.error("AUDIENCE_MAP_LIMITS", limitResult.error);
      return reply(req, 500, { error: "Watchdog could not load your audience limits. Try again." });
    }

    const limits = limitResult.data || {};
    const capacity = Math.max(0, Number(limits.properties || 0));
    const requestLimit = Math.max(1, Number(limits.requests_5m || 20));
    if (capacity < 1) return reply(req, 403, { error: "Audience mapping requires an Agent or professional plan." });

    const body = await req.json().catch(() => ({}));
    const mode = clean(body.mode, 20).toLowerCase();
    const previewLimit = Math.min(Math.max(Number(body.limit) || 150, 1), 500, capacity);
    let spatial: Record<string, string> = {};

    if (mode === "radius") {
      const lat = num(body.lat);
      const lon = num(body.lon);
      const miles = Math.max(0.1, Math.min(num(body.radius_miles) || 1, 50));
      if (lat === null || lon === null || lat < 38.7 || lat > 41.4 || lon < -75.7 || lon > -73.8) {
        return reply(req, 400, { error: "Choose a valid New Jersey address." });
      }
      spatial = {
        geometry: `${lon},${lat}`,
        geometryType: "esriGeometryPoint",
        inSR: "4326",
        spatialRel: "esriSpatialRelIntersects",
        distance: String(miles),
        units: "esriSRUnit_StatuteMile",
      };
    } else if (mode === "polygon") {
      const rings = body?.polygon?.rings;
      if (!Array.isArray(rings) || !rings.length || !Array.isArray(rings[0]) || rings[0].length < 4) {
        return reply(req, 400, { error: "Draw a valid map area." });
      }
      spatial = {
        geometry: JSON.stringify({ rings, spatialReference: { wkid: 4326 } }),
        geometryType: "esriGeometryPolygon",
        inSR: "4326",
        spatialRel: "esriSpatialRelIntersects",
      };
    } else {
      return reply(req, 400, { error: "mode must be radius or polygon" });
    }

    const classes = Array.isArray(body.property_classes)
      ? body.property_classes.map((value: any) => clean(value, 4)).filter((value: string) => /^[0-9A-Z.]{1,4}$/i.test(value))
      : [];

    let where = "1=1";
    if (classes.length) {
      where += ` AND PROP_CLASS IN (${classes.map((value: string) => `'${value.replaceAll("'", "''")}'`).join(",")})`;
    }

    const delivery = crypto.randomUUID();
    const quotaResult = await admin.rpc("consume_municipal_quota", {
      p_user_id: user.id,
      p_endpoint: "marketing-audience-map",
      p_limit: requestLimit,
      p_rows: 0,
      p_delivery_id: delivery,
    });

    if (quotaResult.error) {
      console.error("AUDIENCE_MAP_QUOTA", quotaResult.error);
      return reply(req, 500, { error: "Watchdog could not start the map search. Try again." });
    }

    const quota = quotaResult.data;
    if (!quota?.allowed) {
      return reply(req, 429, {
        error: "Map refresh limit reached. Try again after the usage window resets.",
        code: "AGENT_QUOTA_REQUESTS",
        reset_at: quota?.reset_at,
      });
    }

    const common = { f: "json", where, ...spatial };
    const countParams = new URLSearchParams({ ...common, returnCountOnly: "true" });
    const rowParams = new URLSearchParams({
      ...common,
      outFields: "PAMS_PIN,PCLBLOCK,PCLLOT,PCLQCODE,COUNTY,MUN_NAME,PROP_CLASS,PROP_LOC,ZIP_CODE,ZIP5,LAND_VAL,IMPRVT_VAL,NET_VALUE,LAST_YR_TX,BLDG_DESC,CALC_ACRE,YR_CONSTR,SALE_PRICE,DEED_DATE,DWELL",
      returnGeometry: "true",
      outSR: "4326",
      resultOffset: "0",
      resultRecordCount: String(previewLimit),
      orderByFields: "MUN_NAME ASC, PROP_LOC ASC",
    });

    const timeout = AbortSignal.timeout(15000);
    const [countRes, rowRes] = await Promise.all([
      fetch(`${NJOGIS}?${countParams}`, { signal: timeout }),
      fetch(`${NJOGIS}?${rowParams}`, { signal: timeout }),
    ]);

    if (!countRes.ok || !rowRes.ok) {
      return reply(req, 503, { error: "New Jersey parcel data is temporarily unavailable. Try again." });
    }

    const [countJson, rowJson] = await Promise.all([countRes.json(), rowRes.json()]);
    if (countJson.error || rowJson.error) {
      console.error("AUDIENCE_MAP_NJOGIS", countJson.error || rowJson.error);
      return reply(req, 503, { error: "New Jersey parcel data is temporarily unavailable. Try again." });
    }

    const total = Math.max(0, Number(countJson.count || 0));
    const records = (rowJson.features || [])
      .map((feature: any) => normalize(feature.attributes || {}, feature.geometry))
      .filter((record: any) => record.pams_pin);

    if (records.length) {
      const now = new Date().toISOString();
      const cache = records.map((record: any) => ({
        ...record,
        last_seen: now,
        history: {
          source: "NJ Office of GIS statewide Parcels and MOD-IV Composite",
          purpose: "marketing_audience_map_preview",
          cached_at: now,
        },
      }));
      const { error: cacheError } = await admin.from("property_lookups").upsert(cache, { onConflict: "pams_pin" });
      if (cacheError) console.warn("AUDIENCE_MAP_CACHE", cacheError);
    }

    const rowUsage = await admin.rpc("record_municipal_quota_rows", {
      p_user_id: user.id,
      p_endpoint: "marketing-audience-map",
      p_rows: records.length,
      p_delivery_id: delivery,
    });
    if (rowUsage.error) console.warn("AUDIENCE_MAP_ROW_USAGE", rowUsage.error);

    return reply(req, 200, {
      environment: "live_nj_parcels",
      source: "NJ Office of GIS statewide Parcels and MOD-IV Composite via Watchdog",
      mode,
      count: total,
      accessible_count: Math.min(total, capacity),
      capacity_limited: total > capacity,
      preview_count: records.length,
      preview_limit: previewLimit,
      records,
      plan: String(plan),
      checked_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("AUDIENCE_MAP_UNHANDLED", error);
    return reply(req, 500, { error: "Watchdog could not load the map audience. Try again." });
  }
});