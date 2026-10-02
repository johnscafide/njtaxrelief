/* Local reporters: shared parsing for the hourly sync and the home feed.
   property/scripts/sync_local_news.mjs pulls each enabled source's recent posts
   (property/data/local-sources.json), maps them to towns with this module and
   stores them in public.local_news_items. api/watchdog-home-feed.js reads that
   table, so visitors never wait on a reporter's site. Each stored story is the
   reporter's own headline, short excerpt, featured photo and link; the full
   story always stays on their site. Files starting with "_" are not routes. */
const fs = require('fs');
const path = require('path');

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const MAX_AGE_DAYS = 365;
const USER_AGENT = 'WatchdogIndex/1.0 (+https://www.watchdogindex.com)';
const STREET_TYPES = {
  road: 'rd', rd: 'rd', pike: 'pike', avenue: 'ave', ave: 'ave', street: 'st', st: 'st',
  boulevard: 'blvd', blvd: 'blvd', drive: 'dr', dr: 'dr', lane: 'ln', ln: 'ln',
  highway: 'hwy', hwy: 'hwy', parkway: 'pkwy', pkwy: 'pkwy', way: 'way', court: 'ct', ct: 'ct',
  place: 'pl', pl: 'pl', circle: 'cir', cir: 'cir', terrace: 'ter', ter: 'ter'
};

const memo = new Map();
let staticData = null;

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), relative), 'utf8'));
}

function loadStatic() {
  if (staticData) return staticData;
  staticData = {
    towns: readJson('property/data/home-feed-towns.json').towns || {},
    sources: (readJson('property/data/local-sources.json').sources || []).filter(s => s && s.enabled && s.type === 'wordpress')
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
  if (memo.size > 300) memo.delete(memo.keys().next().value);
  return value;
}

async function getJson(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms || 7000);
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT }, signal: controller.signal });
    if (!response.ok) throw new Error(`http ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
function decode(value) {
  return String(value == null ? '' : value)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => (NAMED[name.toLowerCase()] != null ? NAMED[name.toLowerCase()] : m));
}

function plain(html) {
  return decode(String(html || '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function clip(text, max) {
  const clean = String(text || '').replace(/\s*(\[(?:…|&hellip;|\.\.\.)\]|Continue reading.*|Read more.*)$/i, '').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20)).replace(/[\s,;:.-]+$/, '') + '…';
}

function baseName(name) {
  return String(name || '').replace(/\s+(Township|Borough|City|Town|Village)$/i, '').trim();
}

function sameHost(url, site) {
  try {
    const a = new URL(url), b = new URL(site);
    return a.protocol === 'https:' && (a.hostname === b.hostname || a.hostname.endsWith('.' + b.hostname));
  } catch (_error) {
    return false;
  }
}

/* The reporter's own town tags, mapped to Watchdog municipality codes. */
function tagsFor(source) {
  return cached(`tags:${source.id}`, DAY, async () => {
    const all = [];
    for (let page = 1; page <= 10; page += 1) {
      const rows = await getJson(`${source.api}/tags?per_page=100&page=${page}&_fields=id,name,count`, 7000).catch(() => []);
      if (!Array.isArray(rows) || !rows.length) break;
      all.push(...rows);
      if (rows.length < 100) break;
    }
    return all;
  });
}

function townCodeForTag(source, tagName, towns) {
  const name = decode(tagName).trim();
  if (source.tagTowns && Object.prototype.hasOwnProperty.call(source.tagTowns, name)) return source.tagTowns[name];
  const key = name.toLowerCase();
  const hits = Object.keys(towns).filter(code => {
    const town = towns[code];
    if (!(source.counties || []).includes(town.c)) return false;
    return town.n.toLowerCase() === key || baseName(town.n).toLowerCase() === key;
  });
  return hits.length === 1 ? hits[0] : null;
}

/* Street addresses in a story, as match keys like "303 white horse pike" or
   "53 route 73". Directions and hyphens are dropped so "303 South White
   Horse Pike" and "1515 Woodbury-Glassboro Road" match the permit record.
   home-feed.js builds the same keys for permit addresses. */
function streetKey(number, name, type) {
  const street = String(name).toLowerCase().replace(/[-/]/g, ' ').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  return `${number} ${street} ${STREET_TYPES[String(type).toLowerCase().replace('.', '')] || String(type).toLowerCase()}`;
}
function addressesIn(text) {
  const found = new Set();
  const street = /\b(\d{1,5})\s+(?:(?:[Nn]orth|[Ss]outh|[Ee]ast|[Ww]est|[NSEW]\.?)\s+)?((?:[A-Z][A-Za-z'.-]*\s+){0,3}?[A-Z][A-Za-z'.-]*)\s+(Road|Rd|Pike|Avenue|Ave|Street|St|Boulevard|Blvd|Drive|Dr|Lane|Ln|Highway|Hwy|Parkway|Pkwy|Way|Court|Ct|Place|Pl|Circle|Cir|Terrace|Ter)\b\.?/g;
  const route = /\b(\d{1,5})\s+(?:(?:north|south|east|west|[nsew]\.?)\s+)?(?:Route|Rt\.?|Rte\.?|State Highway|US|U\.S\.)\s*(\d{1,3})\b/gi;
  let m;
  while ((m = street.exec(text))) found.add(streetKey(m[1], m[2], m[3]));
  while ((m = route.exec(text))) found.add(`${m[1]} route ${Number(m[2])}`);
  return Array.from(found).slice(0, 8);
}

function youtubeIn(html) {
  const m = String(html || '').match(/(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=|shorts\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : '';
}

function imageFor(post, source) {
  const media = post._embedded && post._embedded['wp:featuredmedia'] && post._embedded['wp:featuredmedia'][0];
  if (!media || media.code) return { url: '', alt: '' };
  const sizes = (media.media_details && media.media_details.sizes) || {};
  const pick = ['mv_trellis_4x3_med_res', 'medium_large', 'mv_trellis_4x3', 'medium', 'full']
    .map(name => sizes[name] && sizes[name].source_url)
    .find(url => url && sameHost(url, source.site)) || (sameHost(media.source_url, source.site) ? media.source_url : '');
  return { url: pick || '', alt: plain(media.alt_text || '') };
}

function shapePost(post, source) {
  if (!post || !post.link || !sameHost(post.link, source.site)) return null;
  const title = plain(post.title && post.title.rendered);
  if (!title) return null;
  const contentHtml = (post.content && post.content.rendered) || '';
  const text = `${title}. ${plain(contentHtml)}`;
  const image = imageFor(post, source);
  const video = youtubeIn(contentHtml);
  return {
    id: `${source.id}:${post.id}`,
    source: source.id,
    title,
    url: post.link,
    date: String(post.date || '').slice(0, 19),
    excerpt: clip(plain(post.excerpt && post.excerpt.rendered), 220),
    image: image.url,
    imageAlt: image.alt,
    video: video ? { id: video, url: `https://www.youtube.com/watch?v=${video}`, thumb: `https://i.ytimg.com/vi/${video}/hqdefault.jpg` } : null,
    addresses: addressesIn(text)
  };
}

