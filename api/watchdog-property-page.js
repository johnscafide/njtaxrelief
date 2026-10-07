/* Public property pages on https://www.watchdogindex.com

   /nj/<town>/<address>-<zip>      published page (indexable, in /sitemap-properties.xml)
   /nj/<town>/<address>/<pams_pin> any NJ parcel by PIN (noindex until published)
   /nj/property/<pams_pin>         short PIN link

   A property is published the first time someone searches it on Watchdog:
   lookup.js POSTs the PIN here, publish_public_property_page() stores the
   slug, and the address bar moves to the published URL. PIN links to a
   published property redirect (308) to it.

   Every page is the Watchdog home page with the address popup already open.
   The popup holds a server-rendered copy of the property's public record so
   search engines can read it; lookup.js then swaps in the live popup. Data is
   read live from Watchdog's copy of the state parcel list and cached at the
   edge for a day, so pages follow the monthly refresh on their own.

   Public-record fields only. Owner names and mailing addresses are never
   stored, so they cannot appear. Anything tied to a signed-in person (saved,
   "this is my home", watchlists) loads in the browser only. */

const { townLinks } = require('./_tax-town');

const CANONICAL_ORIGIN = 'https://www.watchdogindex.com';
const PAGE_CACHE = 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800';

// Counties whose PIN pages are open to search engines without being
// published. Empty: only published pages are indexed.
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

// Street suffixes spelled out in published URLs ("11 DALTON PL" becomes
// 11-dalton-place), the way people type them.
const STREET_WORDS = { AVE: 'AVENUE', AV: 'AVENUE', ST: 'STREET', RD: 'ROAD', DR: 'DRIVE', CT: 'COURT', LN: 'LANE', PL: 'PLACE', BLVD: 'BOULEVARD', CIR: 'CIRCLE', TER: 'TERRACE', TERR: 'TERRACE', PKWY: 'PARKWAY', HWY: 'HIGHWAY', TRL: 'TRAIL', SQ: 'SQUARE', TPKE: 'TURNPIKE', HTS: 'HEIGHTS', EXT: 'EXTENSION', XING: 'CROSSING', MNR: 'MANOR', PT: 'POINT' };

