// /property-tax, /property-tax/<county> and /property-tax/<county>/<town> on www.watchdogindex.com.
// middleware.js rewrites those clean URLs here with ?county=&town=. Town data is api/_tax-town.js;
// the page chrome and base styles are the public property page's (api/watchdog-property-page.js).
const fs = require('fs');
const path = require('path');
const T = require('./_tax-town');
const page = require('./watchdog-property-page');

const { HEAD_ASSETS, STYLE, FOOT_SCRIPTS, chrome, esc } = page.parts;
const ORIGIN = 'https://www.watchdogindex.com';
const SHARE_IMAGE = `${ORIGIN}/watchdog-social-share-20260913-v3.jpg`;
const ASSET_V = '20261005a';
const SLUG = /^[a-z0-9-]{1,80}$/;

// John's story comment, copied from the /co page so it stays word for word.
let story = null;
function storyComment() {
  if (story !== null) return story;
  try {
    const m = fs.readFileSync(path.join(process.cwd(), 'co', 'index.html'), 'utf8').match(/<!--\s*\n\s*\n\s*Hi There[\s\S]*?-->/);
    story = m ? m[0] : '';
  } catch (_) { story = ''; }
  return story;
}

// ---------- formatting ----------
function money(n) { return '$' + Math.round(Number(n) || 0).toLocaleString('en-US'); }
function count(n) { return Math.round(Number(n) || 0).toLocaleString('en-US'); }
function rate(n) { return Number(n).toFixed(3); }
function pct(n, digits) { return Number(n).toFixed(digits == null ? 2 : digits) + '%'; }
function change(now, then) {
  if (!(now > 0) || !(then > 0)) return null;
  return (now / then - 1) * 100;
}
function signed(n) { return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(1) + '%'; }
function countyLabel(name) { return `${name} County`; }

// Next ordinary appeal deadline. Baselines from property/appeal-deadline-rules.json:
// April 1 (May 1 after a town-wide revaluation), January 15 in the alternate-calendar counties.
function nextDeadline(county, now) {
  const d = now || new Date();
  const y = d.getUTCFullYear();
  const passed = county.alternateCalendar
    ? d.getUTCMonth() > 0 || d.getUTCDate() > 15
    : d.getUTCMonth() > 4 || (d.getUTCMonth() === 4 && d.getUTCDate() > 1);
  const year = passed ? y + 1 : y;
  return county.alternateCalendar
    ? { year, text: `January 15, ${year}`, reval: '' }
    : { year, text: `April 1, ${year}`, reval: `May 1, ${year}` };
}

function shareUrl(p, medium) {
  const q = new URLSearchParams({ utm_source: 'share', utm_medium: medium, utm_campaign: 'tax_town' });
  return `${ORIGIN}${p}?${q}`;
}

// ---------- page shell ----------
function shell({ title, description, canonical, body, jsonld, data }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
<link rel="canonical" href="${ORIGIN}${canonical}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Watchdog">
<meta property="og:title" content="${esc(title.replace(/ \| Watchdog$/, ''))}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${ORIGIN}${canonical}">
<meta property="og:image" content="${SHARE_IMAGE}">
<meta name="twitter:card" content="summary_large_image">
${storyComment()}
${HEAD_ASSETS}
<link rel="stylesheet" href="/property/css/town-tax.css?v=${ASSET_V}">
<style>${STYLE}</style>
${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`).join('\n')}
</head>
<body class="nav-solid wdp">
${chrome()}
${body}
<div id="main-footer"></div>
${data ? `<script id="tt-data" type="application/json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>` : ''}
${FOOT_SCRIPTS}
<script src="/property/js/watchdog-consent.js" defer></script>
<script src="/property/js/product-analytics.js" defer></script>
<script src="/property/js/ai-referral-analytics.js" defer></script>
<script src="/property/js/town-tax.js?v=${ASSET_V}" defer></script>
</body>
</html>`;
}

function crumbs(items) {
  return '<nav class="wdp-crumbs" aria-label="Breadcrumb">' + items.map(([label, href]) => href ? `<a href="${esc(href)}">${esc(label)}</a>` : `<span aria-current="page">${esc(label)}</span>`).join(' › ') + '</nav>';
}
function breadcrumbLd(items) {
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map(([name, href], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${ORIGIN}${href}` })) };
}

