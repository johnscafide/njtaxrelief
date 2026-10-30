/* Link Pages: one shared file for checking and drawing a link page.
   - Backoffice (/backoffice/link-pages) uses it in the browser for the live preview.
   - api/watchdog-link-pages.js uses cleanPage() before saving.
   - api/link-page.js uses renderPage() for the public page at /links/<slug>.
   Everything a person types goes through esc() or a URL check before it is drawn. */
(function(root, factory){
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WatchdogLinkPage = api;
})(typeof self !== 'undefined' ? self : this, function(){
'use strict';

const ORIGIN = 'https://www.watchdogindex.com';
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const COLOR = /^#[0-9a-f]{6}$/i;
const ID = /^[a-z0-9]{1,12}$/;
const MAX_BLOCKS = 40;
const MAX_SOCIALS = 12;
const BLOCK_TYPES = ['link', 'heading', 'text', 'photo', 'countdown'];

// Social icons use the Font Awesome brand set the site already loads from cdnjs.
const NETWORKS = {
  instagram: { label: 'Instagram', icon: 'fa-instagram', url: (h) => `https://www.instagram.com/${h}` },
  tiktok: { label: 'TikTok', icon: 'fa-tiktok', url: (h) => `https://www.tiktok.com/@${h}` },
  facebook: { label: 'Facebook', icon: 'fa-facebook', url: (h) => `https://www.facebook.com/${h}` },
  youtube: { label: 'YouTube', icon: 'fa-youtube', url: (h) => `https://www.youtube.com/@${h}` },
  threads: { label: 'Threads', icon: 'fa-threads', url: (h) => `https://www.threads.net/@${h}` },
  x: { label: 'X', icon: 'fa-x-twitter', url: (h) => `https://x.com/${h}` },
  linkedin: { label: 'LinkedIn', icon: 'fa-linkedin', url: (h) => `https://www.linkedin.com/in/${h}` },
  pinterest: { label: 'Pinterest', icon: 'fa-pinterest', url: (h) => `https://www.pinterest.com/${h}` },
  snapchat: { label: 'Snapchat', icon: 'fa-snapchat', url: (h) => `https://www.snapchat.com/add/${h}` },
  spotify: { label: 'Spotify', icon: 'fa-spotify', url: null },
  website: { label: 'Website', icon: '', url: null }
};

const FONTS = {
  plex: { label: 'Plex (like John’s page)', head: "'IBM Plex Serif', Georgia, serif", body: "'IBM Plex Sans', system-ui, sans-serif", css: 'family=IBM+Plex+Serif:wght@500;600&family=IBM+Plex+Sans:wght@400;500;600' },
  franklin: { label: 'Franklin', head: "'Libre Franklin', system-ui, sans-serif", body: "'Libre Franklin', system-ui, sans-serif", css: 'family=Libre+Franklin:wght@400;500;600;700' },
  lora: { label: 'Lora', head: "'Lora', Georgia, serif", body: "'Libre Franklin', system-ui, sans-serif", css: 'family=Lora:wght@500;600&family=Libre+Franklin:wght@400;500;600' },
  cormorant: { label: 'Cormorant', head: "'Cormorant Garamond', Georgia, serif", body: "'Libre Franklin', system-ui, sans-serif", css: 'family=Cormorant+Garamond:wght@600;700&family=Libre+Franklin:wght@400;500;600' },
  archivo: { label: 'Archivo', head: "'Archivo', system-ui, sans-serif", body: "'Archivo', system-ui, sans-serif", css: 'family=Archivo:wght@400;500;600;700' },
  bitter: { label: 'Bitter', head: "'Bitter', Georgia, serif", body: "'Source Sans 3', system-ui, sans-serif", css: 'family=Bitter:wght@500;600&family=Source+Sans+3:wght@400;500;600' },
  caveat: { label: 'Handwritten name', head: "'Caveat', cursive", body: "'Libre Franklin', system-ui, sans-serif", css: 'family=Caveat:wght@600;700&family=Libre+Franklin:wght@400;500;600' },
  system: { label: 'Phone’s own font', head: 'system-ui, -apple-system, sans-serif', body: 'system-ui, -apple-system, sans-serif', css: '' }
};

const PRESETS = {
  navy: { label: 'Navy', bg: '#0b1b33', bg2: '#16345c', text: '#f4f0e6', button: '#1b3a5f', button_text: '#f4f0e6', accent: '#d9ae3b', font: 'plex', button_style: 'fill', corners: 'rounded' },
  paper: { label: 'Paper', bg: '#f4f0e6', bg2: '', text: '#1f2937', button: '#0b1b33', button_text: '#ffffff', accent: '#c1462c', font: 'lora', button_style: 'fill', corners: 'rounded' },
  blush: { label: 'Blush', bg: '#f8e8e4', bg2: '#f3d5cf', text: '#3b2a2a', button: '#ffffff', button_text: '#3b2a2a', accent: '#b5536b', font: 'cormorant', button_style: 'fill', corners: 'round' },
  sage: { label: 'Sage', bg: '#e7ede4', bg2: '', text: '#1f3324', button: '#2f4f3a', button_text: '#f5f5ef', accent: '#2f4f3a', font: 'franklin', button_style: 'fill', corners: 'square' },
  coastal: { label: 'Coastal', bg: '#dcebf2', bg2: '#f7fbfc', text: '#12324a', button: '#12324a', button_text: '#ffffff', accent: '#1f8a74', font: 'bitter', button_style: 'outline', corners: 'rounded' },
  black: { label: 'Black', bg: '#111111', bg2: '', text: '#f5f5f5', button: '#f5f5f5', button_text: '#111111', accent: '#e2694b', font: 'archivo', button_style: 'fill', corners: 'square' }
};
const BUTTON_STYLES = ['fill', 'outline', 'soft'];
const CORNERS = { square: '4px', rounded: '12px', round: '26px' };
const PHOTO_SHAPES = ['circle', 'rounded', 'square'];
const RINGS = ['none', 'accent', 'gradient'];

function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function text(v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n); }
function longText(v, n) { return String(v == null ? '' : v).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, n); }
// Em dashes are never shown on the site; typed ones become a comma.
function noDash(s) { return String(s).replace(/\s*—\s*/g, ', '); }
function color(v, fallback) { const s = String(v || '').trim(); return COLOR.test(s) ? s.toLowerCase() : fallback; }
function pick(v, list, fallback) { return list.includes(v) ? v : fallback; }

