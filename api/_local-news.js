/* Local reporters: shared parsing for the hourly sync and the home feed.
   property/scripts/sync_local_news.mjs pulls each enabled source's recent posts
   (property/data/local-sources.json), maps them to towns with this module and
   stores them in public.local_news_items. api/watchdog-home-feed.js reads that
   table, so visitors never wait on a reporter's site. Each stored story is the
   reporter's own headline, short excerpt, featured photo and link; the full
   story always stays on their site. Files starting with "_" are not routes.

   Sources are WordPress sites (read through their public REST API) or plain
   RSS feeds. A story is placed in a town by, in order: the reporter's own town
   label (category or tag), a town named in the headline, or the source's home
   town when it only covers one place. */
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

/* Short town names that are also everyday words, people's names or places
   elsewhere ("Deal", "Clark", "Summit", "Berkeley"). In a headline they only
   count with the full name ("Clark Township"); a reporter's own town label for
   them still counts when the source is limited to a few counties. */
const SHORT_NAME_STOPLIST = new Set([
  'Alexandria', 'Alpha', 'Alpine', 'Audubon', 'Berkeley', 'Bethlehem', 'Beverly', 'Bogota', 'Brick', 'Buena',
  'Butler', 'Clark', 'Clayton', 'Commercial', 'Corbin', 'Deal', 'Deerfield', 'Delaware', 'Dennis', 'Dover',
  'Elizabeth', 'Elk', 'Elmer', 'Emerson', 'Fairview', 'Florence', 'Franklin', 'Garfield', 'Gloucester', 'Green',
  'Hamburg', 'Hanover', 'Harding', 'Harmony', 'Highlands', 'Hillside', 'Holland', 'Hope', 'Independence',
  'Interlaken', 'Jackson', 'Jefferson', 'Lafayette', 'Liberty', 'Lincoln', 'Lincoln Park', 'Logan', 'Long Beach',
  'Lower', 'Madison', 'Magnolia', 'Manchester', 'Middle', 'Middlesex', 'Milford', 'Montague', 'Montgomery',
  'Morris', 'National Park', 'Newton', 'Oxford', 'Quinton', 'Randolph', 'Riverside', 'Roosevelt', 'Salem',
  'Shiloh', 'Stockton', 'Summit', 'Sussex', 'Tabernacle', 'Union', 'Upper', 'Vernon', 'Wall', 'Warren',
  'Washington', 'Wayne', 'Westfield', 'White', 'Winfield', 'Woodland'
]);
/* Names people actually write for a few towns. */
const ALIASES = {
  'Parsippany-Troy Hills': ['Parsippany'],
  'Peapack and Gladstone': ['Peapack-Gladstone'],
  'South Orange Village': ['South Orange'],
  'Hi-nella': ['Hi-Nella']
};
/* A town name followed by one of these is a street, county, river or the like:
   "Berlin Road", "Camden County", "Passaic River". */
const PLACE_WORDS = 'Road|Rd|Pike|Avenue|Ave|Street|St|Boulevard|Blvd|Drive|Dr|Lane|Ln|Highway|Hwy|Parkway|Pkwy|Way|Court|Ct|Place|Pl|Circle|Cir|Terrace|Ter|County|River|Creek|Lake|Bay|Inlet|Island|Islands|Valley|Bridge|Junction';
/* "Ocean City, Md." or "Newark, Delaware" is not the New Jersey town. */
const OTHER_STATE = ',\\s+(?:MD|Md\\.|Maryland|NY|N\\.Y\\.|New York|PA|Pa\\.|Penn\\.|Pennsylvania|DE|Del\\.|Delaware|CT|Conn\\.|Connecticut|FL|Fla\\.|Florida|OH|Ohio|CA|Calif\\.|California|MA|Mass\\.|Massachusetts|VA|Va\\.|Virginia|IL|Ill\\.|Illinois)(?!\\w)';

/* The home feed is about places: what is being built, opening, closing or
   decided near you. Crime, deaths, obituaries, opinion and paid posts stay on
   the reporter's site. A source can opt out with "allTopics": true. */
