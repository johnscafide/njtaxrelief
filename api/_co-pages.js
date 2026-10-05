// HTML for the /co town pages, county pages, client checklists and the embedded lookup.
// Served by api/co-town-page.js and api/co-embed-page.js (middleware.js routes the clean URLs).
// The look matches /co: same logo, search box and facts layout (co/co.css); the browser side is
// co/co-search.js (search box) and co/co-town.js (share, votes, corrections, measurement).
const T = require('./_co-town');
const TAX = require('./_tax-town');

const { ORIGIN, SHARE_IMAGE, esc, countyLabel, fmtDate, STATUS } = T;
const LOGO = '/property/branding/watchdog-logo-horizontal.svg';
const MARK = '/property/branding/watchdog-mark.svg';
const ASSET_V = '20261004c';
// Tip line at the bottom of town pages.
const TIP_URL = 'https://account.venmo.com/u/John-Scafide';

// Inline icons, so the buttons never depend on an icon font loading.
function svg(d, fill) { return `<svg class="ic" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">${fill ? `<path fill="currentColor" d="${d}"/>` : `<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="${d}"/>`}</svg>`; }
const ICON = {
  share: svg('M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7'),
  link: svg('M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5'),
  text: svg('M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z'),
  facebook: svg('M14 8h3V4h-3c-2.8 0-4.5 1.8-4.5 4.6V11H7v4h2.5v7h4v-7h3l.5-4h-3.5V9c0-.6.4-1 1-1z', true),
  linkedin: svg('M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9.5h4V21H3zM9.5 9.5h3.8v1.6h.1c.5-1 1.8-2 3.8-2 4 0 4.8 2.6 4.8 6V21h-4v-5.1c0-1.2 0-2.8-1.7-2.8s-2 1.3-2 2.7V21h-4z', true),
  print: svg('M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z'),
  copy: svg('M9 9h11v11H9zM5 15H4V4h11v1'),
  back: svg('M19 12H5m0 0l6-6m-6 6l6 6'),
  up: svg('M12 4l7.5 8.5H15V20H9v-7.5H4.5z'),
  down: svg('M12 20l-7.5-8.5H9V4h6v7.5h4.5z')
};

// ---------- small pieces ----------
function feeTable(fees) {
  if (!fees.length) return '';
  return '<table class="fees"><tbody>' + fees.map((f) => `<tr><td>${esc(f.label)}</td><td class="amt">${esc(f.amount)}</td></tr>`).join('') + '</tbody></table>';
}
function links(applyUrl, pageUrl) {
  let h = '';
  if (applyUrl) h += `<a class="primary" href="${esc(applyUrl)}" target="_blank" rel="noopener">Application</a>`;
  if (pageUrl) h += `<a href="${esc(pageUrl)}" target="_blank" rel="noopener">Official page</a>`;
  return h ? `<div class="links">${h}</div>` : '';
}
function items(list) { return list.length ? '<ul class="items">' + list.map((x) => `<li>${esc(x)}</li>`).join('') + '</ul>' : ''; }
function fact(label, html) { return html ? `<dt>${label}</dt><dd>${html}</dd>` : ''; }
function shareUrl(t, medium, content) {
  const q = new URLSearchParams({ utm_source: 'share', utm_medium: medium, utm_campaign: 'co_town' });
  if (content) q.set('utm_content', content);
  return `${ORIGIN}${t.path}?${q}`;
}

