/* Watchdog home feed.
   Read-only town feed for the reimagined home page: the latest complete month of
   state sale records, recent construction permits matched to the parcel table,
   tax-rate history, assessment uniformity, the Chapter 123 ratio, town tax
   medians and the town's resale rules.

   Sales follow the NJW-37 scoped-delivery rules: only a handful of rows per town,
   a per-client durable request budget, no shared CDN cache, and no rows at all
   for obvious extraction clients. Everything else is public reference data. */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const AUTOMATION_UA = /\b(?:curl|wget|python-requests|scrapy|go-http-client|libwww-perl|httpclient)\b/i;
const BUDGETS = [
  { bucket: 'home_feed_minute', seconds: 60, limit: 30 },
  { bucket: 'home_feed_hour', seconds: 3600, limit: 180 }
];
const PERMITS_URL = 'https://data.nj.gov/resource/w9se-dmra.json';
const PERMITS_META_URL = 'https://data.nj.gov/api/views/w9se-dmra.json';
const SIX_HOURS = 6 * 60 * 60 * 1000;
const SALE_ITEMS = 6;
const PERMIT_ITEMS = 8;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const memo = new Map();
const salesFiles = new Map();
let staticData = null;

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), relative), 'utf8'));
}

function loadStatic() {
  if (staticData) return staticData;
  staticData = {
    towns: readJson('property/data/home-feed-towns.json').towns || {},
    rates: readJson('property/tax-rates.json').rates || {},
    uniformity: readJson('property/uniformity.json').districts || {},
    ratios: readJson('chapter123-ratios-2026.json').districts || {}
  };
  return staticData;
}

function cached(key, ttl, load) {
  const hit = memo.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = Promise.resolve().then(load).catch(error => {
    memo.delete(key);
    throw error;
  });
  memo.set(key, { value, expires: Date.now() + ttl });
  if (memo.size > 400) memo.delete(memo.keys().next().value);
  return value;
}

function backend() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ''), key };
}

