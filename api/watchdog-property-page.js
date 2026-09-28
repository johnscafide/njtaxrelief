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

// Town reference data shipped with the function (vercel.json includeFiles):
// general tax rates by year and the latest equalization (common-level) ratio.
let townData = null;
function loadTownData() {
  if (townData) return townData;
  townData = { rates: {}, ratios: {} };
  try {
    const fs = require('fs');
    const path = require('path');
    townData.rates = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'tax-rates.json'), 'utf8')).rates || {};
    townData.ratios = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'equalization-ratios.json'), 'utf8')).ratios || {};
  } catch (err) {
    console.warn('watchdog-property-page town data', err && err.message || err);
  }
  return townData;
}
const townKey = (row) => `${String(row.town || '').toUpperCase().trim()} (${String(row.county || '').toUpperCase().trim()})`;

// General tax rates since the last town-wide revaluation. A revaluation
// resets assessments, so the rate jumps; years before it are not comparable.
function rateTrend(row) {
  const series = loadTownData().rates[townKey(row)];
  if (!series) return null;
  const years = Object.keys(series).map(Number).filter((y) => y > 1990 && Number(series[y]) > 0).sort((a, b) => b - a);
  if (!years.length) return null;
  const kept = [years[0]];
  for (let i = 1; i < years.length; i++) {
    const newer = Number(series[kept[kept.length - 1]]), older = Number(series[years[i]]);
    if (years[i] !== kept[kept.length - 1] - 1 || older / newer > 1.3 || older / newer < 0.7) break;
    kept.push(years[i]);
  }
  const points = kept.reverse().map((y) => ({ year: y, rate: Number(series[y]) }));
  const cutAtReval = kept.length < years.length;
  return { points, latest: points[points.length - 1], first: points[0], cutAtReval };
}

function latestRatio(row) {
  const series = loadTownData().ratios[townKey(row)];
  if (!series) return null;
  const years = Object.keys(series).map(Number).filter((y) => y > 1990).sort((a, b) => b - a);
  const hit = years.length ? series[String(years[0])] : null;
  const ratio = hit && typeof hit === 'object' ? Number(hit.ratio) : Number(hit);
  return Number.isFinite(ratio) && ratio > 0 ? { ratio, year: years[0] } : null;
}

function scoreSection(row) {
  const s = row.score;
  if (!s || s.score == null) {
    return `<section class="tp-card wdp-card" aria-labelledby="wdp-score-h">
      <h2 id="wdp-score-h"><i class="fas fa-shield-dog" aria-hidden="true"></i> Watchdog Score</h2>
      <p class="wdp-muted">The Watchdog Score for this property is still being calculated. Open the full analysis to run it now.</p>
    </section>`;
  }
  const score = Math.round(Number(s.score));
  const parts = s.components || {};
  const rows = DIMENSIONS.map((d) => {
    const value = componentScore(parts[d.key]);
    return `<li><a href="/robust/${d.slug}"><span class="wdp-letter" aria-hidden="true">${d.letter}</span><span class="wdp-dim">${esc(d.name)}</span>
        <span class="wdp-bar" aria-hidden="true"><i style="width:${value == null ? 0 : value}%"></i></span><b>${value == null ? 'n/a' : value}</b></a></li>`;
  }).join('');
  return `<section class="tp-card wdp-card" aria-labelledby="wdp-score-h">
      <div class="wdp-score-head">
        <div class="wdp-score-ring" style="--wdp-score:${score};--wdp-score-color:${scoreColor(score)}" role="img" aria-label="Watchdog Score ${score} out of 100"><span>${score}</span><small>/100</small></div>
        <div>
          <h2 id="wdp-score-h">Watchdog Score</h2>
          <p class="wdp-verdict">${esc(s.verdict || '')}</p>
          <p class="wdp-muted wdp-small">The Watchdog Score, powered by the ROBUST Framework. Higher means a stronger tax position. Evidence coverage ${Math.round(Number(s.evidence_coverage || 0))}%, ${esc(s.confidence || 'low')} confidence.</p>
        </div>
      </div>
      <ul class="wdp-dims">${rows}</ul>
      <p class="wdp-small"><a href="/robust">How the ROBUST Framework works</a></p>
    </section>`;
}