// Only web links. Phone, email and text links are left out on purpose (site contact rule).
function cleanUrl(v) {
  let s = String(v == null ? '' : v).trim().slice(0, 500);
  if (!s) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) {
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$|\?|#|:\d)/i.test(s) && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(s)) return '';
    s = 'https://' + s.replace(/^\/+/, '');
  }
  let u;
  try { u = new URL(s); } catch (_) { return ''; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
  if (!u.hostname || !u.hostname.includes('.') || u.username || u.password) return '';
  return u.href;
}

function socialUrl(network, value) {
  const n = NETWORKS[network];
  const raw = String(value == null ? '' : value).trim();
  if (!n || !raw) return '';
  const handle = raw.replace(/^@+/, '');
  if (n.url && !/[/:]/.test(raw) && /^[A-Za-z0-9._-]{1,60}$/.test(handle)) return n.url(handle);
  return cleanUrl(raw);
}

function newId() { return Math.random().toString(36).slice(2, 10) || 'b' + Date.now().toString(36); }

function blankPage(name) {
  const p = PRESETS.navy;
  return {
    profile: { name: text(name, 80), bio: '', photo: '', photo_shape: 'circle', ring: 'gradient', verified: false },
    blocks: [{ id: newId(), type: 'link', label: '', tag: '', url: '', image: '', featured: true, hidden: false }],
    socials: [{ id: newId(), network: 'instagram', url: '' }],
    social_spot: 'top',
    theme: Object.assign({ preset: 'navy', bg_image: '', bg_dim: 40 }, stripLabel(p)),
    footer: ''
  };
}
function stripLabel(p) { const o = Object.assign({}, p); delete o.label; return o; }

