'use strict';

// Buyer "true cost" card: /true-cost?pin=<pams_pin>&price=&down=&rate=&term=&ins=&hoa=&agent=<slug>
// One shareable page an agent sends with a showing: the real tax bill, what
// could change it after the sale, and the full monthly cost. With ?agent=<slug>
// the agent's contact card is shown (only while their Agent plan is active,
// enforced by get_public_agent_portal_profile). /true-cost with no pin is the
// address picker; ?q= returns address matches as JSON.

const fs = require('fs');
const path = require('path');
const page = require('./watchdog-property-page');
const { townLinks } = require('./_tax-town');

const { HEAD_ASSETS, STYLE, FOOT_SCRIPTS, chrome, esc } = page.parts;
const H = page.helpers;
const PIN = /^\d{4}_[0-9A-Za-z.&_-]{1,70}$/;
const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
const DEFAULTS = { down: 20, rate: 6.5, term: 30, ins: 0, hoa: 0 };

let refs = null;
function loadRefs() {
  if (refs) return refs;
  refs = { ratios: {}, revals: {} };
  try { refs.ratios = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'chapter123-ratios-2026.json'), 'utf8')).districts || {}; } catch (err) { console.warn('true-cost ratios', err && err.message); }
  try { refs.revals = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'property/revaluation-reassessment-2026.json'), 'utf8')).districts || {}; } catch (err) { console.warn('true-cost revals', err && err.message); }
  return refs;
}

function num(value, min, max, fallback) {
  const n = Number(String(value == null ? '' : value).replace(/[^0-9.]/g, ''));
  return value === undefined || value === '' || !Number.isFinite(n) ? fallback : Math.min(max, Math.max(min, n));
}

function readInputs(query) {
  const q = query || {};
  const term = Number(q.term);
  return {
    price: num(q.price, 0, 50000000, 0),
    down: num(q.down, 0, 100, DEFAULTS.down),
    rate: num(q.rate, 0, 20, DEFAULTS.rate),
    term: [10, 15, 20, 25, 30].includes(term) ? term : DEFAULTS.term,
    ins: num(q.ins, 0, 100000, DEFAULTS.ins),
    hoa: num(q.hoa, 0, 20000, DEFAULTS.hoa)
  };
}

// The three functions below also run in the browser (serialized into the page
// script) so the numbers update as the buyer edits them. Keep them
// self-contained.
function monthlyCost(i) {
  var loan = Math.max(0, i.price * (1 - i.down / 100));
  var r = i.rate / 100 / 12, n = i.term * 12;
  var pi = loan > 0 ? (r > 0 ? loan * r / (1 - Math.pow(1 + r, -n)) : loan / n) : 0;
  var tax = (i.tax || 0) / 12, ins = (i.ins || 0) / 12, hoa = i.hoa || 0;
  return { loan: loan, cash: i.price - loan, pi: pi, tax: tax, ins: ins, hoa: hoa, total: pi + tax + ins + hoa };
}

// ratio/upper: the town's 2026 average assessment ratio and Chapter 123 upper
// limit (percent). rate: latest published general tax rate per $100.
function priceCheck(p) {
  if (!(p.price > 0)) return null;
  var out = { price: p.price };
  if (p.ratio > 0 && p.rate > 0) {
    out.typical = p.price * (p.ratio / 100) * (p.rate / 100);
    if (p.tax > 0) out.gap = p.tax - out.typical;
  }
  if (p.assessed > 0) out.assessedPct = p.assessed / p.price * 100;
  if (out.assessedPct != null && p.upper > 0) {
    out.limit = Math.min(p.upper, 100);
    out.overLimit = out.assessedPct > out.limit;
  }
  return out;
}

