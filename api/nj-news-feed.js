'use strict';

const SOURCES = [
  { name:'NJ Spotlight News', feed:'https://www.njspotlightnews.org/housing/feed/', lane:'Housing & Policy', scope:'housing', weight:6 },
  { name:'NJ Spotlight News', feed:'https://www.njspotlightnews.org/budget/feed/', lane:'Taxes & Budget', scope:'tax', weight:7 },
  { name:'NJBIZ', feed:'https://njbiz.com/feed/?cat=217', lane:'Commercial Real Estate', scope:'commercial', weight:6 },
  { name:'NJBIZ', feed:'https://njbiz.com/feed/?cat=275', lane:'Government & Business', scope:'government', weight:5 },
  { name:'Jersey Digs', feed:'https://jerseydigs.com/feed/', lane:'Development & Real Estate', scope:'development', weight:5 },
  { name:'New Jersey Business Magazine', feed:'https://njbmagazine.com/feed', lane:'Business & Development', scope:'business', weight:5 }
];

const TOPICS = [
  ['property-tax', 'Property Tax', /\b(property tax(?:es)?|property-tax|assessment|assessed value|reassessment|revaluation|tax appeal|chapter 123|anchor|stay nj|senior freeze|tax relief|equalization|municipal tax|school tax)\b/i],
  ['commercial', 'Commercial', /\b(commercial real estate|office|industrial|warehouse|retail property|retail center|shopping center|mixed-use|mixed use|multifamily|multi-family|development site|data center|logistics|CRE|lease|leasing)\b/i],
  ['residential', 'Residential', /\b(home prices?|home sales?|housing market|residential|single-family|single family|condo|townhome|mortgage|foreclosure|rent|rental|landlord|tenant|starter home|apartments?|lofts?)\b/i],
  ['development', 'Housing / Development', /\b(housing|affordable housing|development|redevelopment|zoning|land use|planning board|construction loan|construction financing|permit|transit-oriented|transit oriented|smart growth|inclusionary)\b/i],
  ['policy', 'NJ Policy', /\b(state budget|county budget|legislation|property bill|housing bill|treasury|municipal|state aid|taxation|economic development|NJEDA|EDA|PILOT|payment in lieu of taxes)\b/i]
];

const TAX_RELEVANCE = /\b(property tax(?:es)?|property-tax|tax relief|assessment|assessed value|reassessment|revaluation|tax appeal|chapter 123|anchor|stay nj|senior freeze|equalization|realty transfer|mansion tax|municipal tax|school tax)\b/i;
const HOUSING_RELEVANCE = /\b(housing|affordable housing|home prices?|home sales?|housing market|residential|single-family|single family|condo|townhome|mortgage|foreclosure|rent|rental|landlord|tenant|apartments?|multifamily|multi-family|zoning|land use|redevelopment|development|building conversion|hotel conversion)\b/i;
const PROPERTY_RELEVANCE = /\b(real estate|property|housing|residential|commercial|office|industrial|warehouse|retail center|shopping center|development|redevelopment|zoning|land use|planning board|construction loan|construction financing|permit|PILOT|affordable housing|multifamily|multi-family|apartments?|lofts?|tower|building|site|parcel|acre|lease|leasing|leased|sale|sells|sold|financing|loan)\b/i;
const CORE_RELEVANCE = /\b(property tax(?:es)?|tax relief|assessment|reassessment|revaluation|tax appeal|anchor|stay nj|senior freeze|real estate|housing|affordable housing|commercial real estate|residential|office market|industrial|warehouse|redevelopment|zoning|land use|PILOT|property market|realty transfer|mansion tax)\b/i;
const EXCLUDE = /\b(op-?ed|opinion|editorial|sponsored|partner content|advertorial|commentary|letters? to the editor|sports|celebrity|restaurant review)\b/i;

