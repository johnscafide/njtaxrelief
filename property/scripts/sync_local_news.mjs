#!/usr/bin/env node
/* Local news sync: pulls each enabled reporter's recent stories
   (property/data/local-sources.json) into public.local_news_items so the home
   feed reads them straight from the database.

   Usage:
     node property/scripts/sync_local_news.mjs              # last 3 days (hourly job)
     node property/scripts/sync_local_news.mjs --days 365   # backfill a year
     node property/scripts/sync_local_news.mjs --dry-run    # fetch and print, write nothing
     node property/scripts/sync_local_news.mjs --only jerseydigs,renj
     node property/scripts/sync_local_news.mjs --days 365 --prune

   Writes need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. YouTube channels
   also need YOUTUBE_API_KEY (YouTube Data API v3); without it they are skipped
   with a note. Re-running is safe:
   rows upsert on (source_id, external_id), and the per-story "hidden" switch is
   never overwritten. --prune is for re-syncing after a rule change: when a
   source's whole window was read, its stories in that window that this run
   no longer keeps (now filtered out or no longer placed in a town) are
   removed. Hidden stories are always kept. */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const news = require('../../api/_local-news.js');

const args = process.argv.slice(2);
const flag = name => args.includes(name);
const value = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const days = Math.max(1, Math.min(Number(value('--days', '3')) || 3, news.MAX_AGE_DAYS));
const dryRun = flag('--dry-run');
const maxPagesArg = Math.max(1, Math.min(Number(value('--max-pages', '20')) || 20, 50));
const only = new Set(String(value('--only', '')).split(',').map(s => s.trim()).filter(Boolean));
const prune = flag('--prune');
const runStart = new Date().toISOString();

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!dryRun && (!SUPABASE_URL || !SERVICE_KEY)) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (or pass --dry-run).');
  process.exit(1);
}

const YOUTUBE_KEY = process.env.YOUTUBE_API_KEY || '';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function upsert(rows) {
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const response = await fetch(`${SUPABASE_URL}/rest/v1/local_news_items?on_conflict=source_id,external_id`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(batch)
    });
    if (!response.ok) throw new Error(`upsert http ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
}

/* Photos already stored for these stories, so a re-run does not look them up again. */
async function storedImages(sourceId, externalIds) {
  const out = new Map();
  if (dryRun || !externalIds.length) return out;
  for (let i = 0; i < externalIds.length; i += 80) {
    const ids = externalIds.slice(i, i + 80).map(id => `"${String(id).replace(/"/g, '')}"`).join(',');
    const response = await fetch(`${SUPABASE_URL}/rest/v1/local_news_items?source_id=eq.${encodeURIComponent(sourceId)}&external_id=in.(${encodeURIComponent(ids)})&select=external_id,image_url`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
    });
    if (response.ok) (await response.json()).forEach(row => { if (row.image_url) out.set(row.external_id, row.image_url); });
  }
  return out;
}

/* Some feeds only carry a 150px thumbnail or the full upload (often 700 KB).
   For "imageLookup": "wp-media" sources the site's public WordPress media
   list gives the card-sized copy (looked up by slug), newest stories first,
   at most "imageLookupMax" lookups a run (default 120). */
async function upgradeImages(source, rows) {
  const delay = Math.max(1, source.crawlDelaySec || 1) * 1000;
  const cap = source.imageLookupMax || 120;
  const wanted = rows.filter(row => row.image_url && news.wpUploadPath(row.image_url, source));
  const stored = await storedImages(source.id, wanted.map(row => row.external_id));
  let looked = 0;
  for (const row of wanted) {
    const prior = stored.get(row.external_id);
    if (prior && /-\d+x\d+\.\w+$/.test(prior) && !news.isTinyThumb(prior)) { row.image_url = prior; continue; }
    if (looked >= cap) continue;
    looked += 1;
    await sleep(delay);
    /* The upload's slug is usually its file name; the path check makes sure
       it is the same file and not an older one with the same name. */
    const file = news.wpUploadPath(row.image_url, source);
    const slug = file.base.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
    const list = await news.getJson(`${source.api}/media?slug=${encodeURIComponent(slug)}&_fields=source_url,media_details`, 15000).catch(() => []);
    const media = (Array.isArray(list) ? list : []).find(m => m && m.media_details &&
      String(m.media_details.file || '').replace(/\.\w+$/, '').replace(/-scaled$/, '') === file.path);
    const best = media && news.bestSize(Object.values(media.media_details.sizes || {}), source);
    if (best) row.image_url = best.source_url;
  }
  return looked;
}