const SKIP_TOPIC = /\b(?:obituar\w*|police|blotter|crimes?|public safety|sponsor\w*|opinion|editorials?|letters? to the editor|lottery|courts?|giveaways?|recipes?|horoscopes?)\b/i;
const SKIP_HEADLINE = /\b(?:arrest(?:ed|s)?|charged|indicted|sentenced|convicted|pleads? guilty|pleaded guilty|shooting|stabb(?:ed|ing)|murder(?:ed|s)?|homicide|manslaughter|fatal(?:ly)?|killed|dead|injur(?:ed|ies|y)|crash(?:es|ed)?|overdose|obituary|dies|died|death|DWI|DUI|missing|sexual assault|police say)\b/i;

const memo = new Map();
let staticData = null;

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), relative), 'utf8'));
}

function loadStatic() {
  if (staticData) return staticData;
  staticData = {
    towns: readJson('property/data/home-feed-towns.json').towns || {},
    sources: (readJson('property/data/local-sources.json').sources || []).filter(s => s && s.enabled && (s.type === 'wordpress' || s.type === 'rss'))
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

async function fetchWithTimeout(url, ms, accept) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms || 7000);
  try {
    const response = await fetch(url, { headers: { Accept: accept, 'User-Agent': USER_AGENT }, signal: controller.signal });
    if (!response.ok) throw new Error(`http ${response.status}`);
    return response;
  } finally {
    clearTimeout(timer);
  }
}
async function getJson(url, ms) {
  return (await fetchWithTimeout(url, ms, 'application/json')).json();
}
async function getText(url, ms) {
  return (await fetchWithTimeout(url, ms, 'application/rss+xml, application/xml;q=0.9, */*;q=0.5')).text();
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
  const clean = String(text || '')
    .replace(/\s*The post .{1,300}? appeared first on .{1,120}$/i, '')
    .replace(/\s*(\[(?:…|&hellip;|\.\.\.)\]|Continue reading.*|Read more.*)$/i, '')
    .trim();
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

/* Photos come from the reporter's own site, a CDN they name in the config, or
   WordPress's image CDN. */
function allowedImage(url, source) {
  if (!url) return false;
  if (sameHost(url, source.site)) return true;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    if (/^i[0-3]\.wp\.com$/.test(u.hostname)) return true;
    return (source.imageHosts || []).some(host => u.hostname === host || u.hostname.endsWith('.' + host));
  } catch (_error) {
    return false;
  }
}

/* ---------- towns ---------- */
const escapeRe = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function variantsOf(name) {
  const out = new Set([name]);
  (ALIASES[name] || []).forEach(alias => out.add(alias));
  if (/^Mount /.test(name)) out.add(name.replace(/^Mount /, 'Mt. '));
  return Array.from(out);
}

function containsWord(haystack, needle) {
  const at = haystack.indexOf(needle);
  if (at < 0) return false;
  const before = haystack.charAt(at - 1), after = haystack.charAt(at + needle.length);
  return !/[\w-]/.test(before) && !/\w/.test(after);
}

/* Every name a headline might use for a town, limited to the source's
   counties ("counties": "all" for statewide sources). A name that fits two
   towns is left out rather than guessed. The source's "labelTowns" pin down
   names the reporter uses that the state list spells differently ("Mays
   Landing", "Gibbstown") or that would otherwise be ambiguous. */
function townIndex(source, towns) {
  const key = `index:${source.id}`;
  const hit = memo.get(key);
  if (hit) return hit.value;
  const counties = Array.isArray(source.counties) && source.counties.length ? new Set(source.counties) : null;
  const groups = new Map();
  const add = (name, code, short) => {
    if (!groups.has(name)) groups.set(name, { codes: new Set(), short: true });
    const group = groups.get(name);
    group.codes.add(code);
    if (!short) group.short = false;
  };
  const statewideNames = new Map();
  Object.keys(towns).forEach(code => {
    const town = towns[code];
    const base = baseName(town.n);
    const names = variantsOf(town.n).map(name => [name, false]).concat(base !== town.n ? variantsOf(base).map(name => [name, true]) : []);
    names.forEach(([name]) => {
      if (!statewideNames.has(name)) statewideNames.set(name, new Set());
      statewideNames.get(name).add(code);
    });
    if (counties && !counties.has(town.c)) return;
    names.forEach(([name, short]) => add(name, code, short));
  });
  const overrides = source.labelTowns || {};
  const byLower = new Map();
  const titleNames = new Map();
  groups.forEach((group, name) => {
    if (group.codes.size !== 1) return;
    const code = Array.from(group.codes)[0];
    const stop = group.short && SHORT_NAME_STOPLIST.has(name);
    if (!(stop && !counties)) byLower.set(name.toLowerCase(), code);
    if (!stop) titleNames.set(name, code);
  });
  Object.keys(overrides).forEach(name => {
    const code = overrides[name];
    if (code) { byLower.set(name.toLowerCase(), code); titleNames.set(name, code); }
    else { byLower.delete(name.toLowerCase()); titleNames.delete(name); }
  });
  const allNames = Array.from(new Set(Array.from(statewideNames.keys()).concat(Object.keys(overrides))));
  const codesOf = name => (overrides[name] ? new Set([overrides[name]]) : statewideNames.get(name) || new Set());
  const entries = Array.from(titleNames.entries()).map(([name, code]) => ({
    code,
    re: new RegExp(`(?<![\\w-])${escapeRe(name)}(?!\\w|-[A-Z])(?!\\s+(?:${PLACE_WORDS})\\b)(?!${OTHER_STATE})`),
    others: allNames.filter(other => other !== name && containsWord(other, name) && !codesOf(other).has(code))
  }));
  const value = { byLower, entries };
  memo.set(key, { value, expires: Infinity });
  return value;
}