function taxContextSection(row, v) {
  const compare = townCompareText(row, v);
  const trend = rateTrend(row);
  if (!compare && !trend) return '';
  let trendHtml = '';
  if (trend) {
    const max = Math.max(...trend.points.map((p) => p.rate));
    const bars = trend.points.map((p) => `<li><span class="wdp-rbar" style="height:${Math.max(8, Math.round(p.rate / max * 100))}%" title="${p.year}: $${p.rate.toFixed(3)} per $100"></span><small>${String(p.year).slice(2)}</small></li>`).join('');
    const change = trend.points.length >= 3 ? (trend.latest.rate / trend.first.rate - 1) * 100 : null;
    const changeText = change == null ? '' : ` That's ${change >= 0 ? 'up' : 'down'} ${Math.abs(change).toFixed(1)}% since ${trend.first.year}${trend.cutAtReval ? ', the first year after the last town-wide revaluation' : ''}.`;
    trendHtml = `<h3>Town tax rate</h3>
      <p>${esc(v.town)}'s general tax rate is <b>$${trend.latest.rate.toFixed(3)}</b> per $100 of assessed value (${trend.latest.year}).${esc(changeText)}</p>
      <ul class="wdp-rates" aria-label="General tax rate by year">${bars}</ul>
      ${trend.cutAtReval ? '<p class="wdp-muted wdp-small">Years before the last revaluation are left out because assessments were reset, so the rates are not comparable.</p>' : ''}`;
  }
  return `<section class="tp-card wdp-card" aria-labelledby="wdp-town-h">
      <h2 id="wdp-town-h"><i class="fas fa-scale-balanced" aria-hidden="true"></i> This tax bill in context</h2>
      ${compare ? `<p>${esc(compare)}</p>` : ''}
      ${trendHtml}
      <p class="wdp-small"><a href="/town-compare">Compare ${esc(v.town)} with other towns</a></p>
    </section>`;
}