// The same facts /co shows for a town.
function facts(d) {
  const co = d.co, fire = d.fire;
  const st = STATUS[co.status];
  let html = `<div class="cols"><section class="part"><h2>Certificate of Occupancy</h2><span class="status ${st[0]}">${st[1]}</span>` +
    (co.status === 'not_found' ? '<div><button class="add" type="button" data-add>Add CO Requirements</button></div>' : '') +
    '<dl class="facts">' +
    fact('Certificate', esc(co.name)) +
    fact('Issued by', esc(co.issued_by)) +
    fact('Requirements', items(co.requirements)) +
    fact('Fees', feeTable(co.fees)) +
    fact('Timing', esc(co.lead_time)) +
    fact('Valid for', esc(co.valid_for)) +
    fact('Phone', esc(co.phone)) +
    '</dl>' + links(co.application_url, co.department_url) + '</section>';

  html += '<section class="part"><h2>Smoke and CO alarm certificate</h2><span class="status req">Required</span><dl class="facts">' +
    fact('Requirements', items(fire.requirements)) + '</dl>';
  fire.authorities.forEach((a) => {
    html += `<div class="authority"><h3>${esc(a.name)}</h3>` +
      (a.area_served && fire.authorities.length > 1 ? `<p class="sub">${esc(a.area_served)}</p>` : '') +
      '<dl class="facts">' + fact('Fees', feeTable(a.fees)) + fact('Timing', esc(a.lead_time)) + fact('Phone', esc(a.phone)) + '</dl>' +
      links(a.application_url, a.department_url) + '</div>';
  });
  html += '</section></div>';

  const when = fmtDate(d.checked_at);
  html += '<div class="fine">' + (when ? `Last checked ${esc(when)}` : '') +
    (d.sources.length ? '<details><summary>Sources</summary><ol>' + d.sources.map((u) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a></li>`).join('') + '</ol></details>' : '') +
    '</div>';
  return html;
}

function shareRow(t, embed) {
  const content = embed ? 'embed' : '';
  const text = `${t.name} resale CO and smoke/CO certificate requirements: ${shareUrl(t, 'text', content)}`;
  return '<div class="tools" data-share-row>' +
    '<button class="chip" type="button" data-share-native hidden>' + ICON.share + 'Share</button>' +
    `<button class="chip" type="button" data-share="copy" data-url="${esc(shareUrl(t, 'copy', content))}">${ICON.link}Copy link</button>` +
    `<a class="chip" data-share="text" href="sms:?&amp;body=${esc(encodeURIComponent(text))}">${ICON.text}Text</a>` +
    `<a class="chip icon" data-share="facebook" href="https://www.facebook.com/sharer/sharer.php?u=${esc(encodeURIComponent(shareUrl(t, 'facebook', content)))}" target="_blank" rel="noopener" aria-label="Share on Facebook">${ICON.facebook}</a>` +
    `<a class="chip icon" data-share="linkedin" href="https://www.linkedin.com/sharing/share-offsite/?url=${esc(encodeURIComponent(shareUrl(t, 'linkedin', content)))}" target="_blank" rel="noopener" aria-label="Share on LinkedIn">${ICON.linkedin}</a>` +
    `<a class="chip" data-print href="${esc(t.path)}/print" target="_blank" rel="noopener">${ICON.print}Client checklist</a>` +
    '</div>';
}

// Reddit-style: up arrow, score (helpful minus not helpful), down arrow. Sits next to the town name.
function votes() {
  return '<div class="votes" data-votes role="group" aria-label="Was this helpful?">' +
    '<button class="vote up" type="button" data-vote="1" aria-pressed="false" aria-label="Helpful">' + ICON.up + '</button>' +
    '<span class="score" data-score aria-live="polite"></span>' +
    '<button class="vote down" type="button" data-vote="-1" aria-pressed="false" aria-label="Not helpful">' + ICON.down + '</button>' +
    '</div>';
}

const DIALOG = `<dialog id="add-dlg" aria-labelledby="add-title">
  <form class="dlg" id="add-form" method="dialog" novalidate>
    <h2 id="add-title">Add CO Requirements</h2>
    <p class="sub" id="add-town"></p>
    <label data-fix-only hidden>What’s wrong?
      <textarea name="problem" maxlength="2000" placeholder="For example: the fee went up to $150 in 2026."></textarea>
    </label>
    <label><span data-doc-label>Town document</span> <small>(form, fee sheet or letter; PDF or photo, up to 10 MB)</small>
      <input name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif">
    </label>
    <label>Or link to the town's page
      <input name="source_url" type="url" inputmode="url" placeholder="https://" maxlength="1000">
    </label>
    <label data-add-only>Requirements and fees <small>(optional)</small>
      <textarea name="answer" maxlength="2000"></textarea>
    </label>
    <div class="two">
      <label>Name <small>(optional)</small><input name="name" autocomplete="name" maxlength="120"></label>
      <label>Email <small>(optional)</small><input name="email" type="email" autocomplete="email" maxlength="254"></label>
    </div>
    <label>You are <small>(optional)</small>
      <select name="role">
        <option value="">Choose one</option>
        <option>Real estate agent</option>
        <option>Attorney</option>
        <option>Title or closing company</option>
        <option>Town or fire office staff</option>
        <option>Home inspector</option>
        <option>Homeowner, buyer or seller</option>
        <option>Other</option>
      </select>
    </label>
    <label class="hp" aria-hidden="true">Website <input name="website" tabindex="-1" autocomplete="off"></label>
    <p class="formstatus" role="status" aria-live="polite"></p>
    <div class="actions">
      <button class="cancel" type="button" value="cancel">Cancel</button>
      <button class="send" type="submit">Send</button>
    </div>
  </form>
</dialog>`;

const SEARCH_TPL = `<template id="search-tpl">
  <div class="box">
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
    <label class="sr">Address or town</label>
    <input type="text" autocomplete="off" spellcheck="false" placeholder="Address or town for CO requirements" role="combobox" aria-autocomplete="list" aria-expanded="false" enterkeyhint="search">
    <button class="clear" type="button" aria-label="Clear">&times;</button>
  </div>
  <ul class="suggest" role="listbox"></ul>
</template>`;

// ---------- page shell ----------
function shell(o) {
  const embed = o.mode === 'embed';
  const robots = o.noindex ? '<meta name="robots" content="noindex,follow">\n' : '';
  const canonical = o.canonical ? `<link rel="canonical" href="${esc(o.canonical)}">\n` : '';
  const og = o.canonical && !o.noindex ? `<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.description)}">
<meta property="og:url" content="${esc(o.canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Watchdog">
<meta property="og:image" content="${SHARE_IMAGE}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Free resale CO requirements for New Jersey towns, from Watchdog">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${SHARE_IMAGE}">
` : '';
  // Embeds and client checklists get first-party counts only: no cookie banner over a client's printout.
  const analytics = embed || o.mode === 'print'
    ? '<script src="/property/js/product-analytics.js" defer></script>\n'
    : '<script src="/property/js/watchdog-consent.js" defer></script>\n<script src="/property/js/product-analytics.js" defer></script>\n<script src="/property/js/ai-referral-analytics.js" defer></script>\n';
  const jsonld = o.jsonld ? `<script type="application/ld+json">${JSON.stringify(o.jsonld).replace(/</g, '\\u003c')}</script>\n` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}">
${robots}${canonical}${og}<link rel="icon" type="image/png" href="/favicon-96x96.png" sizes="96x96">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<link rel="stylesheet" href="/co/co.css?v=${ASSET_V}">
${analytics}${jsonld}</head>
<body class="results${embed ? ' embed' : ''}">
${o.body}
${embed ? '' : '<script src="/property/js/watchdog-easter-eggs.js?v=20261005a" defer></script>\n'}</body>
</html>
`;
}