function labelCode(name, index) {
  return index.byLower.get(decode(name).trim().toLowerCase()) || null;
}

function townsInHeadline(title, index) {
  const codes = new Set();
  index.entries.forEach(entry => {
    if (entry.re.test(title) && !entry.others.some(other => title.includes(other))) codes.add(entry.code);
  });
  return codes;
}

/* Label codes first, then headline names, then the source's home town. */
function placeStory(source, index, title, labelNames) {
  let codes = new Set();
  if (source.townsFrom && source.townsFrom !== 'none') {
    labelNames.forEach(name => { const code = labelCode(name, index); if (code) codes.add(code); });
  }
  if (!codes.size && source.titleMatch !== false) codes = townsInHeadline(title, index);
  if (!codes.size && Array.isArray(source.defaultTowns)) source.defaultTowns.forEach(code => codes.add(code));
  return Array.from(codes);
}

function skipStory(source, title, topicNames) {
  if (source.allTopics) return false;
  return SKIP_HEADLINE.test(title) || topicNames.some(name => SKIP_TOPIC.test(decode(name)));
}

/* ---------- addresses and video ---------- */
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
function videoFor(html) {
  const id = youtubeIn(html);
  return id ? { id, url: `https://www.youtube.com/watch?v=${id}`, thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` } : null;
}

/* ---------- WordPress ---------- */
/* A source's categories or tags (id + name), cached for the run. */
function labelsFor(source, taxonomy) {
  return cached(`${taxonomy}:${source.id}`, DAY, async () => {
    const all = [];
    for (let page = 1; page <= 10; page += 1) {
      const rows = await getJson(`${source.api}/${taxonomy}?per_page=100&page=${page}&_fields=id,name`, 10000).catch(() => []);
      if (!Array.isArray(rows) || !rows.length) break;
      all.push(...rows);
      if (rows.length < 100) break;
      if (source.crawlDelaySec) await new Promise(resolve => setTimeout(resolve, source.crawlDelaySec * 1000));
    }
    return all;
  });
}

/* The photo size closest to a 480px-wide landscape card. */
function imageFor(post, source) {
  const media = post._embedded && post._embedded['wp:featuredmedia'] && post._embedded['wp:featuredmedia'][0];
  if (!media || media.code) return { url: '', alt: '' };
  const sizes = Object.values((media.media_details && media.media_details.sizes) || {})
    .filter(size => size && size.source_url && size.width && size.height && allowedImage(size.source_url, source));
  const landscape = sizes.filter(size => size.width / size.height >= 1.1 && size.width / size.height <= 2.1);
  const pool = landscape.length ? landscape : sizes;
  const pick = pool.filter(size => size.width >= 480).sort((a, b) => a.width - b.width)[0] || pool.sort((a, b) => b.width - a.width)[0];
  const url = pick ? pick.source_url : (allowedImage(media.source_url, source) ? media.source_url : '');
  return { url: url || '', alt: plain(media.alt_text || '') };
}

function shapePost(post, source) {
  if (!post || !post.link || !sameHost(post.link, source.site)) return null;
  const title = plain(post.title && post.title.rendered);
  if (!title) return null;
  const contentHtml = (post.content && post.content.rendered) || '';
  const image = imageFor(post, source);
  return {
    id: `${source.id}:${post.id}`,
    externalId: String(post.id),
    source: source.id,
    title,
    url: post.link,
    publishedAt: post.date_gmt ? `${String(post.date_gmt).slice(0, 19)}Z` : new Date(post.date).toISOString(),
    excerpt: clip(plain(post.excerpt && post.excerpt.rendered), 220),
    image: image.url,
    imageAlt: image.alt,
    video: videoFor(contentHtml),
    addresses: addressesIn(`${title}. ${plain(contentHtml)}`)
  };
}

/* Category and tag names on a post, for town labels and topic filtering. */
function wordpressContext(source, categories, tags) {
  const names = new Map();
  categories.forEach(row => names.set(`c${row.id}`, decode(row.name)));
  tags.forEach(row => names.set(`t${row.id}`, decode(row.name)));
  return {
    labelNames: post => {
      const out = [];
      if (source.townsFrom === 'categories') (post.categories || []).forEach(id => names.has(`c${id}`) && out.push(names.get(`c${id}`)));
      if (source.townsFrom === 'tags') (post.tags || []).forEach(id => names.has(`t${id}`) && out.push(names.get(`t${id}`)));
      return out;
    },
    topicNames: post => (post.categories || []).map(id => names.get(`c${id}`)).filter(Boolean)
  };
}

const POST_FIELDS = '_fields=id,date,date_gmt,link,title,excerpt,content,tags,categories,_links,_embedded&_embed=wp:featuredmedia';

/* ---------- RSS ---------- */
function cdata(value) {
  return String(value || '').replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1').trim();
}
function rssItems(xml) {
  const items = [];
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(String(xml || '')))) {
    const block = m[1];
    const one = name => { const r = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(block); return r ? cdata(r[1]) : ''; };
    const many = name => Array.from(block.matchAll(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'gi'))).map(r => cdata(r[1]));
    const media = /<(?:media:content|media:thumbnail)\b[^>]*\burl="([^"]+)"/i.exec(block) || /<enclosure\b[^>]*\burl="([^"]+)"[^>]*type="image\//i.exec(block);
    items.push({
      title: one('title'),
      link: decode(one('link')),
      guid: decode(one('guid')),
      pubDate: one('pubDate'),
      categories: many('category').map(decode),
      description: one('description'),
      content: one('content:encoded'),
      media: media ? decode(media[1]) : ''
    });
  }
  return items;
}

function shapeRssItem(item, source) {
  if (!item || !item.link || !sameHost(item.link, source.site)) return null;
  const title = plain(item.title);
  const when = new Date(item.pubDate);
  if (!title || Number.isNaN(when.getTime())) return null;
  const html = item.content || item.description || '';
  const guidId = /[?&]p=(\d+)/.exec(item.guid || '');
  let externalId = guidId ? guidId[1] : '';
  if (!externalId) { try { externalId = new URL(item.link).pathname.replace(/\/+$/, '') || item.link; } catch (_error) { externalId = item.link; } }
  const imgs = Array.from(`${item.content} ${item.description}`.matchAll(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/gi))
    .filter(r => !/\b(?:width|height)="1"/.test(r[0]) && !/gravatar|pixel|feeds\.feedburner/i.test(r[1]))
    .map(r => decode(r[1]));
  const image = [item.media].concat(imgs).find(url => allowedImage(url, source)) || '';
  const alt = image && !item.media ? (/<img\b[^>]*\balt="([^"]*)"/i.exec(html) || [])[1] : '';
  return {
    id: `${source.id}:${externalId}`,
    externalId: externalId.slice(0, 300),
    source: source.id,
    title,
    url: item.link,
    publishedAt: when.toISOString(),
    excerpt: clip(plain(item.description), 220),
    image,
    imageAlt: plain(alt || ''),
    video: videoFor(html),
    addresses: addressesIn(`${title}. ${plain(html)}`)
  };
}

module.exports = {
  USER_AGENT, MAX_AGE_DAYS, POST_FIELDS,
  loadStatic, getJson, getText, labelsFor, wordpressContext, townIndex, placeStory, skipStory,
  shapePost, rssItems, shapeRssItem, addressesIn, streetKey, youtubeIn, clip, decode, plain, baseName
};
