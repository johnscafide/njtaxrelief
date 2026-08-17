export default async function handler(req, res) {
  try {
    const response = await fetch('https://pxossnwmrygxlpxtstnl.supabase.co/functions/v1/intelligence-phase45-selftest');
    const body = await response.text();
    res.status(response.status).setHeader('Content-Type', 'application/json').send(body);
  } catch (error) {
    res.status(500).json({ ok: false, error: 'staging self-test proxy failed' });
  }
}
