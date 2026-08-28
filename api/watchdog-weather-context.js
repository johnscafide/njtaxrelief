const NWS_ROOT = 'https://api.weather.gov';
const OPEN_METEO_CUSTOMER_ROOT = 'https://customer-api.open-meteo.com/v1/forecast';
const NJ_BOUNDS = { latMin: 38.8, latMax: 41.4, lonMin: -75.7, lonMax: -73.8 };
const ALLOWED_ORIGINS = new Set([
  'https://watchdogindex.com',
  'https://www.watchdogindex.com',
  'https://njpropertytaxrelief.com',
  'https://www.njpropertytaxrelief.com'
]);

function corsOrigin(req) {
  const raw = String(req.headers.origin || '');
  if (ALLOWED_ORIGINS.has(raw)) return raw;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.vercel.app')) return raw;
  } catch (_) {}
  return 'https://www.watchdogindex.com';
}

function number(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function validNj(lat, lon) {
  return lat !== null && lon !== null &&
    lat >= NJ_BOUNDS.latMin && lat <= NJ_BOUNDS.latMax &&
    lon >= NJ_BOUNDS.lonMin && lon <= NJ_BOUNDS.lonMax;
}

function roundCoord(value) {
  return Math.round(Number(value) * 10000) / 10000;
}

function safeText(value, max = 500) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
}

function baseEnvelope(provider) {
  return {
    ok: true,
    provider,
    context_only: true,
    score_impact: false,
    property_condition_evidence: false,
    insurance_risk_evidence: false,
    checked_at: new Date().toISOString()
  };
}

async function nwsContext(lat, lon) {
  const headers = {
    accept: 'application/geo+json, application/json;q=0.9',
    'user-agent': 'WatchdogPropertyIntelligence/1.0 (https://www.watchdogindex.com/)'
  };
  const pointResponse = await fetch(`${NWS_ROOT}/points/${lat},${lon}`, {
    headers,
    signal: AbortSignal.timeout(6500)
  });
  if (!pointResponse.ok) throw new Error(`NWS point ${pointResponse.status}`);
  const point = await pointResponse.json();
  const props = point && point.properties || {};
  if (!props.forecast || !props.forecastHourly) throw new Error('NWS forecast links unavailable');

  const alertsUrl = `${NWS_ROOT}/alerts/active?point=${lat},${lon}`;
  const [hourlyResponse, forecastResponse, alertsResponse] = await Promise.all([
    fetch(props.forecastHourly, { headers, signal: AbortSignal.timeout(6500) }),
    fetch(props.forecast, { headers, signal: AbortSignal.timeout(6500) }),
    fetch(alertsUrl, { headers, signal: AbortSignal.timeout(6500) })
  ]);
  if (!hourlyResponse.ok || !forecastResponse.ok) throw new Error('NWS forecast unavailable');
  const [hourly, forecast, alerts] = await Promise.all([
    hourlyResponse.json(),
    forecastResponse.json(),
    alertsResponse.ok ? alertsResponse.json() : Promise.resolve({ features: [] })
  ]);
  const hourlyPeriods = hourly?.properties?.periods || [];
  const forecastPeriods = forecast?.properties?.periods || [];
  const activeAlerts = Array.isArray(alerts?.features) ? alerts.features : [];
  const relative = props.relativeLocation?.properties || {};

  return {
    ...baseEnvelope('nws'),
    provider_label: 'NOAA / National Weather Service',
    source_url: 'https://www.weather.gov/documentation/services-web-api',
    location: {
      city: safeText(relative.city, 120) || null,
      state: safeText(relative.state, 20) || 'NJ',
      forecast_office: safeText(props.cwa, 20) || null,
      grid_x: number(props.gridX),
      grid_y: number(props.gridY)
    },
    near_term: hourlyPeriods[0] ? {
      start_time: hourlyPeriods[0].startTime || null,
      temperature: number(hourlyPeriods[0].temperature),
      temperature_unit: hourlyPeriods[0].temperatureUnit || 'F',
      precipitation_probability: number(hourlyPeriods[0].probabilityOfPrecipitation?.value),
      relative_humidity: number(hourlyPeriods[0].relativeHumidity?.value),
      wind_speed: safeText(hourlyPeriods[0].windSpeed, 60) || null,
      wind_direction: safeText(hourlyPeriods[0].windDirection, 20) || null,
      summary: safeText(hourlyPeriods[0].shortForecast, 180) || null,
      is_daytime: hourlyPeriods[0].isDaytime === true
    } : null,
    forecast: forecastPeriods.slice(0, 6).map((period) => ({
      name: safeText(period.name, 80),
      start_time: period.startTime || null,
      temperature: number(period.temperature),
      temperature_unit: period.temperatureUnit || 'F',
      precipitation_probability: number(period.probabilityOfPrecipitation?.value),
      wind_speed: safeText(period.windSpeed, 60) || null,
      summary: safeText(period.shortForecast, 180) || null,
      is_daytime: period.isDaytime === true
    })),
    alerts: activeAlerts.slice(0, 8).map((feature) => {
      const p = feature?.properties || {};
      return {
        event: safeText(p.event, 120) || 'Weather alert',
        severity: safeText(p.severity, 40) || null,
        urgency: safeText(p.urgency, 40) || null,
        headline: safeText(p.headline, 300) || null,
        effective: p.effective || null,
        expires: p.expires || null
      };
    }),
    licensing: 'U.S. National Weather Service open government data; no API fee.',
    note: 'Forecast and alert context only. It is not property-condition, flood-insurance, appraisal, underwriting, or Watchdog Score evidence.'
  };
}