function sharePills(p, text) {
  return `<div class="wdp-pills tt-share" data-share-row>
      <button class="wdp-pill" type="button" data-share-native hidden><i class="fas fa-share-nodes" aria-hidden="true"></i>Share</button>
      <button class="wdp-pill" type="button" data-share="copy" data-url="${esc(shareUrl(p, 'copy'))}"><i class="fas fa-link" aria-hidden="true"></i>Copy link</button>
      <a class="wdp-pill" data-share="text" href="sms:?&amp;body=${esc(encodeURIComponent(`${text} ${shareUrl(p, 'text')}`))}"><i class="fas fa-comment" aria-hidden="true"></i>Text</a>
      <a class="wdp-pill tt-icon" data-share="facebook" href="https://www.facebook.com/sharer/sharer.php?u=${esc(encodeURIComponent(shareUrl(p, 'facebook')))}" target="_blank" rel="noopener" aria-label="Share on Facebook"><i class="fab fa-facebook-f" aria-hidden="true"></i></a>
      <a class="wdp-pill tt-icon" data-share="linkedin" href="https://www.linkedin.com/sharing/share-offsite/?url=${esc(encodeURIComponent(shareUrl(p, 'linkedin')))}" target="_blank" rel="noopener" aria-label="Share on LinkedIn"><i class="fab fa-linkedin-in" aria-hidden="true"></i></a>
    </div>
    <p class="tt-toast" role="status" aria-live="polite"></p>`;
}

// ---------- town page ----------
function rateBars(series) {
  if (!series || series.length < 2) return '';
  const max = Math.max(...series.map((x) => x.rate)), min = Math.min(...series.map((x) => x.rate));
  const h = (v) => max > min ? Math.round(14 + (v - min) / (max - min) * 42) : 40;
  return `<div class="wdp-rates-wrap"><span class="wdp-mini-label">General tax rate by year</span>
        <ul class="wdp-rates" aria-label="General tax rate by year">${series.map((x) => `<li><span class="wdp-rbar" style="height:${h(x.rate)}px" title="${x.year}: ${rate(x.rate)}"></span><small>${String(x.year).slice(2)}</small></li>`).join('')}</ul></div>`;
}

function faqItems(t, f, county, deadline) {
  const items = [];
  items.push([`What is the average property tax bill in ${t.name}?`,
    `The typical (median) ${t.name} home paid ${money(f.bill.median)} in property taxes in ${f.bill.year}, based on ${count(f.bill.homes)} homes in New Jersey's assessment records. Half of homes paid more and half paid less.`]);
  if (f.rate) {
    const one = change(f.rate.value, f.rate.prior);
    items.push([`What is the property tax rate in ${t.name}?`,
      `The ${f.rate.year} general tax rate is ${rate(f.rate.value)} per $100 of assessed value${one == null ? '' : `, ${one >= 0 ? 'up' : 'down'} ${Math.abs(one).toFixed(1)}% from ${f.rate.year - 1}`}. Your bill is your assessment divided by 100, times the rate. Compare towns by bills, not rates, because towns assess at different levels.`]);
  }
  if (f.reval2026) {
    items.push([`Did ${t.name} have a revaluation?`,
      `Yes. ${t.name} is on the state's list of 2026 town-wide revaluations and reassessments, so assessments were reset to close to market value for 2026. In a revaluation year the Chapter 123 ratio test does not apply; an appeal has to show the assessment is higher than what the home was worth.`]);
  } else if (f.ratio) {
    items.push([`Is ${t.name} assessed at full market value?`,
      `No. For 2026 the state puts ${t.name}'s average assessment at ${pct(f.ratio.average)} of market value. Divide your assessment by ${(f.ratio.average / 100).toFixed(4)} to see the market value the town is assuming for your home.`]);
  }
  items.push([`When is the property tax appeal deadline in ${t.name}?`,
    county.alternateCalendar
      ? `${county.name} County uses the state's alternate calendar, so appeals are due ${deadline.text}, or 45 days after assessment notices are mailed if that is later. The petition has to be received by the ${county.name} County Board of Taxation, not just postmarked.`
      : `The next deadline is ${deadline.text}, or 45 days after assessment notices are mailed if that is later. If ${t.name} does a town-wide revaluation for ${deadline.year}, it moves to ${deadline.reval}. The petition has to be received by the ${county.name} County Board of Taxation, not just postmarked.`]);
  items.push([`How can ${t.name} homeowners lower their property taxes?`,
    `Check that your assessment isn't too high (the checker on this page does the math), and apply for New Jersey's relief programs: ANCHOR for homeowners and renters, Stay NJ for seniors 65 and older, and the Senior Freeze. Watchdog's free benefit estimator shows which ones fit.`]);
  return items;
}

