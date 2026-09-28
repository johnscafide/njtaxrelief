/* Public property pages: https://www.watchdogindex.com/nj/<town>/<address>/<pams_pin>

   One server-rendered page per NJ property, so search engines and shared
   links can reach what the address popup shows. The page is built from
   Watchdog's own copy of the state parcel list (get_public_property_page)
   and cached at the edge for a day; nothing is generated ahead of time.

   - The last path segment (the PAMS PIN) decides the property. Town and
     address segments are for people and search engines; if they don't match
     the canonical ones the request is redirected there (308).
   - Public-record fields only. Owner names and mailing addresses are never
     stored, so they cannot appear.
   - Rollout is per county: pages outside INDEXABLE_COUNTIES are served with
     noindex until that county is released to search engines. */

const CANONICAL_ORIGIN = 'https://www.watchdogindex.com';
const PAGE_CACHE = 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800';

// Counties released to search engines. Empty while the pilot is reviewed.
const INDEXABLE_COUNTIES = new Set([]);

const DIMENSIONS = [
  { key: 'recourse', letter: 'R', name: 'Recourse', slug: 'recourse' },
  { key: 'fairness', letter: 'O', name: 'Overassessment Position', slug: 'overassessment-position' },
  { key: 'burden', letter: 'B', name: 'Burden', slug: 'burden' },
  { key: 'uniformity', letter: 'U', name: 'Uniformity', slug: 'uniformity' },
  { key: 'stability', letter: 'S', name: 'Stability', slug: 'stability' },
  { key: 'trajectory', letter: 'T', name: 'Trajectory', slug: 'trajectory' }
];

// NJ property classes (N.J.A.C. 18:12-2.2).
const PROPERTY_CLASSES = {
  '1': ['Vacant land', 'vacant lots'],
  '2': ['Residential', 'homes'],
  '3A': ['Farm (regular)', 'farm properties'],
  '3B': ['Farmland (qualified)', 'qualified farmland parcels'],
  '4A': ['Commercial', 'commercial properties'],
  '4B': ['Industrial', 'industrial properties'],
  '4C': ['Apartment', 'apartment properties'],
  '5A': ['Railroad (Class I)', 'railroad properties'],
  '5B': ['Railroad (Class II)', 'railroad properties'],
  '6A': ['Telecommunications', 'telecommunications properties'],
  '15A': ['Exempt: public school', 'public school properties'],
  '15B': ['Exempt: other school', 'school properties'],
  '15C': ['Exempt: public property', 'public properties'],
  '15D': ['Exempt: church and charitable', 'church and charitable properties'],
  '15E': ['Exempt: cemetery', 'cemetery properties'],
  '15F': ['Exempt: other', 'exempt properties']
};

const TOWN_WORDS = { TWP: 'Township', BORO: 'Borough', BOROUGH: 'Borough', CITY: 'City', TOWN: 'Town', VILLAGE: 'Village' };

