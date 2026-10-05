'use strict';

// Annual property tax checkup for a homeowner: /checkup?pin=<pams_pin>&agent=<slug>
// Agents send this link to past clients (from their own email or CRM) each
// year when the new assessments come out. It answers one question: does the
// assessment hold up, and by when would you have to appeal? With ?agent= the
// agent's contact card is shown, only while their Agent plan is active.

const page = require('./watchdog-property-page');
const tc = require('./watchdog-true-cost');

const { esc } = page.parts;
const H = page.helpers;
const PIN = /^\d{4}_[0-9A-Za-z.&_-]{1,70}$/;

// Appeal filing deadline: April 1 of the tax year, or May 1 in a year the town
// has a town-wide revaluation or reassessment (we only know that for 2026).
function nextDeadline(now, revalued2026) {
  const d = now instanceof Date ? now : new Date();
  let year = d.getUTCFullYear();
  const may = revalued2026 && year === 2026;
  const cutoff = Date.UTC(year, may ? 4 : 3, 1, 23, 59, 59);
  if (d.getTime() > cutoff) year += 1;
  if (year === 2026 && revalued2026) return { date: `May 1, ${year}`, note: '' };
  return { date: `April 1, ${year}`, note: 'May 1 if your town revalues that year' };
}

// assessed: current assessment. ratio/upper: town ratio and Chapter 123 upper
// limit (percent). Returns the lowest market value at which the assessment is
// still inside the legal range, and the market value the town ratio implies.
function holdsUp(assessed, ratio, upper) {
  if (!(assessed > 0) || !(ratio > 0) || !(upper > 0)) return null;
  const limit = Math.min(upper, 100);
  return { floor: assessed / (limit / 100), implied: assessed / (ratio / 100), limit, ratio };
}

const CK_STYLE = `
.ck-floor{display:grid;gap:6px;margin:6px 0 12px}
.ck-floor b{font:700 48px/1 "Libre Franklin",system-ui,sans-serif;letter-spacing:-.04em;padding-bottom:6px;border-bottom:2px solid var(--b-gold);justify-self:start}
.ck-floor span{font-size:15px;color:rgba(255,255,255,.8)}
.ck-steps{list-style:none;margin:0;padding:0;display:grid;gap:14px;counter-reset:ck}
.ck-steps li{display:grid;grid-template-columns:32px minmax(0,1fr);gap:12px;counter-increment:ck}
.ck-steps li::before{content:counter(ck);width:32px;height:32px;border-radius:50%;background:var(--b-navy);color:#fff;display:grid;place-content:center;font-weight:700;font-size:14px}
.ck-steps b{display:block;font-size:15px;margin-bottom:2px}
.ck-steps p{margin:0!important;font-size:14px}
@media (max-width:640px){.ck-floor b{font-size:40px}}
`;

