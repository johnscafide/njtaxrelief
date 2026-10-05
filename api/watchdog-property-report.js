/* PDF property report: POST /api/watchdog-property-report

   The property page's report form posts the requester's name, email, phone,
   mailing address and contact consent. The request is validated, rate
   limited per client, saved to property_report_requests (server-only table),
   and a Watchdog-branded PDF of the property's public record is returned.

   The requester's details are theirs, not the property owner's; owner names
   and mailing addresses are never stored or printed. */

const crypto = require('crypto');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const page = require('./watchdog-property-page.js');

const H = page.helpers;
const MAX_PER_HOUR = 5;
const NAVY = rgb(14 / 255, 34 / 255, 72 / 255);
const INK = rgb(20 / 255, 32 / 255, 51 / 255);
const MUTED = rgb(93 / 255, 104 / 255, 119 / 255);
const LINE = rgb(227 / 255, 223 / 255, 214 / 255);
const GOLD = rgb(184 / 255, 151 / 255, 42 / 255);
const SAND = rgb(246 / 255, 239 / 255, 217 / 255);
const SKY = rgb(227 / 255, 237 / 255, 251 / 255);
const BLUE = rgb(20 / 255, 86 / 255, 160 / 255);

function backend() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('backend unavailable');
  return { url, key, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

function clientHash(req, key) {
  const ip = String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '').split(',')[0].trim();
  return ip ? crypto.createHmac('sha256', key).update(ip).digest('hex') : null;
}

function clean(value, max) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function validate(body) {
  const v = {
    pin: clean(body.pin, 80),
    name: clean(body.name, 120),
    email: clean(body.email, 200).toLowerCase(),
    phone: clean(body.phone, 30),
    address: clean(body.address, 300),
    consent: body.consent === true
  };
  if (!/^\d{4}_[0-9A-Za-z.&_-]{1,70}$/.test(v.pin)) return { error: 'Unknown property.' };
  if (v.name.length < 2) return { error: 'Please enter your full name.' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) return { error: 'Please enter a valid email.' };
  const digits = v.phone.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return { error: 'Please enter a phone number with area code.' };
  if (v.address.length < 8) return { error: 'Please enter your mailing address.' };
  if (!v.consent) return { error: 'Please check the consent box to continue.' };
  return { value: v };
}

async function recentCount(b, hash) {
  if (!hash) return 0;
  const since = new Date(Date.now() - 3600 * 1000).toISOString();
  const r = await fetch(`${b.url}/rest/v1/property_report_requests?select=id&client_hash=eq.${hash}&created_at=gte.${encodeURIComponent(since)}`, {
    headers: { ...b.headers, Prefer: 'count=exact', Range: '0-0' }, signal: AbortSignal.timeout(4000)
  });
  const range = r.headers.get('content-range') || '';
  const total = Number(range.split('/')[1]);
  return Number.isFinite(total) ? total : 0;
}

async function saveRequest(b, v, row, hash, ua) {
  const r = await fetch(`${b.url}/rest/v1/property_report_requests`, {
    method: 'POST',
    headers: { ...b.headers, Prefer: 'return=minimal' },
    body: JSON.stringify({
      pams_pin: row.pams_pin, property_address: `${row.address}, ${row.town}`,
      full_name: v.name, email: v.email, phone: v.phone, mailing_address: v.address,
      contact_consent: true, consent_text: H.REPORT_CONSENT, client_hash: hash, user_agent: clean(ua, 300)
    }),
    signal: AbortSignal.timeout(5000)
  });
  if (!r.ok) throw new Error(`report request save http ${r.status}`);
}

// Standard PDF fonts cover WinAnsi only; map common typography and drop the rest.
function pdfText(value) {
  return String(value == null ? '' : value)
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–-]/g, '-')
    .replace(/[·•]/g, '-').replace(/›/g, '>').replace(/…/g, '...')
    .replace(/[^\x20-\x7e -ÿ]/g, '');
}