const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function titleWord(word) {
  if (/^\d+(ST|ND|RD|TH)$/i.test(word)) return word.toLowerCase();
  if (/^[A-Z]{1,2}$/.test(word) && /^(N|S|E|W|NE|NW|SE|SW)$/.test(word)) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function titleCase(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').split(' ').map(titleWord).join(' ').replace(/-([a-z])/g, (m, c) => '-' + c.toUpperCase());
}

function townName(town) {
  const words = String(town || '').trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  const last = words[words.length - 1];
  if (TOWN_WORDS[last]) words[words.length - 1] = TOWN_WORDS[last].toUpperCase();
  return titleCase(words.join(' '));
}

function slugify(value) {
  return String(value || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'nj';
}

function propertyPath(row) {
  return `/nj/${slugify(townName(row.town))}/${slugify(row.address)}/${encodeURIComponent(String(row.pams_pin))}`;
}

// "/nj/<town>/<address>/<pin>" or the short "/nj/property/<pin>". The PIN is
// always the last segment.
function parsePath(path) {
  const clean = String(path || '').split('?')[0].replace(/\/+$/, '');
  if (!/^\/nj\/.+/i.test(clean)) return null;
  const parts = clean.split('/').filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return null;
  let pin;
  try { pin = decodeURIComponent(parts[parts.length - 1]); } catch (_err) { return null; }
  if (!/^\d{4}_[0-9A-Za-z.&_-]{1,70}$/.test(pin)) return null;
  return { pin, path: clean };
}

const money = (v) => (v == null || !Number.isFinite(Number(v)) ? '' : '$' + Math.round(Number(v)).toLocaleString('en-US'));
const count = (v) => Number(v || 0).toLocaleString('en-US');

function saleDate(row) {
  if (row.last_sale_date) {
    const d = new Date(row.last_sale_date + 'T12:00:00Z');
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  }
  return row.last_sale_year ? String(row.last_sale_year) : '';
}

function monthYear(value) {
  const d = new Date(value || '');
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function scoreColor(score) {
  if (score >= 80) return 'var(--wd-good)';
  if (score >= 65) return 'var(--wd-teal)';
  if (score >= 45) return 'var(--wd-gold-deep)';
  return 'var(--wd-warn)';
}

function componentScore(value) {
  if (value && typeof value === 'object') value = value.score;
  const n = Number(value);
  return value == null || !Number.isFinite(n) ? null : Math.max(0, Math.min(100, Math.round(n)));
}

function view(row) {
  const town = townName(row.town);
  const county = titleCase(row.county);
  const address = titleCase(row.address);
  const cls = PROPERTY_CLASSES[String(row.prop_class || '').toUpperCase()] || null;
  const place = `${town}, NJ${row.zip ? ' ' + row.zip : ''}`;
  return { town, county, address, cls, place, path: propertyPath(row), url: CANONICAL_ORIGIN + propertyPath(row) };
}

function describe(row, v) {
  const bits = [`${v.address} in ${v.town}, ${v.county} County, NJ.`];
  if (row.last_year_tax) bits.push(`Property tax ${money(row.last_year_tax)} a year`);
  if (row.assessed_value) bits.push(`${row.last_year_tax ? 'assessed' : 'Assessed'} at ${money(row.assessed_value)}.`);
  else if (row.last_year_tax) bits[bits.length - 1] += '.';
  if (row.score && row.score.score != null) bits.push(`Watchdog Score ${Math.round(row.score.score)}/100.`);
  if (row.town_compare && row.town_compare.peers) bits.push(`Compare with ${count(row.town_compare.peers)} similar properties in ${v.town}.`);
  return bits.join(' ').replace(/\s+/g, ' ').slice(0, 300);
}

function townCompareText(row, v) {
  const tc = row.town_compare;
  if (!tc || !tc.peers || !row.last_year_tax) return '';
  const group = v.cls ? v.cls[1] : 'properties';
  const higher = Number(tc.share_paying_less);
  let position;
  if (!Number.isFinite(higher)) position = '';
  else if (higher >= 55) position = `This bill is higher than about ${higher}% of them.`;
  else if (higher <= 45) position = `This bill is lower than about ${100 - higher}% of them.`;
  else position = 'This bill is close to the middle.';
  return `Among ${count(tc.peers)} ${group} in ${v.town}, the typical (median) tax bill is ${money(tc.median_tax)}. ${position}`;
}

function scoreSection(row) {
  const s = row.score;
  if (!s || s.score == null) {
    return `<section class="wdp-card wdp-score" aria-labelledby="wdp-score-h">
      <h2 id="wdp-score-h">Watchdog Score</h2>
      <p class="wdp-muted">The Watchdog Score for this property is still being calculated. Open the full analysis to run it now.</p>
    </section>`;
  }
  const score = Math.round(Number(s.score));
  const parts = s.components || {};
  const rows = DIMENSIONS.map((d) => {
    const value = componentScore(parts[d.key]);
    const width = value == null ? 0 : value;
    return `<li><a href="/robust/${d.slug}"><span class="wdp-letter" aria-hidden="true">${d.letter}</span><span class="wdp-dim">${esc(d.name)}</span>
        <span class="wdp-bar" aria-hidden="true"><i style="width:${width}%"></i></span><b>${value == null ? 'n/a' : value}</b></a></li>`;
  }).join('');
  return `<section class="wdp-card wdp-score" aria-labelledby="wdp-score-h">
      <div class="wdp-score-head">
        <div class="wdp-score-ring" style="--wdp-score:${score};--wdp-score-color:${scoreColor(score)}" role="img" aria-label="Watchdog Score ${score} out of 100"><span>${score}</span><small>/100</small></div>
        <div>
          <h2 id="wdp-score-h">Watchdog Score</h2>
          <p class="wdp-verdict">${esc(s.verdict || '')}</p>
          <p class="wdp-muted">The Watchdog Score, powered by the ROBUST Framework. Higher means a stronger tax position. Evidence coverage ${Math.round(Number(s.evidence_coverage || 0))}%, ${esc(s.confidence || 'low')} confidence.</p>
        </div>
      </div>
      <ul class="wdp-dims">${rows}</ul>
      <p class="wdp-muted wdp-small"><a href="/robust">How the ROBUST Framework works</a></p>
    </section>`;
}

function factsSection(row, v) {
  const facts = [
    ['Block / lot', [row.block, row.lot].filter(Boolean).join(' / ') + (row.qualifier ? ` (${row.qualifier})` : '')],
    ['Property class', v.cls ? `${v.cls[0]} (${row.prop_class})` : row.prop_class],
    ['Year built', row.year_built && row.year_built > 1700 ? row.year_built : ''],
    ['Building', row.building_desc],
    ['Dwelling units', row.dwelling_units || ''],
    ['Lot size', row.acres && Number(row.acres) > 0 ? `${Number(row.acres).toFixed(2)} acres` : ''],
    ['Land value', money(row.land_value)],
    ['Improvement value', money(row.improvement_value)],
    ['County', `${v.county} County`]
  ].filter(([, value]) => value !== '' && value != null);
  return `<section class="wdp-card" aria-labelledby="wdp-facts-h">
      <h2 id="wdp-facts-h">Property record</h2>
      <dl class="wdp-facts">${facts.map(([k, value]) => `<div><dt>${esc(k)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>
    </section>`;
}

function saleSection(row) {
  if (!row.last_sale_price) return '';
  const when = saleDate(row);
  const note = row.sale_flagged_non_market
    ? '<p class="wdp-muted wdp-small">The state marked this sale as a non-market transfer (for example between family members), so it may not reflect market value.</p>'
    : '';
  return `<section class="wdp-card" aria-labelledby="wdp-sale-h">
      <h2 id="wdp-sale-h">Last recorded sale</h2>
      <p class="wdp-big">${money(row.last_sale_price)}${when ? ` <span class="wdp-muted">on ${esc(when)}</span>` : ''}</p>
      ${note}
    </section>`;
}

function neighborsSection(row, v) {
  // Skip unnumbered lots and parcels with no tax bill (common areas, road lots).
  const list = Array.isArray(row.neighbors) ? row.neighbors.filter((n) => n && n.pams_pin && /^\d/.test(String(n.address || '')) && Number(n.last_year_tax) > 0) : [];
  if (!list.length) return '';
  const items = list.map((n) => `<li><a href="${esc(propertyPath({ ...n, town: n.town || row.town }))}"><span>${esc(titleCase(n.address))}</span><small>${n.last_year_tax ? money(n.last_year_tax) + ' tax' : ''}</small></a></li>`).join('');
  return `<section class="wdp-card" aria-labelledby="wdp-near-h">
      <h2 id="wdp-near-h">More properties on block ${esc(row.block)}</h2>
      <ul class="wdp-near">${items}</ul>
    </section>`;
}

function jsonLd(row, v) {
  const data = [{
    '@context': 'https://schema.org',
    '@type': 'Place',
    name: `${v.address}, ${v.town}, NJ`,
    url: v.url,
    address: { '@type': 'PostalAddress', streetAddress: v.address, addressLocality: v.town, addressRegion: 'NJ', postalCode: row.zip || undefined, addressCountry: 'US' }
  }, {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Watchdog', item: CANONICAL_ORIGIN + '/' },
      { '@type': 'ListItem', position: 2, name: `${v.county} County`, item: CANONICAL_ORIGIN + '/town-compare' },
      { '@type': 'ListItem', position: 3, name: v.address, item: v.url }
    ]
  }];
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

const STYLE = `
:root{--wd-teal:#087f82;--wd-teal-soft:#e9f5f3;--wd-paper:#f7f6f2;--wd-navy:#10294b;--wd-navy-deep:#0b203d;--wd-muted:#5a6b75;--wd-ink:#172234;--wd-gold:#d7b65c;--wd-gold-deep:#9a7a1c;--wd-good:#1f7a4d;--wd-warn:#b4472f;--wd-line:#e3e1d9}
*{box-sizing:border-box}
body{margin:0;background:var(--wd-paper);color:var(--wd-ink);font:16px/1.55 "Source Sans 3",system-ui,-apple-system,"Segoe UI",sans-serif}
a{color:var(--wd-teal)}
a:focus-visible{outline:3px solid var(--wd-gold);outline-offset:2px;border-radius:6px}
.wdp-top{background:var(--wd-navy-deep);color:#fff}
.wdp-top-in{max-width:1080px;margin:0 auto;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.wdp-brand{color:#fff;text-decoration:none;font:800 20px/1 "Plus Jakarta Sans",sans-serif;display:inline-flex;align-items:center;min-height:44px}
.wdp-top a.wdp-search{color:#fff;text-decoration:none;border:1px solid rgba(255,255,255,.35);border-radius:999px;padding:0 16px;min-height:44px;display:inline-flex;align-items:center;font-weight:700;font-size:15px}
main{max-width:1080px;margin:0 auto;padding:16px 16px 48px}
.wdp-crumbs{font-size:14px;color:var(--wd-muted);margin:4px 0 12px}
.wdp-crumbs a{color:var(--wd-muted)}
.wdp-hero{background:#fff;border:1px solid var(--wd-line);border-radius:20px;padding:20px}
h1{font:800 clamp(26px,5vw,38px)/1.15 "Plus Jakarta Sans",sans-serif;margin:0;color:var(--wd-navy)}
.wdp-place{margin:6px 0 0;color:var(--wd-muted);font-size:17px}
.wdp-keys{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:18px}
.wdp-key{background:var(--wd-teal-soft);border-radius:14px;padding:12px 14px;min-width:0}
.wdp-key span{display:block;font-size:13px;color:var(--wd-muted);font-weight:600}
.wdp-key b{display:block;font:800 22px/1.2 "Plus Jakarta Sans",sans-serif;color:var(--wd-navy);overflow-wrap:anywhere}
.wdp-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}
.wdp-btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 18px;border-radius:999px;font-weight:700;text-decoration:none;font-size:16px}
.wdp-btn-primary{background:var(--wd-teal);color:#fff}
.wdp-btn-ghost{border:1px solid var(--wd-teal);color:var(--wd-teal);background:#fff}
.wdp-grid{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:16px;margin-top:16px;align-items:start}
.wdp-col{display:grid;gap:16px;min-width:0}
.wdp-card{background:#fff;border:1px solid var(--wd-line);border-radius:20px;padding:18px 20px;min-width:0}
.wdp-card h2{font:800 19px/1.25 "Plus Jakarta Sans",sans-serif;margin:0 0 8px;color:var(--wd-navy)}
.wdp-muted{color:var(--wd-muted)}
.wdp-small{font-size:14px}
.wdp-big{font:800 24px/1.3 "Plus Jakarta Sans",sans-serif;margin:0;color:var(--wd-navy)}
.wdp-big .wdp-muted{font:600 16px/1.3 "Source Sans 3",sans-serif}
.wdp-score-head{display:flex;gap:16px;align-items:center}
.wdp-score-ring{flex:0 0 auto;width:96px;height:96px;border-radius:50%;display:grid;place-content:center;text-align:center;background:conic-gradient(var(--wdp-score-color) calc(var(--wdp-score)*1%),#ebe8df 0);position:relative}
.wdp-score-ring::before{content:"";position:absolute;inset:9px;border-radius:50%;background:#fff}
.wdp-score-ring span,.wdp-score-ring small{position:relative}
.wdp-score-ring span{font:800 32px/1 "Plus Jakarta Sans",sans-serif;color:var(--wd-navy)}
.wdp-score-ring small{font-size:13px;color:var(--wd-muted)}
.wdp-verdict{margin:0;font-weight:700;font-size:17px}
.wdp-score .wdp-muted{margin:4px 0 0;font-size:14px}
.wdp-dims{list-style:none;margin:14px 0 0;padding:0;display:grid;gap:2px}
.wdp-dims a{display:grid;grid-template-columns:28px minmax(0,1fr) minmax(60px,34%) 34px;gap:10px;align-items:center;min-height:44px;text-decoration:none;color:var(--wd-ink);border-radius:10px;padding:0 4px}
.wdp-dims a:hover{background:var(--wd-teal-soft)}
.wdp-letter{width:28px;height:28px;border-radius:8px;background:var(--wd-navy);color:#fff;display:grid;place-content:center;font:800 14px/1 "Plus Jakarta Sans",sans-serif}
.wdp-dim{font-weight:600;font-size:15px;overflow-wrap:break-word;hyphens:auto}
.wdp-bar{height:8px;border-radius:99px;background:#ebe8df;overflow:hidden}
.wdp-bar i{display:block;height:100%;background:var(--wd-teal);border-radius:99px}
.wdp-dims b{text-align:right;font-size:15px}
.wdp-facts{margin:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 16px}
.wdp-facts div{min-width:0}
.wdp-facts dt{font-size:13px;color:var(--wd-muted);font-weight:600}
.wdp-facts dd{margin:0;font-weight:700;overflow-wrap:anywhere}
.wdp-near{list-style:none;margin:0;padding:0;display:grid;gap:2px}
.wdp-near a{display:flex;justify-content:space-between;gap:12px;align-items:center;min-height:44px;text-decoration:none;color:var(--wd-ink);border-bottom:1px solid var(--wd-line);padding:0 2px}
.wdp-near a span{font-weight:600;overflow-wrap:anywhere}
.wdp-near small{color:var(--wd-muted);font-size:14px;white-space:nowrap}
.wdp-source{margin-top:20px;font-size:14px;color:var(--wd-muted)}
@media (max-width:480px){.wdp-dims a{grid-template-columns:28px minmax(0,1fr) 22% 34px;gap:8px}.wdp-dim{font-size:14px}}
@media (max-width:760px){.wdp-grid{grid-template-columns:minmax(0,1fr)}.wdp-keys{grid-template-columns:minmax(0,1fr)}.wdp-hero{padding:16px}.wdp-card{padding:16px}.wdp-facts{grid-template-columns:minmax(0,1fr)}.wdp-actions .wdp-btn{flex:1 1 100%}}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
@media print{.wdp-top,.wdp-actions{display:none}body{background:#fff}}
`;

function renderPage(row, options = {}) {
  const v = view(row);
  const indexable = options.indexable === true;
  const title = `${v.address}, ${v.town}, NJ${row.zip ? ' ' + row.zip : ''} | Property Tax & Watchdog Score`;
  const description = describe(row, v);
  const lookup = `/?address=${encodeURIComponent(`${v.address}, ${v.town}, NJ${row.zip ? ' ' + row.zip : ''}`)}`;
  const updated = monthYear(row.source_synced_at);
  const compare = townCompareText(row, v);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="${indexable ? 'index, follow' : 'noindex, follow'}">
<link rel="canonical" href="${esc(v.url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Watchdog">
<meta property="og:url" content="${esc(v.url)}">
<meta property="og:title" content="${esc(`${v.address}, ${v.town}, NJ`)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${CANONICAL_ORIGIN}/watchdog-social-share-20260913-v3.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@700;800&family=Source+Sans+3:wght@400;600;700&display=swap" rel="stylesheet">
<script type="application/ld+json">${jsonLd(row, v)}</script>
<style>${STYLE}</style>
</head>
<body>
<header class="wdp-top"><div class="wdp-top-in">
  <a class="wdp-brand" href="/">Watchdog</a>
  <a class="wdp-search" href="/">Look up another address</a>
</div></header>
<main>
  <nav class="wdp-crumbs" aria-label="Breadcrumb"><a href="/">New Jersey</a> › ${esc(v.county)} County › ${esc(v.town)}</nav>
  <section class="wdp-hero" aria-labelledby="wdp-h1">
    <h1 id="wdp-h1">${esc(v.address)}</h1>
    <p class="wdp-place">${esc(v.place)} · ${esc(v.county)} County</p>
    <div class="wdp-keys">
      <div class="wdp-key"><span>Property tax (latest year)</span><b>${esc(money(row.last_year_tax) || 'Not on file')}</b></div>
      <div class="wdp-key"><span>Assessed value</span><b>${esc(money(row.assessed_value) || 'Not on file')}</b></div>
      <div class="wdp-key"><span>Watchdog Score</span><b>${row.score && row.score.score != null ? `${Math.round(Number(row.score.score))} / 100` : 'Calculating'}</b></div>
    </div>
    <div class="wdp-actions">
      <a class="wdp-btn wdp-btn-primary" href="${esc(lookup)}">See the full Watchdog analysis</a>
      <a class="wdp-btn wdp-btn-ghost" href="/home?pin=${encodeURIComponent(row.pams_pin)}">Track this property</a>
    </div>
  </section>
  <div class="wdp-grid">
    <div class="wdp-col">
      ${scoreSection(row)}
      ${compare ? `<section class="wdp-card" aria-labelledby="wdp-town-h"><h2 id="wdp-town-h">Compared with ${esc(v.town)}</h2><p>${esc(compare)}</p><p class="wdp-small"><a href="/town-compare">Compare towns</a></p></section>` : ''}
    </div>
    <div class="wdp-col">
      ${factsSection(row, v)}
      ${saleSection(row)}
      ${neighborsSection(row, v)}
    </div>
  </div>
  <p class="wdp-source">Source: New Jersey MOD-IV tax list and NJ Office of GIS parcel data, refreshed monthly${updated ? ` (last refresh ${esc(updated)})` : ''}. Tax shown is the latest annual amount on the state list. Watchdog does not show owner names. <a href="/data-methodology">Data methodology</a></p>
</main>
</body>
</html>`;
}

function notFoundPage() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Property not found | Watchdog</title><meta name="robots" content="noindex, follow"><style>${STYLE}</style></head>
<body><header class="wdp-top"><div class="wdp-top-in"><a class="wdp-brand" href="/">Watchdog</a><a class="wdp-search" href="/">Look up another address</a></div></header>
<main><section class="wdp-hero"><h1>We couldn't find that property</h1><p class="wdp-place">The link may be old, or the parcel has no tax record on the state list. Try searching for the address instead.</p><div class="wdp-actions"><a class="wdp-btn wdp-btn-primary" href="/">Search an address</a></div></section></main></body></html>`;
}

async function fetchProperty(pin) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('property data unavailable');
  const r = await fetch(`${url}/rest/v1/rpc/get_public_property_page`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ p_pin: pin }),
    signal: AbortSignal.timeout(6000)
  });
  if (!r.ok) throw new Error(`property data http ${r.status}`);
  const data = await r.json().catch(() => null);
  return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
}

async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).end('Method not allowed');
  }
  const parsed = parsePath(req.query && req.query.path);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (!parsed) {
    res.statusCode = 404;
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600');
    return res.end(req.method === 'HEAD' ? undefined : notFoundPage());
  }
  let row;
  try {
    row = await fetchProperty(parsed.pin);
  } catch (err) {
    console.error('watchdog-property-page', err && err.message || err);
    res.statusCode = 503;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Retry-After', '60');
    return res.end(req.method === 'HEAD' ? undefined : notFoundPage());
  }
  if (!row) {
    res.statusCode = 404;
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600');
    return res.end(req.method === 'HEAD' ? undefined : notFoundPage());
  }
  const canonical = propertyPath(row);
  if (parsed.path !== canonical) {
    res.statusCode = 308;
    res.setHeader('Location', canonical);
    res.setHeader('Cache-Control', PAGE_CACHE);
    return res.end();
  }
  const indexable = INDEXABLE_COUNTIES.has(String(row.county || '').toUpperCase());
  res.statusCode = 200;
  res.setHeader('Cache-Control', PAGE_CACHE);
  if (!indexable) res.setHeader('X-Robots-Tag', 'noindex, follow');
  if (req.method === 'HEAD') return res.end();
  return res.end(renderPage(row, { indexable }));
}

module.exports = handler;
module.exports.parsePath = parsePath;
module.exports.propertyPath = propertyPath;
module.exports.renderPage = renderPage;
module.exports.townName = townName;
module.exports.slugify = slugify;
module.exports.INDEXABLE_COUNTIES = INDEXABLE_COUNTIES;
