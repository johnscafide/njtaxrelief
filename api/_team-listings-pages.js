// HTML for the public team listings pages: /listings (every home the team has on the market) and
// /listings/<slug> (one home). Served by api/team-listings-page.js. Uses the /co page shell and
// co/co.css so it looks like the CO lookup; the extra listing styles are LISTINGS_CSS below.
// Listings come from team_listings (added in Backoffice at /backoffice/team-listings).
const P = require('./_co-pages');
const T = require('./_co-town');
const TAX = require('./_tax-town');

const { ORIGIN, esc } = T;
const LOGO = '/property/branding/watchdog-logo-horizontal.svg';
const LIVE = ['coming_soon', 'active', 'under_contract'];
const STATUS = { coming_soon: 'Coming soon', active: 'For sale', under_contract: 'Under contract', sold: 'Sold', off_market: 'Off market' };
const FILTERS = [['', 'All'], ['active', 'For sale'], ['coming_soon', 'Coming soon'], ['under_contract', 'Under contract']];
// NJ ad rules (N.J.A.C. 11:5-6.1) want the brokerage name plus words saying it's a real estate broker.
const BROKER_WORDS = 'Real Estate Broker';

function money(n) { return n == null ? '' : '$' + Number(n).toLocaleString('en-US'); }
function baths(l) {
  const f = Number(l.baths_full) || 0, h = Number(l.baths_half) || 0;
  if (!f && !h) return '';
  return `${h ? `${f}.${h}` : f} ${f + (h ? 0.5 : 0) === 1 ? 'bath' : 'baths'}`;
}
function factsLine(l) {
  return [l.beds != null ? `${l.beds} ${l.beds === 1 ? 'bed' : 'beds'}` : '', baths(l), l.sqft ? `${Number(l.sqft).toLocaleString('en-US')} sq ft` : ''].filter(Boolean);
}
function street(l) { return l.address + (l.unit ? ` #${l.unit}` : ''); }
function place(l) { return `${l.city}, NJ${l.zip ? ' ' + l.zip : ''}`; }
function brokerLine(l) { return `${esc(l.brokerage || 'Opus Elite Real Estate of NJ, LLC')}, ${BROKER_WORDS}`; }

// The town's CO and tax pages, when the listing's town matches one of ours.
function townPages(l) {
  const county = String(l.county || '').toLowerCase().replace(/\s+county$/, '').replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
  const c = county && T.findCounty(county);
  if (!c) return null;
  const want = String(l.city || '').toLowerCase().replace(/[^a-z]/g, '');
  const hits = c.towns.filter((t) => t.name.toLowerCase().replace(/\s+(township|borough|city|town|village)$/, '').replace(/^(city|town|village|borough) of\s+/, '').replace(/[^a-z]/g, '') === want);
  if (hits.length !== 1) return null;
  const t = hits[0];
  const tax = TAX.findTown(c.slug, t.slug);
  return { name: t.name, co: t.published ? t.path : '', tax: tax ? tax.path : '' };
}

function top() { return `<header class="top">\n  <a class="logo" href="/"><img src="${LOGO}" alt="Watchdog" width="150" height="35"></a>\n</header>`; }

function card(l) {
  const photo = l.photos && l.photos[0];
  return `<li class="lcard"><a href="/listings/${esc(l.slug)}">` +
    `<span class="lphoto">${photo ? `<img src="${esc(photo)}" alt="${esc(street(l))}" loading="lazy" width="640" height="427">` : ''}<span class="lbadge ${esc(l.status)}">${esc(STATUS[l.status] || '')}</span></span>` +
    `<span class="lbody"><span class="lprice">${esc(money(l.price))}</span>` +
    `<span class="lfacts">${esc(factsLine(l).join(' · '))}</span>` +
    `<span class="laddr">${esc(street(l))}</span><span class="lplace">${esc(place(l))}</span></span></a></li>`;
}

function indexPage(listings, status) {
  const shown = status ? listings.filter((l) => l.status === status) : listings;
  const chips = '<nav class="lfilters" aria-label="Show">' + FILTERS.map(([key, label]) => {
    const n = key ? listings.filter((l) => l.status === key).length : listings.length;
    if (key && !n) return '';
    return `<a class="chip${key === (status || '') ? ' on' : ''}" href="/listings${key ? `?status=${key}` : ''}"${key === (status || '') ? ' aria-current="page"' : ''}>${label} <span class="n">${n}</span></a>`;
  }).join('') + '</nav>';
  const brokerages = [...new Set(listings.map((l) => l.brokerage || 'Opus Elite Real Estate of NJ, LLC'))];
  const out = `<h1 class="town">Our team’s listings</h1>
<p class="meta">${listings.length ? `${listings.length} ${listings.length === 1 ? 'home' : 'homes'} in South Jersey` : 'South Jersey homes from our team'}</p>
${listings.length > 3 ? chips : ''}
${shown.length ? `<ul class="lgrid">${shown.map(card).join('')}</ul>` : '<p class="msg">Nothing on the market right now. Check back soon.</p>'}
<p class="lbroker">Listed by ${brokerages.map((b) => `${esc(b)}, ${BROKER_WORDS}`).join('; ')}</p>`;
  return P.shell({
    mode: 'page',
    title: 'Our Team’s Listings: South Jersey Homes for Sale | Watchdog',
    description: 'South Jersey homes for sale from our team, with photos, prices, taxes and town info.',
    canonical: `${ORIGIN}/listings`,
    noindex: !!status || !listings.length,
    image: listings[0] && listings[0].photos && listings[0].photos[0],
    imageAlt: 'Homes for sale from our team',
    body: `<style>${LISTINGS_CSS}</style>\n<main>\n${top()}\n<div class="out" id="out">${out}</div>\n</main>`
  });
}