function renderCheckup(row, agent, now) {
  const v = H.view(row);
  const f = tc.townFacts(row, v);
  const tax = Number(row.last_year_tax) || 0;
  const assessed = Number(row.assessed_value) || 0;
  const hu = holdsUp(assessed, f.ratio, f.upper);
  const deadline = nextDeadline(now, f.revalued2026);
  const compare = H.townCompareText(row, v);
  const first = agent ? String(agent.licensed_name || agent.display_name || '').split(/\s+/)[0] : '';
  const estimator = `/appeal-savings-estimator/?${new URLSearchParams(Object.entries({ assessed: assessed || '', ratio: f.ratio || '', rate: f.rate || '' }).filter(([, x]) => x !== '')).toString()}`;
  const trueCost = `/true-cost?pin=${encodeURIComponent(row.pams_pin)}${agent ? `&agent=${encodeURIComponent(agent.slug)}` : ''}`;
  const floorCard = hu
    ? `<section class="wdp-card wdp-card--score" aria-labelledby="ck-floor-h">
      <div class="wdp-card-head"><h2 id="ck-floor-h">Does the assessment hold up?</h2></div>
      <div class="ck-floor"><b>${esc(H.money(hu.floor))}</b><span>Your assessment is fair as long as your home would sell for at least this much.</span></div>
      <p class="wdp-card-note">If it would sell for less, the assessment is above ${esc(v.town)}'s legal limit (${hu.limit.toFixed(0)}% of market value) and you may have an appeal. At the town's average ratio of ${hu.ratio.toFixed(0)}%, your assessment of ${esc(H.money(assessed))} matches a home worth about ${esc(H.money(hu.implied))}.</p>
    </section>`
    : `<section class="wdp-card wdp-card--score" aria-labelledby="ck-floor-h">
      <div class="wdp-card-head"><h2 id="ck-floor-h">Does the assessment hold up?</h2></div>
      <p class="wdp-card-note">We don't have ${esc(v.town)}'s published ratio yet, so we can't run the check. The steps below still apply.</p>
    </section>`;
  const body = `<main class="wdp-app">
  <div class="tc-top">
    <div class="wdp-head" style="margin:0">
      <div><h1>Property tax checkup</h1><p>${esc(v.address)}, ${esc(v.town)} · ${esc(v.county)} County</p></div>
    </div>
    ${tc.agentCard(agent)}
  </div>
  <div class="wdp-cards">
    ${floorCard}
    <section class="wdp-card wdp-card--tax" aria-labelledby="ck-tax-h">
      <div class="wdp-card-head"><h2 id="ck-tax-h">Your tax</h2><a class="wdp-card-link" href="${esc(v.path)}">Full property page</a></div>
      <div class="wdp-stats">
        <div class="wdp-stat is-lead"><b>${esc(H.money(tax) || 'n/a')}</b><span>${esc(H.taxStats(row, H.money).label)}</span></div>
        ${H.taxStats(row, H.money).extra}
        <div class="wdp-stat"><b>${esc(H.money(assessed) || 'n/a')}</b><span>Assessed value</span></div>
        ${f.rate ? `<div class="wdp-stat"><b>$${f.rate.toFixed(3)}</b><span>${f.rateYear} rate per $100</span></div>` : ''}
      </div>
      ${compare ? `<p class="wdp-card-note">${esc(compare)}</p>` : ''}
    </section>
  </div>
  <div class="wdp-grid">
    <div class="wdp-col">
      <section class="wdp-panel" aria-labelledby="ck-do-h">
        <h2 id="ck-do-h">What to do</h2>
        <ol class="ck-steps">
          <li><div><b>Check what your home would sell for today</b><p>${agent ? `${esc(first || 'Your agent')} can give you a free opinion of value from recent sales near you.` : 'Recent sales of similar homes nearby are the best guide.'} Compare it with the number above.</p></div></li>
          <li><div><b>If it's below that number, consider an appeal</b><p>You have to show what the home was worth. <a href="${esc(estimator)}">Estimate the savings</a> first to see if it's worth the effort.</p></div></li>
          <li><div><b>File by ${esc(deadline.date)}</b><p>Appeals go to the ${esc(v.county)} County Board of Taxation. ${deadline.note ? `The deadline is April 1, or 45 days after the assessment notices were mailed if that's later (${esc(deadline.note)}).` : `${esc(v.town)} revalued this year, so the deadline is May 1, or 45 days after the assessment notices were mailed if that's later.`}${assessed > 1000000 ? ' Because this home is assessed at more than $1 million, you can also file directly with the Tax Court.' : ''}</p></div></li>
        </ol>
      </section>
    </div>
    <div class="wdp-col">
      <section class="wdp-panel" aria-labelledby="ck-more-h">
        <h2 id="ck-more-h">Good to know</h2>
        <ul class="tc-list">${tc.changeItems(row, v, f).filter(([icon]) => icon === 'fa-rotate' || icon === 'fa-chart-line' || icon === 'fa-hammer').map(([icon, h, p]) => `<li><span class="fas ${icon}" aria-hidden="true"></span><div><b>${esc(h)}</b><p>${esc(p)}</p></div></li>`).join('')}</ul>
        <p class="wdp-fine"><a href="${esc(trueCost)}">See the full monthly cost of owning this home</a></p>
      </section>
    </div>
  </div>
  <p class="wdp-source">A screening check, not legal or appraisal advice. Tax from the New Jersey MOD-IV tax list; ratios and limits from the ${f.ratio ? '2026 ' : ''}Chapter 123 certification; tax rates from the NJ Division of Taxation. <a href="https://www.nj.gov/treasury/taxation/lpt/lpt-appeal.shtml" rel="noopener">State appeal guide</a> · <a href="/data-methodology">How we get our numbers</a></p>
</main>
<style>${CK_STYLE}</style>`;
  return tc.shell(`Property tax checkup: ${v.address}, ${v.town} | Watchdog`, `Does the assessment on ${v.address}, ${v.town}, NJ hold up? The value it needs, the appeal deadline and what to do.`, body, 'noindex')
    .replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${H.CANONICAL_ORIGIN}/checkup">`);
}

async function handler(req, res) {
  const query = req.query || {};
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.statusCode = 405;
    return res.end('Method not allowed');
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, follow');
  const pin = String(query.pin || '').trim();
  const missing = (status, heading, text) => {
    res.statusCode = status;
    res.setHeader('Cache-Control', status === 503 ? 'no-store' : 'public, max-age=0, s-maxage=3600');
    return res.end(req.method === 'HEAD' ? undefined : page.messagePage('Property tax checkup', heading, text, '<a class="wdp-pill is-dark" href="/">Look up a home</a>'));
  };
  if (!PIN.test(pin)) return missing(404, 'We couldn\'t find that home', 'The link may be incomplete.');
  let row;
  try {
    row = await page.fetchProperty(pin);
  } catch (err) {
    console.error('checkup property', err && err.message || err);
    return missing(503, 'Please try again in a minute', 'Property data is unavailable right now.');
  }
  if (!row) return missing(404, 'We couldn\'t find that home', 'It has no record on the state tax list.');
  const agent = await tc.fetchAgent(String(query.agent || '').trim().toLowerCase());
  res.statusCode = 200;
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600');
  return res.end(req.method === 'HEAD' ? undefined : renderCheckup(row, agent, new Date()));
}

module.exports = handler;
module.exports.nextDeadline = nextDeadline;
module.exports.holdsUp = holdsUp;
module.exports.renderCheckup = renderCheckup;
