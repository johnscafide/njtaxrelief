import crypto from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://uvkvaxljhhngydvlrzom.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPPRESSION_HASH = 'cf6f8882161c59edc7edfe0094fcdf708211ce05ed59a16ebafa0da12aa319d3';

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}
function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
function page(title, message) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title}</title></head><body style="margin:0;background:#f5f5f7;color:#1d1d1f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"><main style="max-width:560px;margin:72px auto;padding:0 20px"><section style="background:#fff;border:1px solid #e8e8ed;border-radius:28px;padding:44px;text-align:center"><div style="font-size:26px;font-weight:800;color:#0b4fb3">Watchdog</div><h1 style="margin:26px 0 12px;font-size:32px;letter-spacing:-1px">${title}</h1><p style="margin:0;color:#6e6e73;font-size:17px;line-height:1.55">${message}</p></section></main></body></html>`;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, no-cache, max-age=0, must-revalidate');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('Method not allowed');
  }
  if (!SERVICE_KEY) {
    return res.status(503).send(page('Unable to update preference', 'Please try again later.'));
  }

  const token = String(first(req.query && req.query.t) || '').trim();
  if (token.length < 20 || token.length > 180) {
    return res.status(400).send(page('Invalid link', 'This unsubscribe link is not valid.'));
  }

  const tokenDigest = digest(token);
  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  try {
    const outreachUrl = new URL(`${SUPABASE_URL}/rest/v1/anchor_review_outreach`);
    outreachUrl.searchParams.set('select', 'id,user_id');
    outreachUrl.searchParams.set('token_digest', `eq.${tokenDigest}`);
    outreachUrl.searchParams.set('limit', '1');

    const outreachResponse = await fetch(outreachUrl, { headers, cache: 'no-store' });
    if (!outreachResponse.ok) throw new Error('lookup_failed');
    const rows = await outreachResponse.json();
    const outreach = Array.isArray(rows) ? rows[0] : null;
    if (!outreach || !outreach.user_id) {
      return res.status(404).send(page('Link expired', 'We could not find this review email preference.'));
    }

    const suppressionResponse = await fetch(`${SUPABASE_URL}/rest/v1/marketing_suppressions?on_conflict=user_id,channel,subject_hash`, {
      method: 'POST',
      headers: Object.assign({}, headers, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({
        user_id: outreach.user_id,
        channel: 'email',
        subject_hash: SUPPRESSION_HASH,
        reason: 'review_outreach_unsubscribe',
        source: 'review_email',
        expires_at: null,
      }),
      cache: 'no-store',
    });
    if (!suppressionResponse.ok) throw new Error('suppression_failed');

    const updateUrl = new URL(`${SUPABASE_URL}/rest/v1/anchor_review_outreach`);
    updateUrl.searchParams.set('id', `eq.${outreach.id}`);
    await fetch(updateUrl, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        unsubscribed_at: new Date().toISOString(),
        delivery_status: 'suppressed',
        lease_until: null,
      }),
      cache: 'no-store',
    });

    return res.status(200).send(page('You’re unsubscribed', 'You will no longer receive Watchdog application review-request emails. Other account or filing-related service messages are unaffected.'));
  } catch (error) {
    console.error('watchdog-review-outreach-unsubscribe', error);
    return res.status(500).send(page('Unable to update preference', 'Please try again later.'));
  }
}
