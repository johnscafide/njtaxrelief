// The town's own CO application PDF for /co/<county>/<town>/apply, fetched from the town's site and
// checked against the pinned hash in property/data/co-application-forms.json (api/_co-forms.js).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const F = require('./_co-forms');

const AGENTS = [
  'Mozilla/5.0 (compatible; Watchdog CO forms; +https://www.watchdogindex.com/co)',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 WatchdogCO/1.0 (+https://www.watchdogindex.com/co)'
];

module.exports = async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const code = String(req.query && req.query.code || '');
  const form = F.formFor(code);
  if (!form) return res.status(400).json({ error: 'invalid_town' });

  try {
    const get = (agent) => fetch(form.url, { redirect: 'follow', headers: { 'User-Agent': agent, Accept: 'application/pdf,*/*' }, signal: AbortSignal.timeout(4500) });
    let upstream = await get(AGENTS[0]).catch(() => null);
    if (!upstream || !upstream.ok) upstream = await get(AGENTS[1]).catch(() => null);
    if (!upstream || !upstream.ok) {
      const copy = savedCopy(code, form);
      if (copy) return sendPdf(res, code, copy, 'saved-copy');
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(502).json({ error: 'town_form_unavailable' });
    }
    const bytes = Buffer.from(await upstream.arrayBuffer());
    if (!bytes.length || bytes.length > 10 * 1024 * 1024 || bytes.subarray(0, 5).toString('latin1') !== '%PDF-') {
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(502).json({ error: 'town_form_not_pdf' });
    }

    const digest = crypto.createHash('sha256').update(bytes).digest('hex');
    if (digest !== form.sha256) {
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(409).json({ error: 'town_form_changed', expected: form.sha256, received: digest });
    }

    return sendPdf(res, code, bytes, 'town');
  } catch (_) {
    const copy = savedCopy(code, form);
    if (copy) return sendPdf(res, code, copy, 'saved-copy');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(502).json({ error: 'town_form_unavailable' });
  }
};

// A few town sites refuse requests from Watchdog's host, so their form is kept in property/data/co-forms/.
function savedCopy(code, form) {
  if (!form.saved_copy) return null;
  try {
    const bytes = fs.readFileSync(path.join(process.cwd(), 'property', 'data', 'co-forms', `${code}.pdf`));
    return crypto.createHash('sha256').update(bytes).digest('hex') === form.sha256 ? bytes : null;
  } catch (_) { return null; }
}

function sendPdf(res, code, bytes, source) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="co-application-${code}.pdf"`);
  res.setHeader('X-Watchdog-Template-SHA256', crypto.createHash('sha256').update(bytes).digest('hex'));
  res.setHeader('X-Watchdog-Template-Source', source);
  return res.status(200).send(bytes);
}