function checker(t, f) {
  const r = f.ratio;
  const attrs = f.reval2026
    ? 'data-mode="reval"'
    : `data-mode="ratio" data-average="${r.average}" data-lower="${r.lower}" data-upper="${r.upper}"`;
  const rateAttr = f.rate ? ` data-rate="${f.rate.value}" data-rate-year="${f.rate.year}"` : '';
  const intro = f.reval2026
    ? `${esc(t.name)} had a town-wide revaluation for 2026, so assessments should be close to market value. If yours is higher than what your home was worth, you may have an appeal case.`
    : `New Jersey checks your assessment against the town's average ratio (${pct(r.average)} for 2026). If your assessment is more than ${pct(r.upper)} of your home's value, you may have an appeal case.`;
  return `<section class="wdp-panel tt-check" aria-labelledby="tt-check-h">
      <h2 id="tt-check-h">Is your assessment too high?</h2>
      <p>${intro}</p>
      <form class="wdp-form" id="tt-check-form" ${attrs}${rateAttr} novalidate>
        <label>Your assessment<input name="assessed" inputmode="numeric" autocomplete="off" placeholder="${esc(money(f.bill.assessed))}"></label>
        <label>What your home was worth<input name="value" inputmode="numeric" autocomplete="off" placeholder="What it would have sold for"></label>
        <p class="wdp-wide wdp-fine">Use the value as of October 1, 2025 (the date 2026 assessments are based on). Your assessment is on your tax bill or at the town tax assessor's office.</p>
        <div class="wdp-wide wdp-form-foot"><button class="wdp-pill is-dark" type="submit">Check it</button></div>
      </form>
      <div class="tt-result" id="tt-result" role="status" aria-live="polite"></div>
    </section>`;
}