/* Stories in the window this run did not refresh. The window starts a day
   later than the fetch so a time zone difference at the edge never removes a
   story the run simply did not ask for. */
async function pruneStale(source, since) {
  const from = new Date(since.getTime() + 864e5).toISOString();
  const query = `source_id=eq.${encodeURIComponent(source.id)}&published_at=gte.${encodeURIComponent(from)}&fetched_at=lt.${encodeURIComponent(runStart)}&hidden=eq.false&select=id`;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/local_news_items?${query}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, Prefer: 'return=representation' }
  });
  if (!response.ok) throw new Error(`prune http ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return (await response.json()).length;
}

function toRow(item, towns) {
  return {
    source_id: item.source,
    external_id: item.externalId,
    title: item.title,
    url: item.url,
    published_at: item.publishedAt,
    excerpt: item.excerpt || null,
    image_url: item.image || null,
    image_alt: item.imageAlt || null,
    video_id: item.video ? item.video.id : null,
    town_codes: towns,
    address_keys: item.addresses,
    fetched_at: new Date().toISOString()
  };
}

/* Sites with large posts can fail on 100-post pages; "perPage" lowers it and
   the page budget grows to cover the same number of stories. */
async function syncWordPress(source, index, since, pages) {
  let complete = false;
  const delay = (source.crawlDelaySec || 0) * 1000;
  const perPage = Math.max(10, Math.min(source.perPage || 100, 100));
  pages = Math.min(Math.ceil(pages * 100 / perPage), 100);
  const categories = source.fetchLabels === false ? [] : await news.labelsFor(source, 'categories');
  const tags = source.townsFrom === 'tags' ? await news.labelsFor(source, 'tags') : [];
  const ctx = news.wordpressContext(source, categories, tags);
  const after = since.toISOString().slice(0, 19);
  const rows = [];
  let fetched = 0, skipped = 0;
  for (let page = 1; page <= pages; page += 1) {
    if (delay && (page > 1 || categories.length || tags.length)) await sleep(delay);
    let posts;
    try {
      posts = await news.getJson(`${source.api}/posts?per_page=${perPage}&page=${page}&after=${after}&orderby=date&order=desc${source.query ? `&${source.query}` : ''}&${news.POST_FIELDS}`, 30000);
    } catch (error) {
      /* WordPress answers past the last page with HTTP 400. */
      if (page > 1 && /http 400/.test(String(error && error.message))) { complete = true; break; }
      throw error;
    }
    if (!Array.isArray(posts) || !posts.length) { complete = true; break; }
    fetched += posts.length;
    posts.forEach(post => {
      const item = news.shapePost(post, source);
      if (!item) return;
      if (news.skipStory(source, item.title, ctx.topicNames(post))) { skipped += 1; return; }
      const towns = news.placeStory(source, index, item.title, ctx.labelNames(post));
      if (towns.length) rows.push(toRow(item, towns));
    });
    if (posts.length < perPage) { complete = true; break; }
  }
  return { fetched, skipped, rows, complete };
}

/* RSS feeds carry the latest 10 to 25 stories. WordPress-backed feeds page
   back with ?paged=N, which the backfill uses; "pageParam" and "pageStep"
   cover feeds that page by offset (TownNews BLOX: o=25, o=50 ...), and
   "noPaging" feeds only ever show their latest items. */
function rssPageUrl(source, page) {
  if (page === 1) return source.feed;
  const param = source.pageParam || 'paged';
  const value = source.pageStep ? (page - 1) * source.pageStep : page;
  return `${source.feed}${source.feed.includes('?') ? '&' : '?'}${param}=${value}`;
}

async function syncRss(source, index, since, pages) {
  const delay = (source.crawlDelaySec || 0) * 1000;
  if (source.noPaging) pages = 1;
  const rows = [];
  const seen = new Set();
  let fetched = 0, skipped = 0, complete = false;
  for (let page = 1; page <= pages; page += 1) {
    if (delay && page > 1) await sleep(delay);
    let xml;
    try {
      xml = await news.getText(rssPageUrl(source, page), 30000);
    } catch (error) {
      if (page > 1) break;
      throw error;
    }
    const items = news.rssItems(xml);
    if (!items.length) break;
    let older = false, fresh = 0;
    items.forEach(raw => {
      const item = news.shapeRssItem(raw, source);
      if (!item || seen.has(item.externalId)) return;
      seen.add(item.externalId);
      fresh += 1;
      if (new Date(item.publishedAt) < since) { older = true; return; }
      fetched += 1;
      if (news.skipStory(source, item.title, raw.categories)) { skipped += 1; return; }
      const labels = source.townsFrom === 'categories' ? raw.categories : source.townsFrom === 'url' ? news.urlLabels(item.url) : [];
      const towns = news.placeStory(source, index, item.title, labels);
      if (towns.length) rows.push(toRow(item, towns));
    });
    /* Only an item older than the window proves the whole window was read. */
    if (older) { complete = true; break; }
    if (!fresh) break;
  }
  if (source.imageLookup === 'wp-media') await upgradeImages(source, rows);
  return { fetched, skipped, rows, complete };
}

/* A YouTube channel's uploads, newest first, through the official Data API
   (playlistItems.list costs 1 quota unit per 50 videos). */
async function syncYoutube(source, index, since, pages) {
  const playlist = news.uploadsPlaylist(source.channelId);
  if (!playlist) throw new Error('channelId must be a UC... channel id');
  const rows = [];
  let fetched = 0, skipped = 0, complete = false, pageToken = '';
  for (let page = 1; page <= pages; page += 1) {
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${playlist}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}&key=${encodeURIComponent(YOUTUBE_KEY)}`;
    const data = await news.getJson(url, 20000);
    const entries = Array.isArray(data && data.items) ? data.items : [];
    let older = false;
    entries.forEach(entry => {
      const item = news.shapeYoutubeItem(entry, source);
      if (!item) return;
      if (new Date(item.publishedAt) < since) { older = true; return; }
      fetched += 1;
      if (news.skipStory(source, item.title, [])) { skipped += 1; return; }
      const towns = news.placeStory(source, index, item.title, [], item.description);
      if (towns.length) rows.push(toRow(item, towns));
    });
    pageToken = data && data.nextPageToken;
    if (older || !pageToken) { complete = true; break; }
  }
  return { fetched, skipped, rows, complete };
}