// Checks and trims a whole page. photoOk(url) says whether an uploaded image URL is ours.
// Returns { page, errors } where errors are short, plain sentences.
function cleanPage(input, photoOk) {
  const okPhoto = typeof photoOk === 'function' ? photoOk : () => false;
  const src = input && typeof input === 'object' ? input : {};
  const errors = [];
  const pr = src.profile && typeof src.profile === 'object' ? src.profile : {};
  const profile = {
    name: noDash(text(pr.name, 80)),
    bio: noDash(longText(pr.bio, 240)),
    photo: okPhoto(pr.photo) ? String(pr.photo) : '',
    photo_shape: pick(pr.photo_shape, PHOTO_SHAPES, 'circle'),
    ring: pick(pr.ring, RINGS, 'none'),
    verified: pr.verified === true
  };
  if (!profile.name) errors.push('Add your name.');

  const seen = new Set();
  const uid = (v) => { let id = ID.test(String(v || '')) ? String(v) : newId(); while (seen.has(id)) id = newId(); seen.add(id); return id; };
  const blocks = [];
  (Array.isArray(src.blocks) ? src.blocks : []).slice(0, MAX_BLOCKS).forEach((b, i) => {
    if (!b || !BLOCK_TYPES.includes(b.type)) return;
    const base = { id: uid(b.id), type: b.type, hidden: b.hidden === true };
    if (b.type === 'link') {
      const label = noDash(text(b.label, 80));
      const url = cleanUrl(b.url);
      if (!label && !String(b.url || '').trim()) return;
      if (!label) errors.push(`Link ${i + 1} needs a title.`);
      if (!url) errors.push(`Check the web address for “${label || `link ${i + 1}`}”. It needs to be a website link.`);
      blocks.push(Object.assign(base, { label, tag: noDash(text(b.tag, 40)), url, image: okPhoto(b.image) ? String(b.image) : '', featured: b.featured === true }));
    } else if (b.type === 'heading') {
      const t = noDash(text(b.text, 80));
      if (t) blocks.push(Object.assign(base, { text: t }));
    } else if (b.type === 'text') {
      const t = noDash(longText(b.text, 500));
      if (t) blocks.push(Object.assign(base, { text: t }));
    } else if (b.type === 'photo') {
      if (!okPhoto(b.image)) return;
      const url = String(b.url || '').trim() ? cleanUrl(b.url) : '';
      if (String(b.url || '').trim() && !url) errors.push('Check the web address on your photo. It needs to be a website link.');
      blocks.push(Object.assign(base, { image: String(b.image), url, alt: noDash(text(b.alt, 120)) }));
    } else if (b.type === 'countdown') {
      const date = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(b.date || '')) ? String(b.date) : '';
      const title = noDash(text(b.title, 80));
      if (!date) { if (title) errors.push(`Pick a date for “${title}”.`); return; }
      blocks.push(Object.assign(base, { title, date }));
    }
  });

  const socials = [];
  (Array.isArray(src.socials) ? src.socials : []).slice(0, MAX_SOCIALS).forEach((s) => {
    if (!s || !NETWORKS[s.network] || !String(s.url || '').trim()) return;
    const url = socialUrl(s.network, s.url);
    if (!url) { errors.push(`Check your ${NETWORKS[s.network].label} link.`); return; }
    socials.push({ id: uid(s.id), network: s.network, url });
  });

  const t = src.theme && typeof src.theme === 'object' ? src.theme : {};
  const base = PRESETS[t.preset] || PRESETS.navy;
  const theme = {
    preset: PRESETS[t.preset] ? t.preset : 'custom',
    bg: color(t.bg, base.bg),
    bg2: t.bg2 === '' ? '' : color(t.bg2, ''),
    bg_image: okPhoto(t.bg_image) ? String(t.bg_image) : '',
    bg_dim: Math.max(0, Math.min(80, Math.round(Number(t.bg_dim)) || 0)),
    text: color(t.text, base.text),
    button: color(t.button, base.button),
    button_text: color(t.button_text, base.button_text),
    accent: color(t.accent, base.accent),
    font: FONTS[t.font] ? t.font : base.font,
    button_style: pick(t.button_style, BUTTON_STYLES, 'fill'),
    corners: CORNERS[t.corners] ? t.corners : 'rounded'
  };

  return {
    page: { profile, blocks, socials, social_spot: src.social_spot === 'bottom' ? 'bottom' : 'top', theme, footer: noDash(longText(src.footer, 300)) },
    errors
  };
}

