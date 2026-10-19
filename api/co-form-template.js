// The town's own CO application PDF for /co/<county>/<town>/apply, fetched from the town's site and
// checked against the pinned hash in property/data/co-application-forms.json (api/_co-forms.js).
const crypto = require('crypto');
const F = require('./_co-forms');

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
    const get = () => fetch(form.url, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 WatchdogCO/1.0 (+https://www.watchdogindex.com/co)' }, signal: AbortSignal.timeout(4000) });
    const upstream = await get().catch(get);
    if (!upstream.ok) return res.status(502).json({ error: 'town_form_unavailable' });
    const bytes = Buffer.from(await upstream.arrayBuffer());
    if (!bytes.length || bytes.length > 10 * 1024 * 1024 || bytes.subarray(0, 5).toString('latin1') !== '%PDF-') return res.status(502).json({ error: 'town_form_not_pdf' });

    const digest = crypto.createHash('sha256').update(bytes).digest('hex');
    if (digest !== form.sha256) {
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(409).json({ error: 'town_form_changed', expected: form.sha256, received: digest });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="co-application-${code}.pdf"`);
    res.setHeader('X-Watchdog-Template-SHA256', digest);
    return res.status(200).send(bytes);
  } catch (_) {
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(502).json({ error: 'town_form_unavailable' });
  }
};
