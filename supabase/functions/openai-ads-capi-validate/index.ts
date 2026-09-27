const CANONICAL_SITE = 'https://www.watchdogindex.com';

function cors(req: Request) {
  const origin = req.headers.get('origin') === CANONICAL_SITE ? CANONICAL_SITE : CANONICAL_SITE;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  return new Response(JSON.stringify({
    ok: false,
    disabled: true,
    message: 'OpenAI Ads CAPI validation is complete; this temporary validator is disabled.'
  }), {
    status: 410,
    headers: {
      ...cors(req),
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
});