// ---------- drawing ----------
function rgba(hex, a) {
  const n = parseInt(String(hex).slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function lines(s) { return esc(s).replace(/\n/g, '<br>'); }
// Countdown dates are typed as New Jersey time.
function njTime(local) {
  const [d, t] = String(local).split('T');
  const [y, m, day] = d.split('-').map(Number);
  const [h, min] = t.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, day, h, min);
  // Eastern time is UTC-4 from the second Sunday of March to the first Sunday of November.
  const nthSunday = (month, n) => { const first = new Date(Date.UTC(y, month, 1)).getUTCDay(); return 1 + ((7 - first) % 7) + (n - 1) * 7; };
  const start = Date.UTC(y, 2, nthSunday(2, 2), 7), end = Date.UTC(y, 10, nthSunday(10, 1), 6);
  const offset = guess + 5 * 3600e3 >= start && guess + 4 * 3600e3 < end ? 4 : 5;
  return guess + offset * 3600e3;
}

const GLOBE = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/></svg>';
const CHECK = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

function css(theme) {
  const f = FONTS[theme.font] || FONTS.plex;
  const r = CORNERS[theme.corners] || CORNERS.rounded;
  const bg = theme.bg2 ? `linear-gradient(180deg,${theme.bg} 0%,${theme.bg2} 100%)` : theme.bg;
  const btn = theme.button_style === 'outline'
    ? `background:transparent;color:${theme.text};border:2px solid ${theme.button}`
    : theme.button_style === 'soft'
      ? `background:${rgba(theme.button, 0.16)};color:${theme.text};border:2px solid transparent`
      : `background:${theme.button};color:${theme.button_text};border:2px solid ${theme.button}`;
  return `*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-text-size-adjust:100%}
body{min-height:100vh;background:${bg};background-color:${theme.bg};color:${theme.text};font-family:${f.body};font-size:16px;line-height:1.45;-webkit-font-smoothing:antialiased}
.lp-bg{position:fixed;inset:0;z-index:-1;background:linear-gradient(${rgba('#000000', theme.bg_dim / 100)},${rgba('#000000', theme.bg_dim / 100)}),var(--lp-photo) center/cover no-repeat}
.lp{width:100%;max-width:480px;margin:0 auto;padding:44px 16px 36px}
.lp-head{text-align:center;margin-bottom:22px}
.lp-photo{position:relative;width:104px;height:104px;margin:0 auto 14px}
.lp-photo img{display:block;width:100%;height:100%;object-fit:cover;background:${rgba(theme.text, 0.1)}}
.lp-photo.circle img{border-radius:50%}.lp-photo.rounded img{border-radius:22px}.lp-photo.square img{border-radius:4px}
.lp-photo.ring-accent img,.lp-photo.ring-gradient img{border:3px solid ${theme.bg}}
.lp-photo.ring-accent{padding:3px;background:${theme.accent}}
.lp-photo.ring-gradient{padding:3px;background:conic-gradient(from 0deg,${theme.accent},${theme.button},${theme.text},${theme.accent})}
.lp-photo.circle.ring-accent,.lp-photo.circle.ring-gradient{border-radius:50%}.lp-photo.rounded.ring-accent,.lp-photo.rounded.ring-gradient{border-radius:25px}.lp-photo.square.ring-accent,.lp-photo.square.ring-gradient{border-radius:6px}
.lp-check{position:absolute;right:2px;bottom:4px;display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:${theme.accent};color:${theme.bg};border:2px solid ${theme.bg}}
.lp h1{font-family:${f.head};font-weight:600;font-size:${theme.font === 'caveat' ? '40px' : '27px'};line-height:1.15;letter-spacing:-.01em;overflow-wrap:anywhere}
.lp-bio{margin:8px auto 0;max-width:380px;font-size:15px;opacity:.82;overflow-wrap:anywhere}
.lp-social{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin:16px 0 0;list-style:none}
.lp-social a{display:grid;place-items:center;width:44px;height:44px;border-radius:50%;color:${theme.text};font-size:22px;text-decoration:none}
.lp-social a:hover{background:${rgba(theme.text, 0.1)}}
.lp-blocks{display:grid;gap:12px}
.lp-link{display:flex;align-items:center;gap:12px;min-height:58px;padding:10px 18px;border-radius:${r};${btn};text-decoration:none;transition:transform .12s ease}
.lp-link:hover{transform:translateY(-1px)}
.lp-link:focus-visible,.lp-social a:focus-visible,.lp-pic a:focus-visible{outline:3px solid ${theme.accent};outline-offset:3px}
.lp-link img{flex:0 0 auto;width:44px;height:44px;margin-left:-8px;border-radius:calc(${r} - 4px);object-fit:cover}
.lp-link span{flex:1;min-width:0;text-align:center}
.lp-link.has-img span{text-align:left}
.lp-link small{display:block;font-size:12px;font-weight:600;opacity:.75;letter-spacing:.01em}
.lp-link b{display:block;font-weight:600;font-size:16px;line-height:1.3;overflow-wrap:anywhere}
.lp-link.is-featured{min-height:66px;background:${theme.accent};border-color:${theme.accent};color:${theme.bg}}
.lp-h{margin:14px 0 0;text-align:center;font-family:${f.head};font-weight:600;font-size:${theme.font === 'caveat' ? '28px' : '19px'}}
.lp-text{text-align:center;font-size:15px;opacity:.85;overflow-wrap:anywhere}
.lp-pic img{display:block;width:100%;height:auto;border-radius:${r}}
.lp-count{padding:16px;border-radius:${r};border:2px solid ${theme.accent};text-align:center}
.lp-count p{font-weight:600}
.lp-clock{display:flex;justify-content:center;gap:14px;margin-top:8px;font-variant-numeric:tabular-nums}
.lp-clock span{display:grid;font:600 26px/1 ${f.body}}
.lp-clock small{margin-top:4px;font-size:11px;font-weight:500;opacity:.75}
.lp-foot{margin-top:30px;text-align:center;font-size:12px;opacity:.7;overflow-wrap:anywhere}
@media (prefers-reduced-motion:reduce){.lp-link{transition:none}.lp-link:hover{transform:none}}`;
}

function socialList(page, preview) {
  if (!page.socials.length) return '';
  const target = preview ? ' target="_blank"' : '';
  return `<ul class="lp-social">${page.socials.map((s) => {
    const n = NETWORKS[s.network];
    const icon = n.icon ? `<i class="fa-brands ${n.icon}" aria-hidden="true"></i>` : GLOBE;
    return `<li><a href="${esc(s.url)}" rel="noopener me"${target} data-i="${esc(s.id)}" aria-label="${esc(n.label)}">${icon}</a></li>`;
  }).join('')}</ul>`;
}

function block(b, preview, now) {
  const target = preview ? ' target="_blank"' : '';
  if (b.type === 'link') {
    return `<a class="lp-link${b.featured ? ' is-featured' : ''}${b.image ? ' has-img' : ''}" href="${esc(b.url)}" rel="noopener"${target} data-i="${esc(b.id)}">${b.image ? `<img src="${esc(b.image)}" alt="" loading="lazy">` : ''}<span>${b.tag ? `<small>${esc(b.tag)}</small>` : ''}<b>${esc(b.label)}</b></span></a>`;
  }
  if (b.type === 'heading') return `<h2 class="lp-h">${esc(b.text)}</h2>`;
  if (b.type === 'text') return `<p class="lp-text">${lines(b.text)}</p>`;
  if (b.type === 'photo') {
    const img = `<img src="${esc(b.image)}" alt="${esc(b.alt)}" loading="lazy">`;
    return `<div class="lp-pic">${b.url ? `<a href="${esc(b.url)}" rel="noopener"${target} data-i="${esc(b.id)}">${img}</a>` : img}</div>`;
  }
  if (b.type === 'countdown') {
    const at = njTime(b.date);
    if (at <= now) return '';
    return `<div class="lp-count" data-at="${at}">${b.title ? `<p>${esc(b.title)}</p>` : ''}<div class="lp-clock" aria-label="Time left"><span data-u="d">00<small>days</small></span><span data-u="h">00<small>hrs</small></span><span data-u="m">00<small>min</small></span><span data-u="s">00<small>sec</small></span></div></div>`;
  }
  return '';
}

const PAGE_JS = `(function(){
function pad(n){return String(n).padStart(2,'0')}
var boxes=[].slice.call(document.querySelectorAll('.lp-count'));
function tick(){var now=Date.now();boxes.forEach(function(b){var left=Number(b.getAttribute('data-at'))-now;if(left<=0){b.remove();return}var s=Math.floor(left/1000);var v={d:Math.floor(s/86400),h:Math.floor(s/3600)%24,m:Math.floor(s/60)%60,s:s%60};b.querySelectorAll('[data-u]').forEach(function(el){el.firstChild.nodeValue=pad(v[el.getAttribute('data-u')])})})}
clearInterval(window.lpTick);if(boxes.length){tick();window.lpTick=setInterval(tick,1000)}
var slug=document.body.getAttribute('data-slug');if(!slug)return;
function hit(item){try{var body=JSON.stringify({slug:slug,item:item||''});if(navigator.sendBeacon)navigator.sendBeacon('/api/link-page',new Blob([body],{type:'text/plain'}));else fetch('/api/link-page',{method:'POST',body:body,keepalive:true})}catch(_){}}
hit('');
document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[data-i]');if(a)hit(a.getAttribute('data-i'))});
})();`;

// opts: { slug, preview, story (John's comment block, public pages only), now }
function renderPage(page, opts) {
  const o = opts || {};
  const p = page;
  const now = o.now || Date.now();
  const f = FONTS[p.theme.font] || FONTS.plex;
  const url = o.slug ? `${ORIGIN}/links/${o.slug}` : '';
  const title = `${p.profile.name || 'Links'} | Links`;
  const desc = p.profile.bio || `Links from ${p.profile.name}`;
  const fontLink = f.css ? `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?${f.css}&display=swap">` : '';
  const iconCss = p.socials.some((s) => NETWORKS[s.network].icon) ? '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/fontawesome.min.css"><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/brands.min.css">' : '';
  const meta = o.preview ? '' : `<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="profile">
<meta property="og:title" content="${esc(p.profile.name)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
${p.profile.photo ? `<meta property="og:image" content="${esc(p.profile.photo)}">\n` : ''}<meta name="twitter:card" content="summary">
<link rel="icon" href="/favicon.ico" sizes="any">
<script src="/property/js/watchdog-consent.js" defer></script>
<script src="/property/js/product-analytics.js" defer></script>
`;
  const photo = p.profile.photo
    ? `<div class="lp-photo ${esc(p.profile.photo_shape)}${p.profile.ring !== 'none' ? ' ring-' + esc(p.profile.ring) : ''}"><img src="${esc(p.profile.photo)}" alt="${esc(p.profile.name)}">${p.profile.verified ? `<span class="lp-check" title="Verified">${CHECK}</span>` : ''}</div>`
    : '';
  const shown = p.blocks.filter((b) => !b.hidden).map((b) => block(b, o.preview, now)).filter(Boolean).join('\n');
  const socials = socialList(p, o.preview);
  return `<!doctype html>
${o.story || ''}<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="${esc(p.theme.bg)}">
${meta}${fontLink}${iconCss}
<style>${css(p.theme)}</style>
</head>
<body${o.preview ? '' : ` data-slug="${esc(o.slug)}"`}${p.theme.bg_image ? ` style="--lp-photo:url('${esc(p.theme.bg_image)}')"` : ''}>
${p.theme.bg_image ? '<div class="lp-bg" aria-hidden="true"></div>\n' : ''}<main class="lp">
<header class="lp-head">${photo}<h1>${esc(p.profile.name)}</h1>${p.profile.bio ? `<p class="lp-bio">${lines(p.profile.bio)}</p>` : ''}${p.social_spot === 'top' ? socials : ''}</header>
<div class="lp-blocks">
${shown}
</div>
${p.social_spot === 'bottom' ? socials : ''}${p.footer ? `<p class="lp-foot">${lines(p.footer)}</p>` : ''}
</main>
<script>${PAGE_JS}</script>
</body>
</html>`;
}

return { ORIGIN, SLUG, NETWORKS, FONTS, PRESETS, CORNERS, BUTTON_STYLES, PHOTO_SHAPES, RINGS, MAX_BLOCKS, MAX_SOCIALS, cleanPage, cleanUrl, socialUrl, renderPage, blankPage, newId, esc, njTime, stripLabel };
});