function topBar(embed) {
  const logo = embed
    ? `<a class="logo" href="${ORIGIN}/co?utm_source=embed&amp;utm_medium=referral&amp;utm_campaign=co_embed" target="_blank" rel="noopener"><img src="${LOGO}" alt="Watchdog" width="110" height="26"></a>`
    : `<a class="logo" href="/"><img src="${LOGO}" alt="Watchdog" width="150" height="35"></a>`;
  return `<header class="top">\n  ${logo}\n  <div class="search" data-search></div>\n</header>`;
}

function scripts(embed, withTown) {
  return `${SEARCH_TPL}
<script>window.CO_BASE = ${embed ? "'/co/embed'" : "'/co'"};</script>
<script src="/co/co-search.js?v=${ASSET_V}" defer></script>
${withTown ? `<script src="/co/co-town.js?v=${ASSET_V}" defer></script>` : ''}${embed ? `\n<script src="/co/co-embed-frame.js?v=${ASSET_V}" defer></script>` : ''}`;
}

function embedFoot() {
  return `<footer class="embed-foot"><a href="${ORIGIN}/co?utm_source=embed&amp;utm_medium=referral&amp;utm_campaign=co_embed" target="_blank" rel="noopener">Free NJ CO lookup by Watchdog</a><a href="${ORIGIN}/co/website?utm_source=embed&amp;utm_medium=referral&amp;utm_campaign=co_embed" target="_blank" rel="noopener">Add it to your site</a></footer>`;
}