function verdictText(c, town) {
  function m(v) { return '$' + Math.round(v).toLocaleString('en-US'); }
  if (!c) return { tone: 'none', title: 'Add the price', body: 'Enter the list price or your offer to see the monthly cost and how this tax bill compares with homes that sell for that much.' };
  if (c.overLimit) {
    return { tone: 'good', title: 'Assessed high for this price',
      body: 'At ' + m(c.price) + ', the assessment is ' + c.assessedPct.toFixed(0) + '% of the price. The legal upper limit in ' + town + ' is ' + c.limit.toFixed(0) + '%. After you buy, you may be able to appeal and lower the bill. The filing deadline is April 1 each year (May 1 in a year the town revalues).' };
  }
  if (c.typical > 0 && c.gap != null) {
    var share = c.gap / c.typical;
    if (share < -0.15) {
      return { tone: 'warn', title: 'Low tax for this price',
        body: 'Homes that sell for about ' + m(c.price) + ' in ' + town + ' usually carry a bill near ' + m(c.typical) + ' a year. This one is ' + m(-c.gap) + ' lower. The sale itself will not raise it, but a town-wide revaluation resets every assessment, and this bill could move toward that level when one happens. Plan for it.' };
    }
    if (share > 0.15) {
      return { tone: 'note', title: 'On the high side for this price',
        body: 'This bill is about ' + m(c.gap) + ' a year more than homes that sell for about ' + m(c.price) + ' in ' + town + ' usually pay. It is still inside the town\'s legal range, so an appeal is less certain, but it is worth a second look after you buy.' };
    }
    return { tone: 'ok', title: 'In line for this price',
      body: 'Homes that sell for about ' + m(c.price) + ' in ' + town + ' usually carry a bill near ' + m(c.typical) + ' a year. This one is close to that.' };
  }
  return { tone: 'none', title: 'Comparison not available', body: 'We don\'t have this town\'s published ratio or tax rate yet, so we can\'t compare the bill with the price.' };
}

function townFacts(row, v) {
  const r = loadRefs();
  const district = String(row.pams_pin || '').slice(0, 4);
  const ch = r.ratios[district] || null;
  const trend = H.rateTrend(row);
  return {
    district,
    ratio: ch ? ch[0] : null,
    upper: ch ? ch[2] : null,
    rate: trend ? trend.latest.rate : null,
    rateYear: trend ? trend.latest.year : null,
    trend,
    revalued2026: Boolean(r.revals[district])
  };
}

function rateChange(trend) {
  if (!trend || trend.points.length < 3) return null;
  const pts = trend.points.slice(-6);
  const a = pts[0], b = pts[pts.length - 1];
  const years = b.year - a.year;
  if (!(years > 0 && a.rate > 0)) return null;
  return { from: a, to: b, perYear: (Math.pow(b.rate / a.rate, 1 / years) - 1) * 100 };
}

function changeItems(row, v, f) {
  const items = [];
  items.push(['fa-scale-balanced', 'Buying it does not reset the tax', 'In New Jersey a town can\'t raise one home\'s assessment just because it sold. The bill stays tied to the current assessment until the whole town is revalued.']);
  if (f.revalued2026) items.push(['fa-rotate', `${v.town} just revalued`, `${v.town} reset its assessments for 2026 in a town-wide revaluation or reassessment, so the numbers here are recent.`]);
  else if (f.ratio) {
    const dated = f.ratio < 85;
    items.push(['fa-rotate', dated ? 'Assessments here are dated' : 'Assessments here are close to market', `Assessments in ${v.town} sit at about ${f.ratio.toFixed(0)}% of market value (2026 state ratio).${dated ? ' A town-wide revaluation resets them. When that happens, bills shift toward what each home is actually worth.' : ''}`]);
  }
  const rc = rateChange(f.trend);
  if (rc) items.push(['fa-chart-line', 'The tax rate trend', `${v.town}'s general tax rate went from $${rc.from.rate.toFixed(3)} in ${rc.from.year} to $${rc.to.rate.toFixed(3)} per $100 in ${rc.to.year}, about ${rc.perYear >= 0 ? '+' : ''}${rc.perYear.toFixed(1)}% a year.`]);
  items.push(['fa-hammer', 'Renovations add to it', 'An addition, a finished basement or other work that needs a permit can bring an "added assessment" and a higher bill, usually the year after the work is done.']);
  items.push(['fa-id-card', 'Some breaks don\'t transfer', 'If the seller gets a senior, veteran or disability deduction or exemption, it ends at the sale. Ask for the current bill so you see the full amount.']);
  return items;
}