function wrap(text, font, size, width) {
  const words = pdfText(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > width && line) { lines.push(line); line = w; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

async function buildPdf(row, requester) {
  const v = H.view(row);
  const doc = await PDFDocument.create();
  doc.setTitle(pdfText(`Watchdog property report: ${v.address}, ${v.town}, NJ`));
  doc.setAuthor('Watchdog');
  doc.setCreator('Watchdog (www.watchdogindex.com)');
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 612, Hh = 792, M = 48, CW = W - M * 2;
  let pg = doc.addPage([W, Hh]);
  let y = Hh - M;
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });
  const pages = [pg];

  function newPage() { pg = doc.addPage([W, Hh]); pages.push(pg); y = Hh - M; }
  function need(h) { if (y - h < M + 40) newPage(); }
  function text(t, x, size, font = regular, color = INK) { pg.drawText(pdfText(t), { x, y, size, font, color }); }
  function para(t, size = 10, color = INK, font = regular, width = CW, x = M) {
    const lines = wrap(t, font, size, width);
    for (const l of lines) { need(size + 4); pg.drawText(l, { x, y, size, font, color }); y -= size + 4; }
  }
  function heading(t) {
    need(40); y -= 8;
    pg.drawText(pdfText(t), { x: M, y, size: 13, font: bold, color: NAVY });
    y -= 8; pg.drawLine({ start: { x: M, y }, end: { x: M + CW, y }, thickness: 1, color: LINE }); y -= 16;
  }

  // Header
  pg.drawText('Watchdog', { x: M, y: y - 4, size: 20, font: bold, color: NAVY });
  const label = 'Property report';
  pg.drawText(label, { x: M + CW - bold.widthOfTextAtSize(label, 11), y: y, size: 11, font: bold, color: MUTED });
  pg.drawText(pdfText(today), { x: M + CW - regular.widthOfTextAtSize(pdfText(today), 9), y: y - 14, size: 9, font: regular, color: MUTED });
  y -= 22; pg.drawRectangle({ x: M, y, width: CW, height: 2, color: GOLD }); y -= 30;
  pg.drawText(pdfText(v.address), { x: M, y, size: 22, font: bold, color: NAVY }); y -= 18;
  para([v.place, `${v.county} County`, v.cls ? v.cls[0] : '', row.block ? `Block ${row.block}, Lot ${row.lot || ''}${row.qualifier ? ` (${row.qualifier})` : ''}` : ''].filter(Boolean).join('  -  '), 10, MUTED);
  para(`Prepared for ${requester.name}`, 9, MUTED);
  y -= 8;

  // Key numbers
  const score = row.score && row.score.score != null ? Math.round(Number(row.score.score)) : null;
  const boxes = [['Latest annual tax', H.money(row.last_year_tax) || 'n/a', SKY], ['Assessed value', H.money(row.assessed_value) || 'n/a', SKY], ['Watchdog Score', score != null ? `${score} / 100` : 'Not yet', SAND]];
  const bw = (CW - 16) / 3, bh = 58;
  need(bh + 10);
  boxes.forEach(([k, val, fill], i) => {
    const x = M + i * (bw + 8);
    pg.drawRectangle({ x, y: y - bh, width: bw, height: bh, color: fill });
    pg.drawText(pdfText(k.toUpperCase()), { x: x + 12, y: y - 18, size: 8, font: bold, color: MUTED });
    pg.drawText(pdfText(val), { x: x + 12, y: y - 42, size: 17, font: bold, color: NAVY });
  });
  y -= bh + 14;

  // Watchdog Score
  if (score != null) {
    heading('Watchdog Score');
    para(`${score} out of 100${row.score.verdict ? ` - ${row.score.verdict}` : ''}. The Watchdog Score, powered by the ROBUST Framework, rates this property's tax position using six kinds of public evidence. Higher is better. Evidence coverage ${Math.round(Number(row.score.evidence_coverage || 0))}%, ${row.score.confidence || 'low'} confidence.`, 10);
    y -= 4;
    const parts = row.score.components || {};
    for (const d of H.DIMENSIONS) {
      need(18);
      const val = H.componentScore(parts[d.key]);
      pg.drawText(pdfText(`${d.letter}  ${d.name}`), { x: M, y, size: 10, font: bold, color: INK });
      const bx = M + 210, bwid = CW - 250;
      pg.drawRectangle({ x: bx, y: y - 1, width: bwid, height: 8, color: LINE });
      if (val != null) pg.drawRectangle({ x: bx, y: y - 1, width: bwid * val / 100, height: 8, color: NAVY });
      const t = val == null ? 'n/a' : String(val);
      pg.drawText(t, { x: M + CW - bold.widthOfTextAtSize(t, 10), y, size: 10, font: bold, color: INK });
      y -= 18;
    }
  }

  // Tax in context
  heading('Property tax in perspective');
  const compare = H.townCompareText(row, v);
  if (compare) para(compare, 10);
  const trend = H.rateTrend(row);
  if (trend) {
    y -= 2;
    para(`${v.town}'s general tax rate is $${trend.latest.rate.toFixed(3)} per $100 of assessed value (${trend.latest.year}).${trend.points.length >= 3 ? ` That is ${trend.latest.rate >= trend.first.rate ? 'up' : 'down'} ${Math.abs((trend.latest.rate / trend.first.rate - 1) * 100).toFixed(1)}% since ${trend.first.year}${trend.cutAtReval ? ', the first year after the last town-wide revaluation' : ''}.` : ''}`, 10);
    const chartH = 60;
    need(chartH + 24);
    const max = Math.max(...trend.points.map((p) => p.rate));
    const n = trend.points.length, gap = 8, barW = Math.min(36, (CW - gap * (n - 1)) / n);
    trend.points.forEach((p, i) => {
      const h = Math.max(4, chartH * p.rate / max);
      const x = M + i * (barW + gap);
      pg.drawRectangle({ x, y: y - chartH, width: barW, height: h, color: BLUE });
      const lbl = String(p.year);
      pg.drawText(lbl, { x: x + (barW - regular.widthOfTextAtSize(lbl, 8)) / 2, y: y - chartH - 12, size: 8, font: regular, color: MUTED });
    });
    y -= chartH + 26;
  }

  // Property record
  heading('Property record');
  const facts = [
    ['Property class', v.cls ? `${v.cls[0]} (${row.prop_class})` : row.prop_class],
    ['Year built', row.year_built && row.year_built > 1700 ? row.year_built : ''],
    ['Building', row.building_desc],
    ['Dwelling units', row.dwelling_units || ''],
    ['Lot size', row.acres && Number(row.acres) > 0 ? `${Number(row.acres).toFixed(2)} acres` : ''],
    ['Land value', H.money(row.land_value)],
    ['Improvement value', H.money(row.improvement_value)],
    ['Last recorded sale', row.last_sale_price ? `${H.money(row.last_sale_price)}${H.saleDate(row) ? ` on ${H.saleDate(row)}` : ''}` : '']
  ].filter(([, val]) => val !== '' && val != null);
  need(Math.ceil(facts.length / 2) * 30 + 8); // keep the record on one page
  for (let i = 0; i < facts.length; i += 2) {
    need(30);
    [facts[i], facts[i + 1]].forEach((f, j) => {
      if (!f) return;
      const x = M + j * (CW / 2);
      pg.drawText(pdfText(f[0].toUpperCase()), { x, y, size: 8, font: bold, color: MUTED });
      pg.drawText(pdfText(f[1]), { x, y: y - 13, size: 11, font: bold, color: INK });
    });
    y -= 30;
  }

  // Recent sales
  const sales = Array.isArray(row.recent_sales) ? row.recent_sales.filter((s) => s && s.price) : [];
  if (sales.length) {
    heading('Recent sales nearby');
    const cols = [M, M + 290, M + 380, M + CW];
    need(16);
    [['ADDRESS', cols[0]], ['SOLD', cols[1]]].forEach(([t, x]) => pg.drawText(t, { x, y, size: 8, font: bold, color: MUTED }));
    pg.drawText('PRICE', { x: cols[3] - bold.widthOfTextAtSize('PRICE', 8), y, size: 8, font: bold, color: MUTED });
    y -= 14;
    for (const s of sales) {
      need(18);
      const d = s.date ? new Date(s.date + 'T12:00:00Z') : null;
      const when = d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
      pg.drawText(pdfText(`${H.titleCase(s.address)}${s.same_street ? '  (same street)' : ''}`), { x: cols[0], y, size: 10, font: regular, color: INK });
      pg.drawText(pdfText(when), { x: cols[1], y, size: 10, font: regular, color: INK });
      const p = pdfText(H.money(s.price));
      pg.drawText(p, { x: cols[3] - bold.widthOfTextAtSize(p, 10), y, size: 10, font: bold, color: INK });
      y -= 6; pg.drawLine({ start: { x: M, y }, end: { x: M + CW, y }, thickness: 0.5, color: LINE }); y -= 12;
    }
    para('Same property type in the same town, same street first. Prices come from the state tax list, which runs about a year behind, and can include non-market transfers.', 8, MUTED);
  }

  // Next steps
  heading('Appeals and relief programs');
  para(`Assessment appeals go to the ${v.county} County Board of Taxation. In most towns the deadline is April 1 (May 1 after a town-wide revaluation), or 45 days after assessment notices are mailed if that is later. Confirm the date on your assessment notice.`, 10);
  y -= 4;
  para('New Jersey relief programs such as ANCHOR, Senior Freeze and Stay NJ can lower what homeowners pay. Watchdog\'s free tools check both: www.watchdogindex.com/appeal-savings-estimator and www.watchdogindex.com/senior-benefit-estimator.', 10);

  // Footers
  const url = `${H.CANONICAL_ORIGIN.replace('https://', '')}${H.propertyPath(row)}`;
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: M + 26 }, end: { x: M + CW, y: M + 26 }, thickness: 0.5, color: LINE });
    const foot = wrap(`Source: New Jersey MOD-IV tax list and NJ Office of GIS parcel data; town tax rates from the NJ Division of Taxation. Public records only; this report is for information and is not an appraisal or legal advice. ${url}`, regular, 7, CW - 50);
    foot.slice(0, 2).forEach((l, k) => p.drawText(l, { x: M, y: M + 14 - k * 9, size: 7, font: regular, color: MUTED }));
    const pn = `Page ${i + 1} of ${pages.length}`;
    p.drawText(pn, { x: M + CW - regular.widthOfTextAtSize(pn, 7), y: M + 14, size: 7, font: regular, color: MUTED });
  });

  return doc.save();
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (_) { return null; } }
  return await new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 10000) { raw = ''; req.destroy(); } });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch (_) { resolve(null); } });
    req.on('error', () => resolve(null));
  });
}

function fail(res, status, error) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ error }));
}

async function handler(req, res) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return fail(res, 405, 'POST required'); }
  const body = await readBody(req);
  if (!body) return fail(res, 400, 'Invalid request.');
  const checked = validate(body);
  if (checked.error) return fail(res, 400, checked.error);
  const v = checked.value;
  let b;
  try { b = backend(); } catch (_) { return fail(res, 503, 'Reports are unavailable right now. Please try again later.'); }
  try {
    const hash = clientHash(req, b.key);
    if (await recentCount(b, hash) >= MAX_PER_HOUR) return fail(res, 429, 'Too many report requests. Please try again in an hour.');
    const row = await page.fetchProperty(v.pin);
    if (!row) return fail(res, 404, 'We could not find that property.');
    await saveRequest(b, v, row, hash, req.headers['user-agent']);
    const pdf = await buildPdf(row, v);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${H.reportFileName(H.view(row))}"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.end(Buffer.from(pdf));
  } catch (err) {
    console.error('watchdog-property-report', err && err.message || err);
    return fail(res, 500, 'Something went wrong. Please try again.');
  }
}

module.exports = handler;
module.exports.validate = validate;
module.exports.buildPdf = buildPdf;
module.exports.pdfText = pdfText;