function toolkitSection(row, v) {
  const trend = rateTrend(row);
  const ratio = latestRatio(row);
  const appeal = new URLSearchParams();
  if (row.assessed_value) appeal.set('assessed', String(row.assessed_value));
  if (trend) appeal.set('rate', trend.latest.rate.toFixed(3));
  if (ratio) appeal.set('ratio', String(ratio.ratio));
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${v.address}, ${v.town}, NJ`)}`;
  const items = [
    ['fa-magnifying-glass-dollar', 'Could an appeal lower this bill?', `Screen it with the appeal estimator, already filled in with this property's assessment${trend ? ' and the town tax rate' : ''}.`, `/appeal-savings-estimator/?${appeal.toString()}`],
    ['fa-calendar-check', 'Appeal deadlines', `In most towns the deadline is April 1 (May 1 after a town-wide revaluation), or 45 days after assessment notices go out if that is later. See the ${v.county} County dates.`, '/nj-property-tax-calendar'],
    ['fa-hand-holding-dollar', 'ANCHOR, Senior Freeze and Stay NJ', 'See which New Jersey property tax relief programs a homeowner here may qualify for.', '/senior-benefit-estimator'],
    ['fa-house-circle-check', 'Is this your home?', 'Save it to your Watchdog account to follow its assessment, tax and Watchdog Score over time.', `/home?pin=${encodeURIComponent(row.pams_pin)}`],
    ['fa-calculator', 'Buying here?', 'Estimate the full monthly cost with the real tax bill included.', '/home-buying-cost-calculator'],
    ['fa-map-location-dot', 'See it on a map', 'Open this address in Google Maps.', maps]
  ];
  const list = items.map(([icon, title, text, href]) => {
    const external = /^https?:\/\//.test(href);
    return `<li><a href="${esc(href)}"${external ? ' target="_blank" rel="noopener"' : ''}><i class="fas ${icon}" aria-hidden="true"></i><span><b>${esc(title)}</b><small>${esc(text)}</small></span><i class="fas fa-chevron-right wdp-go" aria-hidden="true"></i></a></li>`;
  }).join('');
  return `<section class="tp-card wdp-card" aria-labelledby="wdp-tools-h">
      <h2 id="wdp-tools-h"><i class="fas fa-toolbox" aria-hidden="true"></i> Homeowner toolkit</h2>
      <ul class="wdp-tools">${list}</ul>
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
  return `<section class="tp-card wdp-card" aria-labelledby="wdp-facts-h">
      <h2 id="wdp-facts-h"><i class="fas fa-file-lines" aria-hidden="true"></i> Property record</h2>
      <dl class="wdp-facts">${facts.map(([k, value]) => `<div><dt>${esc(k)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>
    </section>`;
}

function saleSection(row) {
  if (!row.last_sale_price) return '';
  const when = saleDate(row);
  const note = row.sale_flagged_non_market
    ? '<p class="wdp-muted wdp-small">The state marked this sale as a non-market transfer (for example between family members), so it may not reflect market value.</p>'
    : '';
  return `<section class="tp-card wdp-card" aria-labelledby="wdp-sale-h">
      <h2 id="wdp-sale-h"><i class="fas fa-handshake" aria-hidden="true"></i> Last recorded sale</h2>
      <p class="wdp-big">${money(row.last_sale_price)}${when ? ` <span class="wdp-muted">on ${esc(when)}</span>` : ''}</p>
      ${note}
    </section>`;
}

function neighborsSection(row) {
  // Skip unnumbered lots and parcels with no tax bill (common areas, road lots).
  const list = Array.isArray(row.neighbors) ? row.neighbors.filter((n) => n && n.pams_pin && /^\d/.test(String(n.address || '')) && Number(n.last_year_tax) > 0) : [];
  if (!list.length) return '';
  const items = list.map((n) => `<li><a href="${esc(propertyPath({ ...n, town: n.town || row.town }))}"><span>${esc(titleCase(n.address))}</span><small>${n.last_year_tax ? money(n.last_year_tax) + ' tax' : ''}</small></a></li>`).join('');
  return `<section class="tp-card wdp-card" aria-labelledby="wdp-near-h">
      <h2 id="wdp-near-h"><i class="fas fa-street-view" aria-hidden="true"></i> More properties on block ${esc(row.block)}</h2>
      <ul class="wdp-near">${items}</ul>
    </section>`;
}

function shareBar(row, v) {
  const url = v.url;
  const text = `${v.address}, ${v.town}, NJ${row.last_year_tax ? `: ${money(row.last_year_tax)} property tax` : ''}${row.score && row.score.score != null ? `, Watchdog Score ${Math.round(Number(row.score.score))}/100` : ''}`;
  const enc = encodeURIComponent;
  const links = [
    ['fa-comment-sms', 'Text', `sms:?&body=${enc(`${text} ${url}`)}`],
    ['fa-envelope', 'Email', `mailto:?subject=${enc(`${v.address}, ${v.town}, NJ`)}&body=${enc(`${text}\n\n${url}`)}`],
    ['fa-brands fa-facebook-f', 'Facebook', `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`],
    ['fa-brands fa-x-twitter', 'X', `https://twitter.com/intent/tweet?url=${enc(url)}&text=${enc(text)}`],
    ['fa-brands fa-linkedin-in', 'LinkedIn', `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`]
  ].map(([icon, label, href]) => {
    const external = /^https:/.test(href);
    return `<a class="wdp-sh" href="${esc(href)}"${external ? ' target="_blank" rel="noopener"' : ''}><i class="${icon.startsWith('fa-brands') ? icon : 'fas ' + icon}" aria-hidden="true"></i><span>${label}</span></a>`;
  }).join('');
  return `<section class="tp-card wdp-share" id="wdp-share" aria-label="Share this property">
      <b class="wdp-share-t"><i class="fas fa-share-nodes" aria-hidden="true"></i> Share this property</b>
      <div class="wdp-share-row">
        <button class="wdp-sh" type="button" data-wdp-native hidden><i class="fas fa-arrow-up-from-bracket" aria-hidden="true"></i><span>Share</span></button>
        <button class="wdp-sh" type="button" data-wdp-copy><i class="fas fa-link" aria-hidden="true"></i><span>Copy link</span></button>
        ${links}
        <button class="wdp-sh" type="button" data-wdp-print><i class="fas fa-print" aria-hidden="true"></i><span>Print</span></button>
      </div>
      <span class="wdp-toast" role="status" aria-live="polite"></span>
    </section>`;
}

function faqItems(row, v) {
  const items = [];
  if (row.last_year_tax) items.push([`How much are the property taxes at ${v.address}?`, `The latest annual property tax on the New Jersey tax list is ${money(row.last_year_tax)}${row.assessed_value ? `, on an assessed value of ${money(row.assessed_value)}` : ''}.`]);
  const compare = townCompareText(row, v);
  if (compare) items.push([`How does this tax bill compare with others in ${v.town}?`, compare]);
  if (row.score && row.score.score != null) items.push(['What is the Watchdog Score?', `The Watchdog Score, powered by the ROBUST Framework, rates a property's tax position from 0 to 100 using six kinds of public evidence. Higher is better. This property scores ${Math.round(Number(row.score.score))}${row.score.verdict ? ` (${row.score.verdict})` : ''}.`]);
  items.push(['Can the assessment be appealed?', `Yes. Appeals go to the ${v.county} County Board of Taxation. In most towns the deadline is April 1 (May 1 after a town-wide revaluation), or 45 days after assessment notices are mailed if that is later.`]);
  items.push(['Does Watchdog show who owns this property?', 'No. Watchdog does not show owner names or mailing addresses. Everything on this page comes from public tax and parcel records.']);
  return items;
}

function faqSection(row, v) {
  const items = faqItems(row, v).map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('');
  return `<section class="tp-card wdp-card wdp-faq" aria-labelledby="wdp-faq-h"><h2 id="wdp-faq-h">Questions about ${esc(v.address)}</h2>${items}</section>`;
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
  }, {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems(row, v).map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } }))
  }];
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