function townPage(t) {
  const f = T.facts(t.code);
  const county = T.findCounty(t.countySlug);
  const deadline = nextDeadline(county);
  const one = f.rate ? change(f.rate.value, f.rate.prior) : null;
  const five = f.rate ? change(f.rate.value, f.rate.fiveBack) : null;
  const countyPath = `/property-tax/${t.countySlug}`;
  const trail = [['Property taxes', '/property-tax'], [countyLabel(t.county), countyPath], [t.name, t.path]];
  const faq = faqItems(t, f, county, deadline);
  const near = T.nearby(t, 8);

  const assessCard = f.reval2026
    ? `<div class="wdp-card wdp-card--score">
        <div class="wdp-card-head"><h2>Assessments</h2></div>
        <div class="wdp-score-lead"><b>2026</b><span>revaluation</span></div>
        <p class="wdp-score-verdict">Assessments were reset close to market value.</p>
        <p class="wdp-card-note">${esc(t.name)} is on the state's 2026 list of town-wide revaluations and reassessments. The 2026 bill is the first one on the new values.</p>
      </div>`
    : f.ratio ? `<div class="wdp-card wdp-card--score">
        <div class="wdp-card-head"><h2>Assessments</h2></div>
        <div class="wdp-score-lead"><b>${pct(f.ratio.average)}</b><span>of market value</span></div>
        <p class="wdp-score-verdict">The town's average assessment ratio for 2026.</p>
        <p class="wdp-card-note">An assessment from ${pct(f.ratio.lower)} to ${pct(f.ratio.upper)} of a home's value is inside the state's allowed range. Above that, an appeal can bring it down.</p>
      </div>` : '';

  const body = `<main class="wdp-app tt-app">
  ${crumbs(trail)}
  <div class="wdp-head">
    <div>
      <h1>${esc(t.name)} property taxes</h1>
      <p>${esc(countyLabel(t.county))}, New Jersey${f.pop ? ` · population ${count(f.pop)}` : ''}</p>
    </div>
    ${sharePills(t.path, `${t.name} NJ property taxes: typical bill, tax rate and appeal deadline.`)}
  </div>
  <div class="wdp-cards">
    <div class="wdp-card wdp-card--tax">
      <div class="wdp-card-head"><h2>Typical home tax bill</h2></div>
      <div class="wdp-stats">
        <div class="wdp-stat is-lead"><b>${money(f.bill.median)}</b><span>${f.bill.year} median bill</span></div>
        <div class="wdp-stat"><b>${money(f.bill.assessed)}</b><span>Median assessment</span></div>
        ${f.rate ? `<div class="wdp-stat"><b>${rate(f.rate.value)}</b><span>${f.rate.year} rate per $100</span></div>` : ''}
        ${one == null ? '' : `<div class="wdp-stat"><b>${signed(one)}</b><span>Rate vs ${f.rate.year - 1}</span></div>`}
      </div>
      ${f.rate ? rateBars(f.rate.series) : ''}
      <p class="wdp-card-note">Median of ${count(f.bill.homes)} homes (residential lots) in the state's assessment records.${five == null ? '' : ` The tax rate is ${signed(five).replace('+', 'up ').replace('−', 'down ')} since ${f.rate.year - 5}.`}</p>
    </div>
    ${assessCard}
  </div>
  <div class="wdp-grid">
    <div class="wdp-col">
      ${f.ratio || f.reval2026 ? checker(t, f) : ''}
      <section class="wdp-panel" aria-labelledby="tt-deadline-h">
        <h2 id="tt-deadline-h">Appeal deadline</h2>
        <p><strong>${esc(deadline.text)}</strong>${county.alternateCalendar ? '' : ` (${esc(deadline.reval)} if ${esc(t.name)} does a town-wide revaluation for ${deadline.year})`}, or 45 days after assessment notices are mailed if that's later.</p>
        <p>File with the ${esc(county.name)} County Board of Taxation. The petition has to arrive by the deadline; a postmark isn't enough. Homes assessed over $1 million can go straight to the Tax Court.</p>
        <p class="wdp-fine"><a href="/nj-property-tax-calendar">Full New Jersey property tax calendar</a></p>
      </section>
      <section class="wdp-panel wdp-faq" aria-labelledby="tt-faq-h">
        <h2 id="tt-faq-h">Questions</h2>
        ${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}
      </section>
    </div>
    <div class="wdp-col">
      <section class="wdp-panel" aria-labelledby="tt-relief-h">
        <h2 id="tt-relief-h">Property tax relief</h2>
        <ul class="wdp-tools">
          <li><a href="/senior-benefit-estimator"><i class="fas fa-hand-holding-dollar" aria-hidden="true"></i><span><b>ANCHOR</b><small>A yearly benefit for New Jersey homeowners and renters under the income limits.</small></span></a></li>
          <li><a href="/senior-benefit-estimator"><i class="fas fa-house-user" aria-hidden="true"></i><span><b>Stay NJ</b><small>Homeowners 65 and older can get up to half of the bill back, up to a cap.</small></span></a></li>
          <li><a href="/senior-benefit-estimator"><i class="fas fa-snowflake" aria-hidden="true"></i><span><b>Senior Freeze</b><small>Pays back increases for eligible seniors and people with disabilities.</small></span></a></li>
          <li><a href="/benefit-stacking"><i class="fas fa-layer-group" aria-hidden="true"></i><span><b>Stack them</b><small>See how the programs work together for one household.</small></span></a></li>
        </ul>
      </section>
      <section class="wdp-panel" aria-labelledby="tt-move-h">
        <h2 id="tt-move-h">Buying or selling in ${esc(t.name)}?</h2>
        <ul class="wdp-tools">
          <li><a href="/true-cost"><i class="fas fa-calculator" aria-hidden="true"></i><span><b>True cost of a home</b><small>The monthly cost of any address, with its real tax bill.</small></span></a></li>
          ${t.coPath ? `<li><a href="${esc(t.coPath)}"><i class="fas fa-clipboard-check" aria-hidden="true"></i><span><b>${esc(t.name)} CO requirements</b><small>Resale Certificate of Occupancy and smoke/CO alarm rules, fees and timing.</small></span></a></li>` : ''}
          <li><a href="/appeal-savings-estimator"><i class="fas fa-magnifying-glass-dollar" aria-hidden="true"></i><span><b>Appeal savings estimator</b><small>What a lower assessment would save each year.</small></span></a></li>
        </ul>
        <p class="wdp-fine">Real estate agent? Copy this page's link for buyers and sellers in ${esc(t.name)}.</p>
      </section>
      ${near.length ? `<section class="wdp-panel" aria-labelledby="tt-near-h">
        <h2 id="tt-near-h">Nearby towns</h2>
        <ul class="wdp-near">${near.map((x) => `<li><a href="${esc(x.t.path)}">${esc(x.t.name)}<small>${money(x.f.bill.median)} typical bill</small></a></li>`).join('')}</ul>
        <p class="wdp-fine"><a href="${esc(countyPath)}">Every ${esc(countyLabel(t.county))} town</a></p>
      </section>` : ''}
    </div>
  </div>
  <p class="wdp-source">Sources: typical bills and assessments are medians of residential lots in New Jersey's MOD-IV assessment records (${f.bill.year} bills). Tax rates: NJ Division of Taxation, General Tax Rates by County and Municipality. Assessment ratios: NJ Division of Taxation, <a href="https://www.nj.gov/treasury/taxation/pdf/lpt/chap123/2026CH123.pdf" target="_blank" rel="noopener">2026 Chapter 123 ratios</a>. Revaluations: <a href="https://www.nj.gov/treasury/taxation/pdf/lpt/revaluation/2026RevalList.pdf" target="_blank" rel="noopener">2026 approved revaluations and reassessments</a>. This page is general information, not legal or tax advice.</p>
</main>`;

  const title = `${t.name} NJ Property Taxes: Typical Bill, Tax Rate & Appeals | Watchdog`;
  const description = `The typical ${t.name} home paid ${money(f.bill.median)} in property taxes in ${f.bill.year}. See the ${f.rate ? f.rate.year + ' ' : ''}tax rate, how assessments compare to market value, the appeal deadline and relief programs.`;
  const jsonld = [
    breadcrumbLd(trail),
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }
  ];
  return shell({ title, description, canonical: t.path, body, jsonld, data: { kind: 'town', code: t.code, town: t.name, county: t.county, path: t.path } });
}

