module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const promoEndsAt = Date.parse('2026-09-19T00:00:00Z');
  if (Date.now() >= promoEndsAt) {
    return res.status(200).json({ ok: false, blocked_by_watchdog_promo_cutoff: true });
  }

  let helperToken = '';
  let helperError = '';
  let gatewayStatus = null;
  let gatewayOk = false;
  let audioPresent = false;
  let providerError = null;

  try {
    const { getVercelOidcToken } = await import('@vercel/oidc');
    helperToken = await getVercelOidcToken({
      project: 'prj_WjkoYFzi04JigQOvvgWiXuC1lC8Q',
      team: 'team_NLnARgwzVf4nYuSMQ3jif2ld',
    }) || '';
  } catch (error) {
    helperError = String(error?.message || error || '').slice(0, 180);
  }

  if (helperToken) {
    try {
      const response = await fetch('https://ai-gateway.vercel.sh/v4/ai/speech-model', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${helperToken}`,
          'ai-model-id': 'fish-audio/s2.1-pro',
          'ai-gateway-protocol-version': '0.0.1',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: 'Watchdog provider verification.', outputFormat: 'mp3' }),
      });
      gatewayStatus = response.status;
      const text = await response.text();
      let body = null;
      try { body = text ? JSON.parse(text) : null; } catch { body = null; }
      gatewayOk = response.ok;
      audioPresent = Boolean(body && typeof body === 'object' && typeof body.audio === 'string' && body.audio.length > 20);
      if (!response.ok) {
        const value = body && typeof body === 'object'
          ? (body?.error?.message || body?.message || body?.error || body?.detail)
          : text;
        providerError = String(value || `Gateway request failed (${response.status})`).replace(/[<>]/g, '').slice(0, 240);
      }
    } catch (error) {
      providerError = String(error?.message || error || '').replace(/[<>]/g, '').slice(0, 240);
    }
  }

  return res.status(200).json({
    ok: true,
    vercel_oidc_helper_token_present: Boolean(helperToken),
    vercel_oidc_helper_error: helperError || null,
    gateway_status: gatewayStatus,
    gateway_ok: gatewayOk,
    audio_present: audioPresent,
    provider_error: providerError,
    protocol_version: '0.0.1',
    watchdog_promo_cutoff_utc: '2026-09-19T00:00:00Z',
    model: 'fish-audio/s2.1-pro',
  });
};