const STYLE = `
.wdp{--wd-teal:#078486;--wd-teal-soft:#e6f4f3;--wd-navy:#0e2849;--wd-ink:#14202b;--wd-muted:#5a6b78;--wd-line:#dde4ea;--wd-gold:#e7d28d;--wd-gold-deep:#9a7a1c;--wd-good:#1f7a4d;--wd-warn:#b4472f}
.wdp a:focus-visible,.wdp button:focus-visible,.wdp summary:focus-visible{outline:3px solid var(--wd-gold);outline-offset:2px;border-radius:8px}
.wdp .tp-hero{padding:104px 0 96px}
.wdp-crumbs{font-size:14px;color:#b9cddc;margin:0 0 14px;background:none}
.wdp-crumbs a{color:#d8e5ed}
.wdp .tp-hero h1{margin-bottom:8px}
.wdp-place{font-size:18px!important;color:#d8e5ed}
.wdp-keys{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:24px 0 0;max-width:860px}
.wdp-key{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);border-radius:16px;padding:14px 16px;min-width:0}
.wdp-key span{display:block;font-size:13px;color:#b9cddc;font-weight:700}
.wdp-key b{display:block;font-size:clamp(22px,3vw,30px);line-height:1.15;font-weight:800;color:#fff;overflow-wrap:anywhere}
.wdp-key b.wdp-gold{color:var(--wd-gold)}
.wdp-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}
.wdp-actions .tp-btn.gold{background:var(--wd-gold);border-color:var(--wd-gold);color:var(--wd-navy)}
.wdp-actions .tp-btn.outline{background:transparent;color:#fff;border-color:rgba(255,255,255,.45)}
.wdp-share{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;padding:14px 18px!important;margin-bottom:20px;position:relative}
.wdp-share-t{font-size:15px;color:var(--wd-navy);white-space:nowrap}
.wdp-share-row{display:flex;flex-wrap:wrap;gap:8px}
.wdp-sh{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 14px;border-radius:999px;border:1px solid var(--wd-line);background:#fff;color:var(--wd-navy);font:700 14px "Plus Jakarta Sans",system-ui,sans-serif;text-decoration:none;cursor:pointer}
.wdp-sh:hover{border-color:var(--wd-teal);color:var(--wd-teal)}
.wdp-sh[hidden]{display:none}
.wdp-toast{font-size:14px;color:var(--wd-good);font-weight:700}
.wdp-grid{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:20px;align-items:start}
.wdp-col{display:grid;gap:20px;min-width:0}
.wdp-card h2{display:flex;align-items:center;gap:10px;color:var(--wd-navy)}
.wdp-card h2 .fas{color:var(--wd-teal);font-size:18px}
.wdp-card h3{margin:18px 0 6px;font-size:16px;color:var(--wd-navy)}
.wdp-card p{line-height:1.6;margin:0 0 10px}
.wdp-muted{color:var(--wd-muted)}
.wdp-small{font-size:14px}
.wdp-card a{color:var(--wd-teal);font-weight:700}
.wdp-big{font-size:26px;font-weight:800;color:var(--wd-navy)}
.wdp-big .wdp-muted{font-size:16px;font-weight:600}
.wdp-score-head{display:flex;gap:18px;align-items:center}
.wdp-score-ring{flex:0 0 auto;width:104px;height:104px;border-radius:50%;display:grid;place-content:center;text-align:center;background:conic-gradient(var(--wdp-score-color) calc(var(--wdp-score)*1%),#ebe8df 0);position:relative}
.wdp-score-ring::before{content:"";position:absolute;inset:10px;border-radius:50%;background:#fff}
.wdp-score-ring span,.wdp-score-ring small{position:relative}
.wdp-score-ring span{font-size:34px;font-weight:800;line-height:1;color:var(--wd-navy)}
.wdp-score-ring small{font-size:13px;color:var(--wd-muted)}
.wdp-verdict{font-weight:800;font-size:17px;margin:2px 0 4px!important}
.wdp-dims{list-style:none;margin:14px 0 8px;padding:0;display:grid;gap:2px}
.wdp-dims a{display:grid;grid-template-columns:28px minmax(0,1fr) minmax(60px,34%) 34px;gap:10px;align-items:center;min-height:44px;text-decoration:none;color:var(--wd-ink)!important;font-weight:600!important;border-radius:10px;padding:0 4px}
.wdp-dims a:hover{background:var(--wd-teal-soft)}
.wdp-letter{width:28px;height:28px;border-radius:8px;background:var(--wd-navy);color:#fff;display:grid;place-content:center;font-weight:800;font-size:14px}
.wdp-dim{font-size:15px;overflow-wrap:break-word;hyphens:auto}
.wdp-bar{height:8px;border-radius:99px;background:#ebe8df;overflow:hidden}
.wdp-bar i{display:block;height:100%;background:var(--wd-teal);border-radius:99px}
.wdp-dims b{text-align:right;font-size:15px}
.wdp-rates{list-style:none;margin:10px 0 6px;padding:0;display:flex;align-items:flex-end;gap:6px;height:96px}
.wdp-rates li{flex:1 1 0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;min-width:0}
.wdp-rbar{display:block;width:100%;max-width:34px;border-radius:6px 6px 2px 2px;background:linear-gradient(180deg,var(--wd-teal),#0e5f6a)}
.wdp-rates small{font-size:12px;color:var(--wd-muted);margin-top:4px}
.wdp-tools{list-style:none;margin:0;padding:0;display:grid;gap:4px}
.wdp-tools a{display:grid;grid-template-columns:36px minmax(0,1fr) 16px;gap:12px;align-items:center;min-height:56px;padding:10px 8px;border-radius:14px;text-decoration:none;color:var(--wd-ink)!important;font-weight:400!important}
.wdp-tools a:hover{background:var(--wd-teal-soft)}
.wdp-tools a>.fas:first-child{width:36px;height:36px;border-radius:10px;background:var(--wd-teal-soft);color:var(--wd-teal);display:grid;place-content:center;font-size:16px}
.wdp-tools b{display:block;font-size:15px;color:var(--wd-navy)}
.wdp-tools small{display:block;font-size:14px;color:var(--wd-muted);line-height:1.45}
.wdp-go{color:#9aa9b5;font-size:13px}
.wdp-facts{margin:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 16px}
.wdp-facts div{min-width:0}
.wdp-facts dt{font-size:13px;color:var(--wd-muted);font-weight:700}
.wdp-facts dd{margin:0;font-weight:800;overflow-wrap:anywhere}
.wdp-near{list-style:none;margin:0;padding:0;display:grid}
.wdp-near a{display:flex;justify-content:space-between;gap:12px;align-items:center;min-height:44px;text-decoration:none;color:var(--wd-ink)!important;border-bottom:1px solid var(--wd-line)}
.wdp-near a span{overflow-wrap:anywhere}
.wdp-near small{color:var(--wd-muted);font-size:14px;white-space:nowrap;font-weight:600}
.wdp-faq{margin-top:20px}
.wdp-faq details{border-top:1px solid var(--wd-line)}
.wdp-faq summary{cursor:pointer;min-height:48px;display:flex;align-items:center;font-weight:800;color:var(--wd-navy);list-style:none;padding:10px 0}
.wdp-faq summary::after{content:"+";margin-left:auto;padding-left:12px;color:var(--wd-teal);font-size:20px}
.wdp-faq details[open] summary::after{content:"–"}
.wdp-faq details p{color:var(--wd-muted)}
.wdp-source{margin:20px 0 0;font-size:14px;color:var(--wd-muted);line-height:1.55}
.wdp-source a{color:var(--wd-teal);font-weight:700}
@media (max-width:860px){.wdp-grid{grid-template-columns:minmax(0,1fr)}}
@media (max-width:640px){.wdp .tp-hero{padding:92px 0 80px}.wdp-keys{grid-template-columns:minmax(0,1fr)}.wdp-facts{grid-template-columns:minmax(0,1fr)}.wdp-actions .tp-btn{flex:1 1 100%}.wdp-share-row .wdp-sh{padding:0 12px;font-size:13px;gap:6px}.wdp-share{padding:14px!important}.wdp-dims a{grid-template-columns:28px minmax(0,1fr) 22% 34px;gap:8px}.wdp-dim{font-size:14px}}
@media (prefers-reduced-motion:reduce){.wdp *{transition:none!important;animation:none!important}}
@media print{.wd-nav,.wd-public-sheet,.wd-public-backdrop,.wdp-actions,.wdp-share,#main-footer{display:none!important}.wdp .tp-hero{background:#fff!important;color:#000!important;padding:0 0 12px}.wdp .tp-hero *{color:#000!important}.tp-main{margin-top:0!important}.tp-card{box-shadow:none!important;break-inside:avoid}}
`;