// ---------- county page ----------
function countyPage(c) {
  const rows = c.towns.filter((t) => t.published).map((t) => ({ t, f: T.facts(t.code) }));
  const bills = rows.map((r) => r.f.bill.median).sort((a, b) => a - b);
  const mid = bills.length ? (bills.length % 2 ? bills[(bills.length - 1) / 2] : (bills[bills.length / 2 - 1] + bills[bills.length / 2]) / 2) : 0;
  const high = rows.slice().sort((a, b) => b.f.bill.median - a.f.bill.median)[0];
  const low = rows.slice().sort((a, b) => a.f.bill.median - b.f.bill.median)[0];
  const revals = rows.filter((r) => r.f.reval2026).length;
  const year = rows[0] ? rows[0].f.bill.year : '';
  const p = `/property-tax/${c.slug}`;
  const trail = [['Property taxes', '/property-tax'], [countyLabel(c.name), p]];
  const deadline = nextDeadline(c);
  const body = `<main class="wdp-app tt-app">
  ${crumbs(trail)}
  <div class="wdp-head">
    <div>
      <h1>${esc(countyLabel(c.name))} property taxes by town</h1>
      <p>Typical home tax bill, tax rate and 2026 revaluations for all ${rows.length} towns.</p>
    </div>
    ${sharePills(p, `${countyLabel(c.name)} NJ property taxes by town.`)}
  </div>
  <section class="wdp-panel">
    <dl class="wdp-facts tt-facts">
      <div><dt>Middle town's typical bill</dt><dd>${money(mid)}</dd></div>
      ${high ? `<div><dt>Highest</dt><dd><a href="${esc(high.t.path)}">${esc(high.t.name)}</a>, ${money(high.f.bill.median)}</dd></div>` : ''}
      ${low ? `<div><dt>Lowest</dt><dd><a href="${esc(low.t.path)}">${esc(low.t.name)}</a>, ${money(low.f.bill.median)}</dd></div>` : ''}
      <div><dt>Next appeal deadline</dt><dd>${esc(deadline.text)}</dd></div>
    </dl>
    <p class="wdp-fine">${revals} of ${rows.length} towns had a town-wide revaluation or reassessment for 2026. Typical bills are ${year} medians for homes.</p>
  </section>
  <section class="wdp-panel tt-table-panel">
    <div class="tt-filter"><label for="tt-q">Find a town</label><input id="tt-q" type="search" placeholder="Type a town name" autocomplete="off" data-filter></div>
    <div class="wdp-table-wrap">
      <table class="wdp-table tt-table" data-sortable>
        <thead><tr><th scope="col"><button type="button" data-sort="name">Town</button></th><th scope="col" class="wdp-num"><button type="button" data-sort="bill">Typical bill</button></th><th scope="col" class="wdp-num"><button type="button" data-sort="rate">Tax rate</button></th><th scope="col">2026 revaluation</th></tr></thead>
        <tbody>${rows.map(({ t, f }) => `<tr data-name="${esc(t.name.toLowerCase())}" data-bill="${f.bill.median}" data-rate="${f.rate ? f.rate.value : ''}"><td><a href="${esc(t.path)}">${esc(t.name)}</a></td><td class="wdp-num">${money(f.bill.median)}</td><td class="wdp-num">${f.rate ? rate(f.rate.value) : '—'}</td><td>${f.reval2026 ? 'Yes' : ''}</td></tr>`).join('')}</tbody>
      </table>
    </div>
    <p class="wdp-fine">Tax rate is the ${rows[0] && rows[0].f.rate ? rows[0].f.rate.year : 'latest'} general rate per $100 of assessed value. Rates aren't comparable town to town because towns assess at different levels; the bill is the better comparison.</p>
  </section>
  <p class="wdp-source">Sources: NJ MOD-IV assessment records (median residential bills and assessments), NJ Division of Taxation general tax rates and 2026 approved revaluations and reassessments. General information, not legal or tax advice.</p>
</main>`;
  const title = `${countyLabel(c.name)} NJ Property Taxes by Town | Watchdog`;
  const description = `Typical home property tax bill and tax rate for every ${countyLabel(c.name)} town. The middle town's typical bill is ${money(mid)}${high ? `; ${high.t.name} is highest at ${money(high.f.bill.median)}` : ''}.`;
  const list = { '@context': 'https://schema.org', '@type': 'ItemList', name: `${countyLabel(c.name)} property taxes by town`, itemListElement: rows.map(({ t }, i) => ({ '@type': 'ListItem', position: i + 1, url: `${ORIGIN}${t.path}`, name: t.name })) };
  return shell({ title, description, canonical: p, body, jsonld: [breadcrumbLd(trail), list], data: { kind: 'county', county: c.name, path: p } });
}

