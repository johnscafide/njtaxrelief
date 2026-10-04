// Shared by the /co town pages (api/co-town-page.js), the embedded lookup (api/co-embed-page.js),
// the JSON lookup (api/co-lookup.js) and the Watchdog sitemap.
//
// Town data comes straight from property/data/municipal-requirements/: only towns approved in
// approvals.json are shown, the same gate the publish step uses, so a town page goes live as soon
// as the town is approved and committed. Researcher notes, evidence quotes, open questions,
// how-to-apply text and staff names/emails are left out, as on /co.
//
// Page URLs are /co/<county>/<town>, with the same slugs as the /towns reports
// (scripts/generate_town_pages.py), for example /co/essex/montclair-township.
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const DIR = path.join(ROOT, 'property', 'data', 'municipal-requirements');
const ORIGIN = 'https://www.watchdogindex.com';
const SHARE_IMAGE = `${ORIGIN}/co/co-share.png`;

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return null; }
}

// ---------- public town data (what /api/co-lookup returns) ----------
function text(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 1500); }
function url(v) { const s = text(v, 600); return /^https:\/\//i.test(s) ? s : ''; }
function list(v) { return (Array.isArray(v) ? v : []).map((x) => text(x)).filter(Boolean); }
function fees(v) {
  return (Array.isArray(v) ? v : []).map((f) => ({ label: text(f && f.label, 300), amount: text(f && f.amount, 120), source_url: url(f && f.source_url) }))
    .filter((f) => f.label || f.amount);
}
function sources(...groups) {
  const seen = new Set();
  const out = [];
  groups.flat().forEach((e) => { const u = url(e && e.url); if (u && !seen.has(u)) { seen.add(u); out.push(u); } });
  return out.slice(0, 8);
}
function publicTown(r) {
  const co = r.resale_co || {};
  const fire = r.fire_cert || {};
  const authorities = Array.isArray(fire.authorities) ? fire.authorities : [];
  return {
    status: 'ok',
    code: r.municipality_code,
    town: text(r.municipality, 120),
    county: text(r.county, 60),
    checked_at: text(r.checked_at, 20),
    co: {
      status: ['required', 'not_required', 'not_found'].includes(co.status) ? co.status : 'not_found',
      name: text(co.name, 200),
      issued_by: text(co.issued_by, 200),
      lead_time: text(co.lead_time, 400),
      valid_for: text(co.valid_for, 400),
      requirements: list(co.requirements),
      fees: fees(co.fees),
      how_to_apply: text(co.how_to_apply, 2000),
      application_url: url(co.application_url),
      department_url: url(co.department_url),
      phone: text(co.phone, 80)
    },
    fire: {
      requirements: list(fire.requirements),
      authorities: authorities.map((a) => ({
        name: text(a.name, 200),
        area_served: text(a.area_served, 300),
        lead_time: text(a.lead_time, 400),
        fees: fees(a.fees),
        how_to_apply: text(a.how_to_apply, 2000),
        application_url: url(a.application_url),
        department_url: url(a.department_url),
        phone: text(a.phone, 80)
      }))
    },
    sources: sources(co.evidence || [], authorities.map((a) => a.evidence || []))
  };
}
function approvals() { return (readJson(path.join(DIR, 'approvals.json')) || {}).towns || {}; }
function isApproved(code, a) { return ((a || approvals())[code] || {}).status === 'approved'; }
// One town's public data, or null when it isn't approved yet.
function townData(code, a) {
  if (!/^\d{4}$/.test(String(code || '')) || !isApproved(code, a)) return null;
  const row = readJson(path.join(DIR, 'checked', `${code}.json`));
  return row && row.municipality_code === code ? publicTown(row) : null;
}

// ---------- the town list and URLs ----------
function slug(v) { return String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
function townPath(t) { return `/co/${t.countySlug}/${t.slug}`; }
let cached = null;
function towns() {
  if (cached) return cached;
  const data = readJson(path.join(ROOT, 'co', 'towns.json')) || { towns: [] };
  const a = approvals();
  const all = data.towns.map((t) => {
    const o = { code: t.c, name: t.n, county: t.k, countySlug: slug(t.k), slug: slug(t.n), published: isApproved(t.c, a) };
    o.path = townPath(o);
    return o;
  });
  const byPath = new Map(all.map((t) => [t.path, t]));
  const byCode = new Map(all.map((t) => [t.code, t]));
  const counties = new Map();
  all.forEach((t) => {
    if (!counties.has(t.countySlug)) counties.set(t.countySlug, { slug: t.countySlug, name: t.county, towns: [] });
    counties.get(t.countySlug).towns.push(t);
  });
  counties.forEach((c) => c.towns.sort((x, y) => x.name.localeCompare(y.name)));
  cached = { all, byPath, byCode, counties: new Map([...counties.entries()].sort((x, y) => x[0].localeCompare(y[0]))), approvals: a };
  return cached;
}
function findTown(countySlug, townSlug) { return towns().byPath.get(`/co/${countySlug}/${townSlug}`) || null; }
function findCounty(countySlug) { return towns().counties.get(countySlug) || null; }
// Sitemap rows: /co, every county page and every published town page.
function sitemapRows() {
  const t = towns();
  const rows = [{ path: '/co', changefreq: 'weekly', priority: '0.86' }];
  t.counties.forEach((c) => {
    if (c.towns.some((x) => x.published)) rows.push({ path: `/co/${c.slug}`, changefreq: 'weekly', priority: '0.72' });
  });
  t.all.filter((x) => x.published).forEach((x) => {
    const d = townData(x.code, t.approvals);
    rows.push({ path: x.path, lastmod: d && /^\d{4}-\d{2}-\d{2}/.test(d.checked_at) ? d.checked_at.slice(0, 10) : '', changefreq: 'monthly', priority: '0.74' });
  });
  return rows;
}

// ---------- HTML helpers ----------
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function countyLabel(c) { return String(c || '').toLowerCase().replace(/\b[a-z]/g, (m) => m.toUpperCase()) + ' County'; }
function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  if (!m) return '';
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[+m[2] - 1]} ${+m[3]}, ${m[1]}`;
}
const STATUS = { required: ['req', 'Required'], not_required: ['no', 'Not required'], not_found: ['unsure', 'Not confirmed'] };

module.exports = {
  ORIGIN, SHARE_IMAGE, publicTown, townData, towns, findTown, findCounty, townPath, sitemapRows, slug,
  esc, countyLabel, fmtDate, STATUS
};
