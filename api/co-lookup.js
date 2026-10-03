// Public resale CO lookup (/co). Returns one town's person-checked resale Certificate of
// Occupancy and smoke / CO alarm certificate rules, read straight from
// property/data/municipal-requirements/. Only towns approved in approvals.json are returned, the
// same gate the publish step uses, so a town shows up here as soon as it is approved and committed.
// Researcher notes, evidence quotes, open questions and staff names/emails are left out.
const fs = require('fs');
const path = require('path');

const DIR = path.join(process.cwd(), 'property', 'data', 'municipal-requirements');
const CODE = /^\d{4}$/;

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8')); } catch (_) { return null; }
}
function text(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 1500); }
function url(v) { const s = text(v, 600); return /^https:\/\//i.test(s) ? s : ''; }
function list(v) { return (Array.isArray(v) ? v : []).map((x) => text(x)).filter(Boolean); }
function fees(v) {
  return (Array.isArray(v) ? v : []).map((f) => ({ label: text(f && f.label, 300), amount: text(f && f.amount, 120), source_url: url(f && f.source_url) }))
    .filter((f) => f.label || f.amount);
}
function sources(...groups) {
  const seen = new Set();
  const out = [];
  groups.flat().forEach((e) => { const u = url(e && e.url); if (u && !seen.has(u)) { seen.add(u); out.push(u); } });
  return out.slice(0, 8);
}

function publicTown(r) {
  const co = r.resale_co || {};
  const fire = r.fire_cert || {};
  const authorities = Array.isArray(fire.authorities) ? fire.authorities : [];
  return {
    status: 'ok',
    code: r.municipality_code,
    town: text(r.municipality, 120),
    county: text(r.county, 60),
    checked_at: text(r.checked_at, 20),
    co: {
      status: ['required', 'not_required', 'not_found'].includes(co.status) ? co.status : 'not_found',
      name: text(co.name, 200),
      issued_by: text(co.issued_by, 200),
      lead_time: text(co.lead_time, 400),
      valid_for: text(co.valid_for, 400),
      requirements: list(co.requirements),
      fees: fees(co.fees),
      how_to_apply: text(co.how_to_apply, 2000),
      application_url: url(co.application_url),
      department_url: url(co.department_url),
      phone: text(co.phone, 80)
    },
    fire: {
      requirements: list(fire.requirements),
      authorities: authorities.map((a) => ({
        name: text(a.name, 200),
        area_served: text(a.area_served, 300),
        lead_time: text(a.lead_time, 400),
        fees: fees(a.fees),
        how_to_apply: text(a.how_to_apply, 2000),
        application_url: url(a.application_url),
        department_url: url(a.department_url),
        phone: text(a.phone, 80)
      }))
    },
    sources: sources(co.evidence || [], authorities.map((a) => a.evidence || []))
  };
}

module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.statusCode = 405;
    return res.end(JSON.stringify({ status: 'error' }));
  }
  const code = String((req.query && req.query.code) || '').trim();
  if (!CODE.test(code)) {
    res.statusCode = 400;
    res.setHeader('Cache-Control', 'no-store');
    return res.end(JSON.stringify({ status: 'invalid' }));
  }
  const approvals = (readJson('approvals.json') || {}).towns || {};
  const row = (approvals[code] || {}).status === 'approved' ? readJson(path.join('checked', `${code}.json`)) : null;
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
  if (!row || row.municipality_code !== code) return res.end(JSON.stringify({ status: 'not_available', code }));
  return res.end(JSON.stringify(publicTown(row)));
};