const PAGE_SCRIPT = `(function(){
  var data={};try{data=JSON.parse(document.getElementById('wdp-data').textContent)}catch(e){}
  var toast=document.querySelector('.wdp-toast');
  function say(t){if(!toast)return;toast.textContent=t;clearTimeout(say.t);say.t=setTimeout(function(){toast.textContent=''},2500)}
  function copy(){var u=data.url||location.href;if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(u).then(function(){say('Link copied')},function(){prompt('Copy this link',u)})}else{prompt('Copy this link',u)}}
  var nat=document.querySelector('[data-wdp-native]');
  if(nat&&navigator.share){nat.hidden=false;nat.addEventListener('click',function(){navigator.share({title:data.title,text:data.text,url:data.url}).catch(function(){})})}
  var c=document.querySelector('[data-wdp-copy]');if(c)c.addEventListener('click',copy);
  var p=document.querySelector('[data-wdp-print]');if(p)p.addEventListener('click',function(){window.print()});
  document.querySelectorAll('[data-wdp-scroll-share]').forEach(function(a){a.addEventListener('click',function(e){var s=document.getElementById('wdp-share');if(!s)return;e.preventDefault();if(navigator.share){navigator.share({title:data.title,text:data.text,url:data.url}).catch(function(){})}else{s.scrollIntoView({behavior:'smooth',block:'center'});var b=s.querySelector('[data-wdp-copy]');if(b)b.focus()}})});
  function remember(){if(window.WatchdogPublicNav&&typeof window.WatchdogPublicNav.remember==='function'&&data.recent){window.WatchdogPublicNav.remember(data.recent);return true}return false}
  if(!remember())window.addEventListener('load',remember);
})();`;