// ---------- index ----------
function indexPage() {
  const counties = T.publishedCounties();
  const trail = [['Property taxes', '/property-tax']];
  const body = `<main class="wdp-app tt-app">
  ${crumbs(trail)}
  <div class="wdp-head">
    <div>
      <h1>New Jersey property taxes by town</h1>
      <p>What homes really pay, the tax rate, how assessments compare to market value and when to appeal.</p>
    </div>
  </div>
  <div class="tt-counties">
    ${counties.map((c) => {
      const n = c.towns.filter((t) => t.published).length;
      return `<a class="wdp-panel tt-county" href="/property-tax/${esc(c.slug)}"><b>${esc(countyLabel(c.name))}</b><small>${n} towns</small></a>`;
    }).join('')}
  </div>
  <section class="wdp-panel">
    <h2>More ways to check your taxes</h2>
    <ul class="wdp-tools">
      <li><a href="/statistics/nj-property-tax-rates-by-town-2026"><i class="fas fa-table" aria-hidden="true"></i><span><b>Tax rates for every NJ town</b><small>Search and sort all 564 municipalities.</small></span></a></li>
      <li><a href="/property-tax-estimator"><i class="fas fa-calculator" aria-hidden="true"></i><span><b>Property tax estimator</b><small>Estimate a bill from an assessment.</small></span></a></li>
      <li><a href="/senior-benefit-estimator"><i class="fas fa-hand-holding-dollar" aria-hidden="true"></i><span><b>Relief programs</b><small>ANCHOR, Stay NJ and the Senior Freeze.</small></span></a></li>
    </ul>
  </section>
</main>`;
  return shell({
    title: 'New Jersey Property Taxes by Town | Watchdog',
    description: 'Typical home property tax bills, tax rates, assessment ratios and appeal deadlines for New Jersey towns.',
    canonical: '/property-tax', body, jsonld: [breadcrumbLd(trail)], data: { kind: 'index', path: '/property-tax' }
  });
}