async function backend(pathname, body) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('backend unavailable');
  const r = await fetch(`${url}/rest/v1/rpc/${pathname}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(6000)
  });
  if (!r.ok) throw new Error(`${pathname} http ${r.status}`);
  return r.json();
}

async function fetchAgent(slug) {
  if (!SLUG.test(slug || '')) return null;
  try {
    const p = await backend('get_public_agent_portal_profile', { p_slug: slug });
    return p && typeof p === 'object' && p.slug ? p : null;
  } catch (err) {
    console.warn('true-cost agent', err && err.message || err);
    return null;
  }
}

function safeUrl(value) {
  const s = String(value || '').trim();
  return /^https:\/\/[^\s"'<>]+$/i.test(s) ? s : '';
}

function agentCard(a) {
  if (!a) return '';
  const name = a.licensed_name || a.display_name || '';
  const photo = safeUrl(a.photo_url);
  const phone = String(a.business_phone || '').replace(/[^0-9+]/g, '');
  const lines = [a.brokerage_name, a.license_number ? `NJ License #${a.license_number}` : ''].filter(Boolean).join(' · ');
  return `<aside class="tc-agent" aria-label="Prepared by">
      ${photo ? `<img src="${esc(photo)}" alt="" width="56" height="56">` : '<span class="tc-agent-ph" aria-hidden="true"><i class="fas fa-user"></i></span>'}
      <div class="tc-agent-copy"><small>Prepared by</small><b>${esc(name)}</b>${lines ? `<span>${esc(lines)}</span>` : ''}</div>
      <div class="tc-agent-links">
        ${phone ? `<a class="wdp-pill" href="tel:${esc(phone)}"><i class="fas fa-phone" aria-hidden="true"></i>Call</a>` : ''}
        ${a.business_email ? `<a class="wdp-pill" href="mailto:${esc(a.business_email)}"><i class="fas fa-envelope" aria-hidden="true"></i>Email</a>` : ''}
        <a class="wdp-pill" href="/agent/${esc(a.slug)}">Profile</a>
      </div>
      ${a.brokerage_disclosure ? `<p class="tc-agent-note">${esc(a.brokerage_disclosure)}</p>` : ''}
    </aside>`;
}

const TC_STYLE = `
.tc-top{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;align-items:start;margin-bottom:16px}
.tc-agent{display:grid;grid-template-columns:56px minmax(0,1fr);gap:4px 12px;align-items:center;background:var(--b-white);border:1px solid var(--b-line);border-radius:var(--b-radius);padding:14px 16px;max-width:420px}
.tc-agent img,.tc-agent-ph{width:56px;height:56px;border-radius:50%;object-fit:cover;background:var(--b-sky);display:grid;place-content:center;color:var(--b-blue)}
.tc-agent-copy{display:grid;gap:2px;min-width:0}
.tc-agent-copy small{font-size:12px;font-weight:600;letter-spacing:0;text-transform:none;color:var(--b-muted)}
.tc-agent-copy b{font-size:16px}
.tc-agent-copy span{font-size:13px;color:var(--b-muted)}
.tc-agent-links{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}
.tc-agent-note{grid-column:1/-1;margin:6px 0 0;font-size:12px;color:var(--b-muted)}
.tc-total{display:flex;align-items:baseline;gap:6px;margin:4px 0 14px}
.tc-total b{font:700 52px/1 "Libre Franklin",system-ui,sans-serif;letter-spacing:-.04em;padding-bottom:6px;border-bottom:2px solid var(--b-gold)}
.tc-total span{font-size:15px;color:rgba(255,255,255,.74)}
.tc-lines{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.tc-lines li{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px;align-items:center;font-size:14px}
.tc-lines li i{grid-column:1/-1;display:block;height:6px;border-radius:6px;background:rgba(255,255,255,.14);overflow:hidden}
.tc-lines li i s{display:block;height:100%;background:var(--b-gold);text-decoration:none}
.tc-lines b{font-weight:700}
.tc-muted{color:rgba(255,255,255,.66)}
.tc-verdict{border-radius:16px;padding:14px 16px;margin-top:12px;background:rgba(255,255,255,.6)}
.tc-verdict b{display:block;font-size:16px;margin-bottom:4px}
.tc-verdict p{margin:0;font-size:14px;line-height:1.55}
.tc-verdict.is-warn{background:#fdf1dc}
.tc-verdict.is-good{background:#e1f3ea}
.tc-list{list-style:none;margin:0;padding:0;display:grid;gap:14px}
.tc-list li{display:grid;grid-template-columns:36px minmax(0,1fr);gap:12px}
.tc-list .fas{width:36px;height:36px;border-radius:12px;background:var(--b-sand);color:var(--b-ink);display:grid;place-content:center;font-size:15px}
.tc-list b{display:block;font-size:15px;margin-bottom:2px}
.tc-list p{margin:0!important;font-size:14px}
.tc-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.tc-form label{display:grid;gap:6px;font-size:13px;font-weight:600;color:var(--b-ink-2)}
.tc-form input,.tc-form select{width:100%;box-sizing:border-box;min-height:46px;padding:10px 12px;border:1px solid var(--b-line);border-radius:12px;background:var(--b-surface);font:500 16px "Libre Franklin",system-ui,sans-serif;color:var(--b-ink)}
.tc-form input:focus,.tc-form select:focus{border-color:var(--b-ink);background:#fff}
.tc-form .wdp-wide{grid-column:1/-1}
.tc-hint{font-size:12px;font-weight:500;color:var(--b-muted)}
.tc-pick{position:relative}
.tc-matches{list-style:none;margin:6px 0 0;padding:0;border:1px solid var(--b-line);border-radius:14px;background:#fff;overflow:hidden}
.tc-matches:empty{display:none}
.tc-matches button{display:block;width:100%;text-align:left;min-height:48px;padding:10px 14px;border:0;border-bottom:1px solid var(--b-line);background:#fff;font:500 15px "Libre Franklin",system-ui,sans-serif;color:var(--b-ink);cursor:pointer}
.tc-matches button small{display:block;font-size:13px;color:var(--b-muted)}
.tc-matches button:hover,.tc-matches button:focus{background:var(--b-surface)}
.tc-chosen{font-weight:600;margin:0}
@media (max-width:980px){.tc-top{grid-template-columns:minmax(0,1fr)}.tc-agent{max-width:none}}
@media (max-width:640px){.tc-form{grid-template-columns:minmax(0,1fr)}.tc-total b{font-size:44px}}
@media print{.tc-inputs,.tc-share{display:none!important}}
`;

