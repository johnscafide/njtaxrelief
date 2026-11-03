/* What people are searching for and reading right now, for the "Trending now"
   box on the Backoffice Quote Image page. Sources: Google Trends daily search
   trends RSS (US and New Jersey) and Google News RSS searches for money and
   home topics from the last day. Public feeds, no key. Kept for 15 minutes in
   memory and at the edge. */
const MINUTE = 60 * 1000;
const USER_AGENT = 'Mozilla/5.0 (compatible; WatchdogIndex/1.0; +https://www.watchdogindex.com)';
const TRENDS = 'https://trends.google.com/trending/rss?geo=';
const NEWS = 'https://news.google.com/rss/search?hl=en-US&gl=US&ceid=US:en&q=';
const MONEY_TOPICS = ['mortgage rates', 'housing market', 'home prices', 'property taxes', 'New Jersey real estate', 'stock market', 'Social Security', 'inflation', 'credit card debt', 'personal finance'];

let memo = null;

async function getText(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(url, { headers: { Accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.5', 'User-Agent': USER_AGENT }, signal: controller.signal });
    if (!response.ok) throw new Error(`http ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function decode(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(xml, name) {
  const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return match ? decode(match[1]) : '';
}

function items(xml, name) {
  return String(xml || '').split(`<${name}>`).slice(1).map(part => part.split(`</${name}>`)[0]);
}

function safeUrl(url) {
  return /^https:\/\//i.test(url) ? url : '';
}

function parseTrends(xml) {
  return items(xml, 'item').map(item => ({
    topic: tag(item, 'title'),
    traffic: tag(item, 'ht:approx_traffic'),
    started: Date.parse(tag(item, 'pubDate')) || null,
    news: items(item, 'ht:news_item').slice(0, 2).map(n => ({
      title: tag(n, 'ht:news_item_title'),
      url: safeUrl(tag(n, 'ht:news_item_url')),
      source: tag(n, 'ht:news_item_source')
    })).filter(n => n.title && n.url)
  })).filter(t => t.topic).slice(0, 20);
}

function trafficValue(text) {
  const match = String(text || '').replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*([KM]?)/i);
  if (!match) return 0;
  return Number(match[1]) * (match[2].toUpperCase() === 'M' ? 1e6 : match[2].toUpperCase() === 'K' ? 1e3 : 1);
}

function parseNews(xml, topic) {
  return items(xml, 'item').map(item => {
    const source = tag(item, 'source');
    let title = tag(item, 'title');
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    return { topic, title, url: safeUrl(tag(item, 'link')), source, published: Date.parse(tag(item, 'pubDate')) || null };
  }).filter(n => n.title && n.url);
}

async function trends(geo) {
  const list = parseTrends(await getText(TRENDS + geo, 6000));
  return list.sort((a, b) => trafficValue(b.traffic) - trafficValue(a.traffic));
}

async function money() {
  const results = await Promise.allSettled(MONEY_TOPICS.map(topic => getText(NEWS + encodeURIComponent(`${topic} when:1d`), 6000).then(xml => parseNews(xml, topic).slice(0, 3))));
  const seen = new Set();
  const list = [];
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    for (const story of result.value) {
      const key = story.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (seen.has(key)) continue;
      seen.add(key);
      list.push(story);
    }
  }
  return list.sort((a, b) => (b.published || 0) - (a.published || 0)).slice(0, 24);
}

async function load() {
  const [us, nj, news] = await Promise.allSettled([trends('US'), trends('US-NJ'), money()]);
  const value = (r) => (r.status === 'fulfilled' ? r.value : []);
  const data = { updated: Date.now(), us: value(us), nj: value(nj), money: value(news) };
  if (!data.us.length && !data.nj.length && !data.money.length) throw new Error('no trend data');
  return data;
}

function current() {
  if (memo && memo.expires > Date.now()) return memo.value;
  const value = load().catch(error => {
    memo = null;
    throw error;
  });
  memo = { value, expires: Date.now() + 15 * MINUTE };
  return value;
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET');
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }
  try {
    const data = await current();
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=900, stale-while-revalidate=1800');
    return res.end(JSON.stringify(data));
  } catch (_error) {
    res.statusCode = 503;
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
    return res.end(JSON.stringify({ error: 'Trends are unavailable right now.' }));
  }
};

module.exports._test = { parseTrends, parseNews, trafficValue, decode };