async function syncSource(source, towns) {
  const index = news.townIndex(source, towns);
  const since = new Date(Date.now() - days * 864e5);
  const pages = Math.min(maxPagesArg, source.maxPages || 50);
  const result = source.type === 'rss' ? await syncRss(source, index, since, pages)
    : source.type === 'youtube' ? await syncYoutube(source, index, since, pages)
      : await syncWordPress(source, index, since, pages);
  if (!dryRun && result.rows.length) await upsert(result.rows);
  const removed = prune && result.complete && !dryRun ? await pruneStale(source, since) : null;
  return {
    source: source.id,
    fetched: result.fetched,
    skipped: result.skipped,
    stored: result.rows.length,
    removed,
    sample: result.rows.slice(0, dryRun ? 12 : 3).map(r => `${r.published_at.slice(0, 10)} ${r.town_codes.join('/')} ${r.image_url ? '[photo]' : '[no photo]'} ${r.title}`)
  };
}

const { sources, towns } = news.loadStatic();
const wanted = sources.filter(source => !only.size || only.has(source.id));
const waiting = wanted.filter(source => source.type === 'youtube' && !YOUTUBE_KEY);
if (waiting.length) console.log(`::notice::YouTube channels skipped until the YOUTUBE_API_KEY secret is set: ${waiting.map(source => source.id).join(', ')}`);
const selected = wanted.filter(source => !waiting.includes(source));
let failed = 0;
for (const source of selected) {
  try {
    const result = await syncSource(source, towns);
    console.log(JSON.stringify({ ...result, days, dryRun }));
  } catch (error) {
    failed += 1;
    /* "::warning::" shows up as an annotation on the GitHub Actions run. */
    console.error(`::warning::${source.id}: ${error && error.message ? error.message : error}`);
  }
}
if (!wanted.length) console.log('No enabled local sources.');
/* One unreachable site should not stop the others; fail the run only when every source failed. */
process.exit(selected.length && failed === selected.length ? 1 : 0);