function fact(label, value) { return value ? `<div><dt>${label}</dt><dd>${esc(value)}</dd></div>` : ''; }

function listingPage(l) {
  const photos = l.photos || [];
  const shareUrl = `${ORIGIN}/listings/${l.slug}`;
  const q = (medium) => `${shareUrl}?utm_source=share&utm_medium=${medium}&utm_campaign=team_listing`;
  const facts = factsLine(l);
  const towns = townPages(l);
  const gallery = photos.length ? `<div class="lgallery">
<img class="lmain" id="lmain" src="${esc(photos[0])}" alt="${esc(street(l))}, photo 1 of ${photos.length}" width="1200" height="800">
${photos.length > 1 ? `<ul class="lthumbs">${photos.map((u, i) => `<li><a href="${esc(u)}" data-photo="${i}"${i ? '' : ' aria-current="true"'}><img src="${esc(u)}" alt="Photo ${i + 1}" loading="lazy" width="160" height="107"></a></li>`).join('')}</ul>` : ''}
</div>` : '';
  const details = fact('Home type', l.property_type) + fact('Style', l.style) + fact('Year built', l.year_built) + fact('Lot', l.lot) +
    fact('Yearly taxes', l.annual_tax ? money(l.annual_tax) : '') + fact('School district', l.school_district) + fact('Neighborhood', l.subdivision) +
    fact('County', l.county ? `${String(l.county).replace(/\s+county$/i, '')} County` : '') + fact('MLS#', l.mls_number);
  const features = (l.features || []).map((f) => fact(esc(f.label), f.value)).join('');
  const subject = `About ${street(l)}, ${l.city}`;
  const out = `<nav class="crumbs" aria-label="Breadcrumb"><a href="/listings">Our team’s listings</a></nav>
${gallery}
<div class="lhead">
<div><h1 class="town">${esc(street(l))}</h1><p class="meta">${esc(place(l))}</p></div>
<div class="lpricebox"><span class="lbadge ${esc(l.status)}">${esc(STATUS[l.status] || '')}</span><span class="lbig">${esc(money(l.price))}</span>${facts.length ? `<span class="lfacts">${esc(facts.join(' · '))}</span>` : ''}</div>
</div>
<div class="tools">
<a class="chip lask" href="/contact?subject=${esc(encodeURIComponent(subject))}">Ask about this home</a>
<button class="chip" type="button" data-copy="${esc(q('copy'))}">Copy link</button>
<a class="chip" href="sms:?&amp;body=${esc(encodeURIComponent(`${street(l)}, ${l.city}: ${q('text')}`))}">Text</a>
<a class="chip" href="https://www.facebook.com/sharer/sharer.php?u=${esc(encodeURIComponent(q('facebook')))}" target="_blank" rel="noopener">Facebook</a>
</div>
<div class="cols">
${l.remarks ? `<section class="part"><h2>About this home</h2>${String(l.remarks).split(/\n{2,}/).map((p) => `<p>${esc(p)}</p>`).join('')}</section>` : ''}
<section class="part"><h2>Details</h2><dl class="facts ldl">${details}</dl>${features ? `<h2 class="lsub">Features</h2><dl class="facts ldl">${features}</dl>` : ''}</section>
</div>
${towns && (towns.co || towns.tax) ? `<p class="more">${towns.tax ? `<a href="${esc(towns.tax)}">${esc(towns.name)} property taxes</a>` : ''}${towns.tax && towns.co ? ' · ' : ''}${towns.co ? `<a href="${esc(towns.co)}">${esc(towns.name)} CO requirements</a>` : ''}</p>` : ''}
<p class="lbroker">${l.agent_name ? `Listed by ${esc(l.agent_name)}, ` : 'Listed by '}${brokerLine(l)}${l.list_date ? ` · Listed ${esc(new Date(l.list_date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }))}` : ''}</p>
<p class="lfine">Info comes from Bright MLS and is believed accurate but not guaranteed.</p>`;
  const live = LIVE.includes(l.status);
  return P.shell({
    mode: 'page',
    title: `${street(l)}, ${l.city}, NJ${l.zip ? ' ' + l.zip : ''}${l.price ? ' | ' + money(l.price) : ''} | Watchdog`,
    description: [STATUS[l.status], money(l.price), facts.join(', '), `${street(l)}, ${place(l)}`].filter(Boolean).join(' · '),
    canonical: shareUrl,
    noindex: !live,
    image: photos[0],
    imageAlt: `${street(l)}, ${l.city}`,
    body: `<style>${LISTINGS_CSS}</style>\n<main>\n${top()}\n<div class="out" id="out">${out}</div>\n</main>\n<div class="toast" data-toast role="status" aria-live="polite" hidden></div>\n<script>${LISTING_JS}</script>`
  });
}

