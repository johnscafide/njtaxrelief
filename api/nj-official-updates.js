'use strict';

const SOURCES = [
  {
    name: 'NJ Treasury',
    agency: 'New Jersey Department of the Treasury',
    url: 'https://www.nj.gov/treasury/news.shtml',
    match: /\/treasury\/news\/2026\/\d{8}\.shtml(?:$|[?#])/i,
    weight: 10
  },
  {
    name: 'NJHMFA',
    agency: 'New Jersey Housing and Mortgage Finance Agency',
    url: 'https://www.nj.gov/dca/hmfa/about/pressreleases/index.shtml',
    match: /\/dca\/hmfa\/about\/pressreleases\/2026\/(?:approved\/)?\d{8}\.shtml(?:$|[?#])/i,
    weight: 9
  },
  {
    name: 'NJEDA',
    agency: 'New Jersey Economic Development Authority',
    url: 'https://www.njeda.gov/press-room/?category=press-releases',
    match: /^https:\/\/www\.njeda\.gov\/(?!press-room(?:\/|$))[^?#]+\/?$/i,
    weight: 8
  },
  {
    name: 'NJDEP',
    agency: 'New Jersey Department of Environmental Protection',
    url: 'https://dep.nj.gov/newsrel/',
    match: /^https:\/\/dep\.nj\.gov\/newsrel\/(?:26[_-]\d+|[^/?#]+)\/?$/i,
    weight: 8
  }
];

const TOPICS = [
  ['property-tax', 'Property Tax', /\b(property tax(?:es)?|property-tax|assessment|assessed value|reassessment|revaluation|tax appeal|chapter 123|anchor|stay nj|senior freeze|tax relief|equalization|municipal tax|school tax|realty transfer|mansion tax)\b/i],
  ['commercial', 'Commercial', /\b(commercial real estate|office|industrial|warehouse|retail|mixed-use|mixed use|redevelopment|development site|data center|logistics|c-pace|manufacturing|business facility)\b/i],
  ['residential', 'Residential', /\b(home prices?|home sales?|housing market|residential|single-family|single family|condo|townhome|mortgage|foreclosure|rent|rental|landlord|tenant|apartments?|lofts?)\b/i],
  ['development', 'Housing / Development', /\b(housing|affordable housing|workforce housing|development|redevelopment|zoning|land use|planning board|construction|permit|wetlands?|flood|site remediation|smart growth|inclusionary)\b/i],
  ['policy', 'NJ Policy', /\b(state budget|county budget|legislation|law|treasury|municipal|state aid|taxation|economic development|njeda|pilot|payment in lieu of taxes|grant|tax credit)\b/i]
];

const RELEVANCE = /\b(property tax(?:es)?|tax relief|assessment|reassessment|revaluation|tax appeal|anchor|stay nj|senior freeze|housing|affordable housing|workforce housing|residential|commercial real estate|office|industrial|warehouse|redevelopment|development|zoning|land use|permit|wetland|flood|site remediation|property|real estate|mortgage|foreclosure|rent|rental|apartments?|multifamily|multi-family|construction|pilot|tax credit|c-pace|realty transfer|mansion tax|municipal|ratable|ratables)\b/i;
const EXCLUDE = /\b(board meeting|public hearing|job posting|career|awards ceremony|youth program|sports|tourism event|museum|restaurant|film premiere|movie|festival)\b/i;

function decode(input) {
  return String(input || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}
function stripTags(input) {
  return decode(String(input || '').replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}
function safeUrl(value, base) {
  try {
    const u = new URL(String(value || ''), base);
    if (u.protocol !== 'https:') return '';
    u.hash = '';
    ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','fbclid','gclid'].forEach(k => u.searchParams.delete(k));
    return u.href;
  } catch (_) { return ''; }
}
function classify(title) {
  for (const [id, label, rx] of TOPICS) if (rx.test(title)) return { id, label };
  return { id: 'policy', label: 'NJ Policy' };
}
function dateFromUrl(url) {
  let m = String(url).match(/\/treasury\/news\/2026\/(\d{2})(\d{2})(2026)\.shtml/i);
  if (m) return new Date(`${m[3]}-${m[1]}-${m[2]}T12:00:00Z`).toISOString();
  m = String(url).match(/\/pressreleases\/2026\/(?:approved\/)?(2026)(\d{2})(\d{2})\.shtml/i);
  if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00Z`).toISOString();
  return null;
}
function dateNear(html, index) {
  const text = stripTags(html.slice(Math.max(0, index - 700), Math.min(html.length, index + 180)));
  const month = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(2026)\b/i);
  if (month) {
    const t = Date.parse(`${month[1]} ${month[2]}, ${month[3]} 12:00:00 GMT`);
    if (Number.isFinite(t)) return new Date(t).toISOString();
  }
  const slash = text.match(/\b(\d{1,2})\/(\d{1,2})\/(2026)\b/);
  if (slash) return new Date(`${slash[3]}-${String(slash[1]).padStart(2,'0')}-${String(slash[2]).padStart(2,'0')}T12:00:00Z`).toISOString();
  return null;
}
function score(title, source, publishedAt) {
  let s = source.weight || 0;
  const hits = title.match(/\b(property tax(?:es)?|assessment|reassessment|revaluation|tax appeal|anchor|stay nj|senior freeze|affordable housing|housing|redevelopment|zoning|land use|permit|wetland|flood|commercial real estate|c-pace|tax credit|pilot)\b/gi);
  s += hits ? Math.min(10, hits.length * 2) : 0;
  if (publishedAt) {
    const age = Date.now() - new Date(publishedAt).getTime();
    if (age <= 2 * 86400000) s += 6;
    else if (age <= 7 * 86400000) s += 4;
    else if (age <= 21 * 86400000) s += 2;
  }
  return s;
}
function normalizeTitle(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function parseIndex(html, source) {
  const rows = [];
  const rx = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = rx.exec(html))) {
    const url = safeUrl(m[1], source.url);
    const title = stripTags(m[2]);
    if (!url || !title || title.length < 18 || title.length > 240) continue;
    if (!source.match.test(url)) continue;
    if (EXCLUDE.test(title) || !RELEVANCE.test(title)) continue;
    const publishedAt = dateFromUrl(url) || dateNear(html, m.index);
    const topic = classify(title);
    rows.push({
      title,
      url,
      source: source.name,
      agency: source.agency,
      sourceType: 'official',
      official: true,
      topic: topic.id,
      topicLabel: topic.label,
      publishedAt,
      relevance: score(title, source, publishedAt)
    });
  }
  return rows;
}
async function fetchSource(source) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 5000);
  try {
    const response = await fetch(source.url, {
      signal: ctl.signal,
      redirect: 'follow',
      headers: {
        'user-agent': 'WatchdogNJOfficial/1.0 (+https://www.watchdogindex.com)',
        accept: 'text/html,application/xhtml+xml'
      }
    });
    if (!response.ok) return { source: source.name, ok: false, status: response.status, items: [] };
    const html = await response.text();
    return { source: source.name, ok: true, status: response.status, items: parseIndex(html, source) };
  } catch (_) {
    return { source: source.name, ok: false, status: 0, items: [] };
  } finally {
    clearTimeout(timer);
  }
}
function curate(results) {
  const seen = new Set();
  const bySource = new Map();
  const maxAge = 75 * 86400000;
  return results.flatMap(r => r.items)
    .filter(item => !item.publishedAt || Date.now() - new Date(item.publishedAt).getTime() <= maxAge)
    .sort((a,b) => (b.relevance - a.relevance) || (new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0)))
    .filter(item => {
      const key = normalizeTitle(item.title);
      const count = bySource.get(item.source) || 0;
      if (!key || seen.has(key) || count >= 7) return false;
      seen.add(key);
      bySource.set(item.source, count + 1);
      return true;
    })
    .slice(0, 24);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).end('Method not allowed');
  }
  const results = await Promise.all(SOURCES.map(fetchSource));
  const items = curate(results);
  const payload = {
    generatedAt: new Date().toISOString(),
    items,
    sourceHealth: results.map(r => ({ source: r.source, ok: r.ok, status: r.status, itemCount: r.items.length })),
    policy: 'Official New Jersey agency updates are labeled as government/agency releases. Watchdog curates for property, tax, housing, land-use and real-estate relevance; inclusion does not imply endorsement.'
  };
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=900, stale-while-revalidate=3600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'HEAD') return res.status(200).end();
  return res.status(200).json(payload);
};