async function openMeteoCommercialContext(lat, lon, apiKey) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    timezone: 'America/New_York',
    forecast_days: '3',
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,snowfall,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
    apikey: apiKey
  });
  const response = await fetch(`${OPEN_METEO_CUSTOMER_ROOT}?${params.toString()}`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(6500)
  });
  if (!response.ok) throw new Error(`Open-Meteo customer API ${response.status}`);
  const data = await response.json();
  const daily = data?.daily || {};
  const times = Array.isArray(daily.time) ? daily.time : [];
  return {
    ...baseEnvelope('open_meteo_commercial'),
    provider_label: 'Open-Meteo Commercial API',
    source_url: 'https://open-meteo.com/en/pricing',
    near_term: data?.current ? {
      time: data.current.time || null,
      temperature: number(data.current.temperature_2m),
      apparent_temperature: number(data.current.apparent_temperature),
      relative_humidity: number(data.current.relative_humidity_2m),
      precipitation: number(data.current.precipitation),
      rain: number(data.current.rain),
      snowfall: number(data.current.snowfall),
      weather_code: number(data.current.weather_code),
      cloud_cover: number(data.current.cloud_cover),
      wind_speed: number(data.current.wind_speed_10m),
      wind_gusts: number(data.current.wind_gusts_10m),
      units: data.current_units || {}
    } : null,
    forecast: times.slice(0, 3).map((day, i) => ({
      day,
      weather_code: number(daily.weather_code?.[i]),
      temperature_max: number(daily.temperature_2m_max?.[i]),
      temperature_min: number(daily.temperature_2m_min?.[i]),
      precipitation_probability_max: number(daily.precipitation_probability_max?.[i]),
      sunrise: daily.sunrise?.[i] || null,
      sunset: daily.sunset?.[i] || null
    })),
    alerts: [],
    licensing: 'Commercial Open-Meteo customer API; API key required by provider terms.',
    note: 'Weather context only. Climate/history endpoints are intentionally not called from this route and are not Watchdog Score evidence.'
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', corsOrigin(req));
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=1800');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'GET or POST required' });

  const input = req.method === 'POST' ? (req.body || {}) : (req.query || {});
  const lat = number(input.lat ?? input.latitude);
  const lon = number(input.lon ?? input.lng ?? input.longitude);
  if (!validNj(lat, lon)) {
    return res.status(400).json({
      ok: false,
      error: 'Valid New Jersey latitude and longitude required',
      code: 'INVALID_NJ_COORDINATES'
    });
  }

  const safeLat = roundCoord(lat);
  const safeLon = roundCoord(lon);
  const commercialKey = String(process.env.OPEN_METEO_API_KEY || '').trim();
  let commercialError = null;

  if (commercialKey) {
    try {
      const result = await openMeteoCommercialContext(safeLat, safeLon, commercialKey);
      return res.status(200).json(result);
    } catch (error) {
      commercialError = safeText(error?.message || error, 160) || 'Open-Meteo commercial provider unavailable';
    }
  }

  try {
    const result = await nwsContext(safeLat, safeLon);
    if (commercialError) result.provider_fallback_reason = commercialError;
    result.open_meteo = commercialKey
      ? { configured: true, active: false, fallback: 'nws' }
      : { configured: false, active: false, reason: 'Commercial API key not configured; free hosted Open-Meteo API is not used by Watchdog.' };
    return res.status(200).json(result);
  } catch (_) {
    return res.status(502).json({
      ok: false,
      error: 'Weather context temporarily unavailable',
      code: 'WEATHER_CONTEXT_UNAVAILABLE',
      context_only: true,
      score_impact: false
    });
  }
};
