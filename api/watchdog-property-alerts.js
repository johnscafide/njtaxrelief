'use strict';

// Property alerts: sign up (POST JSON from a property page), then confirm or
// unsubscribe from the links in the emails. The email links land on a small
// page with a button, so link scanners in mail apps can't confirm or
// unsubscribe on their own. Emails are sent by the property-alert-sender
// Supabase function; everything here goes through service-role RPCs.

const crypto = require('crypto');
const page = require('./watchdog-property-page');

const TOKEN = /^[0-9a-f]{32,96}$/;
const PIN = /^\d{4}_[0-9A-Za-z.&_-]{1,70}$/;

function backend() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('backend unavailable');
  return { url, key };
}

function clientHash(req, key) {
  const ip = String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '').split(',')[0].trim();
  return ip ? crypto.createHmac('sha256', key).update(ip).digest('hex') : null;
}

async function rpc(b, name, args) {
  const r = await fetch(`${b.url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: b.key, Authorization: `Bearer ${b.key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(6000)
  });
  if (!r.ok) throw new Error(`${name} http ${r.status}`);
  return r.json();
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = typeof req.body === 'string' ? req.body : await new Promise((resolve) => {
    let s = '';
    req.on('data', (c) => { s += c; if (s.length > 4000) { s = ''; req.destroy(); } });
    req.on('end', () => resolve(s));
    req.on('error', () => resolve(''));
  });
  raw = String(raw || '');
  if (/^\s*\{/.test(raw)) { try { return JSON.parse(raw); } catch (_) { return null; } }
  return Object.fromEntries(new URLSearchParams(raw));
}

// Every successful state gets the same answer so the form can't be used to
// find out whether an email already follows a property.
const SUBSCRIBE_ERRORS = {
  disabled: [503, 'Alerts are not available yet.'],
  invalid_email: [400, 'Please enter a valid email.'],
  unknown_property: [404, 'We could not find that property.'],
  rate_limited: [429, 'Too many sign-ups from this connection. Please try again in an hour.']
};

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function subscribe(req, res, body) {
  const pin = String(body.pin || '').trim().slice(0, 80);
  const email = String(body.email || '').trim().toLowerCase().slice(0, 200);
  if (!PIN.test(pin)) return json(res, 400, { error: 'Unknown property.' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(res, 400, { error: 'Please enter a valid email.' });
  let b;
  try { b = backend(); } catch (_) { return json(res, 503, { error: 'Alerts are unavailable right now.' }); }
  try {
    const out = await rpc(b, 'subscribe_property_alert', { p_pin: pin, p_email: email, p_client_hash: clientHash(req, b.key) });
    if (out && out.ok) return json(res, 200, { ok: true, message: 'Check your email and tap Confirm to start alerts. If it isn\'t there in a few minutes, look in spam.' });
    const [status, error] = SUBSCRIBE_ERRORS[out && out.error] || [500, 'Something went wrong. Please try again.'];
    return json(res, status, { error });
  } catch (err) {
    console.error('watchdog-property-alerts subscribe', err && err.message || err);
    return json(res, 500, { error: 'Something went wrong. Please try again.' });
  }
}

const ACTIONS = {
  confirm: {
    title: 'Confirm property alerts',
    ask: 'Tap the button to start email alerts for this property. We check the state tax list once a month and email you only when something changes.',
    button: 'Confirm alerts',
    rpc: 'confirm_property_alert',
    done: (out) => [`You're set`, `We'll email you when the assessment, tax bill or Watchdog Score for ${out.address ? `${page.helpers.titleCase(out.address)}, ${page.townName(out.town)}` : 'this property'} changes. Every email has an unsubscribe link.`],
    failed: ['That link has expired', 'Confirmation links work for 7 days. Go back to the property page and sign up again to get a new one.']
  },
  unsubscribe: {
    title: 'Stop property alerts',
    ask: 'Tap the button to stop email alerts for this property.',
    button: 'Unsubscribe',
    rpc: 'unsubscribe_property_alert',
    done: () => ['You\'re unsubscribed', 'You won\'t get any more alerts for this property.'],
    failed: ['That link didn\'t work', 'It may already have been used. If you still get alerts, reply to one and we\'ll remove you.']
  }
};

function sendPage(res, status, html) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.end(html);
}

async function tokenAction(req, res, action, body) {
  const a = ACTIONS[action];
  const token = String((body && body.t) || (req.query && req.query.t) || '').trim().toLowerCase();
  const path = `/alerts/${action}`;
  if (!TOKEN.test(token)) return sendPage(res, 400, page.messagePage(a.title, a.failed[0], a.failed[1]));
  if (req.method === 'GET' || req.method === 'HEAD') {
    const form = `<form method="post" action="${path}"><input type="hidden" name="t" value="${token}"><button class="wdp-pill is-dark" type="submit">${a.button}</button></form>`;
    return sendPage(res, 200, req.method === 'HEAD' ? undefined : page.messagePage(a.title, a.title, a.ask, form));
  }
  let b;
  try { b = backend(); } catch (_) { return sendPage(res, 503, page.messagePage(a.title, 'Please try again later', 'Alerts are unavailable right now.')); }
  try {
    const out = await rpc(b, a.rpc, { p_token: token });
    if (!out || !out.ok) return sendPage(res, 410, page.messagePage(a.title, a.failed[0], a.failed[1]));
    const [heading, text] = a.done(out);
    const link = out.pams_pin ? `<a class="wdp-pill" href="/nj/property/${encodeURIComponent(out.pams_pin)}">Back to the property</a>` : '';
    return sendPage(res, 200, page.messagePage(a.title, heading, text, link));
  } catch (err) {
    console.error('watchdog-property-alerts', action, err && err.message || err);
    return sendPage(res, 500, page.messagePage(a.title, 'Something went wrong', 'Please try the link again in a minute.'));
  }
}

async function handler(req, res) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const action = String((req.query && req.query.action) || '');
  if (ACTIONS[action]) {
    if (!['GET', 'HEAD', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD, POST'); return sendPage(res, 405, 'Method not allowed'); }
    const body = req.method === 'POST' ? await readBody(req) : null;
    return tokenAction(req, res, action, body);
  }
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return json(res, 405, { error: 'POST required' }); }
  const body = await readBody(req);
  if (!body) return json(res, 400, { error: 'Invalid request.' });
  return subscribe(req, res, body);
}

module.exports = handler;
module.exports.SUBSCRIBE_ERRORS = SUBSCRIBE_ERRORS;
module.exports.ACTIONS = ACTIONS;