function description(t, d) {
  const where = `${t.name} (${countyLabel(t.county)})`;
  if (!d) return `Resale certificate of occupancy (CO or CCO) and smoke detector / CO alarm certificate requirements for ${where}, New Jersey.`;
  if (d.co.status === 'required') return `Selling a home in ${where}? You need a resale certificate of occupancy (CO or CCO) and a smoke detector and CO alarm certificate. Requirements, fees, inspection timing and who to call.`;
  if (d.co.status === 'not_required') return `${where} doesn't require a resale certificate of occupancy (CO or CCO), but you still need a smoke detector and CO alarm certificate to sell. Requirements, fees, inspection timing and who to call.`;
  return `Resale certificate of occupancy (CO or CCO) and smoke detector / CO alarm certificate requirements for ${where}: fees, inspection timing and who to call.`;
}

function crumbs(t, county) {
  return `<nav class="crumbs" aria-label="Breadcrumb"><a href="/co">CO lookup</a>${t ? `<span aria-hidden="true">›</span><a href="/co/${esc(t.countySlug)}">${esc(countyLabel(t.county))}</a>` : county ? `<span aria-hidden="true">›</span><a href="/co/${esc(county.slug)}">${esc(countyLabel(county.name))}</a>` : ''}</nav>`;
}
function breadcrumbLd(items) {
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map((x, i) => ({ '@type': 'ListItem', position: i + 1, name: x[0], item: ORIGIN + x[1] })) };
}