function decodeXml(input) {
  return String(input || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function stripTags(input) {
  return decodeXml(input).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function tag(block, names) {
  for (const name of names) {
    const m = block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
    if (m) return stripTags(m[1]);
  }
  return '';
}

function tags(block, name) {
  const out = [];
  const rx = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, 'gi');
  let m;
  while ((m = rx.exec(block))) out.push(stripTags(m[1]));
  return out;
}

function linkFrom(block) {
  const rss = tag(block, ['link']);
  if (/^https?:\/\//i.test(rss)) return rss;
  const atom = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i);
  return atom ? decodeXml(atom[1]).trim() : '';
}

function cleanUrl(value) {
  try {
    const u = new URL(String(value || ''));
    if (!/^https?:$/.test(u.protocol)) return '';
    u.hash = '';
    ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','fbclid','gclid'].forEach(k => u.searchParams.delete(k));
    return u.toString();
  } catch (_) {
    return '';
  }
}

function relevant(title, source) {
  if (source.scope === 'tax') return TAX_RELEVANCE.test(title);
  if (source.scope === 'housing') return HOUSING_RELEVANCE.test(title);
  if (source.scope === 'commercial' || source.scope === 'development') return PROPERTY_RELEVANCE.test(title);
  return CORE_RELEVANCE.test(title);
}

function classify(title, source) {
  for (const [id, label, rx] of TOPICS) if (rx.test(title)) return { id, label };
  if (source.scope === 'tax') return { id:'property-tax', label:'Property Tax' };
  if (source.scope === 'commercial') return { id:'commercial', label:'Commercial' };
  if (source.scope === 'housing') return { id:'development', label:'Housing / Development' };
  if (source.scope === 'development') return { id:'development', label:'Housing / Development' };
  return { id:'policy', label:'NJ Policy' };
}

function score(title, source) {
  let value = source.weight || 0;
  const hits = title.match(/\b(property tax(?:es)?|assessment|reassessment|revaluation|tax appeal|anchor|stay nj|senior freeze|real estate|housing|commercial|development|redevelopment|zoning|mortgage|foreclosure|PILOT|affordable housing)\b/gi);
  value += hits ? Math.min(8, hits.length * 2) : 0;
  return value;
}

function freshness(publishedAt, now) {
  if (!publishedAt) return 0;
  const age = now - new Date(publishedAt).getTime();
  if (!Number.isFinite(age) || age < 0) return 0;
  if (age <= 2 * 86400000) return 6;
  if (age <= 7 * 86400000) return 4;
  if (age <= 14 * 86400000) return 3;
  if (age <= 30 * 86400000) return 1;
  return 0;
}

function normalizeTitle(title) {
  return String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function parseFeed(xml, source) {
  const blocks = [];
  const itemRx = /<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = itemRx.exec(xml))) blocks.push(m[2]);
  return blocks.map(block => {
    const title = tag(block, ['title']);
    const url = cleanUrl(linkFrom(block));
    const categories = tags(block, 'category').join(' ');
    const publishedRaw = tag(block, ['pubDate','published','updated','dc:date']);
    const publishedAt = Number.isFinite(new Date(publishedRaw).getTime()) ? new Date(publishedRaw).toISOString() : null;
    if (!title || !url || EXCLUDE.test(`${title} ${categories}`) || !relevant(title, source)) return null;
    const topic = classify(title, source);
    return {
      title: title.slice(0, 220),
      url,
      source: source.name,
      sourceLane: source.lane,
      topic: topic.id,
      topicLabel: topic.label,
      publishedAt,
      relevance: score(title, source)
    };
  }).filter(Boolean);
}

async function fetchOne(source) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4500);
  try {
    const response = await fetch(source.feed, {
      headers: {
        'user-agent': 'WatchdogNJNews/1.1 (+https://www.watchdogindex.com)',
        accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'
      },
      signal: ctrl.signal,
      redirect: 'follow'
    });
    if (!response.ok) return { source:source.name, lane:source.lane, ok:false, status:response.status, items:[] };
    const text = await response.text();
    return { source:source.name, lane:source.lane, ok:true, status:response.status, items:parseFeed(text, source) };
  } catch (_) {
    return { source:source.name, lane:source.lane, ok:false, status:0, items:[] };
  } finally {
    clearTimeout(timer);
  }
}

function curate(results) {
  const seen = new Set();
  const sourceCounts = new Map();
  const now = Date.now();
  const maxAge = 45 * 86400000;
  return results.flatMap(r => r.items)
    .filter(item => !item.publishedAt || (now - new Date(item.publishedAt).getTime()) <= maxAge)
    .map(item => Object.assign(item, { rank:item.relevance + freshness(item.publishedAt, now) }))
    .sort((a,b) => {
      const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return (b.rank - a.rank) || (tb - ta);
    })
    .filter(item => {
      const key = normalizeTitle(item.title);
      if (!key || seen.has(key)) return false;
      const count = sourceCounts.get(item.source) || 0;
      if (count >= 7) return false;
      seen.add(key);
      sourceCounts.set(item.source, count + 1);
      return true;
    })
    .slice(0, 24)
    .map(({ rank, ...item }) => item);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    return res.end('Method not allowed');
  }
  const results = await Promise.all(SOURCES.map(fetchOne));
  const items = curate(results);
  const payload = {
    generatedAt: new Date().toISOString(),
    items,
    sourceHealth: results.map(r => ({ source:r.source, lane:r.lane, ok:r.ok, status:r.status, itemCount:r.items.length })),
    policy: 'Curated New Jersey property, tax, housing, development and commercial headlines. Opinion, sponsored and off-topic material are excluded when identifiable. Headlines link to the original publisher.'
  };
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=900, stale-while-revalidate=3600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'HEAD') return res.end();
  return res.end(JSON.stringify(payload));
};
