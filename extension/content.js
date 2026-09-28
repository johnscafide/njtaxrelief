// Watchdog panel for New Jersey listing pages on Zillow, Realtor.com and Redfin.
// Reads only the address of the listing being viewed (page title or URL),
// asks Watchdog for that one property and shows a small panel. Nothing else on
// the page is read or changed.
(() => {
  'use strict';
  if (window.__watchdogPanel) return;
  window.__watchdogPanel = true;

  const money = (v) => (v == null || !isFinite(v) ? 'n/a' : '$' + Math.round(v).toLocaleString('en-US'));
  const words = (s) => String(s || '').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();

  function onDetailPage() {
    const h = location.hostname, p = location.pathname;
    if (/(^|\.)zillow\.com$/.test(h)) return p.startsWith('/homedetails/');
    if (/(^|\.)realtor\.com$/.test(h)) return p.startsWith('/realestateandhomes-detail/');
    if (/(^|\.)redfin\.com$/.test(h)) return /^\/NJ\/[^/]+\/[^/]+\/home\/\d+/i.test(p);
    return false;
  }

  // "102 Grant Ave, Harrison, NJ 07029" from the title, else from the URL.
  function listingAddress() {
    if (!onDetailPage()) return null;
    const og = document.querySelector('meta[property="og:title"]');
    for (const t of [og && og.content, document.title]) {
      const m = String(t || '').match(/(\d+[A-Za-z]?(?:-\d+[A-Za-z]?)?\s+[^,|]+?),\s*([^,|]+?),\s*NJ\b/);
      if (m) return `${m[1].trim()}, ${m[2].trim()}, NJ`;
    }
    const seg = location.pathname.split('/').filter(Boolean);
    if (/zillow/.test(location.hostname) && seg[1]) {
      const m = seg[1].match(/^(\d.*?)-([A-Za-z-]+)-NJ-\d{5}$/);
      if (m) return words(m[1]) + ' ' + words(m[2]) + ' NJ';
    }
    if (/realtor/.test(location.hostname) && seg[1]) {
      const parts = seg[1].split('_');
      if (parts[2] === 'NJ' && /^\d/.test(parts[0])) return `${words(parts[0])}, ${words(parts[1])}, NJ`;
    }
    if (/redfin/.test(location.hostname) && seg[0] === 'NJ' && seg[2]) {
      return `${words(seg[2].replace(/-\d{5}$/, ''))}, ${words(seg[1])}, NJ`;
    }
    return null;
  }

  const CSS = `
  :host{all:initial}
  .wd{position:fixed;right:16px;bottom:16px;z-index:2147483646;width:320px;max-width:calc(100vw - 32px);font:14px/1.45 -apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#0e2248;background:#fbfaf7;border:1px solid #e3dfd6;border-radius:18px;box-shadow:0 12px 32px rgba(14,34,72,.18);overflow:hidden}
  .wd.min .body{display:none}
  .head{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#0e2248;color:#fff}
  .head b{flex:1;font-size:15px}
  .head button{all:unset;cursor:pointer;min-width:32px;min-height:32px;display:grid;place-content:center;border-radius:8px;color:#fff;font-size:16px}
  .head button:focus-visible,a:focus-visible{outline:2px solid #b8972a;outline-offset:2px}
  .body{padding:12px 14px 14px}
  .addr{font-weight:700;font-size:15px}
  .town{color:#5d6877;font-size:13px;margin-bottom:10px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;margin-bottom:10px}
  .grid div{display:grid}
  .grid b{font-size:17px}
  .grid span{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:#5d6877}
  .note{margin:0 0 10px;font-size:13px;color:#142033}
  .links{display:flex;flex-wrap:wrap;gap:6px}
  .links a{display:inline-flex;align-items:center;min-height:36px;padding:0 12px;border-radius:999px;border:1px solid #e3dfd6;background:#fff;color:#0e2248;text-decoration:none;font-weight:600;font-size:13px}
  .links a.dark{background:#0e2248;border-color:#0e2248;color:#fff}
  .msg{color:#5d6877;font-size:13px;margin:0}
  `;

  let host = null, shadow = null, lastKey = '', closedFor = '';

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

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
    const box = el('section', 'wd'); box.setAttribute('aria-label', 'Watchdog property tax');
    const head = el('div', 'head');
    head.appendChild(el('b', null, 'Watchdog'));
    const min = el('button', null, '–'); min.setAttribute('aria-label', 'Minimize'); min.addEventListener('click', () => { box.classList.toggle('min'); min.textContent = box.classList.contains('min') ? '+' : '–'; min.setAttribute('aria-label', box.classList.contains('min') ? 'Expand' : 'Minimize'); });
    const close = el('button', null, '×'); close.setAttribute('aria-label', 'Close for this listing'); close.addEventListener('click', () => { closedFor = address; unmount(); });
    head.append(min, close);
    const body = el('div', 'body');
    box.append(head, body);
    shadow.appendChild(box);
    return body;
  }

  function stat(grid, value, label) { const d = el('div'); d.append(el('b', null, value), el('span', null, label)); grid.appendChild(d); }
  function link(wrap, href, text, dark) { const a = el('a', dark ? 'dark' : '', text); a.href = href; a.target = '_blank'; a.rel = 'noopener'; wrap.appendChild(a); }

  function render(address, res) {
    const body = shell(address);
    if (!res || !res.ok) {
      const text = res && res.error === 'no_key' ? 'Add your Watchdog key: click the Watchdog icon in your browser toolbar.'
        : res && res.error === 'bad_key' ? 'Your key was replaced or turned off. Add the new one from the Agent Desk.'
        : (res && res.message) || 'Watchdog could not look this up.';
      body.appendChild(el('p', 'msg', text));
      return;
    }
    const p = res.property;
    body.append(el('div', 'addr', p.address), el('div', 'town', `${p.town} · ${p.county} County`));
    const grid = el('div', 'grid');
    stat(grid, money(p.tax), 'Annual tax');
    stat(grid, money(p.assessed), 'Assessed');
    stat(grid, p.score != null ? `${p.score}/100` : 'n/a', 'Watchdog Score');
    stat(grid, money(p.town_median_tax), 'Town median tax');
    body.appendChild(grid);
    if (p.assessment_floor) body.appendChild(el('p', 'note', `The assessment holds up if the home is worth at least ${money(p.assessment_floor)}. Below that, the owner may have an appeal.`));
    const links = el('div', 'links');
    link(links, p.links.true_cost, 'True cost card', true);
    link(links, p.links.checkup, 'Tax checkup');
    link(links, p.links.property, 'Full page');
    body.appendChild(links);
  }

  function check() {
    const address = listingAddress();
    const key = address ? address + '|' + location.pathname : '';
    if (key === lastKey) return;
    lastKey = key;
    if (!address) { unmount(); return; }
    if (closedFor === address) return;
    render(address, { ok: false, message: 'Looking up the tax record…' });
    chrome.runtime.sendMessage({ type: 'lookup', address }, (res) => {
      if (chrome.runtime.lastError) return;
      if (lastKey === key) render(address, res);
    });
  }

  check();
  // Listing sites change pages without a full reload.
  setInterval(check, 1500);
})();