function renderPage(row, options = {}) {
  const v = view(row);
  const indexable = options.indexable === true;
  const title = `${v.address}, ${v.town}, NJ${row.zip ? ' ' + row.zip : ''} | Property Tax & Watchdog Score`;
  const description = describe(row, v);
  const lookup = `/?address=${encodeURIComponent(`${v.address}, ${v.town}, NJ${row.zip ? ' ' + row.zip : ''}`)}`;
  const updated = monthYear(row.source_synced_at);
  const score = row.score && row.score.score != null ? Math.round(Number(row.score.score)) : null;
  const shareText = `${v.address}, ${v.town}, NJ${row.last_year_tax ? `: ${money(row.last_year_tax)} property tax` : ''}${score != null ? `, Watchdog Score ${score}/100` : ''}`;
  const pageData = JSON.stringify({
    url: v.url, title: `${v.address}, ${v.town}, NJ`, text: shareText,
    recent: { address: v.address, town: row.town, pin: row.pams_pin, assessed: row.assessed_value || '', tax: row.last_year_tax || '', year_built: row.year_built || '', zip: row.zip || '' }
  }).replace(/</g, '\\u003c');
  const kicker = ['NJ property record', v.cls ? v.cls[0] : '', row.block ? `Block ${row.block}, Lot ${row.lot || ''}` : ''].filter(Boolean).join(' · ');
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
<meta name="twitter:title" content="${esc(`${v.address}, ${v.town}, NJ`)}">
<meta name="twitter:description" content="${esc(description)}">
<link rel="icon" href="/favicon-96x96.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<link rel="stylesheet" href="/styles.css">
<link rel="stylesheet" href="/property/css/shared.css">
<link rel="stylesheet" href="/property/css/public-mobile-nav.css">
<link rel="stylesheet" href="/property/css/watchdog-tool-page.css?v=20260928a">
<script type="application/ld+json">${jsonLd(row, v)}</script>
<style>${STYLE}</style>
</head>
<body class="tp-page nav-solid wdp">
<header class="wd-nav" id="wd-nav">
  <div class="wd-nav-in">
    <button class="wd-public-trigger" id="wd-menu-trigger" type="button" onclick="WatchdogPublicNav.open('main')" aria-label="Open Watchdog menu"><i class="fas fa-bars"></i><span>Menu</span></button>
    <a class="wd-logo" href="/"><i class="fas fa-dog"></i><span>Watchdog</span></a>
    <button class="wd-public-trigger wd-public-profile" id="wd-profile-trigger" type="button" onclick="WatchdogPublicNav.open('profile')" aria-label="Open account menu"><i class="fas fa-user"></i><span>Sign in</span></button>
  </div>
</header>
<div class="wd-public-backdrop" id="wd-public-backdrop" onclick="WatchdogPublicNav.close()"></div>
<aside class="wd-public-sheet" id="wd-main-sheet" aria-hidden="true" aria-label="Watchdog navigation"></aside>
<aside class="wd-public-sheet right" id="wd-profile-sheet" aria-hidden="true" aria-label="Watchdog account">
  <div class="wd-public-sheet-head"><b>Your Watchdog</b><button class="wd-public-close" type="button" onclick="WatchdogPublicNav.close()" aria-label="Close account menu"><i class="fas fa-xmark"></i></button></div>
  <div id="wd-profile-content"></div>
</aside>
<main>
  <section class="tp-hero" aria-labelledby="wdp-h1"><div class="tp-shell">
    <div class="wdp-crumbs" role="navigation" aria-label="Breadcrumb"><a href="/">New Jersey</a> › ${esc(v.county)} County › ${esc(v.town)}</div>
    <p class="tp-kicker">${esc(kicker)}</p>
    <h1 id="wdp-h1">${esc(v.address)}</h1>
    <p class="wdp-place">${esc(v.place)} · ${esc(v.county)} County</p>
    <div class="wdp-keys">
      <div class="wdp-key"><span>Property tax (latest year)</span><b>${esc(money(row.last_year_tax) || 'Not on file')}</b></div>
      <div class="wdp-key"><span>Assessed value</span><b>${esc(money(row.assessed_value) || 'Not on file')}</b></div>
      <div class="wdp-key"><span>Watchdog Score</span><b class="wdp-gold">${score != null ? `${score} / 100` : 'Calculating'}</b></div>
    </div>
    <div class="wdp-actions">
      <a class="tp-btn gold" href="${esc(lookup)}"><i class="fas fa-magnifying-glass-chart" aria-hidden="true"></i>See the full Watchdog analysis</a>
      <a class="tp-btn light" href="/home?pin=${encodeURIComponent(row.pams_pin)}"><i class="fas fa-bookmark" aria-hidden="true"></i>Track this property</a>
      <a class="tp-btn outline" href="#wdp-share" data-wdp-scroll-share><i class="fas fa-share-nodes" aria-hidden="true"></i>Share</a>
    </div>
  </div></section>
  <div class="tp-main"><div class="tp-shell">
    ${shareBar(row, v)}
    <div class="wdp-grid">
      <div class="wdp-col">
        ${scoreSection(row)}
        ${taxContextSection(row, v)}
        ${toolkitSection(row, v)}
      </div>
      <div class="wdp-col">
        ${factsSection(row, v)}
        ${saleSection(row)}
        ${neighborsSection(row)}
      </div>
    </div>
    ${faqSection(row, v)}
    <p class="wdp-source">Source: New Jersey MOD-IV tax list and NJ Office of GIS parcel data, refreshed monthly${updated ? ` (last refresh ${esc(updated)})` : ''}. Town tax rates from the NJ Division of Taxation. Tax shown is the latest annual amount on the state list. Watchdog does not show owner names. <a href="/data-methodology">Data methodology</a></p>
  </div></div>
</main>
<div id="main-footer"></div>
<script id="wdp-data" type="application/json">${pageData}</script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
<script src="/property/js/public-nav.js"></script>
<script>fetch('/property/partials/footer.html').then(function(r){return r.ok?r.text():''}).then(function(h){var f=document.getElementById('main-footer');if(f&&h)f.innerHTML=h}).catch(function(){});</script>
<script>${PAGE_SCRIPT}</script>
</body>
</html>`;
}

function notFoundPage() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Property not found | Watchdog</title><meta name="robots" content="noindex, follow">
<link rel="icon" href="/favicon-96x96.png"><link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap" rel="stylesheet"><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/property/css/shared.css"><link rel="stylesheet" href="/property/css/public-mobile-nav.css"><link rel="stylesheet" href="/property/css/watchdog-tool-page.css?v=20260928a"><style>${STYLE}</style></head>
<body class="tp-page nav-solid wdp"><header class="wd-nav" id="wd-nav"><div class="wd-nav-in"><button class="wd-public-trigger" id="wd-menu-trigger" type="button" onclick="WatchdogPublicNav.open('main')" aria-label="Open Watchdog menu"><i class="fas fa-bars"></i><span>Menu</span></button><a class="wd-logo" href="/"><i class="fas fa-dog"></i><span>Watchdog</span></a><button class="wd-public-trigger wd-public-profile" id="wd-profile-trigger" type="button" onclick="WatchdogPublicNav.open('profile')" aria-label="Open account menu"><i class="fas fa-user"></i><span>Sign in</span></button></div></header>
<div class="wd-public-backdrop" id="wd-public-backdrop" onclick="WatchdogPublicNav.close()"></div><aside class="wd-public-sheet" id="wd-main-sheet" aria-hidden="true" aria-label="Watchdog navigation"></aside><aside class="wd-public-sheet right" id="wd-profile-sheet" aria-hidden="true" aria-label="Watchdog account"><div class="wd-public-sheet-head"><b>Your Watchdog</b><button class="wd-public-close" type="button" onclick="WatchdogPublicNav.close()" aria-label="Close account menu"><i class="fas fa-xmark"></i></button></div><div id="wd-profile-content"></div></aside>
<main><section class="tp-hero"><div class="tp-shell"><p class="tp-kicker">NJ property record</p><h1>We couldn't find that property</h1><p>The link may be old, or the parcel has no tax record on the state list. Try searching for the address instead.</p><div class="wdp-actions"><a class="tp-btn gold" href="/">Search an address</a></div></div></section></main>
<div id="main-footer"></div><script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script><script src="/property/js/public-nav.js"></script><script>fetch('/property/partials/footer.html').then(function(r){return r.ok?r.text():''}).then(function(h){var f=document.getElementById('main-footer');if(f&&h)f.innerHTML=h}).catch(function(){});</script></body></html>`;
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
module.exports.rateTrend = rateTrend;