function money(v) { return H.money(v) || '$0'; }

function renderCard(row, inp, agent) {
  const v = H.view(row);
  const f = townFacts(row, v);
  const ts = H.taxStats(row, H.money);
  // Monthly cost uses the newest year: an older state-list bill is moved to the
  // newest published rate when its year is known.
  const bill = Number(row.last_year_tax) > 0 ? Number(row.last_year_tax) : (row.assessed_value && f.rate ? row.assessed_value * f.rate / 100 : 0);
  const tax = ts.by.current && !ts.by.current.generalRateOnly ? ts.by.current.amount : bill;
  const mc = monthlyCost({ ...inp, tax });
  const check = priceCheck({ price: inp.price, assessed: Number(row.assessed_value) || 0, tax, ratio: f.ratio, upper: f.upper, rate: f.rate });
  const verdict = verdictText(check, v.town);
  const items = changeItems(row, v, f);
  const share = `${H.CANONICAL_ORIGIN}/true-cost?${new URLSearchParams(Object.entries({ pin: row.pams_pin, price: inp.price || '', down: inp.down, rate: inp.rate, term: inp.term, ins: inp.ins || '', hoa: inp.hoa || '', agent: agent ? agent.slug : '' }).filter(([, x]) => x !== '' && x != null)).toString()}`;
  const data = JSON.stringify({
    pin: row.pams_pin, town: v.town, tax, assessed: Number(row.assessed_value) || 0, ratio: f.ratio, upper: f.upper, rate: f.rate,
    agent: agent ? agent.slug : '', title: `True cost of ${v.address}, ${v.town}`
  }).replace(/</g, '\\u003c');
  const line = (key, label, value, note) => `<li data-tc-line="${key}"><span>${esc(label)}${note ? ` <span class="tc-muted">${esc(note)}</span>` : ''}</span><b>${money(value)}</b><i><s style="width:${mc.total > 0 ? Math.round(value / mc.total * 100) : 0}%"></s></i></li>`;
  const title = `True cost of owning ${v.address}, ${v.town}, NJ | Watchdog`;
  const body = `<main class="wdp-app">
  <div class="wdp-crumbs" role="navigation" aria-label="Breadcrumb"><a href="/true-cost${agent ? `?agent=${esc(agent.slug)}` : ''}">True cost</a> › ${esc(v.town)}</div>
  <div class="tc-top">
    <div class="wdp-head" style="margin:0">
      <div><h1>${esc(v.address)}</h1><p>What it really costs to own, including New Jersey property tax. ${esc([v.place, `${v.county} County`].join(' · '))}</p></div>
    </div>
    ${agentCard(agent)}
  </div>
  <div class="wdp-cards">
    <section class="wdp-card wdp-card--score" aria-labelledby="tc-month-h">
      <div class="wdp-card-head"><h2 id="tc-month-h">Monthly cost</h2></div>
      <div class="tc-total"><b id="tc-total">${inp.price ? money(mc.total) : '-'}</b><span>a month</span></div>
      <ul class="tc-lines" id="tc-lines">
        ${line('pi', 'Mortgage', mc.pi, `${inp.term} yrs at ${inp.rate}%`)}
        ${line('tax', 'Property tax', mc.tax)}
        ${line('ins', 'Home insurance', mc.ins, inp.ins ? '' : 'add your quote')}
        ${line('hoa', 'HOA / condo fee', mc.hoa)}
      </ul>
      <p class="wdp-card-note" id="tc-cash">${inp.price ? `${money(mc.cash)} down, ${money(mc.loan)} loan.` : ''}${inp.down < 20 && inp.price ? ' With less than 20% down, lenders usually add mortgage insurance, not shown here.' : ''}</p>
    </section>
    <section class="wdp-card wdp-card--tax" aria-labelledby="tc-tax-h">
      <div class="wdp-card-head"><h2 id="tc-tax-h">Property tax</h2><a class="wdp-card-link" href="${esc(v.path)}">Full property page</a></div>
      <div class="wdp-stats">
        <div class="wdp-stat is-lead"><b>${esc(money(bill))}</b><span>${esc(ts.label)}</span></div>
        ${ts.extra}
        <div class="wdp-stat"><b>${esc(H.money(row.assessed_value) || 'n/a')}</b><span>Assessed value</span></div>
        ${f.rate ? `<div class="wdp-stat"><b>$${f.rate.toFixed(3)}</b><span>${f.rateYear} rate per $100</span></div>` : ''}
      </div>
      <div class="tc-verdict is-${verdict.tone}" id="tc-verdict" aria-live="polite"><b>${esc(verdict.title)}</b><p>${esc(verdict.body)}</p></div>
    </section>
  </div>
  <div class="wdp-grid">
    <div class="wdp-col">
      <section class="wdp-panel" aria-labelledby="tc-change-h">
        <h2 id="tc-change-h">Could the tax change after you buy?</h2>
        <ul class="tc-list">${items.map(([icon, h, p]) => `<li><span class="fas ${icon}" aria-hidden="true"></span><div><b>${esc(h)}</b><p>${esc(p)}</p></div></li>`).join('')}</ul>
      </section>
    </div>
    <div class="wdp-col">
      <section class="wdp-panel tc-inputs" aria-labelledby="tc-in-h">
        <h2 id="tc-in-h">Change the numbers</h2>
        <form class="tc-form" id="tc-form" method="get" action="/true-cost">
          <input type="hidden" name="pin" value="${esc(row.pams_pin)}">
          ${agent ? `<input type="hidden" name="agent" value="${esc(agent.slug)}">` : ''}
          <label class="wdp-wide">Price<input name="price" inputmode="numeric" value="${inp.price ? Math.round(inp.price) : ''}" placeholder="List price or your offer"></label>
          <label>Down payment %<input name="down" inputmode="decimal" value="${inp.down}"></label>
          <label>Interest rate %<input name="rate" inputmode="decimal" value="${inp.rate}"></label>
          <label>Loan length<select name="term">${[30, 20, 15].map((t) => `<option value="${t}"${t === inp.term ? ' selected' : ''}>${t} years</option>`).join('')}</select></label>
          <label>Insurance per year<input name="ins" inputmode="numeric" value="${inp.ins || ''}" placeholder="Your quote"></label>
          <label>HOA per month<input name="hoa" inputmode="numeric" value="${inp.hoa || ''}" placeholder="0"></label>
          <p class="tc-hint wdp-wide">The interest rate is only an example. Use your lender's quote.</p>
          <div class="wdp-wide wdp-form-foot"><button class="wdp-pill is-dark" type="submit">Update</button></div>
        </form>
      </section>
      <section class="wdp-panel tc-share" aria-labelledby="tc-share-h">
        <h2 id="tc-share-h">Send this card</h2>
        <p>The link keeps the price and numbers above.</p>
        <div class="wdp-pills"><button class="wdp-pill is-dark" type="button" data-tc-copy><i class="fas fa-link" aria-hidden="true"></i>Copy link</button><button class="wdp-pill" type="button" data-tc-native hidden><i class="fas fa-share-nodes" aria-hidden="true"></i>Share</button><button class="wdp-pill" type="button" onclick="window.print()"><i class="fas fa-print" aria-hidden="true"></i>Print</button></div>
        <p class="wdp-form-msg" role="status" aria-live="polite" data-tc-msg></p>
      </section>
      ${townSection(row)}
    </div>
  </div>
  <p class="wdp-source">Estimates only, not a loan offer. Tax from the New Jersey MOD-IV tax list; tax rates from the NJ Division of Taxation; town ratios from the 2026 Chapter 123 certification. "Usually carry" compares the price with the town's average assessment ratio and latest published tax rate. <a href="/data-methodology">How we get our numbers</a></p>
</main>
<script id="tc-data" type="application/json">${data}</script>
<script>${clientScript(share)}</script>`;
  return shell(title, `The real monthly cost of ${v.address}, ${v.town}, NJ, with property tax and what could change it after you buy.`, body, share);
}