const POST_FIELDS = '_fields=id,date,date_gmt,link,title,excerpt,content,tags,_links,_embedded&_embed=wp:featuredmedia';
const STREET_WORDS = 'Road|Rd|Pike|Avenue|Ave|Street|St|Boulevard|Blvd|Drive|Dr|Lane|Ln|Highway|Hwy|Parkway|Pkwy|Way|Court|Ct|Place|Pl|Circle|Cir|Terrace|Ter|County';

/* Which Watchdog towns a source's tags point to, plus headline matchers for
   untagged posts. A headline counts for a town unless it names a different
   town containing that name ("West Deptford" vs "Deptford") or uses it as a
   street or county name ("Berlin Road", "Camden County"). */
function tagContext(source, tags, towns) {
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const codeByTagId = new Map();
  tags.forEach(tag => {
    const code = townCodeForTag(source, tag.name, towns);
    if (code) codeByTagId.set(tag.id, code);
  });
  const allNames = tags.map(tag => decode(tag.name));
  const names = tags.filter(tag => codeByTagId.has(tag.id)).map(tag => {
    const name = decode(tag.name), code = codeByTagId.get(tag.id);
    return {
      code,
      re: new RegExp(`\\b${escape(name)}\\b(?!\\s+(?:${STREET_WORDS})\\b)`),
      others: allNames.filter(other => other !== name && new RegExp(`\\b${escape(name)}\\b`).test(other) && townCodeForTag(source, other, towns) !== code)
    };
  });
  return { codeByTagId, names };
}

function townsForPost(post, ctx) {
  const codes = new Set();
  (post.tags || []).forEach(id => { if (ctx.codeByTagId.has(id)) codes.add(ctx.codeByTagId.get(id)); });
  if (!codes.size) {
    const title = plain(post.title && post.title.rendered);
    ctx.names.forEach(entry => { if (entry.re.test(title) && !entry.others.some(other => title.includes(other))) codes.add(entry.code); });
  }
  return Array.from(codes);
}

module.exports = { USER_AGENT, loadStatic, getJson, tagsFor, townCodeForTag, tagContext, townsForPost, shapePost, POST_FIELDS, addressesIn, streetKey, youtubeIn, clip, decode, plain, baseName, MAX_AGE_DAYS };