async function timedFetch(url, options, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms || 6000);
  try {
    return await fetch(url, { ...(options || {}), signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function rest(config, table, params) {
  const url = new URL(`${config.url}/rest/v1/${table}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await timedFetch(url, {
    headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, Accept: 'application/json' }
  }, 6000);
  if (!response.ok) throw new Error(`${table} http ${response.status}`);
  return response.json();
}

async function rpc(config, name, body) {
  const response = await timedFetch(`${config.url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body)
  }, 4000);
  if (!response.ok) throw new Error(`${name} http ${response.status}`);
  const text = await response.text();
  if (!text) return [];
  const data = JSON.parse(text);
  return Array.isArray(data) ? data : [data];
}

function clientHash(req, key) {
  const forwarded = String(req.headers && req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  if (!forwarded) return '';
  return crypto.createHmac('sha256', key).update(forwarded).digest('hex');
}

/* Returns true when this client may receive sale rows. Fails closed: if the
   budget cannot be checked, the feed still renders, just without sale rows. */
async function salesAllowed(req, config) {
  if (!config) return false;
  const hash = clientHash(req, config.key);
  if (!hash) return false;
  try {
    const results = await Promise.all(BUDGETS.map(budget => rpc(config, 'consume_public_request_budget', {
      p_client_hash: hash,
      p_bucket: budget.bucket,
      p_window_seconds: budget.seconds,
      p_limit: budget.limit
    })));
    return results.every(rows => rows[0] && rows[0].allowed === true);
  } catch (error) {
    console.error('home-feed budget', error && error.message || error);
    return false;
  }
}

function slug(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function titleCase(value) {
  const raw = String(value || '').trim().replace(/\s+/g, ' ');
  if (!raw || raw !== raw.toUpperCase()) return raw;
  return raw.toLowerCase().replace(/\b([a-z])/g, m => m.toUpperCase())
    .replace(/\b(Nw|Ne|Sw|Se|Rte|Us|Nj|Cr)\b/g, m => m === 'Rte' ? 'Route' : m.toUpperCase())
    .replace(/(\d)(St|Nd|Rd|Th)\b/g, (m, d, s) => d + s.toLowerCase());
}

function median(values) {
  const list = values.filter(v => Number.isFinite(v)).sort((a, b) => a - b);
  if (!list.length) return null;
  const mid = Math.floor(list.length / 2);
  return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
}

function round(value, digits) {
  const factor = Math.pow(10, digits || 0);
  return Math.round(value * factor) / factor;
}

function monthIndex(year, month) {
  return year * 12 + (month - 1);
}

function monthLabel(index) {
  return `${MONTHS[index % 12]} ${Math.floor(index / 12)}`;
}

function rangeLabel(fromIndex, toIndex) {
  if (fromIndex === toIndex) return monthLabel(toIndex);
  const fromYear = Math.floor(fromIndex / 12);
  const toYear = Math.floor(toIndex / 12);
  return fromYear === toYear
    ? `${MONTHS[fromIndex % 12]} to ${MONTHS[toIndex % 12]} ${toYear}`
    : `${monthLabel(fromIndex)} to ${monthLabel(toIndex)}`;
}

/* SR1A blocks and lots are zero padded (0001602 = 16.02, 00017 = 17). */
function srPart(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.includes('.')) return pinPart(raw);
  const whole = raw.length > 5 ? raw.slice(0, 5) : raw;
  const decimal = raw.length > 5 ? raw.slice(5) : '';
  const head = String(parseInt(whole, 10) || 0);
  return /[1-9]/.test(decimal) ? `${head}.${decimal}` : head;
}

function pinPart(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const [whole, decimal] = raw.split('.');
  const head = /^\d+$/.test(whole) ? String(parseInt(whole, 10)) : whole;
  return decimal && /[1-9]/.test(decimal) ? `${head}.${decimal}` : head;
}

async function parcelsFor(config, pins) {
  const unique = Array.from(new Set(pins.filter(Boolean))).slice(0, 40);
  if (!config || !unique.length) return new Map();
  const list = unique.map(pin => `"${pin.replace(/"/g, '')}"`).join(',');
  const rows = await rest(config, 'property_lookups', {
    select: 'pams_pin,address,prop_class,lat,lon',
    pams_pin: `in.(${list})`
  });
  return new Map((Array.isArray(rows) ? rows : []).map(row => [row.pams_pin, row]));
}

function coord(row) {
  const lat = Number(row && row.lat);
  const lon = Number(row && row.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) && lat > 38.8 && lat < 41.4 && lon > -75.7 && lon < -73.8
    ? { lat: round(lat, 6), lon: round(lon, 6) }
    : null;
}

function countySales(county) {
  const key = slug(county);
  if (salesFiles.has(key)) return salesFiles.get(key);
  const parsed = readJson(`property/sales-${key}.json`);
  const rows = Array.isArray(parsed.sales) ? parsed.sales : [];
  salesFiles.set(key, rows);
  if (salesFiles.size > 4) salesFiles.delete(salesFiles.keys().next().value);
  return rows;
}

/* The newest month in the state file is usually only partly filed. Use the
   latest month that holds at least 40% of the recent typical monthly volume. */
function salesSummary(code, county) {
  const rows = countySales(county).filter(row => String(row && row.d || '') === code && String(row.c || '') === '2'
    && Number(row.p) >= 10000 && Number(row.y) > 2000 && Number(row.m) >= 1 && Number(row.m) <= 12);
  if (!rows.length) return { available: false, reason: 'no_sales' };
  const byMonth = new Map();
  rows.forEach(row => {
    const index = monthIndex(Number(row.y), Number(row.m));
    if (!byMonth.has(index)) byMonth.set(index, []);
    byMonth.get(index).push(row);
  });
  const months = Array.from(byMonth.keys()).sort((a, b) => a - b);
  let batch = months[months.length - 1];
  for (let i = months.length - 1; i >= 0; i -= 1) {
    const prior = months.filter(m => m < months[i] && m >= months[i] - 6).map(m => byMonth.get(m).length);
    const typical = median(prior);
    if (!typical || byMonth.get(months[i]).length >= Math.max(2, typical * 0.4)) { batch = months[i]; break; }
  }
  const batchRows = byMonth.get(batch) || [];
  const windowRows = rows.filter(row => {
    const index = monthIndex(Number(row.y), Number(row.m));
    return index <= batch && index > batch - 3;
  });
  const priorRows = rows.filter(row => {
    const index = monthIndex(Number(row.y), Number(row.m));
    return index <= batch - 12 && index > batch - 15;
  });
  const windowMedian = median(windowRows.map(row => Number(row.p)));
  const priorMedian = median(priorRows.map(row => Number(row.p)));
  const comparable = windowRows.length >= 8 && priorRows.length >= 8 && windowMedian && priorMedian;
  const items = batchRows.slice().sort((a, b) => Number(b.p) - Number(a.p)).slice(0, SALE_ITEMS).map(row => ({
    pin: `${code}_${srPart(row.b)}_${srPart(row.l)}`,
    address: titleCase(row.a),
    price: Number(row.p),
    sqft: Number(row.sf) > 0 ? Number(row.sf) : null,
    yearBuilt: Number(row.yb) > 1700 ? Number(row.yb) : null,
    ppsf: Number(row.ppsf) > 0 ? Number(row.ppsf) : null,
    assessed: Number(row.av) > 0 ? Number(row.av) : null,
    year: Number(row.y),
    month: Number(row.m)
  }));
  return {
    available: true,
    batch: { year: Math.floor(batch / 12), month: (batch % 12) + 1, label: monthLabel(batch) },
    batchCount: batchRows.length,
    items,
    window: {
      label: rangeLabel(batch - 2, batch),
      count: windowRows.length,
      median: windowMedian,
      ppsfMedian: median(windowRows.map(row => Number(row.ppsf)).filter(v => v > 0)),
      priorLabel: rangeLabel(batch - 14, batch - 12),
      priorCount: priorRows.length,
      priorMedian: comparable ? priorMedian : null,
      changePct: comparable ? round((windowMedian / priorMedian - 1) * 100, 1) : null
    }
  };
}

async function salesFor(code, county, config) {
  const summary = salesSummary(code, county);
  if (!summary.available || !summary.items.length) return summary;
  try {
    const parcels = await parcelsFor(config, summary.items.map(item => item.pin));
    summary.items.forEach(item => {
      const place = coord(parcels.get(item.pin));
      item.lat = place ? place.lat : null;
      item.lon = place ? place.lon : null;
    });
  } catch (error) {
    console.error('home-feed sale parcels', error && error.message || error);
  }
  return summary;
}

const USE_LABELS = [
  [/international residential|one- and two-family|1 & 2 family/i, 'home'],
  [/multiple family|dormitor|apartment/i, 'apartment building'],
  [/accessory/i, 'garage, shed or other accessory building'],
  [/business/i, 'business'],
  [/mercantile/i, 'store'],
  [/medical|nursing|hospital|institution/i, 'medical or care facility'],
  [/educational|school/i, 'school'],
  [/assembly|restaurant|church|theater|outdoor activit|grandstand|stadium/i, 'gathering place'],
  [/factory|industrial/i, 'industrial building'],
  [/storage/i, 'storage building'],
  [/hotel|motel|residential.*transient|boarding/i, 'lodging'],
  [/utility|miscellaneous/i, 'utility structure']
];

function useLabel(value) {
  const text = String(value || '');
  const match = USE_LABELS.find(([pattern]) => pattern.test(text));
  return match ? match[1] : (text ? text.toLowerCase() : 'property');
}

function classLabel(value) {
  const code = String(value || '').toUpperCase();
  if (code === '1') return 'vacant land';
  if (code === '2') return 'home';
  if (code === '3A' || code === '3B') return 'farm';
  if (code === '4A') return 'commercial property';
  if (code === '4B') return 'industrial property';
  if (code === '4C') return 'apartment property';
  if (code.startsWith('15')) return 'tax-exempt property';
  return '';
}

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

async function permitsMeta() {
  return cached('permits:meta', SIX_HOURS, async () => {
    const response = await timedFetch(PERMITS_META_URL, { headers: { Accept: 'application/json' } }, 6000);
    if (!response.ok) throw new Error(`permit metadata http ${response.status}`);
    const body = await response.json();
    const updated = Number(body && body.rowsUpdatedAt);
    return { updatedAt: Number.isFinite(updated) && updated > 0 ? new Date(updated * 1000).toISOString() : null };
  });
}

async function permitsFor(code, config) {
  return cached(`permits:${code}`, SIX_HOURS, async () => {
    const today = new Date();
    const since = new Date(today.getTime() - 200 * 864e5);
    const url = new URL(PERMITS_URL);
    url.searchParams.set('$select', 'block,lot,permitno,permitdate,permittypedesc,usegroupdesc,constcost,squarefeet,permitstatusdesc');
    url.searchParams.set('$where', `treasurycode='${code}' AND permitdate >= '${isoDay(since)}T00:00:00' AND permitdate <= '${isoDay(today)}T23:59:59'`);
    url.searchParams.set('$order', 'permitdate DESC');
    url.searchParams.set('$limit', '2000');
    const response = await timedFetch(url, { headers: { Accept: 'application/json' } }, 7000);
    if (!response.ok) throw new Error(`permits http ${response.status}`);
    const rows = (await response.json()).filter(row => row && row.permitdate);
    if (!rows.length) return { available: false, reason: 'no_recent_permits' };
    const through = rows.reduce((max, row) => row.permitdate > max ? row.permitdate : max, '').slice(0, 10);
    const throughDate = new Date(`${through}T00:00:00Z`);
    const windowStart = new Date(throughDate.getTime() - 92 * 864e5);
    const recent = rows.filter(row => new Date(row.permitdate) >= windowStart);
    const cost = row => Number(row.constcost) || 0;
    const type = row => String(row.permittypedesc || '').trim();
    const notable = recent.filter(row => (type(row) === 'New' && cost(row) >= 10000)
      || (type(row) === 'Addition' && cost(row) >= 25000)
      || (type(row) === 'Demolition' && !/accessory/i.test(row.usegroupdesc || ''))
      || cost(row) >= 75000);
    const grouped = new Map();
    notable.forEach(row => {
      const pin = `${code}_${pinPart(row.block)}_${pinPart(row.lot)}`;
      const key = `${pin}|${String(row.permitdate).slice(0, 10)}`;
      const current = grouped.get(key);
      if (!current) grouped.set(key, { row, pin, related: 0 });
      else {
        current.related += 1;
        if (cost(row) > cost(current.row)) current.row = row;
      }
    });
    /* New buildings, additions and demolitions answer "what is going up near
       me", so they outrank interior alterations of similar cost. */
    const weight = row => cost(row) * ({ New: 3, Demolition: 2.5, Addition: 2 }[type(row)] || 1);
    const picked = Array.from(grouped.values()).sort((a, b) => weight(b.row) - weight(a.row)).slice(0, PERMIT_ITEMS);
    let parcels = new Map();
    try { parcels = await parcelsFor(config, picked.map(item => item.pin)); }
    catch (error) { console.error('home-feed permit parcels', error && error.message || error); }
    const items = picked.map(item => {
      const parcel = parcels.get(item.pin) || {};
      const place = coord(parcel);
      return {
        pin: item.pin,
        address: parcel.address ? titleCase(parcel.address) : null,
        type: type(item.row) || 'Permit',
        useLabel: useLabel(item.row.usegroupdesc),
        propertyLabel: classLabel(parcel.prop_class),
        cost: cost(item.row) || null,
        sqft: Number(item.row.squarefeet) > 0 ? Number(item.row.squarefeet) : null,
        date: String(item.row.permitdate).slice(0, 10),
        related: item.related,
        lat: place ? place.lat : null,
        lon: place ? place.lon : null
      };
    });
    const windowFrom = recent.reduce((min, row) => row.permitdate < min ? row.permitdate : min, through).slice(0, 10);
    return {
      available: true,
      dataThrough: through,
      window: { from: windowFrom, to: through },
      total: recent.length,
      notableCount: grouped.size,
      items
    };
  });
}

function taxFor(town) {
  const { rates } = loadStatic();
  const raw = town && town.tk ? rates[town.tk] : null;
  const series = Object.entries(raw || {}).map(([year, rate]) => [Number(year), Number(rate)])
    .filter(([year, rate]) => year > 2000 && rate > 0).sort((a, b) => a[0] - b[0]);
  if (!series.length) return { available: false };
  const last = series[series.length - 1];
  const prior = series.length > 1 ? series[series.length - 2] : null;
  return {
    available: true,
    year: last[0],
    rate: last[1],
    priorYear: prior ? prior[0] : null,
    priorRate: prior ? prior[1] : null,
    changePct: prior && prior[1] > 0 ? round((last[1] / prior[1] - 1) * 100, 1) : null,
    series
  };
}

function fairnessFor(code) {
  const row = loadStatic().uniformity[code];
  if (!row || !row.band) return { available: false };
  return { available: true, band: row.band, cod: Number(row.latest) || null, year: Number(row.latest_year) || null, score: Number(row.score) || null };
}

function ratioFor(code) {
  const row = loadStatic().ratios[code];
  if (!Array.isArray(row) || !Number(row[0])) return { available: false };
  return { available: true, average: Number(row[0]), low: Number(row[1]) || null, high: Number(row[2]) || null, year: 2026 };
}

async function statsFor(town, config) {
  if (!config || !town.m) return { available: false };
  return cached(`stats:${town.m}|${town.c}`, SIX_HOURS, async () => {
    const rows = await rest(config, 'public_town_class_stats', {
      select: 'peers,median_tax,median_assessed,refreshed_at',
      town: `eq.${town.m}`,
      county: `eq.${String(town.c || '').toUpperCase()}`,
      prop_class: 'eq.2',
      limit: '1'
    });
    const row = Array.isArray(rows) && rows[0];
    if (!row) return { available: false };
    return {
      available: true,
      homes: Number(row.peers) || null,
      medianTax: Number(row.median_tax) || null,
      medianAssessed: Number(row.median_assessed) || null,
      refreshedAt: row.refreshed_at || null
    };
  });
}

function firstUrl(value) {
  if (Array.isArray(value)) return value.find(v => typeof v === 'string' && /^https?:\/\//i.test(v)) || null;
  if (value && typeof value === 'object') return firstUrl(Object.values(value));
  return typeof value === 'string' && /^https?:\/\//i.test(value) ? value : null;
}

async function rulesFor(code, config) {
  if (!config) return { available: false };
  return cached(`rules:${code}`, SIX_HOURS, async () => {
    const rows = await rest(config, 'transaction_municipal_requirements', {
      select: 'requirement_key,requirement_state,title,last_verified_at,source_urls,department_url,application_url',
      municipality_code: `eq.${code}`,
      requirement_state: 'eq.explicit_required',
      order: 'requirement_key.asc',
      limit: '6'
    });
    const items = (Array.isArray(rows) ? rows : []).map(row => ({
      key: row.requirement_key,
      title: row.title,
      verifiedAt: row.last_verified_at,
      sourceUrl: firstUrl(row.source_urls) || row.department_url || row.application_url || null
    })).filter(item => item.title);
    return items.length ? { available: true, items } : { available: false };
  });
}

async function townFromZip(zip, config) {
  if (!config || !/^0[78]\d{3}$/.test(zip)) return null;
  return cached(`zip:${zip}`, 24 * 60 * 60 * 1000, async () => {
    const rows = await rest(config, 'nj_zip_districts', {
      select: 'district_code',
      zip: `eq.${zip}`,
      order: 'zip_share.desc',
      limit: '1'
    });
    return Array.isArray(rows) && rows[0] ? String(rows[0].district_code || '') : null;
  });
}

function header(req, name) {
  const value = req.headers && req.headers[name];
  return String(Array.isArray(value) ? value[0] : value || '').trim();
}

function settle(result, label) {
  if (result.status === 'fulfilled') return result.value;
  console.error('home-feed', label, result.reason && result.reason.message || result.reason);
  return { available: false, reason: 'unavailable' };
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET');
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }
  if (AUTOMATION_UA.test(header(req, 'user-agent'))) {
    res.statusCode = 403;
    return res.end(JSON.stringify({ error: 'Automated extraction is not permitted on this endpoint.' }));
  }

  let data;
  try { data = loadStatic(); }
  catch (error) {
    console.error('home-feed static', error && error.message || error);
    res.statusCode = 503;
    return res.end(JSON.stringify({ error: 'The home feed is temporarily unavailable.' }));
  }

  const config = backend();
  const requested = String(req.query && req.query.town || '').replace(/\D/g, '').slice(0, 4);
  let code = data.towns[requested] ? requested : '';
  let source = code ? 'param' : 'none';
  if (!code && header(req, 'x-vercel-ip-country-region').toUpperCase() === 'NJ') {
    try {
      const fromZip = await townFromZip(header(req, 'x-vercel-ip-postal-code'), config);
      if (fromZip && data.towns[fromZip]) { code = fromZip; source = 'ip'; }
    } catch (error) {
      console.error('home-feed zip', error && error.message || error);
    }
  }

  const generatedAt = new Date().toISOString();
  if (!code) {
    return res.end(JSON.stringify({ ok: true, generatedAt, source, town: null }));
  }

  const town = data.towns[code];
  const allowSales = await salesAllowed(req, config);
  const [sales, permits, meta, stats, rules] = await Promise.allSettled([
    allowSales ? salesFor(code, town.c, config) : Promise.resolve({ available: false, reason: 'withheld' }),
    permitsFor(code, config),
    permitsMeta(),
    statsFor(town, config),
    rulesFor(code, config)
  ]);

  const permitBlock = settle(permits, 'permits');
  const metaBlock = meta.status === 'fulfilled' ? meta.value : {};
  if (permitBlock.available) permitBlock.publishedAt = metaBlock.updatedAt || null;

  const body = {
    ok: true,
    generatedAt,
    source,
    town: {
      code,
      name: town.n,
      county: town.c,
      countySlug: slug(town.c),
      townPage: town.p ? `/${town.p}` : null,
      lat: town.lat || null,
      lon: town.lon || null,
      sqMiles: town.sq || null,
      population: town.pop || null
    },
    sales: settle(sales, 'sales'),
    permits: permitBlock,
    tax: taxFor(town),
    fairness: fairnessFor(code),
    ratio: ratioFor(code),
    stats: settle(stats, 'stats'),
    rules: settle(rules, 'rules')
  };
  return res.end(JSON.stringify(body));
};