function clientScript(share) {
  return `(function(){
  ${monthlyCost.toString()}
  ${priceCheck.toString()}
  ${verdictText.toString()}
  var d={};try{d=JSON.parse(document.getElementById('tc-data').textContent)}catch(e){}
  var form=document.getElementById('tc-form');if(!form)return;
  var shareUrl=${JSON.stringify(share)};
  function n(name,def){var v=String(form.elements[name].value||'').replace(/[^0-9.]/g,'');var x=parseFloat(v);return isFinite(x)?x:def}
  function m(v){return '$'+Math.round(v).toLocaleString('en-US')}
  function run(){
    var i={price:n('price',0),down:Math.min(100,n('down',20)),rate:Math.min(20,n('rate',0)),term:Number(form.elements.term.value)||30,ins:n('ins',0),hoa:n('hoa',0),tax:d.tax};
    var c=monthlyCost(i);
    document.getElementById('tc-total').textContent=i.price?m(c.total):'-';
    ['pi','tax','ins','hoa'].forEach(function(k){var li=document.querySelector('[data-tc-line="'+k+'"]');if(!li)return;li.querySelector('b').textContent=m(c[k]);li.querySelector('s').style.width=(c.total>0?Math.round(c[k]/c.total*100):0)+'%'});
    var pi=document.querySelector('[data-tc-line="pi"] .tc-muted');if(pi)pi.textContent=i.term+' yrs at '+i.rate+'%';
    document.getElementById('tc-cash').textContent=i.price?(m(c.cash)+' down, '+m(c.loan)+' loan.'+(i.down<20?' With less than 20% down, lenders usually add mortgage insurance, not shown here.':'')):'';
    var v=verdictText(priceCheck({price:i.price,assessed:d.assessed,tax:d.tax,ratio:d.ratio,upper:d.upper,rate:d.rate}),d.town);
    var box=document.getElementById('tc-verdict');box.className='tc-verdict is-'+v.tone;box.querySelector('b').textContent=v.title;box.querySelector('p').textContent=v.body;
    var q=new URLSearchParams();q.set('pin',d.pin);if(i.price)q.set('price',Math.round(i.price));q.set('down',i.down);q.set('rate',i.rate);q.set('term',i.term);if(i.ins)q.set('ins',Math.round(i.ins));if(i.hoa)q.set('hoa',Math.round(i.hoa));if(d.agent)q.set('agent',d.agent);
    shareUrl=location.origin+'/true-cost?'+q.toString();
    try{history.replaceState(null,'','/true-cost?'+q.toString())}catch(e){}
  }
  form.addEventListener('input',run);form.addEventListener('change',run);
  var msg=document.querySelector('[data-tc-msg]');
  function say(t){if(msg){msg.textContent=t;msg.className='wdp-form-msg is-ok'}}
  var copy=document.querySelector('[data-tc-copy]');
  if(copy)copy.addEventListener('click',function(){if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(shareUrl).then(function(){say('Link copied.')},function(){prompt('Copy this link',shareUrl)})}else{prompt('Copy this link',shareUrl)}});
  var nat=document.querySelector('[data-tc-native]');
  if(nat&&navigator.share){nat.hidden=false;nat.addEventListener('click',function(){navigator.share({title:d.title,url:shareUrl}).catch(function(){})})}
})();`;
}