function spelledAddress(address) {
  const words = String(address || '').trim().toUpperCase().split(/\s+/).filter(Boolean);
  for (let i = words.length - 1; i > 0; i--) {
    if (STREET_WORDS[words[i]]) { words[i] = STREET_WORDS[words[i]]; break; }
    if (!/^(N|S|E|W|NE|NW|SE|SW|UNIT|APT|#?\d+[A-Z]?)$/.test(words[i])) break;
  }
  return words.join(' ');
}

function pageSlug(row, zip) {
  const base = slugify(spelledAddress(row.address)).slice(0, 94).replace(/-+$/, '');
  return /^0[78]\d{3}$/.test(String(zip || '')) ? `${base}-${zip}` : base;
}

// Published: "/nj/<town>/<address>-<zip>". PIN forms: "/nj/<town>/<address>/<pin>"
// or the short "/nj/property/<pin>", PIN always last.
function parsePath(path) {
  const clean = String(path || '').split('?')[0].replace(/\/+$/, '');
  if (!/^\/nj\/.+/i.test(clean)) return null;
  const parts = clean.split('/').filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return null;
  if (parts.length === 3 && parts[1].toLowerCase() !== 'property' && /^[a-z0-9-]{1,80}$/.test(parts[1]) && /^[a-z0-9-]{1,120}$/.test(parts[2])) {
    return { town: parts[1], slug: parts[2], path: clean };
  }
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
  const path = row.page_path || propertyPath(row);
  return { town, county, address, cls, place, path, url: CANONICAL_ORIGIN + path };
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

// Which year the state-list tax bill is for. The MOD-IV "last year tax" is a
// mix: some towns' files carry the 2024 bill, others 2025. A bill is matched
// to a year only when it equals assessed x that year's general rate (within
// 0.2%); special district charges can make that impossible, and then the year
// stays unknown rather than guessed. When the bill is older than the newest
// published rate, current = the bill moved to the newest rate.
function billYear(row) {
  const bill = Number(row.last_year_tax), assessed = Number(row.assessed_value);
  const series = loadTownData().rates[townKey(row)];
  if (!(bill > 0) || !(assessed > 0) || !series) return { year: null, current: null };
  const implied = bill / assessed * 100;
  const years = Object.keys(series).map(Number).filter((y) => Number(series[y]) > 0).sort((a, b) => b - a);
  if (!years.length) return { year: null, current: null };
  const latest = years[0];
  // Only the two newest years: an older rate can match a bill by coincidence.
  const hit = years.slice(0, 2).find((y) => Math.abs(implied / Number(series[y]) - 1) <= 0.002);
  if (!hit) {
    // Year unknown (usually special district charges on top of the general
    // rate): estimate the newest year from the general rate alone.
    return { year: null, current: { year: latest, amount: Math.round(assessed * Number(series[latest])) / 100, generalRateOnly: true } };
  }
  const current = hit < latest ? { year: latest, amount: Math.round(bill * Number(series[latest]) / Number(series[hit]) * 100) / 100 } : null;
  return { year: hit, current };
}

// Stat label + optional second stat for the bill year (see billYear).
function taxStats(row, money) {
  const by = billYear(row);
  const label = by.year ? `${by.year} tax bill` : 'Latest annual tax';
  const extra = by.current ? `<div class="wdp-stat"><b>${esc(money(by.current.amount))}</b><span>${by.current.year} ${by.current.generalRateOnly ? 'estimate' : 'at new rate'}</span></div>` : '';
  return { label, extra, by };
}

function latestRatio(row) {
  const series = loadTownData().ratios[townKey(row)];
  if (!series) return null;
  const years = Object.keys(series).map(Number).filter((y) => y > 1990).sort((a, b) => b - a);
  const hit = years.length ? series[String(years[0])] : null;
  const ratio = hit && typeof hit === 'object' ? Number(hit.ratio) : Number(hit);
  return Number.isFinite(ratio) && ratio > 0 ? { ratio, year: years[0] } : null;
}

// Contact consent shown on the PDF report form and stored with each request.
const REPORT_CONSENT = 'I agree that Watchdog and John Scafide, a licensed New Jersey real estate salesperson with Opus Elite Real Estate (NJ License #2079591), may contact me by phone, text or email about this property. Message and data rates may apply. I can opt out at any time.';

function scoreCard(row) {
  const s = row.score;
  if (!s || s.score == null) {
    return `<section class="wdp-card wdp-card--score" aria-labelledby="wdp-score-h">
      <div class="wdp-card-head"><h2 id="wdp-score-h">Watchdog Score</h2></div>
      <p class="wdp-card-note">Still being calculated for this property. The full analysis runs it now.</p>
    </section>`;
  }
  const score = Math.round(Number(s.score));
  const parts = s.components || {};
  const rows = DIMENSIONS.map((d) => {
    const value = componentScore(parts[d.key]);
    return `<li><a href="/robust/${d.slug}"><span class="wdp-letter" aria-hidden="true">${d.letter}</span><span class="wdp-dim">${esc(d.name)}</span><span class="wdp-bar${value == null ? ' is-empty' : ''}" aria-hidden="true"><i style="width:${value == null ? 0 : value}%"></i></span><b>${value == null ? 'n/a' : value}</b></a></li>`;
  }).join('');
  return `<section class="wdp-card wdp-card--score" aria-labelledby="wdp-score-h">
      <div class="wdp-card-head"><h2 id="wdp-score-h">Watchdog Score</h2><a class="wdp-card-link" href="/robust">How it works</a></div>
      <div class="wdp-score-lead"><b>${score}</b><span>/100</span></div>
      <p class="wdp-score-verdict">${esc(s.verdict || '')}</p>
      <p class="wdp-card-note">The Watchdog Score, powered by the ROBUST Framework. Evidence coverage ${Math.round(Number(s.evidence_coverage || 0))}%, ${esc(s.confidence || 'low')} confidence.</p>
      <ul class="wdp-dims">${rows}</ul>
    </section>`;
}

function taxCard(row, v) {
  const tc = row.town_compare;
  const trend = rateTrend(row);
  let bars = '';
  if (trend && trend.points.length >= 2) {
    const max = Math.max(...trend.points.map((p) => p.rate));
    bars = `<div class="wdp-rates-wrap"><span class="wdp-mini-label">Town tax rate per $100</span><ul class="wdp-rates" aria-label="General tax rate by year">${trend.points.map((p) => `<li><span class="wdp-rbar" style="height:${Math.max(10, Math.round(p.rate / max * 100))}%" title="${p.year}: $${p.rate.toFixed(3)}"></span><small>${String(p.year).slice(2)}</small></li>`).join('')}</ul></div>`;
  }
  const compare = townCompareText(row, v);
  return `<section class="wdp-card wdp-card--tax" aria-labelledby="wdp-tax-h">
      <div class="wdp-card-head"><h2 id="wdp-tax-h">Property tax</h2><a class="wdp-card-link" href="/town-compare">Compare towns</a></div>
      <div class="wdp-stats">
        <div class="wdp-stat is-lead"><b>${esc(money(row.last_year_tax) || 'n/a')}</b><span>${esc(taxStats(row, money).label)}</span></div>
        ${taxStats(row, money).extra}
        <div class="wdp-stat"><b>${esc(money(row.assessed_value) || 'n/a')}</b><span>Assessed value</span></div>
        ${tc && tc.median_tax ? `<div class="wdp-stat"><b>${esc(money(tc.median_tax))}</b><span>${esc(v.town)} median</span></div>` : ''}
        ${trend ? `<div class="wdp-stat"><b>$${trend.latest.rate.toFixed(3)}</b><span>${trend.latest.year} rate</span></div>` : ''}
      </div>
      ${compare ? `<p class="wdp-card-note">${esc(compare)}</p>` : ''}
      ${bars}
      ${trend && trend.cutAtReval ? `<p class="wdp-card-note">Rates start in ${trend.first.year}, the first year after the last town-wide revaluation.</p>` : ''}
    </section>`;
}

function salesCard(row, v) {
  const sum = row.sales_summary || {};
  const since = sum.first_date ? new Date(sum.first_date + 'T12:00:00Z').getUTCFullYear() : null;
  const own = row.last_sale_price ? `${money(row.last_sale_price)}${saleDate(row) ? ` on ${saleDate(row)}` : ''}` : 'No recorded sale price';
  return `<section class="wdp-card wdp-card--sales" aria-labelledby="wdp-salesum-h">
      <div class="wdp-card-head"><h2 id="wdp-salesum-h">Sales</h2>${Number(sum.count) ? '<a class="wdp-card-link" href="#wdp-sales">Nearby sales</a>' : ''}</div>
      <div class="wdp-stats">
        <div class="wdp-stat is-lead"><b>${esc(own)}</b><span>This property's last sale</span></div>
      </div>
      <div class="wdp-stats">
        ${Number(sum.count) ? `<div class="wdp-stat"><b>${count(sum.count)}</b><span>Similar sales${since ? ` since ${since}` : ''}</span></div><div class="wdp-stat"><b>${esc(money(sum.median))}</b><span>Median price</span></div>` : '<p class="wdp-card-note">No similar sales on the state list in the last 3 years.</p>'}
      </div>
    </section>`;
}

function homeCard(row) {
  const pin = encodeURIComponent(row.pams_pin);
  return `<section class="wdp-card wdp-card--home" aria-labelledby="wdp-home-h">
      <div class="wdp-card-head"><h2 id="wdp-home-h">Is this your home?</h2></div>
      <p class="wdp-card-note">Claim it to follow its assessment, tax and score in your Watchdog account. Once ownership is verified, you can add a photo that shows wherever this address appears on Watchdog.</p>
      <div class="wdp-pills">
        <a class="wdp-pill is-dark" href="/home?pin=${pin}"><i class="fas fa-house-circle-check" aria-hidden="true"></i>Claim this home</a>
        <a class="wdp-pill" href="/home?pin=${pin}#photo"><i class="fas fa-camera" aria-hidden="true"></i>Add a photo</a>
      </div>
    </section>`;
}

function salesSection(row) {
  const list = Array.isArray(row.recent_sales) ? row.recent_sales.filter((s) => s && s.pams_pin && s.price) : [];
  if (!list.length) return '';
  const rows = list.map((s) => {
    const d = s.date ? new Date(s.date + 'T12:00:00Z') : null;
    const when = d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
    return `<tr><td><a href="${esc(propertyPath({ ...s, town: s.town || row.town }))}">${esc(titleCase(s.address))}</a>${s.same_street ? '<span class="wdp-tag">Same street</span>' : ''}</td><td>${esc(when)}</td><td class="wdp-num">${esc(money(s.price))}</td><td class="wdp-num wdp-hide-sm">${s.year_built && s.year_built > 1700 ? s.year_built : ''}</td></tr>`;
  }).join('');
  return `<section class="wdp-panel" id="wdp-sales" aria-labelledby="wdp-sales-h">
      <h2 id="wdp-sales-h">Recent sales nearby</h2>
      <div class="wdp-table-wrap"><table class="wdp-table"><thead><tr><th>Address</th><th>Sold</th><th class="wdp-num">Price</th><th class="wdp-num wdp-hide-sm">Built</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="wdp-fine">Same property type in the same town, same street first. Prices come from the state tax list, which runs about a year behind, and can include sales between relatives or other non-market transfers.</p>
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
  return `<section class="wdp-panel" aria-labelledby="wdp-facts-h">
      <h2 id="wdp-facts-h">Property record</h2>
      <dl class="wdp-facts">${facts.map(([k, value]) => `<div><dt>${esc(k)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>
    </section>`;
}

function neighborsSection(row) {
  // Skip unnumbered lots and parcels with no tax bill (common areas, road lots).
  const list = Array.isArray(row.neighbors) ? row.neighbors.filter((n) => n && n.pams_pin && /^\d/.test(String(n.address || '')) && Number(n.last_year_tax) > 0) : [];
  if (!list.length) return '';
  const items = list.map((n) => `<li><a href="${esc(propertyPath({ ...n, town: n.town || row.town }))}"><span>${esc(titleCase(n.address))}</span><small>${money(n.last_year_tax)} tax</small></a></li>`).join('');
  return `<section class="wdp-panel" aria-labelledby="wdp-near-h">
      <h2 id="wdp-near-h">Same block</h2>
      <ul class="wdp-near">${items}</ul>
    </section>`;
}

function toolkitSection(row, v) {
  const trend = rateTrend(row);
  const ratio = latestRatio(row);
  const links = townLinks(row.pams_pin);
  const appeal = new URLSearchParams();
  if (row.assessed_value) appeal.set('assessed', String(row.assessed_value));
  if (trend) appeal.set('rate', trend.latest.rate.toFixed(3));
  if (ratio) appeal.set('ratio', String(ratio.ratio));
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${v.address}, ${v.town}, NJ`)}`;
  const items = [
    ['fa-magnifying-glass-dollar', 'Could an appeal lower this bill?', `The appeal estimator opens with this property's assessment${trend ? ' and the town tax rate' : ''} filled in.`, `/appeal-savings-estimator/?${appeal.toString()}`],
    ['fa-calendar-check', 'Appeal deadlines', 'Usually April 1 (May 1 after a town-wide revaluation), or 45 days after assessment notices go out if later.', '/nj-property-tax-calendar'],
    ['fa-hand-holding-dollar', 'ANCHOR, Senior Freeze and Stay NJ', 'Check which state property tax relief programs apply.', '/senior-benefit-estimator'],
    ['fa-calculator', 'Buying here?', 'Monthly cost with the real tax bill included.', '/home-buying-cost-calculator'],
    ['fa-clipboard-check', 'Selling? CO requirements', `Resale certificate of occupancy and smoke detector certificate rules${links.name ? ` for ${links.name}` : ''}.`, links.co],
    ...(links.tax ? [['fa-landmark', `${links.name} property taxes`, 'Typical bill, tax rate and appeal deadline for the town.', links.tax]] : []),
    ['fa-map-location-dot', 'Map', 'Open this address in Google Maps.', maps]
  ];
  const list = items.map(([icon, title, text, href]) => {
    const external = /^https?:\/\//.test(href);
    return `<li><a href="${esc(href)}"${external ? ' target="_blank" rel="noopener"' : ''}><i class="fas ${icon}" aria-hidden="true"></i><span><b>${esc(title)}</b><small>${esc(text)}</small></span></a></li>`;
  }).join('');
  return `<section class="wdp-panel" aria-labelledby="wdp-tools-h">
      <h2 id="wdp-tools-h">Homeowner tools</h2>
      <ul class="wdp-tools">${list}</ul>
    </section>`;
}

function alertsSection(row, v) {
  if (row.alerts_enabled !== true) return '';
  return `<section class="wdp-panel" id="wdp-alerts" aria-labelledby="wdp-alerts-h">
      <h2 id="wdp-alerts-h">Get alerts for this property</h2>
      <p>We check the state tax list once a month and email you if the assessment, tax bill or Watchdog Score for ${esc(v.address)} changes. Unsubscribe any time.</p>
      <form class="wdp-alert-form" id="wdp-alert-form" novalidate>
        <label><span class="wdp-sr">Email</span><input name="email" type="email" autocomplete="email" required maxlength="200" placeholder="you@example.com"></label>
        <button class="wdp-pill is-dark" type="submit"><i class="fas fa-bell" aria-hidden="true"></i>Email me changes</button>
      </form>
      <p class="wdp-form-msg" role="status" aria-live="polite"></p>
    </section>`;
}

function reportSection(row, v) {
  return `<section class="wdp-panel wdp-report" id="wdp-report" aria-labelledby="wdp-report-h">
      <div class="wdp-report-copy">
        <h2 id="wdp-report-h">Property report (PDF)</h2>
        <p>A printable report for ${esc(v.address)}: tax and assessment, the Watchdog Score, how the bill compares in ${esc(v.town)}, recent nearby sales and appeal dates.</p>
      </div>
      <form class="wdp-form" id="wdp-report-form" novalidate>
        <label>Full name<input name="name" autocomplete="name" required maxlength="120"></label>
        <label>Email<input name="email" type="email" autocomplete="email" required maxlength="200"></label>
        <label>Phone<input name="phone" type="tel" autocomplete="tel" required maxlength="30"></label>
        <label class="wdp-wide">Mailing address<input name="address" autocomplete="street-address" required maxlength="300" placeholder="Street, town, state, ZIP"></label>
        <label class="wdp-check wdp-wide"><input name="consent" type="checkbox" required><span>${esc(REPORT_CONSENT)}</span></label>
        <div class="wdp-wide wdp-form-foot"><button class="wdp-pill is-dark" type="submit"><i class="fas fa-file-arrow-down" aria-hidden="true"></i>Get the PDF</button><span class="wdp-form-msg" role="status" aria-live="polite"></span></div>
      </form>
    </section>`;
}

function shareSection(row, v) {
  const url = v.url;
  const text = `${v.address}, ${v.town}, NJ${row.last_year_tax ? `: ${money(row.last_year_tax)} property tax` : ''}${row.score && row.score.score != null ? `, Watchdog Score ${Math.round(Number(row.score.score))}/100` : ''}`;
  const enc = encodeURIComponent;
  const links = [
    ['fas fa-comment-sms', 'Text', `sms:?&body=${enc(`${text} ${url}`)}`],
    ['fas fa-envelope', 'Email', `mailto:?subject=${enc(`${v.address}, ${v.town}, NJ`)}&body=${enc(`${text}\n\n${url}`)}`],
    ['fab fa-facebook-f', 'Facebook', `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`],
    ['fab fa-x-twitter', 'X', `https://twitter.com/intent/tweet?url=${enc(url)}&text=${enc(text)}`],
    ['fab fa-linkedin-in', 'LinkedIn', `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`]
  ].map(([icon, label, href]) => `<a class="wdp-pill" href="${esc(href)}"${/^https:/.test(href) ? ' target="_blank" rel="noopener"' : ''}><i class="${icon}" aria-hidden="true"></i>${label}</a>`).join('');
  return `<section class="wdp-panel" id="wdp-share" aria-labelledby="wdp-share-h">
      <h2 id="wdp-share-h">Share</h2>
      <div class="wdp-pills">
        <button class="wdp-pill" type="button" data-wdp-native hidden><i class="fas fa-arrow-up-from-bracket" aria-hidden="true"></i>Share</button>
        <button class="wdp-pill" type="button" data-wdp-copy><i class="fas fa-link" aria-hidden="true"></i>Copy link</button>
        ${links}
        <button class="wdp-pill" type="button" data-wdp-print><i class="fas fa-print" aria-hidden="true"></i>Print</button>
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
  return `<section class="wdp-panel wdp-faq" aria-labelledby="wdp-faq-h"><h2 id="wdp-faq-h">Questions</h2>${items}</section>`;
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

// Dashboard board tokens (property/css/dashboard/watchdog-dashboard-board.css).
const STYLE = `
.wdp{--b-bg:#f3f1ec;--b-surface:#fbfaf7;--b-white:#fff;--b-ink:#0e2248;--b-ink-2:#142033;--b-muted:#5d6877;--b-line:#e3dfd6;--b-navy:#0e2248;--b-blue:#1456a0;--b-gold:#b8972a;--b-sky:#e3edfb;--b-teal:#dff1ec;--b-sand:#f6efd9;--b-radius:12px;background:var(--b-bg)!important;color:var(--b-ink);font-family:"Libre Franklin",system-ui,-apple-system,"Segoe UI",sans-serif}
.wdp .wd-nav.solid,.wdp.nav-solid .wd-nav{background:rgba(251,250,247,.94)}
.wdp a:focus-visible,.wdp button:focus-visible,.wdp summary:focus-visible,.wdp input:focus-visible{outline:3px solid var(--b-gold);outline-offset:2px}
.wdp-app{width:100%;max-width:1240px;margin:0 auto;padding:96px 30px 56px;box-sizing:border-box}
.wdp-crumbs{font-size:13px;color:var(--b-muted);margin:0 0 10px}
.wdp-crumbs a{color:var(--b-muted)}
.wdp-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:16px 24px;margin-bottom:22px}
.wdp-head h1{margin:0;font:600 clamp(28px,3.3vw,42px)/1.08 "Libre Franklin",system-ui,sans-serif;letter-spacing:-.035em;color:var(--b-ink)}
.wdp-head p{margin:8px 0 0;font-size:15px;color:var(--b-muted)}
.wdp-pills{display:flex;flex-wrap:wrap;gap:8px}
.wdp-pill{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 16px;border-radius:8px;border:1px solid var(--b-line);background:var(--b-white);color:var(--b-ink)!important;font:600 14px "Libre Franklin",system-ui,sans-serif;text-decoration:none!important;cursor:pointer;white-space:nowrap}
.wdp-pill:hover{border-color:var(--b-ink)}
.wdp-pill.is-dark{background:var(--b-navy);border-color:var(--b-navy);color:#fff!important}
.wdp-pill[hidden]{display:none}
.wdp-photo{margin:0 0 16px;border-radius:var(--b-radius);overflow:hidden;background:var(--b-surface);border:1px solid var(--b-line)}
.wdp-photo img{display:block;width:100%;aspect-ratio:16/7;object-fit:cover}
.wdp-photo figcaption{padding:8px 16px;font-size:12px;color:var(--b-muted)}
.wdp-cards{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:16px}
.wdp-card{min-width:0;border-radius:var(--b-radius);padding:20px 22px;color:var(--b-ink)}
.wdp-card--score{grid-column:span 5;background:var(--b-navy);color:#fff}
.wdp-card--tax{grid-column:span 7;background:var(--b-sky)}
.wdp-card--sales{grid-column:span 6;background:var(--b-sand)}
.wdp-card--home{grid-column:span 6;background:var(--b-teal)}
.wdp-card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
.wdp-card-head h2{margin:0;font:600 19px/1.2 "Libre Franklin",system-ui,sans-serif;letter-spacing:-.01em}
.wdp-card-link{display:inline-flex;align-items:center;min-height:44px;padding:0 12px;border-radius:8px;background:rgba(255,255,255,.55);color:inherit!important;font-size:13px;font-weight:600;text-decoration:none!important;white-space:nowrap}
.wdp-card--score .wdp-card-link{background:rgba(255,255,255,.14)}
.wdp-card-note{margin:12px 0 0;font-size:13px;line-height:1.5;color:rgba(22,20,15,.72)}
.wdp-card--score .wdp-card-note{color:rgba(255,255,255,.74)}
.wdp-stats{display:flex;flex-wrap:wrap;gap:12px 28px;margin-top:4px}
.wdp-stat{display:grid;gap:4px;min-width:0}
.wdp-stat b{font:700 20px/1.15 "Libre Franklin",system-ui,sans-serif;letter-spacing:-.02em;overflow-wrap:anywhere}
.wdp-stat span{font-size:12px;font-weight:600;letter-spacing:0;text-transform:none;color:rgba(22,20,15,.66)}
.wdp-stat.is-lead b{padding-bottom:6px;border-bottom:2px solid var(--b-ink);justify-self:start}
.wdp-score-lead{display:flex;align-items:baseline;gap:4px}
.wdp-score-lead b{font:700 56px/1 "Libre Franklin",system-ui,sans-serif;letter-spacing:-.04em;padding-bottom:6px;border-bottom:2px solid var(--b-gold)}
.wdp-score-lead span{font-size:16px;color:rgba(255,255,255,.74)}
.wdp-score-verdict{margin:12px 0 0;font-size:16px;font-weight:600}
.wdp-dims{list-style:none;margin:14px 0 0;padding:0;display:grid;gap:2px}
.wdp-dims a{display:grid;grid-template-columns:26px minmax(0,1fr) minmax(56px,32%) 32px;gap:10px;align-items:center;min-height:44px;color:#fff!important;text-decoration:none!important;border-radius:10px;padding:0 4px}
.wdp-dims a:hover{background:rgba(255,255,255,.08)}
.wdp-letter{width:26px;height:26px;border-radius:8px;background:rgba(255,255,255,.14);display:grid;place-content:center;font-weight:700;font-size:13px}
.wdp-dim{font-size:14px;font-weight:600;overflow-wrap:break-word;hyphens:auto}
.wdp-bar{height:8px;border-radius:12px;background:rgba(255,255,255,.16);overflow:hidden}
.wdp-bar i{display:block;height:100%;background:#fff;border-radius:12px}
.wdp-dims b{text-align:right;font-size:14px}
.wdp-rates-wrap{margin-top:14px}
.wdp-mini-label{font-size:12px;font-weight:600;letter-spacing:0;text-transform:none;color:rgba(22,20,15,.66)}
.wdp-rates{list-style:none;margin:8px 0 0;padding:0;display:flex;align-items:flex-end;gap:6px;height:72px}
.wdp-rates li{flex:1 1 0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;min-width:0}
.wdp-rbar{display:block;width:100%;max-width:30px;border-radius:6px 6px 2px 2px;background:var(--b-blue)}
.wdp-rates small{font-size:12px;color:rgba(22,20,15,.66);margin-top:4px}
.wdp-grid{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:16px;margin-top:16px;align-items:start}
.wdp-col{display:grid;gap:16px;min-width:0}
.wdp-panel{background:var(--b-white);border:1px solid var(--b-line);border-radius:var(--b-radius);padding:20px 22px;min-width:0}
.wdp-panel h2{margin:0 0 12px;font:600 19px/1.2 "Libre Franklin",system-ui,sans-serif;letter-spacing:-.01em;color:var(--b-ink)}
.wdp-panel p{margin:0 0 10px;line-height:1.55;color:var(--b-ink-2)}
.wdp-fine{font-size:13px!important;color:var(--b-muted)!important;margin:12px 0 0!important}
.wdp-table-wrap{overflow-x:auto}
.wdp-table{width:100%;border-collapse:collapse;font-size:14px}
.wdp-table th{text-align:left;font-size:12px;font-weight:600;letter-spacing:0;text-transform:none;color:var(--b-muted);padding:0 8px 8px 0;border-bottom:1px solid var(--b-line)}
.wdp-table td{padding:12px 8px 12px 0;border-bottom:1px solid var(--b-line);vertical-align:top}
.wdp-table a{color:var(--b-ink);font-weight:600}
.wdp-num{text-align:right!important;white-space:nowrap}
.wdp-tag{display:inline-block;margin-left:8px;padding:2px 8px;border-radius:8px;background:var(--b-sand);font-size:12px;font-weight:600;color:var(--b-ink-2)}
.wdp-facts{margin:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 16px}
.wdp-facts div{min-width:0}
.wdp-facts dt{font-size:12px;font-weight:600;letter-spacing:0;text-transform:none;color:var(--b-muted)}
.wdp-facts dd{margin:2px 0 0;font-weight:600;overflow-wrap:anywhere}
.wdp-near{list-style:none;margin:0;padding:0}
.wdp-near a{display:flex;justify-content:space-between;gap:12px;align-items:center;min-height:44px;color:var(--b-ink)!important;text-decoration:none;border-bottom:1px solid var(--b-line);font-weight:600}
.wdp-near small{color:var(--b-muted);font-size:13px;font-weight:600;white-space:nowrap}
.wdp-tools{list-style:none;margin:0;padding:0;display:grid;gap:2px}
.wdp-tools a{display:grid;grid-template-columns:36px minmax(0,1fr);gap:12px;align-items:center;min-height:56px;padding:8px 6px;border-radius:14px;text-decoration:none!important;color:var(--b-ink)!important}
.wdp-tools a:hover{background:var(--b-surface)}
.wdp-tools .fas{width:36px;height:36px;border-radius:12px;background:var(--b-sky);color:var(--b-blue);display:grid;place-content:center;font-size:15px}
.wdp-tools b{display:block;font-size:15px;font-weight:600}
.wdp-tools small{display:block;font-size:13px;color:var(--b-muted);line-height:1.45}
.wdp-report{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:20px;margin-top:16px}
.wdp-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.wdp-form label{display:grid;gap:6px;font-size:13px;font-weight:600;color:var(--b-ink-2)}
.wdp-form input:not([type=checkbox]){width:100%;box-sizing:border-box;min-height:46px;padding:10px 12px;border:1px solid var(--b-line);border-radius:12px;background:var(--b-surface);font:500 16px "Libre Franklin",system-ui,sans-serif;color:var(--b-ink)}
.wdp-form input:focus{border-color:var(--b-ink);background:#fff}
.wdp-form input[aria-invalid=true]{border-color:#c0342b}
.wdp-wide{grid-column:1/-1}
.wdp-check{display:flex!important;align-items:flex-start;gap:10px;font-weight:500!important;font-size:13px!important;line-height:1.5;color:var(--b-muted)!important}
.wdp-check input{margin-top:3px;width:20px;height:20px;flex:none}
.wdp-form-foot{display:flex;flex-wrap:wrap;align-items:center;gap:12px}
.wdp-form-msg{font-size:14px;font-weight:600}
.wdp-form-msg.is-error{color:#c0342b}
.wdp-form-msg.is-ok{color:#1c7a4a}
.wdp-alert-form{display:flex;flex-wrap:wrap;gap:10px;margin:4px 0 8px}
.wdp-alert-form label{flex:1 1 220px;display:block}
.wdp-alert-form input{width:100%;box-sizing:border-box;min-height:46px;padding:10px 12px;border:1px solid var(--b-line);border-radius:12px;background:var(--b-surface);font:500 16px "Libre Franklin",system-ui,sans-serif;color:var(--b-ink)}
.wdp-alert-form input:focus{border-color:var(--b-ink);background:#fff}
.wdp-alert-form input[aria-invalid=true]{border-color:#c0342b}
.wdp-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.wdp-share-wrap{margin-top:16px}
.wdp-toast{display:block;margin-top:8px;font-size:14px;font-weight:600;color:#1c7a4a}
.wdp-faq{margin-top:16px}
.wdp-faq details{border-top:1px solid var(--b-line)}
.wdp-faq summary{cursor:pointer;min-height:48px;display:flex;align-items:center;font-weight:600;list-style:none;padding:10px 0}
.wdp-faq summary::after{content:"+";margin-left:auto;padding-left:12px;font-size:20px;color:var(--b-muted)}
.wdp-faq details[open] summary::after{content:"\\2013"}
.wdp-faq details p{color:var(--b-muted)}
.wdp-source{margin:16px 0 0;font-size:13px;line-height:1.55;color:var(--b-muted)}
.wdp-source a{color:var(--b-ink);font-weight:600}
@media (max-width:980px){.wdp-card--score,.wdp-card--tax,.wdp-card--sales,.wdp-card--home{grid-column:1/-1}.wdp-grid,.wdp-report{grid-template-columns:minmax(0,1fr)}}
@media (max-width:640px){.wdp-app{padding:84px 16px 40px}.wdp-card,.wdp-panel{padding:18px 16px}.wdp-form{grid-template-columns:minmax(0,1fr)}.wdp-facts{grid-template-columns:minmax(0,1fr)}.wdp-head .wdp-pills{width:100%}.wdp-head .wdp-pill{flex:1 1 auto;justify-content:center}.wdp-hide-sm{display:none}.wdp-dims a{grid-template-columns:26px minmax(0,1fr) 22% 32px;gap:8px}.wdp-score-lead b{font-size:48px}}
@media (prefers-reduced-motion:reduce){.wdp *{transition:none!important;animation:none!important}}
@media print{.wd-nav,.wd-public-sheet,.wd-public-backdrop,.wdp-head .wdp-pills,#wdp-share,#wdp-report,#wdp-alerts,#main-footer,.wdp-card--home{display:none!important}.wdp{background:#fff!important}.wdp-app{padding:0}.wdp-card,.wdp-panel{break-inside:avoid}.wdp-card--score{background:#fff!important;color:#000!important;border:1px solid #ccc}.wdp-card--score *{color:#000!important}.wdp-bar i{background:#000!important}}
`;

const PAGE_SCRIPT = `(function(){
  var data={};try{data=JSON.parse(document.getElementById('wdp-data').textContent)}catch(e){}
  var toast=document.querySelector('.wdp-toast');
  function say(t){if(!toast)return;toast.textContent=t;clearTimeout(say.t);say.t=setTimeout(function(){toast.textContent=''},2500)}
  function copy(){var u=data.url||location.href;if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(u).then(function(){say('Link copied')},function(){prompt('Copy this link',u)})}else{prompt('Copy this link',u)}}
  function nativeShare(){return navigator.share({title:data.title,text:data.text,url:data.url}).catch(function(){})}
  var nat=document.querySelector('[data-wdp-native]');
  if(nat&&navigator.share){nat.hidden=false;nat.addEventListener('click',nativeShare)}
  var c=document.querySelector('[data-wdp-copy]');if(c)c.addEventListener('click',copy);
  var p=document.querySelector('[data-wdp-print]');if(p)p.addEventListener('click',function(){window.print()});
  document.querySelectorAll('[data-wdp-share-top]').forEach(function(a){a.addEventListener('click',function(e){if(navigator.share){e.preventDefault();nativeShare()}})});
  function remember(){if(window.WatchdogPublicNav&&typeof window.WatchdogPublicNav.remember==='function'&&data.recent){window.WatchdogPublicNav.remember(data.recent);return true}return false}
  if(!remember())window.addEventListener('load',remember);

  var af=document.getElementById('wdp-alert-form');
  if(af){
    var am=af.parentNode.querySelector('.wdp-form-msg');
    af.addEventListener('submit',function(e){
      e.preventDefault();
      var input=af.elements.email,email=input.value.trim();input.removeAttribute('aria-invalid');
      function tell(t,ok){am.textContent=t;am.className='wdp-form-msg '+(ok?'is-ok':'is-error')}
      if(!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email)){input.setAttribute('aria-invalid','true');input.focus();return tell('Please enter a valid email.',false)}
      var b=af.querySelector('button');b.disabled=true;tell('Sending...',true);
      fetch('/api/watchdog-property-alerts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin:data.pin,email:email})})
        .then(function(r){return r.json().catch(function(){return{}}).then(function(j){if(!r.ok)throw new Error(j.error||'Something went wrong. Please try again.');return j})})
        .then(function(j){tell(j.message||'Check your email to confirm.',true);af.reset()})
        .catch(function(err){tell(err.message,false)})
        .then(function(){b.disabled=false});
    });
  }

  var form=document.getElementById('wdp-report-form');
  if(!form)return;
  var msg=form.querySelector('.wdp-form-msg');
  function show(t,ok){msg.textContent=t;msg.className='wdp-form-msg '+(ok?'is-ok':'is-error')}
  function bad(name,why){var el=form.elements[name];if(el){el.setAttribute('aria-invalid','true');el.focus()}show(why,false);return false}
  function notify(v){
    try{
      function go(){if(!window.emailjs)return;window.emailjs.init({publicKey:'u262kw5AoJcBI342V'});window.emailjs.send('service_gptqbyx','template_contact',{
        name:v.name,email:v.email,phone:v.phone,topic:'PDF property report, '+(data.recent&&data.recent.town||'NJ'),
        tenure:'Unknown',lead_type:'Unknown',finance:'Not provided',town:(data.recent&&data.recent.town)||'',address:data.title||'',
        message:['Downloaded the Watchdog property report (PDF).','Property: '+(data.title||''),'Page: '+(data.url||''),'Mailing address: '+v.address,'Contact consent: yes'].join('\\n')
      }).catch(function(){})}
      if(window.emailjs)return go();
      var s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';s.onload=go;document.head.appendChild(s);
    }catch(e){}
  }
  form.addEventListener('submit',function(e){
    e.preventDefault();
    [].forEach.call(form.querySelectorAll('[aria-invalid]'),function(el){el.removeAttribute('aria-invalid')});
    var v={name:form.elements.name.value.trim(),email:form.elements.email.value.trim(),phone:form.elements.phone.value.trim(),address:form.elements.address.value.trim(),consent:form.elements.consent.checked};
    if(v.name.length<2)return bad('name','Please enter your full name.');
    if(!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(v.email))return bad('email','Please enter a valid email.');
    var digits=v.phone.replace(/\\D/g,'');if(digits.length<10||digits.length>15)return bad('phone','Please enter a phone number with area code.');
    if(v.address.length<8)return bad('address','Please enter your mailing address.');
    if(!v.consent)return bad('consent','Please check the box to continue.');
    var btn=form.querySelector('button[type=submit]');btn.disabled=true;show('Preparing your report...',true);
    fetch('/api/watchdog-property-report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin:data.pin,name:v.name,email:v.email,phone:v.phone,address:v.address,consent:true})})
      .then(function(r){if(!r.ok)return r.json().catch(function(){return{}}).then(function(j){throw new Error(j.error||'Something went wrong. Please try again.')});return r.blob()})
      .then(function(blob){
        var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=data.fileName||'Watchdog-Property-Report.pdf';document.body.appendChild(a);a.click();
        setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},4000);
        show('Your report is downloading.',true);notify(v);
      })
      .catch(function(err){show(err.message,false)})
      .then(function(){btn.disabled=false});
  });
})();`;

function chrome() {
  return `<header class="wd-nav" id="wd-nav">
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
</aside>`;
}

const HEAD_ASSETS = `<link rel="icon" href="/favicon-96x96.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<link rel="stylesheet" href="/styles.css">
<link rel="stylesheet" href="/property/css/shared.css">
<link rel="stylesheet" href="/property/css/public-mobile-nav.css">`;

const FOOT_SCRIPTS = `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
<script src="/property/js/watchdog-easter-eggs.js?v=20261005a" defer></script>
<script src="/property/js/public-nav.js"></script>
<script>fetch('/property/partials/footer.html').then(function(r){return r.ok?r.text():''}).then(function(h){var f=document.getElementById('main-footer');if(f&&h)f.innerHTML=h}).catch(function(){});</script>`;

function reportFileName(v) {
  return `Watchdog-Property-Report-${slugify(v.address)}-${slugify(v.town)}.pdf`;
}

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
    url: v.url, title: `${v.address}, ${v.town}, NJ`, text: shareText, pin: row.pams_pin, fileName: reportFileName(v),
    recent: { address: v.address, town: row.town, pin: row.pams_pin, assessed: row.assessed_value || '', tax: row.last_year_tax || '', year_built: row.year_built || '', zip: row.zip || '' }
  }).replace(/</g, '\\u003c');
  const photo = options.photoUrl ? `<figure class="wdp-photo"><img src="${esc(options.photoUrl)}" alt="${esc(`${v.address}, ${v.town}`)}" loading="eager"><figcaption>Photo shared by the homeowner</figcaption></figure>` : '';
  const subtitle = [v.place, `${v.county} County`, v.cls ? v.cls[0] : '', row.block ? `Block ${row.block}, Lot ${row.lot || ''}` : ''].filter(Boolean).join(' · ');
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
<meta property="og:image" content="${esc(options.photoUrl || `${CANONICAL_ORIGIN}/watchdog-social-share-20260913-v3.jpg`)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(`${v.address}, ${v.town}, NJ`)}">
<meta name="twitter:description" content="${esc(description)}">
${HEAD_ASSETS}
<script type="application/ld+json">${jsonLd(row, v)}</script>
<style>${STYLE}</style>
</head>
<body class="nav-solid wdp">
${chrome()}
<main class="wdp-app">
  <div class="wdp-crumbs" role="navigation" aria-label="Breadcrumb"><a href="/">New Jersey</a> › ${esc(v.county)} County › ${esc(v.town)}</div>
  <div class="wdp-head">
    <div>
      <h1>${esc(v.address)}</h1>
      <p>${esc(subtitle)}</p>
    </div>
    <div class="wdp-pills">
      <a class="wdp-pill is-dark" href="${esc(lookup)}"><i class="fas fa-magnifying-glass-chart" aria-hidden="true"></i>Full analysis</a>
      <a class="wdp-pill" href="#wdp-report"><i class="fas fa-file-arrow-down" aria-hidden="true"></i>PDF report</a>
      <a class="wdp-pill" href="#wdp-share" data-wdp-share-top><i class="fas fa-share-nodes" aria-hidden="true"></i>Share</a>
    </div>
  </div>
  ${photo}
  <div class="wdp-cards">
    ${scoreCard(row)}
    ${taxCard(row, v)}
    ${salesCard(row, v)}
    ${homeCard(row)}
  </div>
  <div class="wdp-grid">
    <div class="wdp-col">
      ${salesSection(row)}
      ${toolkitSection(row, v)}
    </div>
    <div class="wdp-col">
      ${factsSection(row, v)}
      ${neighborsSection(row)}
      ${alertsSection(row, v)}
    </div>
  </div>
  ${reportSection(row, v)}
  <div class="wdp-share-wrap">${shareSection(row, v)}</div>
  ${faqSection(row, v)}
  <p class="wdp-source">Source: New Jersey MOD-IV tax list and NJ Office of GIS parcel data, refreshed monthly${updated ? ` (last refresh ${esc(updated)})` : ''}. Town tax rates from the NJ Division of Taxation. Watchdog does not show owner names. <a href="/data-methodology">How we get our numbers</a></p>
</main>
<div id="main-footer"></div>
<script id="wdp-data" type="application/json">${pageData}</script>
${FOOT_SCRIPTS}
<script>${PAGE_SCRIPT}</script>
</body>
</html>`;
}

function messagePage(title, heading, text, actions = '') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)} | Watchdog</title><meta name="robots" content="noindex, follow">
${HEAD_ASSETS}<style>${STYLE}</style></head>
<body class="nav-solid wdp">${chrome()}
<main class="wdp-app"><div class="wdp-head"><div><h1>${esc(heading)}</h1><p>${esc(text)}</p></div>${actions ? `<div class="wdp-pills">${actions}</div>` : ''}</div></main>
<div id="main-footer"></div>${FOOT_SCRIPTS}</body></html>`;
}

function notFoundPage() {
  return messagePage('Property not found', 'We couldn\'t find that property', 'The link may be old, or the parcel has no tax record on the state list.', '<a class="wdp-pill is-dark" href="/">Search an address</a>');
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

// Approved homeowner photos live in the private property-photos bucket; sign a
// week-long URL (pages are cached for a day).
async function signPhoto(path) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!path || !url || !key) return '';
  try {
    const r = await fetch(`${url}/storage/v1/object/sign/property-photos/${String(path).split('/').map(encodeURIComponent).join('/')}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: 604800 }),
      signal: AbortSignal.timeout(4000)
    });
    if (!r.ok) return '';
    const j = await r.json().catch(() => null);
    const signed = j && (j.signedURL || j.signedUrl);
    return signed ? `${url}/storage/v1${signed.startsWith('/') ? '' : '/'}${signed}` : '';
  } catch (err) {
    console.warn('watchdog-property-page photo', err && err.message || err);
    return '';
  }
}

function supabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('property data unavailable');
  return { url, key };
}

async function rpc(name, body) {
  const { url, key } = supabaseConfig();
  const r = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(6000)
  });
  if (!r.ok) throw new Error(`${name} http ${r.status}`);
  return r.json().catch(() => null);
}

const asObject = (data) => (data && typeof data === 'object' && !Array.isArray(data) ? data : null);

// Published page details (path, property ZIP, postal city) folded into the
// row so titles, canonical URLs and structured data use them.
function withPublished(row, published) {
  if (!published) return row;
  const zip = /^0[78]\d{3}$/.test(String(published.property_zip || '')) ? published.property_zip : null;
  return { ...row, zip, postal_city: published.postal_city || null, page_path: published.path };
}

// The live home page, built by api/watchdog-index-entry.js. Kept for a few
// minutes per instance; that page changes only on deploys.
let homeCache = { at: 0, html: '' };
async function homeHtml() {
  if (homeCache.html && Date.now() - homeCache.at < 300000) return homeCache.html;
  const mod = await import('./watchdog-index-entry.js');
  const build = mod.buildWatchdogHomeHtml || (mod.default && mod.default.buildWatchdogHomeHtml);
  if (typeof build !== 'function') throw new Error('home page builder missing');
  homeCache = { at: Date.now(), html: await build() };
  return homeCache.html;
}

const SHELL_STYLE = `
#plm-ssr.wdp{background:#fff!important;padding:24px 28px 40px}
#plm-ssr .wdp-head{margin-top:4px}
#plm-top.wdp{background:#fff!important;padding:24px 28px 8px}
#plm-top .wdp-head{margin-top:4px}
#plm-top~#plm-photos .wd-mapless-property-hero{display:none!important}
html body #plm-top~#plm-photos.wd-has-lot-map{grid-template-columns:1fr!important}
@media (max-width:640px){#plm-ssr.wdp{padding:18px 16px 32px}#plm-top.wdp{padding:18px 16px 4px}}
`;

function subtitleLine(row, v) {
  return [row.postal_city ? `${titleCase(row.postal_city)}, NJ${row.zip ? ' ' + row.zip : ''}` : v.place, row.postal_city ? v.town : '', `${v.county} County`, v.cls ? v.cls[0] : '', row.block ? `Block ${row.block}, Lot ${row.lot || ''}` : ''].filter(Boolean).join(' · ');
}

// Title and the four summary cards. The popup shows this above its own
// sections, for searches as well as saved links.
function topSection(row, v) {
  return `<div class="wdp-head"><div><h1>${esc(v.address)}</h1><p>${esc(subtitleLine(row, v))}</p></div></div>
  <div class="wdp-cards">
    ${scoreCard(row)}
    ${taxCard(row, v)}
    ${salesCard(row, v)}
    ${homeCard(row)}
  </div>`;
}

function propertySection(row, v, options) {
  const photo = options.photoUrl ? `<figure class="wdp-photo"><img src="${esc(options.photoUrl)}" alt="${esc(`${v.address}, ${v.town}`)}" loading="eager"><figcaption>Photo shared by the homeowner</figcaption></figure>` : '';
  const updated = monthYear(row.source_synced_at);
  return `<div class="wdp" id="plm-ssr">
  ${topSection(row, v)}
  ${photo}
  <div class="wdp-grid">
    <div class="wdp-col">
      ${salesSection(row)}
      ${toolkitSection(row, v)}
    </div>
    <div class="wdp-col">
      ${factsSection(row, v)}
      ${neighborsSection(row)}
      ${alertsSection(row, v)}
    </div>
  </div>
  ${reportSection(row, v)}
  <div class="wdp-share-wrap">${shareSection(row, v)}</div>
  ${faqSection(row, v)}
  <p class="wdp-source">Source: New Jersey MOD-IV tax list and NJ Office of GIS parcel data, refreshed monthly${updated ? ` (last refresh ${esc(updated)})` : ''}. Town tax rates from the NJ Division of Taxation. Watchdog does not show owner names. <a href="/data-methodology">How we get our numbers</a></p>
</div>`;
}

function shellTitle(row, v) {
  const place = row.postal_city ? `${titleCase(row.postal_city)}, NJ` : `${v.town}, NJ`;
  return `${v.address}, ${place}${row.zip ? ' ' + row.zip : ''} | Property Tax & Watchdog Score`;
}

function setTag(html, pattern, tag) {
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace('</head>', `${tag}\n</head>`);
}

// The home page with this property's popup open. Returns '' when the home
// page markup isn't what we expect, and the caller falls back to renderPage.
function renderShell(home, row, options = {}) {
  if (!/<div class="plm-backdrop" id="plm-backdrop"/.test(home) || !/<div class="plm" id="plm"/.test(home) || !/<div class="plm-scroll" id="plm-scroll">/.test(home)) return '';
  const v = view(row);
  const indexable = options.indexable === true;
  const title = shellTitle(row, v);
  const description = describe(row, v);
  const social = `${v.address}, ${row.postal_city ? titleCase(row.postal_city) : v.town}, NJ`;
  const homeTitle = (home.match(/<title>([^<]*)<\/title>/) || [])[1] || 'Watchdog';
  const score = row.score && row.score.score != null ? Math.round(Number(row.score.score)) : null;
  const pageData = JSON.stringify({
    url: v.url, title: social, text: `${social}${row.last_year_tax ? `: ${money(row.last_year_tax)} property tax` : ''}${score != null ? `, Watchdog Score ${score}/100` : ''}`,
    pin: row.pams_pin, fileName: reportFileName(v),
    recent: { address: v.address, town: row.town, pin: row.pams_pin, assessed: row.assessed_value || '', tax: row.last_year_tax || '', year_built: row.year_built || '', zip: row.zip || '' }
  }).replace(/</g, '\\u003c');
  const boot = JSON.stringify({
    pin: row.pams_pin, path: v.path, published: options.published === true, zip: row.zip || '', homeTitle,
    query: `${v.address}, ${v.town}, NJ${row.zip ? ' ' + row.zip : ''}`
  }).replace(/</g, '\\u003c');
  let html = home;
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  html = setTag(html, /<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(description)}">`);
  html = setTag(html, /<meta name="robots" content="[^"]*">/, `<meta name="robots" content="${indexable ? 'index, follow, max-image-preview:large' : 'noindex, follow'}">`);
  html = setTag(html, /<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${esc(v.url)}">`);
  html = setTag(html, /<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${esc(v.url)}">`);
  html = setTag(html, /<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(social)}">`);
  html = setTag(html, /<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(description)}">`);
  html = setTag(html, /<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${esc(social)}">`);
  html = setTag(html, /<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${esc(description)}">`);
  if (options.photoUrl) html = html.replace(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${esc(options.photoUrl)}">`);
  html = html.replace('</head>', `<script type="application/ld+json">${jsonLd(row, v)}</script>\n<style>${STYLE}${SHELL_STYLE}</style>\n</head>`);
  html = html.replace(/<body([^>]*)>/, (m, attrs) => (/class="/.test(attrs) ? `<body${attrs.replace(/class="/, 'class="plm-locked ')}>` : `<body${attrs} class="plm-locked">`));
  html = html.replace('<div class="plm-backdrop" id="plm-backdrop"', '<div class="plm-backdrop open" id="plm-backdrop"');
  html = html.replace('<div class="plm" id="plm"', '<div class="plm open" id="plm"');
  html = html.replace('<div class="plm-scroll" id="plm-scroll">', `<div class="plm-scroll" id="plm-scroll">\n${propertySection(row, v, options)}`);
  const scripts = `<script id="wdp-data" type="application/json">${pageData}</script>\n<script>window.WD_PROPERTY_PAGE=${boot};</script>\n<script>${PAGE_SCRIPT}</script>\n`;
  html = html.replace(/<script src="\/property\/js\/lookup\.js/, (m) => scripts + m);
  if (!html.includes('window.WD_PROPERTY_PAGE')) html = html.replace('</body>', `${scripts}</body>`);
  return html;
}

async function renderProperty(row, options) {
  const photoUrl = await signPhoto(row.photo_path);
  try {
    const shell = renderShell(await homeHtml(), row, { ...options, photoUrl });
    if (shell) return shell;
    console.warn('watchdog-property-page shell markers missing');
  } catch (err) {
    console.warn('watchdog-property-page shell', err && err.message || err);
  }
  return renderPage(row, { ...options, photoUrl });
}

function requestHost(req) {
  return String((req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || '').split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');
}

// Only Watchdog's own pages may publish: same host, a browser, a real PIN.
function publishAllowed(req) {
  const host = requestHost(req);
  const origin = String((req.headers && (req.headers.origin || req.headers.referer)) || '');
  let originHost = '';
  try { originHost = new URL(origin).hostname.toLowerCase(); } catch (_err) { return false; }
  const ua = String((req.headers && req.headers['user-agent']) || '');
  if (!ua || /curl|wget|python-requests|scrapy|go-http-client|libwww-perl|httpclient|headless|bot|spider|crawl|slurp|lighthouse/i.test(ua)) return false;
  return !!host && originHost === host && (host === 'www.watchdogindex.com' || host.endsWith('.vercel.app') || host === 'localhost');
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  if (typeof req.body === 'string') { try { return Promise.resolve(JSON.parse(req.body)); } catch (_err) { return Promise.resolve({}); } }
  return Promise.resolve({});
}

function cleanCity(value) {
  const city = String(value || '').trim().replace(/\s+/g, ' ');
  return /^[A-Za-z .'-]{2,40}$/.test(city) && !/^nj$|^new jersey$/i.test(city) ? city : '';
}

async function publish(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (!publishAllowed(req)) return res.status(403).end(JSON.stringify({ error: 'Not allowed.' }));
  const body = await readBody(req);
  const pin = String(body.pin || '');
  if (!/^\d{4}_[0-9A-Za-z.&_-]{1,70}$/.test(pin)) return res.status(400).end(JSON.stringify({ error: 'Bad property.' }));
  const zip = /^0[78]\d{3}$/.test(String(body.zip || '')) ? String(body.zip) : null;
  try {
    const row = await fetchProperty(pin);
    if (!row) return res.status(404).end(JSON.stringify({ error: 'Not found.' }));
    const path = await rpc('publish_public_property_page', {
      p_pin: pin, p_town_slug: slugify(townName(row.town)), p_page_slug: pageSlug(row, zip), p_zip: zip, p_city: cleanCity(body.city) || null
    });
    if (typeof path !== 'string' || !path.startsWith('/nj/')) return res.status(404).end(JSON.stringify({ error: 'Not found.' }));
    return res.status(200).end(JSON.stringify({ path }));
  } catch (err) {
    console.error('watchdog-property-page publish', err && err.message || err);
    return res.status(503).end(JSON.stringify({ error: 'Try again later.' }));
  }
}

function sendNotFound(req, res) {
  res.statusCode = 404;
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600');
  return res.end(req.method === 'HEAD' ? undefined : notFoundPage());
}

const ROBUST_NOTES = {
  recourse: 'weight 10: county appeal options, deadlines and how strong the evidence is',
  fairness: 'weight 20: assessed value next to the value the sales evidence supports, using NJ Chapter 123 rules',
  burden: 'weight 30: yearly tax next to the supported market value',
  uniformity: 'weight 15: how evenly the town assesses, from the NJ Coefficient of Deviation',
  stability: 'weight 15: revaluation pressure, ratio drift and town uniformity',
  trajectory: 'weight 10: this assessment next to verified sales and the town ratio over time'
};

function mdText(value) {
  return String(value == null ? '' : value).replace(/[\r\n]+/g, ' ').replace(/[<>`|]/g, '').trim();
}

// A Markdown file about one property that any AI assistant can read.
function renderMarkdown(row, v) {
  const lines = [];
  const add = (...items) => lines.push(...items);
  const fact = (k, value) => { if (value !== '' && value != null) add(`- ${k}: ${mdText(value)}`); };
  const place = row.postal_city ? `${titleCase(row.postal_city)}, NJ${row.zip ? ' ' + row.zip : ''}` : v.place;
  add(`# ${mdText(v.address)}, ${mdText(place)}`, '');
  add(`Watchdog property file. Source: ${v.url}`, '');
  add('Watchdog is a New Jersey property tax site. This file has the public tax record for one property and Watchdog\'s own numbers about it. Use it to answer questions about this property\'s taxes, value and whether an appeal might make sense. Figures come from the NJ MOD-IV tax list, NJ Office of GIS parcels, state sales records and the NJ Division of Taxation. Watchdog does not show owner names. This is not an appraisal or legal advice.', '');
  add('## Property');
  fact('Address', `${v.address}, ${place}`);
  fact('Municipality', v.town);
  fact('County', `${v.county} County`);
  fact('Block / lot', [row.block, row.lot].filter(Boolean).join(' / ') + (row.qualifier ? ` (${row.qualifier})` : ''));
  fact('NJ parcel ID (PAMS PIN)', row.pams_pin);
  fact('Property class', v.cls ? `${v.cls[0]} (${row.prop_class})` : row.prop_class);
  fact('Year built', row.year_built && row.year_built > 1700 ? row.year_built : '');
  fact('Building', row.building_desc);
  fact('Lot size', row.acres && Number(row.acres) > 0 ? `${Number(row.acres).toFixed(2)} acres` : '');
  add('', '## Property tax');
  const ts = taxStats(row, money);
  fact(ts.label, money(row.last_year_tax));
  if (ts.by.current) fact(`${ts.by.current.year} ${ts.by.current.generalRateOnly ? 'estimate' : 'at new rate'}`, money(ts.by.current.amount));
  fact('Assessed value', money(row.assessed_value));
  fact('Land value', money(row.land_value));
  fact('Improvement value', money(row.improvement_value));
  const trend = rateTrend(row);
  if (trend) fact(`${trend.latest.year} general tax rate`, `$${trend.latest.rate.toFixed(3)} per $100 of assessed value`);
  const ratio = latestRatio(row);
  if (ratio) fact(`${ratio.year} state equalization ratio`, `${(ratio.ratio > 1.5 ? ratio.ratio : ratio.ratio * 100).toFixed(2)}% (town assessments run at about this share of market value)`);
  const compare = townCompareText(row, v);
  if (compare) add(`- ${mdText(compare)}`);
  if (trend && trend.points.length >= 2) add(`- Tax rate by year: ${trend.points.map((p) => `${p.year} $${p.rate.toFixed(3)}`).join(', ')}`);
  const s = row.score;
  if (s && s.score != null) {
    add('', '## Watchdog Score');
    add(`${Math.round(Number(s.score))} out of 100${s.verdict ? `: ${mdText(s.verdict)}` : ''}. The Watchdog Score, powered by the ROBUST Framework, rates this property's tax position. Higher means a stronger position for the owner. Evidence coverage ${Math.round(Number(s.evidence_coverage || 0))}%, ${mdText(s.confidence || 'low')} confidence. Scale: 80 and up strong, 65 to 79 favorable, 50 to 64 typical or mixed, 35 to 49 pressured, under 35 highly pressured. Each ROBUST part is scored 0 to 100 and weighted; parts without data are left out instead of guessed.`, '');
    const parts = s.components || {};
    DIMENSIONS.forEach((d) => {
      const value = componentScore(parts[d.key]);
      add(`- ${d.letter}, ${d.name}: ${value == null ? 'not enough data' : `${value}/100`} (${ROBUST_NOTES[d.key]})`);
    });
  }
  add('', '## Sales');
  fact('This property\'s last sale', row.last_sale_price ? `${money(row.last_sale_price)}${saleDate(row) ? ` on ${saleDate(row)}` : ''}` : 'No recorded sale price');
  const sum = row.sales_summary || {};
  if (Number(sum.count)) fact('Similar sales nearby', `${count(sum.count)}, median price ${money(sum.median)}`);
  const sales = Array.isArray(row.recent_sales) ? row.recent_sales.filter((x) => x && x.price).slice(0, 10) : [];
  if (sales.length) {
    add('', 'Recent nearby sales:');
    sales.forEach((x) => add(`- ${mdText(titleCase(x.address || ''))}: ${money(x.price)}${x.date ? ` (${x.date})` : ''}`));
  }
  add('', '## Links');
  add(`- This property on Watchdog: ${v.url}`);
  add(`- How the Watchdog Score works: ${CANONICAL_ORIGIN}/robust`);
  add(`- Compare NJ towns: ${CANONICAL_ORIGIN}/town-compare`);
  const updated = monthYear(row.source_synced_at);
  if (updated) add('', `Last data refresh: ${updated}.`);
  return lines.join('\n') + '\n';
}

// GET ?top=<pin>: the title and summary cards for the popup, as JSON.
async function sendTop(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const q = req.query || {};
  const pin = String(q.top || '');
  if (!/^\d{4}_[0-9A-Za-z.&_-]{1,70}$/.test(pin)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).end(JSON.stringify({ error: 'Bad property.' }));
  }
  try {
    const row = await fetchProperty(pin);
    if (!row) {
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600');
      return res.status(404).end(JSON.stringify({ error: 'Not found.' }));
    }
    const zip = /^0[78]\d{3}$/.test(String(q.zip || '')) ? String(q.zip) : null;
    const city = cleanCity(q.city);
    const full = { ...row, zip, postal_city: city || null };
    res.setHeader('Cache-Control', PAGE_CACHE);
    return res.status(200).end(JSON.stringify({ pin, html: topSection(full, view(full)), css: STYLE + SHELL_STYLE }));
  } catch (err) {
    console.error('watchdog-property-page top', err && err.message || err);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).end(JSON.stringify({ error: 'Try again later.' }));
  }
}

// GET ?md=<pin>: the property as Markdown, for pasting into an AI assistant.
async function sendMarkdownFor(req, res, row) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Cache-Control', PAGE_CACHE);
  res.setHeader('X-Robots-Tag', 'noindex, follow');
  if (req.method === 'HEAD') return res.end();
  return res.end(renderMarkdown(row, view(row)));
}

async function sendMarkdown(req, res) {
  const q = req.query || {};
  const pin = String(q.md || '');
  if (!/^\d{4}_[0-9A-Za-z.&_-]{1,70}$/.test(pin)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).end('Bad property.');
  }
  try {
    const [row, published] = await Promise.all([
      fetchProperty(pin),
      rpc('get_public_property_page_by_pin', { p_pin: pin }).then(asObject).catch(() => null)
    ]);
    if (!row) {
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600');
      return res.status(404).end('Not found.');
    }
    const zip = /^0[78]\d{3}$/.test(String(q.zip || '')) ? String(q.zip) : null;
    const full = published ? withPublished(row, published) : { ...row, zip, postal_city: cleanCity(q.city) || null };
    return sendMarkdownFor(req, res, full);
  } catch (err) {
    console.error('watchdog-property-page md', err && err.message || err);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).end('Try again later.');
  }
}

async function handler(req, res) {
  if (req.method === 'POST') return publish(req, res);
  if (req.method === 'GET' && req.query && req.query.top) return sendTop(req, res);
  if ((req.method === 'GET' || req.method === 'HEAD') && req.query && req.query.md) return sendMarkdown(req, res);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD, POST');
    return res.status(405).end('Method not allowed');
  }
  const rawPath = String((req.query && req.query.path) || '');
  const wantsMarkdown = /\.md$/i.test(rawPath.split('?')[0]);
  const parsed = parsePath(wantsMarkdown ? rawPath.split('?')[0].replace(/\.md$/i, '') : rawPath);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (!parsed) return sendNotFound(req, res);
  let row;
  let published = null;
  try {
    if (parsed.slug) {
      published = asObject(await rpc('get_public_property_page_slug', { p_town_slug: parsed.town, p_page_slug: parsed.slug }));
      if (!published) return sendNotFound(req, res);
      row = await fetchProperty(published.pams_pin);
    } else {
      [row, published] = await Promise.all([
        fetchProperty(parsed.pin),
        rpc('get_public_property_page_by_pin', { p_pin: parsed.pin }).then(asObject).catch((err) => {
          console.warn('watchdog-property-page published lookup', err && err.message || err);
          return null;
        })
      ]);
    }
  } catch (err) {
    console.error('watchdog-property-page', err && err.message || err);
    res.statusCode = 503;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Retry-After', '60');
    return res.end(req.method === 'HEAD' ? undefined : notFoundPage());
  }
  if (!row) return sendNotFound(req, res);
  const canonical = published ? published.path : propertyPath(row);
  if (wantsMarkdown) {
    if (parsed.path !== canonical) {
      res.statusCode = 308;
      res.setHeader('Location', `${canonical}.md`);
      res.setHeader('Cache-Control', PAGE_CACHE);
      return res.end();
    }
    return sendMarkdownFor(req, res, withPublished(row, published));
  }
  if (parsed.path !== canonical) {
    res.statusCode = 308;
    res.setHeader('Location', canonical);
    res.setHeader('Cache-Control', PAGE_CACHE);
    return res.end();
  }
  const indexable = !!published || INDEXABLE_COUNTIES.has(String(row.county || '').toUpperCase());
  res.statusCode = 200;
  res.setHeader('Cache-Control', PAGE_CACHE);
  res.setHeader('Link', `<${CANONICAL_ORIGIN}${canonical}>; rel="canonical"`);
  if (!indexable) res.setHeader('X-Robots-Tag', 'noindex, follow');
  if (req.method === 'HEAD') return res.end();
  return res.end(await renderProperty(withPublished(row, published), { indexable, published: !!published }));
}

module.exports = handler;
module.exports.parsePath = parsePath;
module.exports.propertyPath = propertyPath;
module.exports.renderPage = renderPage;
module.exports.renderShell = renderShell;
module.exports.pageSlug = pageSlug;
module.exports.spelledAddress = spelledAddress;
module.exports.publishAllowed = publishAllowed;
module.exports.withPublished = withPublished;
module.exports.topSection = topSection;
module.exports.renderMarkdown = renderMarkdown;
module.exports.townName = townName;
module.exports.slugify = slugify;
module.exports.INDEXABLE_COUNTIES = INDEXABLE_COUNTIES;
module.exports.rateTrend = rateTrend;
module.exports.fetchProperty = fetchProperty;
module.exports.messagePage = messagePage;
module.exports.parts = { HEAD_ASSETS, STYLE, FOOT_SCRIPTS, chrome, esc };
module.exports.helpers = { billYear, taxStats, view, money, count, saleDate, monthYear, titleCase, componentScore, townCompareText, rateTrend, latestRatio, faqItems, reportFileName, propertyPath, DIMENSIONS, CANONICAL_ORIGIN, REPORT_CONSENT };
