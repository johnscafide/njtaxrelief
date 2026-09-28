// Watchdog panel for New Jersey listing pages on Zillow, Realtor.com and Redfin.
// Reads only the listing's address, map location and list price from the page
// it is on (structured data, title or URL), asks Watchdog for that one
// property and shows a panel. Nothing else on the page is read or changed.
(() => {
  'use strict';
  if (window.__watchdogPanel) return;
  window.__watchdogPanel = true;

  const money = (v) => (v == null || !isFinite(v) ? 'n/a' : '$' + Math.round(v).toLocaleString('en-US'));
  const words = (s) => String(s || '').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  const num = (v) => { const n = Number(String(v == null ? '' : v).replace(/[^0-9.]/g, '')); return isFinite(n) && n > 0 ? n : null; };

  function onDetailPage() {
    const h = location.hostname, p = location.pathname;
    if (/(^|\.)zillow\.com$/.test(h)) return p.startsWith('/homedetails/');
    if (/(^|\.)realtor\.com$/.test(h)) return p.startsWith('/realestateandhomes-detail/');
    if (/(^|\.)redfin\.com$/.test(h)) return /^\/NJ\/[^/]+\/[^/]+\/home\/\d+/i.test(p);
    return false;
  }

  // The URL always matches the listing on screen; titles and structured data
  // can lag a moment when the site switches listings without a reload, so
  // they are only used when their house number agrees with the URL.
  function fromUrl() {
    const seg = location.pathname.split('/').filter(Boolean);
    if (/zillow/.test(location.hostname) && seg[1]) {
      const m = seg[1].match(/^(\d[\w-]*?)-NJ-(\d{5})$/i);
      if (m) return { address: words(m[1]) + ' NJ', number: m[1].split('-')[0] };
    }
    if (/realtor/.test(location.hostname) && seg[1]) {
      const parts = seg[1].split('_');
      if (parts[2] === 'NJ' && /^\d/.test(parts[0])) return { address: `${words(parts[0])}, ${words(parts[1])}, NJ`, number: parts[0].split('-')[0] };
    }
    if (/redfin/.test(location.hostname) && seg[0] === 'NJ' && seg[2] && /^\d/.test(seg[2])) {
      return { address: `${words(seg[2].replace(/-\d{5}$/, ''))}, ${words(seg[1])}, NJ`, number: seg[2].split('-')[0] };
    }
    return null;
  }
  function structured() {
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      let data;
      try { data = JSON.parse(s.textContent); } catch (_) { continue; }
      const stack = [data];
      while (stack.length) {
        const o = stack.pop();
        if (!o || typeof o !== 'object') continue;
        if (Array.isArray(o)) { stack.push(...o); continue; }
        const a = o.address;
        if (a && a.streetAddress && /^(NJ|New Jersey)$/i.test(String(a.addressRegion || ''))) {
          const geo = o.geo || {};
          const offer = Array.isArray(o.offers) ? o.offers[0] : o.offers;
          return { street: String(a.streetAddress), city: String(a.addressLocality || ''), lat: Number(geo.latitude), lon: Number(geo.longitude), price: num(offer && offer.price) };
        }
        for (const k in o) if (o[k] && typeof o[k] === 'object') stack.push(o[k]);
      }
    }
    return null;
  }
  function listing() {
    if (!onDetailPage()) return null;
    const url = fromUrl();
    const sameHouse = (street) => !url || String(street || '').trim().split(/\s+/)[0].toUpperCase() === String(url.number).toUpperCase();
    const ld = structured();
    if (ld && sameHouse(ld.street)) {
      return { address: `${ld.street}, ${ld.city}, NJ`, lat: isFinite(ld.lat) ? ld.lat : null, lon: isFinite(ld.lon) ? ld.lon : null, price: ld.price };
    }
    const og = document.querySelector('meta[property="og:title"]');
    for (const t of [og && og.content, document.title]) {
      const m = String(t || '').match(/(\d+[A-Za-z]?(?:-\d+[A-Za-z]?)?\s+[^,|]+?),\s*([^,|]+?),\s*NJ\b/);
      if (m && sameHouse(m[1])) {
        const desc = document.querySelector('meta[property="og:description"], meta[name="description"]');
        const pm = String(desc && desc.content || '').match(/\$\s?(\d{1,3}(?:,\d{3}){1,3})/);
        return { address: `${m[1].trim()}, ${m[2].trim()}, NJ`, price: pm ? num(pm[1]) : null };
      }
    }
    return url ? { address: url.address } : null;
  }

  const CSS = `
  :host{all:initial}
  .wd{position:fixed;right:16px;bottom:16px;z-index:2147483646;width:360px;max-width:calc(100vw - 32px);font:14px/1.45 "Plus Jakarta Sans",-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#0e2248;background:#f3f1ec;border:1px solid #e3dfd6;border-radius:22px;box-shadow:0 14px 36px rgba(14,34,72,.22);overflow:hidden}
  .wd.min .body{display:none}
  .head{display:flex;align-items:center;gap:10px;padding:10px 12px;background:#0e2248;color:#fff}
  .head img{width:26px;height:26px;border-radius:7px}
  .brand{flex:1;display:grid;line-height:1.15}
  .brand b{font-size:15px;letter-spacing:-.01em}
  .brand small{font-size:11px;color:rgba(255,255,255,.7)}
  .head button{all:unset;cursor:pointer;min-width:32px;min-height:32px;display:grid;place-content:center;border-radius:8px;color:#fff;font-size:16px}
  .head button:hover{background:rgba(255,255,255,.12)}
  button:focus-visible,a:focus-visible,input:focus-visible{outline:2px solid #b8972a;outline-offset:2px}
  .body{padding:12px;max-height:min(70vh,640px);overflow:auto;display:grid;gap:10px}
  .addr b{display:block;font-size:16px;letter-spacing:-.01em}
  .addr span{font-size:12px;color:#5d6877}
  .card{border-radius:16px;padding:12px 14px;background:#fff;border:1px solid #e3dfd6}
  .card h3{margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#5d6877}
  .score{background:#0e2248;border-color:#0e2248;color:#fff;display:flex;align-items:center;gap:14px}
  .score h3{color:rgba(255,255,255,.7)}
  .score .big{font:700 40px/1 "Plus Jakarta Sans",system-ui,sans-serif;letter-spacing:-.03em;padding-bottom:4px;border-bottom:2px solid #b8972a}
  .score .big small{font-size:14px;font-weight:600;color:rgba(255,255,255,.7);border:0}
  .score p{margin:0;font-size:13px;color:rgba(255,255,255,.85)}
  .tax{background:#e3edfb;border-color:#e3edfb}
  .value{background:#f6efd9;border-color:#f6efd9}
  .sales{background:#dff1ec;border-color:#dff1ec}
  .row{display:flex;justify-content:space-between;gap:10px;font-size:13px;padding:3px 0}
  .row b{font-size:14px;white-space:nowrap}
  .lead{font:700 22px/1.1 "Plus Jakarta Sans",system-ui,sans-serif;letter-spacing:-.02em}
  .note{margin:6px 0 0;font-size:12.5px;color:#142033}
  .muted{color:#5d6877}
  .verdict{margin-top:8px;padding:8px 10px;border-radius:12px;background:rgba(255,255,255,.7);font-size:12.5px}
  .verdict b{display:block;font-size:13px}
  .verdict.good{background:#e1f3ea}
  .verdict.warn{background:#fdf1dc}
  label.price{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;margin-top:4px}
  label.price input{flex:1;min-width:0;min-height:32px;padding:4px 10px;border:1px solid #e3dfd6;border-radius:10px;font-family:inherit;font-size:14px;font-weight:600;background:#fff;color:#0e2248}
  .check{background:#fdf1dc;border-color:#f3dfb4}
  .check button{all:unset;cursor:pointer;display:block;width:100%;box-sizing:border-box;margin-top:6px;padding:8px 10px;border-radius:10px;background:#fff;font-size:13px;font-weight:600}
  .check button small{display:block;font-weight:500;color:#5d6877}
  .links{display:flex;flex-wrap:wrap;gap:6px}
  .links a{display:inline-flex;align-items:center;min-height:36px;padding:0 12px;border-radius:999px;border:1px solid #e3dfd6;background:#fff;color:#0e2248;text-decoration:none;font-weight:600;font-size:13px}
  .links a.dark{background:#0e2248;border-color:#0e2248;color:#fff}
  .msg{color:#5d6877;font-size:13px;margin:0}
  `;

  let host = null, shadow = null, lastKey = '', closedFor = '', current = null;

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function row(parent, label, value, muted) { const r = el('div', 'row'); r.append(el('span', muted ? 'muted' : null, label), el('b', null, value)); parent.appendChild(r); }
  function card(cls, title) { const c = el('section', 'card ' + cls); if (title) c.appendChild(el('h3', null, title)); return c; }

  function mount() {
    if (host) return;
    host = document.createElement('div');
    host.id = 'watchdog-extension-panel';
    shadow = host.attachShadow({ mode: 'closed' });
    const style = el('style'); style.textContent = CSS; shadow.appendChild(style);
    document.documentElement.appendChild(host);
  }
  function unmount() { if (host) { host.remove(); host = null; shadow = null; } }

  function shell(address) {
    mount();
    [...shadow.querySelectorAll('.wd')].forEach((n) => n.remove());
    const box = el('section', 'wd'); box.setAttribute('aria-label', 'Watchdog property intelligence');
    const head = el('div', 'head');
    const logo = el('img'); logo.src = chrome.runtime.getURL('icons/icon-32.png'); logo.alt = '';
    const brand = el('div', 'brand'); brand.append(el('b', null, 'Watchdog'), el('small', null, 'NJ property intelligence'));
    const min = el('button', null, '–'); min.setAttribute('aria-label', 'Minimize');
    min.addEventListener('click', () => { const m = box.classList.toggle('min'); min.textContent = m ? '+' : '–'; min.setAttribute('aria-label', m ? 'Expand' : 'Minimize'); });
    const close = el('button', null, '×'); close.setAttribute('aria-label', 'Close for this listing'); close.addEventListener('click', () => { closedFor = address; unmount(); });
    head.append(logo, brand, min, close);
    const body = el('div', 'body');
    box.append(head, body);
    shadow.appendChild(box);
    return body;
  }

  // Same test as the true cost card: is the tax right for this price?
  function priceVerdict(p, price) {
    if (!(price > 0)) return null;
    const pct = p.assessed ? p.assessed / price * 100 : null;
    const limit = p.upper ? Math.min(p.upper, 100) : null;
    if (pct != null && limit && pct > limit) return { tone: 'good', title: 'Assessed high for this price', text: `The assessment is ${pct.toFixed(0)}% of ${money(price)}, above the ${limit.toFixed(0)}% legal limit. A buyer may be able to appeal.` };
    if (p.ratio && p.rate && p.tax) {
      const typical = price * p.ratio / 100 * p.rate / 100, gap = (p.tax_current ? p.tax_current.amount : p.tax) - typical;
      if (gap / typical < -0.15) return { tone: 'warn', title: 'Low tax for this price', text: `Homes that sell near ${money(price)} here usually pay about ${money(typical)}. A town-wide revaluation could move this bill toward that.` };
      if (gap / typical > 0.15) return { tone: '', title: 'On the high side for this price', text: `About ${money(gap)} a year more than homes that sell near ${money(price)} here usually pay.` };
      return { tone: '', title: 'In line for this price', text: `Homes that sell near ${money(price)} here usually pay about ${money(typical)}.` };
    }
    return null;
  }

  function lookup(req, key) {
    chrome.runtime.sendMessage({ type: 'lookup', ...req }, (res) => {
      if (chrome.runtime.lastError) return;
      if (lastKey === key) render(res);
    });
  }

  function render(res) {
    const address = current && current.address;
    const body = shell(address);
    if (!res || !res.ok) {
      const text = res && res.error === 'no_key' ? 'Add your Watchdog key: click the Watchdog icon in your browser toolbar.'
        : res && res.error === 'bad_key' ? 'Your key was replaced or turned off. Add the new one from the Agent Desk.'
        : (res && res.message) || 'Watchdog could not look this up.';
      body.appendChild(el('p', 'msg', text));
      if (res && res.alternatives && res.alternatives.length) body.appendChild(pickList('Did you mean one of these?', res.alternatives));
      return;
    }
    const p = res.property;
    const a = el('div', 'addr'); a.append(el('b', null, p.address), el('span', null, [p.town, `${p.county} County`, p.block ? `Block ${p.block}, Lot ${p.lot}` : ''].filter(Boolean).join(' · ')));
    body.appendChild(a);
    if (!res.confident && res.alternatives && res.alternatives.length) body.appendChild(pickList('Is this the right home? Other matches:', res.alternatives));

    const sc = card('score');
    if (p.score != null) {
      const big = el('div', 'big', String(p.score)); big.appendChild(el('small', null, '/100'));
      const side = el('div'); side.append(el('h3', null, 'Watchdog Score'), el('p', null, p.score_verdict || ''));
      sc.append(big, side);
    } else {
      const side = el('div'); side.append(el('h3', null, 'Watchdog Score'), el('p', null, 'Not scored yet. Open the full page to run it.'));
      sc.appendChild(side);
    }
    body.appendChild(sc);

    const t = card('tax', 'Property tax');
    const yearLabel = p.tax_year ? `${p.tax_year} bill` : 'Latest bill on the state list';
    t.appendChild(el('div', 'lead', money(p.tax)));
    t.appendChild(el('div', 'muted', yearLabel));
    if (p.tax_current) row(t, p.tax_current.general_rate_only ? `${p.tax_current.year} estimate (general rate)` : `${p.tax_current.year} at the new rate`, money(p.tax_current.amount));
    if (p.town_median_tax) row(t, `${p.town} median`, money(p.town_median_tax), true);
    if (p.share_paying_less != null && p.town_peers) t.appendChild(el('p', 'note', p.share_paying_less >= 55 ? `Higher than about ${p.share_paying_less}% of ${p.town_peers.toLocaleString()} similar homes in town.` : p.share_paying_less <= 45 ? `Lower than about ${100 - p.share_paying_less}% of ${p.town_peers.toLocaleString()} similar homes in town.` : 'Close to the middle for similar homes in town.'));
    if (p.rate_trend) t.appendChild(el('p', 'note', `Town tax rate: ${p.rate_trend.per_year_pct >= 0 ? '+' : ''}${p.rate_trend.per_year_pct}% a year since ${p.rate_trend.from_year}.`));
    body.appendChild(t);

    const v = card('value', 'Value check');
    row(v, 'Assessed', money(p.assessed));
    if (p.implied_value) row(v, `Matches a home worth (town ratio ${Math.round(p.ratio)}%)`, money(p.implied_value));
    if (p.assessment_floor) row(v, 'Assessment holds up above', money(p.assessment_floor));
    v.appendChild(el('p', 'note', p.revalued_2026 ? `${p.town} revalued for 2026, so assessments are recent.` : p.ratio && p.ratio < 85 ? `Assessments in ${p.town} are dated (about ${Math.round(p.ratio)}% of market). A revaluation would reset them.` : ''));
    const lbl = el('label', 'price'); const inp = el('input'); inp.inputMode = 'numeric'; inp.placeholder = 'List price'; inp.value = current && current.price ? Math.round(current.price) : '';
    lbl.append(el('span', null, 'Price'), inp); v.appendChild(lbl);
    const vbox = el('div'); v.appendChild(vbox);
    const paint = () => { vbox.replaceChildren(); const r = priceVerdict(p, num(inp.value)); if (r) { const d = el('div', 'verdict ' + r.tone); d.append(el('b', null, r.title), el('span', null, r.text)); vbox.appendChild(d); } };
    inp.addEventListener('input', paint); paint();
    body.appendChild(v);

    const s = card('sales', 'Sales');
    if (p.last_sale) row(s, 'This home last sold', `${money(p.last_sale.price)}${p.last_sale.year ? ` (${p.last_sale.year})` : ''}`);
    if (p.nearby_sales && p.nearby_sales.count) row(s, `Similar sales nearby${p.nearby_sales.since ? ` since ${String(p.nearby_sales.since).slice(0, 4)}` : ''}`, `${p.nearby_sales.count} · median ${money(p.nearby_sales.median)}`, true);
    for (const x of (p.nearby_sales && p.nearby_sales.recent) || []) row(s, x.address, `${money(x.price)}${x.date ? ` · ${String(x.date).slice(0, 7)}` : ''}`, true);
    if (s.childNodes.length > 1) body.appendChild(s);

    const f = p.facts || {};
    const facts = [f.class, f.year_built ? `Built ${f.year_built}` : '', f.units > 1 ? `${f.units} units` : '', f.acres ? `${f.acres} acres` : '', f.building].filter(Boolean);
    if (facts.length) { const h = card('', 'Home'); h.appendChild(el('p', 'note', facts.join(' · '))); body.appendChild(h); }

    const links = el('div', 'links');
    const price = num(inp.value);
    const a1 = el('a', 'dark', 'True cost card'); a1.href = p.links.true_cost + (price ? `&price=${Math.round(price)}` : ''); a1.target = '_blank'; a1.rel = 'noopener';
    inp.addEventListener('input', () => { const pr = num(inp.value); a1.href = p.links.true_cost + (pr ? `&price=${Math.round(pr)}` : ''); });
    const a2 = el('a', null, 'Tax checkup'); a2.href = p.links.checkup; a2.target = '_blank'; a2.rel = 'noopener';
    const a3 = el('a', null, 'Full page'); a3.href = p.links.property; a3.target = '_blank'; a3.rel = 'noopener';
    links.append(a1, a2, a3);
    body.appendChild(links);
  }

  function pickList(title, alts) {
    const c = card('check', null);
    c.appendChild(el('b', null, title));
    for (const x of alts) {
      const b = el('button'); b.append(el('span', null, x.address), el('small', null, x.town));
      b.addEventListener('click', () => { render({ ok: false, message: 'Looking up the tax record…' }); lookup({ pin: x.pin }, lastKey); });
      c.appendChild(b);
    }
    return c;
  }

  function check() {
    const l = listing();
    const key = l ? l.address + '|' + location.pathname : '';
    if (key === lastKey) return;
    lastKey = key;
    current = l;
    if (!l) { unmount(); return; }
    if (closedFor === l.address) return;
    render({ ok: false, message: 'Looking up the tax record…' });
    lookup({ address: l.address, lat: l.lat, lon: l.lon }, key);
  }

  check();
  // Listing sites change pages without a full reload.
  setInterval(check, 1500);
})();