function townSection(row) {
  const links = townLinks(row.pams_pin);
  const items = [
    ['fa-clipboard-check', `${links.name || 'Town'} CO requirements`, 'Resale certificate of occupancy and smoke detector certificate rules, fees and timing.', links.co],
    links.tax ? ['fa-landmark', `${links.name} property taxes`, 'Typical bill, tax rate and appeal deadline for the town.', links.tax] : null
  ].filter(Boolean);
  return `<section class="wdp-panel" aria-labelledby="tc-town-h">
        <h2 id="tc-town-h">Before closing</h2>
        <ul class="wdp-tools">${items.map(([icon, title, text, href]) => `<li><a href="${esc(href)}"><i class="fas ${icon}" aria-hidden="true"></i><span><b>${esc(title)}</b><small>${esc(text)}</small></span></a></li>`).join('')}</ul>
      </section>`;
}

function shell(title, description, body, canonical) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="${canonical ? 'noindex, follow' : 'index, follow'}">
<link rel="canonical" href="${H.CANONICAL_ORIGIN}/true-cost">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Watchdog">
<meta property="og:title" content="${esc(title.replace(/ \| Watchdog$/, ''))}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${H.CANONICAL_ORIGIN}/watchdog-social-share-20260913-v3.jpg">
${HEAD_ASSETS}
<style>${STYLE}${TC_STYLE}</style>
</head>
<body class="nav-solid wdp">
${chrome()}
${body}
<div id="main-footer"></div>
${FOOT_SCRIPTS}
</body>
</html>`;
}

function renderPicker(agent) {
  const body = `<main class="wdp-app">
  <div class="tc-top">
    <div class="wdp-head" style="margin:0"><div><h1>True cost of a home</h1><p>The real monthly cost of any New Jersey home, including the property tax and what could change it after the sale.</p></div></div>
    ${agentCard(agent)}
  </div>
  <section class="wdp-panel" aria-labelledby="tc-pick-h" style="max-width:720px">
    <h2 id="tc-pick-h">Pick a home</h2>
    <form class="tc-form" id="tc-pick" method="get" action="/true-cost">
      <input type="hidden" name="pin" value="">
      ${agent ? `<input type="hidden" name="agent" value="${esc(agent.slug)}">` : ''}
      <label class="wdp-wide tc-pick">Address<input name="address" autocomplete="off" placeholder="Start typing: 102 Grant Ave, Harrison" aria-controls="tc-matches"></label>
      <ul class="tc-matches wdp-wide" id="tc-matches" role="listbox" aria-label="Matching addresses"></ul>
      <p class="tc-chosen wdp-wide" id="tc-chosen" aria-live="polite"></p>
      <label class="wdp-wide">Price<input name="price" inputmode="numeric" placeholder="List price or your offer"></label>
      <div class="wdp-wide wdp-form-foot"><button class="wdp-pill is-dark" type="submit">Show the true cost</button><span class="wdp-form-msg" role="status" aria-live="polite"></span></div>
    </form>
  </section>