function missingPage() {
  return P.shell({
    mode: 'page',
    title: 'Listing not found | Watchdog',
    description: 'That listing isn’t here anymore.',
    noindex: true,
    body: `<style>${LISTINGS_CSS}</style>\n<main>\n${top()}\n<div class="out" id="out"><h1 class="town">That listing isn’t here anymore.</h1><p class="msg"><a href="/listings">See what’s on the market now</a></p></div>\n</main>`
  });
}

const LISTINGS_CSS = `.lfilters{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 20px}
.lfilters .chip.on{border-color:var(--blue);color:var(--blue)}
.lfilters .n{color:var(--muted);font-weight:400}
.lgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:24px;margin:0;padding:0;list-style:none}
.lcard a{display:block;color:var(--ink);text-decoration:none}
.lphoto{position:relative;display:block;aspect-ratio:3/2;border-radius:12px;overflow:hidden;background:var(--soft)}
.lphoto img{display:block;width:100%;height:100%;object-fit:cover}
.lbadge{display:inline-block;padding:2px 10px;border-radius:8px;background:#fff;color:var(--blue);font-size:13px;font-weight:600;line-height:1.6}
.lphoto .lbadge{position:absolute;left:10px;top:10px;box-shadow:0 2px 6px rgba(15,23,42,.08)}
.lbadge.coming_soon{color:#9a6700}
.lbadge.under_contract{color:#5f6b7a}
.lbadge.sold,.lbadge.off_market{color:#5f6b7a}
.lbody{display:grid;gap:1px;padding:10px 2px 0}
.lprice{font-size:22px;font-weight:600}
.lfacts{color:var(--ink);font-size:15px}
.laddr{font-size:15px}
.lplace{color:var(--muted);font-size:14px}
.lcard a:hover .laddr{text-decoration:underline}
.lcard a:focus-visible{outline:2px solid var(--blue);outline-offset:4px;border-radius:12px}
.lbroker{margin-top:28px;color:var(--muted);font-size:14px}
.lfine{margin-top:4px;color:var(--muted);font-size:13px}
.lgallery{margin:6px 0 20px}
.lmain{display:block;width:100%;max-height:72vh;aspect-ratio:3/2;object-fit:cover;border-radius:12px;background:var(--soft)}
.lthumbs{display:flex;gap:8px;margin:8px 0 0;padding:0 0 4px;list-style:none;overflow-x:auto;scroll-snap-type:x proximity}
.lthumbs li{flex:none;scroll-snap-align:start}
.lthumbs a{display:block;border-radius:8px;overflow:hidden;border:2px solid transparent}
.lthumbs a[aria-current="true"]{border-color:var(--blue)}
.lthumbs img{display:block;width:120px;height:80px;object-fit:cover}
.lhead{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:12px 32px}
.lhead .meta{margin-bottom:10px}
.lpricebox{display:grid;justify-items:end;gap:2px}
.lpricebox .lbadge{padding:0;background:none}
.lbig{font-size:30px;font-weight:600;line-height:1.15}
.out .tools{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 24px}
.lask{border-color:var(--blue);background:var(--blue);color:#fff}
.lask:hover{background:#0a2f94}
.part p{margin:0 0 12px}
.lsub{margin-top:28px}
.ldl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 24px}
dl.facts.ldl dt{text-transform:none;letter-spacing:0;font-size:14px;font-weight:400}
.ldl dd{font-weight:600}
@media (max-width:640px){.ldl{grid-template-columns:1fr 1fr}.lpricebox{justify-items:start}.lgrid{grid-template-columns:1fr}.lmain{border-radius:8px}}
@media (prefers-reduced-motion:reduce){.lthumbs{scroll-behavior:auto}}
@media print{.lthumbs,.tools,.lfilters{display:none!important}}`;

const LISTING_JS = `(function(){var m=document.getElementById('lmain');document.querySelectorAll('[data-photo]').forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();m.src=a.getAttribute('href');m.alt=m.alt.replace(/photo \\d+/,'photo '+(Number(a.dataset.photo)+1));document.querySelectorAll('[data-photo]').forEach(function(x){x.removeAttribute('aria-current')});a.setAttribute('aria-current','true')})});var t=document.querySelector('[data-toast]');document.querySelectorAll('[data-copy]').forEach(function(b){b.addEventListener('click',function(){var u=b.getAttribute('data-copy');var say=function(s){t.textContent=s;t.hidden=false;setTimeout(function(){t.hidden=true},2200)};if(navigator.clipboard)navigator.clipboard.writeText(u).then(function(){say('Link copied')},function(){say('Couldn’t copy the link')});else say('Couldn’t copy the link')})})})();`;

module.exports = { indexPage, listingPage, missingPage, LIVE, _test: { townPages, factsLine, baths } };
