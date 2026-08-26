'use strict';

const SOURCES = [
  { name:'NJ Spotlight News', feed:'https://www.njspotlightnews.org/housing/feed/', lane:'Housing & Policy', weight:6 },
  { name:'NJ Spotlight News', feed:'https://www.njspotlightnews.org/budget/feed/', lane:'Taxes & Budget', weight:6 },
  { name:'NJBIZ', feed:'https://njbiz.com/feed/?cat=217', lane:'Commercial Real Estate', weight:5 },
  { name:'NJBIZ', feed:'https://njbiz.com/feed/?cat=275', lane:'Government & Business', weight:5 },
  { name:'ROI-NJ', feed:'https://www.roi-nj.com/feed/', lane:'Business & Real Estate', weight:4 },
  { name:'Jersey Digs', feed:'https://jerseydigs.com/feed/', lane:'Development & Real Estate', weight:4 },
  { name:'New Jersey Monitor', feed:'https://newjerseymonitor.com/category/housing/feed/', lane:'Housing & Policy', weight:5 },
  { name:'New Jersey Future', feed:'https://www.njfuture.org/feed/', lane:'Land Use & Housing', weight:4 }
];

const TOPICS = [
  ['property-tax', 'Property Tax', /\b(property tax|property-tax|assessment|assessed value|reassessment|revaluation|tax appeal|chapter 123|anchor|stay nj|senior freeze|tax relief|equalization table|municipal tax|school tax)\b/i],
  ['commercial', 'Commercial', /\b(commercial real estate|office|industrial|warehouse|retail property|mixed-use|mixed use|multifamily|multi-family|development site|redevelopment|data center|logistics|CRE)\b/i],
  ['residential', 'Residential', /\b(home prices?|home sales?|housing market|residential|single-family|single family|condo|min?i?market|mortgage|foreclosure|rent|rental|landlord|tenant|starter home)\b/i],
  ['development', 'Housing / Development', /\b(housing|affordable housing|development|redevelopment|zoning|land use|planning board|construction|permit|transit-oriented|transit oriented|smart growth|inclusionary)\b/i],
  ['policy', 'NJ Policy', /\b(budget|legislation|bill|law|governor|treasury|municipal|county|state aid|taxation|economic development|EDA|PILOT|payment in lieu of taxes)\b/i]
];

const RELEVANCE = /\b(property tax|property-tax|tax relief|assessment|reassessment|revaluation|appeal|anchor|stay nj|senior freeze|real estate|housing|home prices?|home sales?|commercial|office|industrial|warehouse|retail|development|redevelopment|zoning|land use|mortgage|foreclosure|rent|rental|multifamily|multi-family|construction|permit|PILOT|affordable housing|municipal|county budget|state budget|property market|taxation|equalization)\b/i;
const EXCLUDE = /\b(opinion|editorial|sponsored|partner content|advertorial|letters to the editor|sports|celebrity|restaurant review)\b/i;

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

function classify(title, lane) {
  const hay = `${title} ${lane}`;
  for (const [id, label, rx] of TOPICS) if (rx.test(hay)) return { id, label };
  return { id:'property', label:'Property Insights' };
}

function score(title, source) {
  let value = source.weight || 0;
  const hits = title.match(/\b(property tax|assessment|reassessment|revaluation|tax appeal|anchor|stay nj|senior freeze|real estate|housing|commercial|development|redevelopment|zoning|mortgage|foreclosure|PILOT|affordable housing)\b/gi);
  value += hits ? Math.min(8, hits.length * 2) : 0;
  return value;
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
    const publishedRaw = tag(block, ['pubDate','published','updated','dc:date']);
    const publishedAt = Number.isFinite(new Date(publishedRaw).getTime()) ? new Date(publishedRaw).toISOString() : null;
    if (!title || !url || EXCLUDE.test(title) || !RELEVANCE.test(`${title} ${source.lane}`)) return null;
    const topic = classify(title, source.lane);
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
        'user-agent': 'WatchdogNJNews/1.0 (+https://www.watchdogindex.com)',
        accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'
      },
      signal: ctrl.signal,
      redirect: 'follow'
    });
    if (!response.ok) return { source:source.name, ok:false, status:response.status, items:[] };
    const text = await response.text();
    return { source:source.name, ok:true, status:response.status, items:parseFeed(text, source) };
  } catch (_) {
    return { source:source.name, ok:false, status:0, items:[] };
  } finally {
    clearTimeout(timer);
  }
}

function curate(results) {
  const seen = new Set();
  const now = Date.now();
  const maxAge = 45 * 86400000;
  return results.flatMap(r => r.items)
    .filter(item => !item.publishedAt || (now - new Date(item.publishedAt).getTime()) <= maxAge)
    .sort((a,b) => {
      const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return (b.relevance - a.relevance) || (tb - ta);
    })
    .filter(item => {
      const key = normalizeTitle(item.title);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 24)
    .sort((a,b) => (new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime()) || (b.relevance - a.relevance));
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
    sourceHealth: results.map(r => ({ source:r.source, ok:r.ok, status:r.status, itemCount:r.items.length })),
    policy: 'Curated New Jersey property, tax, housing, development and commercial headlines. Opinion and sponsored headlines are excluded when identifiable. Headlines link to the original publisher.'
  };
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=900, stale-while-revalidate=3600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'HEAD') return res.end();
  return res.end(JSON.stringify(payload));
};