</main>
<script>(function(){
  var form=document.getElementById('tc-pick'),box=document.getElementById('tc-matches'),chosen=document.getElementById('tc-chosen'),msg=form.querySelector('.wdp-form-msg');
  var input=form.elements.address,t=null,seq=0;
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  input.addEventListener('input',function(){
    form.elements.pin.value='';chosen.textContent='';clearTimeout(t);var q=input.value.trim();
    if(q.length<4||!/^\\d/.test(q)){box.innerHTML='';return}
    t=setTimeout(function(){var my=++seq;fetch('/api/watchdog-true-cost?q='+encodeURIComponent(q)).then(function(r){return r.ok?r.json():[]}).then(function(rows){
      if(my!==seq)return;
      box.innerHTML=(rows||[]).map(function(r,i){return '<li><button type="button" role="option" data-i="'+i+'">'+esc(r.address)+'<small>'+esc(r.town)+', '+esc(r.county)+' County</small></button></li>'}).join('');
      [].forEach.call(box.querySelectorAll('button'),function(b){b.addEventListener('click',function(){var r=rows[Number(b.getAttribute('data-i'))];form.elements.pin.value=r.pin;input.value=r.address+', '+r.town;chosen.textContent='Selected: '+r.address+', '+r.town;box.innerHTML='';form.elements.price.focus()})});
    }).catch(function(){})},200);
  });
  form.addEventListener('submit',function(e){
    if(!form.elements.pin.value){e.preventDefault();msg.textContent='Pick the address from the list.';msg.className='wdp-form-msg is-error';input.focus();return}
    input.disabled=true;
  });
})();</script>`;
  return shell('True cost of a New Jersey home | Watchdog', 'See the real monthly cost of any New Jersey home, with the property tax and what could change it after you buy.', body, '');
}

async function search(q) {
  const query = String(q || '').trim().slice(0, 120);
  if (query.length < 4 || !/^\d/.test(query)) return [];
  const rows = await backend('search_parcels', { p_query: query, p_limit: 8 });
  return (Array.isArray(rows) ? rows : []).filter((r) => r && r.pams_pin).map((r) => ({
    pin: r.pams_pin, address: H.titleCase(r.address), town: page.townName(r.town), county: H.titleCase(r.county)
  }));
}

async function handler(req, res) {
  const query = req.query || {};
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.statusCode = 405;
    return res.end('Method not allowed');
  }
  if (query.q !== undefined) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    try {
      const rows = await search(query.q);
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600');
      res.statusCode = 200;
      return res.end(JSON.stringify(rows));
    } catch (err) {
      console.error('true-cost search', err && err.message || err);
      res.setHeader('Cache-Control', 'no-store');
      res.statusCode = 503;
      return res.end('[]');
    }
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const pin = String(query.pin || '').trim();
  const agent = await fetchAgent(String(query.agent || '').trim().toLowerCase());
  if (!pin) {
    res.statusCode = 200;
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600');
    return res.end(req.method === 'HEAD' ? undefined : renderPicker(agent));
  }
  if (!PIN.test(pin)) {
    res.statusCode = 404;
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600');
    return res.end(req.method === 'HEAD' ? undefined : page.messagePage('True cost', 'We couldn\'t find that home', 'The link may be incomplete. Pick the address again.', '<a class="wdp-pill is-dark" href="/true-cost">Pick a home</a>'));
  }
  let row;
  try {
    row = await page.fetchProperty(pin);
  } catch (err) {
    console.error('true-cost property', err && err.message || err);
    res.statusCode = 503;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Retry-After', '60');
    return res.end(req.method === 'HEAD' ? undefined : page.messagePage('True cost', 'Please try again in a minute', 'Property data is unavailable right now.'));
  }
  if (!row) {
    res.statusCode = 404;
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600');
    return res.end(req.method === 'HEAD' ? undefined : page.messagePage('True cost', 'We couldn\'t find that home', 'It has no record on the state tax list.', '<a class="wdp-pill is-dark" href="/true-cost">Pick a home</a>'));
  }
  res.statusCode = 200;
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600');
  res.setHeader('X-Robots-Tag', 'noindex, follow');
  return res.end(req.method === 'HEAD' ? undefined : renderCard(row, readInputs(query), agent));
}

module.exports = handler;
module.exports.readInputs = readInputs;
module.exports.monthlyCost = monthlyCost;
module.exports.priceCheck = priceCheck;
module.exports.verdictText = verdictText;
module.exports.changeItems = changeItems;
module.exports.townFacts = townFacts;
module.exports.renderCard = renderCard;
module.exports.renderPicker = renderPicker;
module.exports.fetchAgent = fetchAgent;
module.exports.agentCard = agentCard;
module.exports.shell = shell;
module.exports.TC_STYLE = TC_STYLE;
module.exports.rateChange = rateChange;