// ---------- one town ----------
function townPage(t, opts) {
  const embed = opts.mode === 'embed';
  const d = T.townData(t.code);
  const city = String(opts.city || '').replace(/[^A-Za-z .'’-]/g, '').trim().slice(0, 60);
  const lower = (s) => s.toLowerCase().replace(/[^a-z]/g, '');
  let meta = esc(countyLabel(t.county)) + ' · Resale certificate of occupancy and smoke detector certificate';
  if (city && lower(city) !== lower(t.name) && !lower(t.name).startsWith(lower(city))) meta += ` · Mailing address: ${esc(city)}`;
  meta += '<span data-helpful-summary></span>';
  const attrs = `data-co-town data-code="${t.code}" data-name="${esc(t.name)}" data-county="${esc(countyLabel(t.county))}" data-status="${d ? d.co.status : 'not_available'}" data-url="${esc(ORIGIN + t.path)}" data-surface="${embed ? 'embed' : 'page'}"`;
  let out = (embed ? '' : crumbs(t)) + `<div class="head"><div><h1 class="town">${esc(t.name)}</h1><p class="meta">${meta}</p></div>${d ? votes() : ''}</div>`;
  if (d) {
    out += shareRow(t, embed) + facts(d) + '<button class="fix" type="button" data-fix>Report a correction</button>';
  } else {
    out += '<p>Not available yet.</p><button class="add" type="button" data-add>Add CO Requirements</button>';
  }
  if (!embed) {
    const county = T.findCounty(t.countySlug);
    const others = county.towns.filter((x) => x.code !== t.code && x.published);
    if (others.length) {
      out += `<section class="nearby"><h2>Other towns in ${esc(countyLabel(t.county))}</h2><ul class="townlist">` +
        others.map((x) => `<li><a href="${esc(x.path)}">${esc(x.name)}</a></li>`).join('') + '</ul></section>';
    }
    const tax = TAX.findTown(t.countySlug, t.slug);
    if (tax) out += `<p class="more"><a href="${esc(tax.path)}">${esc(t.name)} property taxes: typical bill, tax rate and appeal deadline</a></p>`;
    out += '<p class="more"><a href="/">Look up any New Jersey property on Watchdog</a></p>' +
      `<p class="tip"><a href="${TIP_URL}" target="_blank" rel="noopener" data-tip>Found this helpful? Show appreciation with a tip on Venmo</a></p>`;
  }
  const body = `<main ${attrs}>
${topBar(embed)}
<div class="out" id="out" aria-live="polite">${out}</div>
${embed ? embedFoot() : ''}
</main>
<div class="toast" data-toast role="status" aria-live="polite" hidden></div>
${DIALOG}
${scripts(embed, true)}`;
  return shell({
    mode: opts.mode,
    title: `${t.name} NJ Certificate of Occupancy & Smoke Detector Certificate | Watchdog`,
    description: description(t, d),
    canonical: ORIGIN + t.path,
    noindex: embed || !d,
    jsonld: embed || !d ? null : breadcrumbLd([['CO lookup', '/co'], [countyLabel(t.county), `/co/${t.countySlug}`], [t.name, t.path]]),
    body
  });
}

// ---------- client checklist (printable, Watchdog header and watermark) ----------
function box(text) { return `<li><span class="cb" aria-hidden="true"></span>${esc(text)}</li>`; }
function printFees(fees) { return fees.length ? '<table class="pfees"><tbody>' + fees.map((f) => `<tr><td>${esc(f.label)}</td><td class="amt">${esc(f.amount)}</td></tr>`).join('') + '</tbody></table>' : ''; }
function contactLines(o) {
  const bits = [];
  if (o.phone) bits.push(`<li><strong>Phone:</strong> ${esc(o.phone)}</li>`);
  if (o.lead_time) bits.push(`<li><strong>Timing:</strong> ${esc(o.lead_time)}</li>`);
  if (o.valid_for) bits.push(`<li><strong>Good for:</strong> ${esc(o.valid_for)}</li>`);
  if (o.application_url) bits.push(`<li><strong>Application:</strong> <a href="${esc(o.application_url)}">${esc(o.application_url)}</a></li>`);
  else if (o.department_url) bits.push(`<li><strong>Official page:</strong> <a href="${esc(o.department_url)}">${esc(o.department_url)}</a></li>`);
  return bits.length ? `<ul class="plines">${bits.join('')}</ul>` : '';
}
function printPage(t) {
  const d = T.townData(t.code);
  if (!d) return null;
  const co = d.co, fire = d.fire;
  const st = STATUS[co.status];
  const when = fmtDate(d.checked_at);
  const pageUrl = `www.watchdogindex.com${t.path}`;
  let coHtml = `<section><h2>Certificate of Occupancy <span class="pst ${st[0]}">${st[1]}</span></h2>`;
  if (co.status === 'required') {
    coHtml += (co.name ? `<p class="pname">${esc(co.name)}${co.issued_by ? ` · ${esc(co.issued_by)}` : ''}</p>` : '') +
      (co.requirements.length ? '<ul class="checks">' + co.requirements.map(box).join('') + '</ul>' : '') +
      printFees(co.fees) + contactLines(co);
  } else if (co.status === 'not_required') {
    coHtml += `<p>${esc(t.name)} doesn’t require a resale Certificate of Occupancy.</p>` + contactLines(co);
  } else {
    coHtml += '<p>Not confirmed yet. Check with the town’s building or code office.</p>' + contactLines(co);
  }
  coHtml += '</section>';
  let fireHtml = '<section><h2>Smoke and CO alarm certificate <span class="pst req">Required</span></h2>' +
    (fire.requirements.length ? '<ul class="checks">' + fire.requirements.map(box).join('') + '</ul>' : '');
  fire.authorities.forEach((a) => {
    fireHtml += `<div class="pauth"><h3>${esc(a.name)}</h3>${a.area_served && fire.authorities.length > 1 ? `<p class="psub">${esc(a.area_served)}</p>` : ''}${printFees(a.fees)}${contactLines(a)}</div>`;
  });
  fireHtml += '</section>';
  const copyUrl = `${ORIGIN}${t.path}/print?utm_source=share&utm_medium=copy&utm_campaign=co_town&utm_content=checklist`;
  const body = `<main data-co-town data-code="${t.code}" data-name="${esc(t.name)}" data-county="${esc(countyLabel(t.county))}" data-status="${co.status}" data-url="${esc(ORIGIN + t.path)}" data-surface="checklist">
<div class="wm" aria-hidden="true"><img src="${MARK}" alt=""></div>
<div class="pbar"><button class="chip" type="button" data-print-now>${ICON.print}Print or save as PDF</button><button class="chip" type="button" data-share="copy" data-url="${esc(copyUrl)}">${ICON.link}Copy link</button><a class="chip" href="${esc(t.path)}">${ICON.back}Town page</a></div>
<article class="sheet">
<header class="phead"><img src="${LOGO}" alt="Watchdog" width="170" height="40"><span>Resale CO checklist</span></header>
<h1>${esc(t.name)}</h1>
<p class="pmeta">${esc(countyLabel(t.county))}, New Jersey${when ? ` · Checked ${esc(when)}` : ''}</p>
${coHtml}
${fireHtml}
<footer class="pfoot"><p>Requirements can change. Confirm with the town before closing.</p><p>Free from <strong>Watchdog</strong> · ${esc(pageUrl)}</p></footer>
</article>
</main>
<div class="toast" data-toast role="status" aria-live="polite" hidden></div>
<script src="/co/co-town.js?v=${ASSET_V}" defer></script>`;
  return shell({
    mode: 'print',
    title: `${t.name} Resale CO Checklist | Watchdog`,
    description: `A printable resale CO and smoke / CO alarm certificate checklist for ${t.name}, ${countyLabel(t.county)}.`,
    canonical: ORIGIN + t.path,
    noindex: true,
    body: `<style>${PRINT_CSS}</style>\n${body}`
  }).replace('<body class="results">', '<body class="checklist">');
}
const PRINT_CSS = `body.checklist{background:#f5f7fa}
.pbar{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;padding:16px}
.sheet{position:relative;max-width:760px;margin:0 auto 40px;padding:36px 40px 28px;background:#fff;border:1px solid var(--line);border-radius:12px}
.phead{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:14px;border-bottom:3px solid var(--blue)}
.phead img{display:block;width:170px;height:auto}
.phead span{color:var(--muted);font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:.06em}
.sheet h1{margin:20px 0 0;font-size:28px;line-height:1.2}
.pmeta{margin:2px 0 18px;color:var(--muted)}
.sheet section{margin:0 0 18px;padding-top:14px;border-top:1px solid var(--line)}
.sheet h2{margin:0 0 8px;font-size:19px}
.pst{display:inline-block;margin-left:8px;font-size:14px;font-weight:600}
.pst.req{color:var(--blue)}.pst.no{color:#1e7a3c}.pst.unsure{color:#9a6700}
.pname{margin:0 0 8px;color:var(--muted)}
.sheet h3{margin:12px 0 4px;font-size:16px}
.psub{margin:0 0 6px;color:var(--muted);font-size:14px}
.checks{margin:6px 0 10px;padding:0;list-style:none}
.checks li{display:flex;gap:10px;margin:6px 0;break-inside:avoid}
.cb{flex:none;width:16px;height:16px;margin-top:4px;border:1.5px solid #556270;border-radius:3px}
.pfees{width:100%;margin:6px 0;border-collapse:collapse;font-size:15px}
.pfees td{padding:4px 0;border-bottom:1px solid #eef0f3}.pfees td.amt{text-align:right;font-weight:600;white-space:nowrap;padding-left:16px}
.plines{margin:6px 0 0;padding-left:18px;font-size:15px;word-break:break-word}
.pfoot{margin-top:18px;padding-top:12px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}
.pfoot p{margin:2px 0}
.wm{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:2}
.wm img{width:min(60vw,420px);opacity:.07;transform:rotate(-24deg)}
.sheet,.pbar{position:relative;z-index:1}
@media(max-width:640px){.sheet{padding:22px 18px;border-radius:0;border-left:0;border-right:0}.sheet h1{font-size:24px}}
@media print{@page{margin:14mm}body.checklist{background:#fff}.pbar,.toast{display:none!important}.sheet{max-width:none;margin:0;padding:0;border:0}.wm img{width:70%;opacity:.08}a{color:inherit;text-decoration:none}}`;

// ---------- county page ----------
function countyPage(county) {
  const live = county.towns.filter((x) => x.published);
  const label = countyLabel(county.name);
  const out = crumbs(null, null) + `<h1 class="town">${esc(label)} CO Requirements</h1>` +
    `<p class="meta">Resale CO and smoke / CO alarm certificate rules for ${live.length} of ${county.towns.length} towns</p>` +
    '<ul class="townlist">' + county.towns.map((x) => x.published
      ? `<li><a href="${esc(x.path)}">${esc(x.name)}</a></li>`
      : `<li><a class="off" href="${esc(x.path)}" rel="nofollow">${esc(x.name)} (not yet)</a></li>`).join('') + '</ul>' +
    '<p class="more"><a href="/co">Search any New Jersey town or address</a></p>';
  return shell({
    mode: 'page',
    title: `${label} NJ Certificate of Occupancy & Smoke Certificate Requirements by Town | Watchdog`,
    description: `Resale certificate of occupancy (CO or CCO) and smoke detector / CO alarm certificate requirements for every town in ${label}, New Jersey.`,
    canonical: `${ORIGIN}/co/${county.slug}`,
    noindex: !live.length,
    jsonld: breadcrumbLd([['CO lookup', '/co'], [label, `/co/${county.slug}`]]),
    body: `<main>\n${topBar(false)}\n<div class="out" id="out" aria-live="polite">${out}</div>\n</main>\n${scripts(false, false)}`
  });
}

// ---------- /co/website: how to put the lookup on your own site ----------
function websitePage() {
  const t = T.towns();
  const options = [];
  t.counties.forEach((c) => {
    const live = c.towns.filter((x) => x.published);
    if (!live.length) return;
    options.push(`<optgroup label="${esc(countyLabel(c.name))}">` + live.map((x) => `<option value="${esc(x.countySlug + '/' + x.slug)}">${esc(x.name)}</option>`).join('') + '</optgroup>');
  });
  const out = crumbs(null, null) + `<h1 class="town">Put the free CO lookup on your website</h1>
<p class="meta">Free for agents, brokerages, teams, attorneys and anyone else.</p>
<p>Your visitors look up resale CO and smoke / CO alarm certificate rules for New Jersey towns right on your site. It stays up to date on its own when towns change their rules.</p>
<section class="part"><h2>1. Pick what to show</h2>
<p class="sub">The whole lookup, or just one town (handy on a listing or a town page).</p>
<label class="sr" for="embed-town">Town</label>
<select id="embed-town" class="pick" data-embed-town><option value="">Whole lookup (any NJ town)</option>${options.join('')}</select></section>
<section class="part"><h2>2. Copy this code</h2>
<p class="sub">Paste it into your site where you want the lookup. Most website builders have an Embed, HTML or Code block for this.</p>
<textarea class="code" id="embed-code" readonly rows="5" data-embed-code aria-label="Embed code"></textarea>
<div class="tools"><button class="chip" type="button" data-copy-code="embed-code">${ICON.copy}Copy code</button></div>
<details class="fine"><summary>Site doesn’t allow scripts? Use this instead</summary>
<textarea class="code" id="embed-iframe" readonly rows="3" data-embed-iframe aria-label="Embed code without a script"></textarea>
<div class="tools"><button class="chip" type="button" data-copy-code="embed-iframe">${ICON.copy}Copy code</button></div>
</details></section>
<section class="part"><h2>Preview</h2>
<iframe class="preview" data-embed-preview src="/co/embed" title="Preview of the embedded CO lookup" loading="lazy"></iframe></section>
<p class="more"><a href="/co">Open the CO lookup on Watchdog</a></p>`;
  return shell({
    mode: 'page',
    title: 'Add the Free NJ CO Lookup to Your Website | Watchdog',
    description: 'Put Watchdog’s free New Jersey resale CO requirements lookup on your brokerage, team or agent website with one line of code.',
    canonical: `${ORIGIN}/co/website`,
    body: `<style>${WEBSITE_CSS}</style>\n<main>\n${topBar(false)}\n<div class="out" id="out" aria-live="polite">${out}</div>\n</main>\n<div class="toast" data-toast role="status" aria-live="polite" hidden></div>\n${scripts(false, false)}\n<script src="/co/co-website.js?v=${ASSET_V}" defer></script>`
  });
}
const WEBSITE_CSS = `.pick{width:100%;max-width:420px;min-height:44px;padding:8px 12px;border:1px solid #cfd6de;border-radius:10px;background:#fff;font:inherit;color:var(--ink)}
.code{display:block;width:100%;margin-top:6px;padding:12px;border:1px solid #cfd6de;border-radius:10px;background:var(--soft);font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--ink);resize:vertical}
.out .tools{margin:10px 0 0}
.preview{display:block;width:100%;height:420px;border:1px solid var(--line);border-radius:12px;background:#fff}`;

function notFound(embed) {
  return shell({
    mode: embed ? 'embed' : 'page',
    title: 'Town not found | Watchdog',
    description: 'That town page isn’t here.',
    noindex: true,
    body: `<main>\n${topBar(embed)}\n<div class="out" id="out" aria-live="polite"><h1 class="town">That town page isn’t here.</h1><p class="msg">Search for the town or address above.</p></div>\n</main>\n${scripts(embed, false)}`
  });
}

module.exports = { townPage, printPage, countyPage, websitePage, notFound };
