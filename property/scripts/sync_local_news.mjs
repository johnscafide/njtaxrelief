#!/usr/bin/env node
/* Local news sync: pulls each enabled reporter's recent stories
   (property/data/local-sources.json) into public.local_news_items so the home
   feed reads them straight from the database.

   Usage:
     node property/scripts/sync_local_news.mjs              # last 3 days (hourly job)
     node property/scripts/sync_local_news.mjs --days 365   # backfill a year
     node property/scripts/sync_local_news.mjs --dry-run    # fetch and print, write nothing
     node property/scripts/sync_local_news.mjs --only jerseydigs,renj

   Writes need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Re-running is safe:
   rows upsert on (source_id, external_id), and the per-story "hidden" switch is
   never overwritten. */
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

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!dryRun && (!SUPABASE_URL || !SERVICE_KEY)) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (or pass --dry-run).');
  process.exit(1);
}

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
      if (page > 1 && /http 400/.test(String(error && error.message))) break;
      throw error;
    }
    if (!Array.isArray(posts) || !posts.length) break;
    fetched += posts.length;
    posts.forEach(post => {
      const item = news.shapePost(post, source);
      if (!item) return;
      if (news.skipStory(source, item.title, ctx.topicNames(post))) { skipped += 1; return; }
      const towns = news.placeStory(source, index, item.title, ctx.labelNames(post));
      if (towns.length) rows.push(toRow(item, towns));
    });
    if (posts.length < perPage) break;
  }
  return { fetched, skipped, rows };
}

/* RSS feeds carry the latest 10 to 20 stories; WordPress-backed feeds page
   back with ?paged=N, which the backfill uses. */
async function syncRss(source, index, since, pages) {
  const delay = (source.crawlDelaySec || 0) * 1000;
  const rows = [];
  const seen = new Set();
  let fetched = 0, skipped = 0;
  for (let page = 1; page <= pages; page += 1) {
    if (delay && page > 1) await sleep(delay);
    let xml;
    try {
      xml = await news.getText(page === 1 ? source.feed : `${source.feed}${source.feed.includes('?') ? '&' : '?'}paged=${page}`, 30000);
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
      const towns = news.placeStory(source, index, item.title, source.townsFrom === 'categories' ? raw.categories : []);
      if (towns.length) rows.push(toRow(item, towns));
    });
    if (older || !fresh) break;
  }
  return { fetched, skipped, rows };
}

async function syncSource(source, towns) {
  const index = news.townIndex(source, towns);
  const since = new Date(Date.now() - days * 864e5);
  const pages = Math.min(maxPagesArg, source.maxPages || 50);
  const result = source.type === 'rss' ? await syncRss(source, index, since, pages) : await syncWordPress(source, index, since, pages);
  if (!dryRun && result.rows.length) await upsert(result.rows);
  return {
    source: source.id,
    fetched: result.fetched,
    skipped: result.skipped,
    stored: result.rows.length,
    sample: result.rows.slice(0, dryRun ? 12 : 3).map(r => `${r.published_at.slice(0, 10)} ${r.town_codes.join('/')} ${r.image_url ? '[photo]' : '[no photo]'} ${r.title}`)
  };
}

const { sources, towns } = news.loadStatic();
const selected = sources.filter(source => !only.size || only.has(source.id));
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
if (!selected.length) console.log('No enabled local sources.');
/* One unreachable site should not stop the others; fail the run only when every source failed. */
process.exit(selected.length && failed === selected.length ? 1 : 0);
