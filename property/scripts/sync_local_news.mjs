#!/usr/bin/env node
/* Local news sync: pulls each enabled reporter's recent stories
   (property/data/local-sources.json) into public.local_news_items so the home
   feed reads them straight from the database.

   Usage:
     node property/scripts/sync_local_news.mjs              # last 3 days (hourly job)
     node property/scripts/sync_local_news.mjs --days 365   # backfill a year
     node property/scripts/sync_local_news.mjs --dry-run    # fetch and print, write nothing

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
const maxPages = Math.max(1, Math.min(Number(value('--max-pages', '20')) || 20, 50));

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!dryRun && (!SUPABASE_URL || !SERVICE_KEY)) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (or pass --dry-run).');
  process.exit(1);
}

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

async function syncSource(source, towns) {
  const tags = await news.tagsFor(source);
  const ctx = news.tagContext(source, tags, towns);
  const after = new Date(Date.now() - days * 864e5).toISOString().slice(0, 19);
  const rows = [];
  let fetched = 0;
  for (let page = 1; page <= maxPages; page += 1) {
    let posts;
    try {
      posts = await news.getJson(`${source.api}/posts?per_page=100&page=${page}&after=${after}&orderby=date&order=desc&${news.POST_FIELDS}`, 20000);
    } catch (error) {
      /* WordPress answers past the last page with HTTP 400. */
      if (page > 1 && /http 400/.test(String(error && error.message))) break;
      throw error;
    }
    if (!Array.isArray(posts) || !posts.length) break;
    fetched += posts.length;
    posts.forEach(post => {
      const towns = news.townsForPost(post, ctx);
      const item = towns.length ? news.shapePost(post, source) : null;
      if (!item) return;
      const published = post.date_gmt ? `${String(post.date_gmt).slice(0, 19)}Z` : `${item.date}Z`;
      rows.push({
        source_id: source.id,
        external_id: String(post.id),
        title: item.title,
        url: item.url,
        published_at: published,
        excerpt: item.excerpt || null,
        image_url: item.image || null,
        image_alt: item.imageAlt || null,
        video_id: item.video ? item.video.id : null,
        town_codes: towns,
        address_keys: item.addresses,
        fetched_at: new Date().toISOString()
      });
    });
    if (posts.length < 100) break;
  }
  if (!dryRun && rows.length) await upsert(rows);
  return { source: source.id, tags: tags.length, fetched, stored: rows.length, sample: rows.slice(0, 3).map(r => `${r.published_at.slice(0, 10)} ${r.town_codes.join('/')} ${r.title}`) };
}

const { sources, towns } = news.loadStatic();
let failed = false;
for (const source of sources) {
  try {
    const result = await syncSource(source, towns);
    console.log(JSON.stringify({ ...result, days, dryRun }));
  } catch (error) {
    failed = true;
    console.error(`${source.id}: ${error && error.message ? error.message : error}`);
  }
}
if (!sources.length) console.log('No enabled local sources.');
process.exit(failed ? 1 : 0);