function notFound() {
  const body = `<main class="wdp-app tt-app"><div class="wdp-head"><div><h1>We couldn't find that town</h1><p><a href="/property-tax">See New Jersey property taxes by town</a>.</p></div></div></main>`;
  return shell({ title: 'Town not found | Watchdog', description: 'New Jersey property taxes by town.', canonical: '/property-tax', body, jsonld: [], data: null })
    .replace('<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">', '<meta name="robots" content="noindex, follow">');
}

function send(res, status, html, cache) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', cache || 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
  return res.end(html);
}

function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return send(res, 405, 'Method not allowed', 'no-store');
  }
  const q = req.query || {};
  const county = String(q.county || '').toLowerCase();
  const town = String(q.town || '').toLowerCase();
  const missing = () => send(res, 404, notFound(), 'public, max-age=60, s-maxage=300');
  if (!county) return T.publishedCounties().length ? send(res, 200, indexPage()) : missing();
  if (!SLUG.test(county) || (town && !SLUG.test(town))) return missing();
  if (!town) {
    const c = T.findCounty(county);
    return c ? send(res, 200, countyPage(c)) : missing();
  }
  const t = T.findTown(county, town);
  return t ? send(res, 200, townPage(t)) : missing();
}

module.exports = handler;
module.exports.townPage = townPage;
module.exports.countyPage = countyPage;
module.exports.indexPage = indexPage;
module.exports.nextDeadline = nextDeadline;
