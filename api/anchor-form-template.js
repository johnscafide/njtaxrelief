const crypto = require('crypto');

const FORMS = Object.freeze({
  'anc-1': {
    url: 'https://www.nj.gov/treasury/taxation/pdf/25-anc-1.pdf',
    sha256: '1df62f2b2057f527ece24ba64af86e086613cf40164bd7d43b331f789072ae4b'
  },
  'pas-1': {
    url: 'https://www.nj.gov/treasury/taxation/pdf/25-pas1.pdf',
    sha256: '03a1a9032337697a3e536f86d65713b4c8261f0799d60e36a563e10d348e6a71'
  }
});

module.exports = async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const key = String(req.query && req.query.form || '').toLowerCase();
  const source = FORMS[key];
  if (!source) return res.status(400).json({ error: 'invalid_form' });

  try {
    const upstream = await fetch(source.url, { redirect: 'follow' });
    if (!upstream.ok) return res.status(502).json({ error: 'state_form_unavailable' });
    const contentType = String(upstream.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('pdf')) return res.status(502).json({ error: 'state_form_not_pdf' });
    const bytes = Buffer.from(await upstream.arrayBuffer());
    if (!bytes.length || bytes.length > 5 * 1024 * 1024) return res.status(502).json({ error: 'state_form_size_invalid' });

    const digest = crypto.createHash('sha256').update(bytes).digest('hex');
    if (digest !== source.sha256) {
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(409).json({ error: 'state_form_changed', expected: source.sha256, received: digest });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="2025-${key}.pdf"`);
    res.setHeader('X-Watchdog-Template-SHA256', digest);
    return res.status(200).send(bytes);
  } catch (_) {
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(502).json({ error: 'state_form_unavailable' });
  }
};
