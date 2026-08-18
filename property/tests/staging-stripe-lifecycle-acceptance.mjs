const originalFetch = globalThis.fetch.bind(globalThis);
const stagingBase = String(process.env.STAGING_SUPABASE_URL || '').replace(/\/$/, '');
const stagingFunctionsPrefix = stagingBase ? `${stagingBase}/functions/v1/` : '';
const maxAttempts = 4;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function requestUrl(input) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return String(input?.url || '');
}

function isExplicitEdgeRuntimeFailure(response, text, payload) {
  if (![502, 503, 504].includes(Number(response?.status || 0))) return false;
  const code = String(payload?.code || '');
  const body = String(text || '');
  return code.startsWith('SUPABASE_EDGE_RUNTIME_') || body.includes('SUPABASE_EDGE_RUNTIME_');
}

function normalizeStripeDeclineFixture(url, init) {
  if (!url.startsWith('https://api.stripe.com/v1/customers/')) return init;
  if (String(init?.method || 'GET').toUpperCase() !== 'POST') return init;
  if (!(init?.body instanceof URLSearchParams)) return init;
  if (init.body.get('source') !== 'tok_chargeDeclined') return init;

  // Stripe does not allow a normal issuer-decline card to be attached to a
  // Customer. Its documented `tok_chargeCustomerFail` fixture attaches
  // successfully and then declines the subsequent charge, which is exactly the
  // revenue-recovery state this acceptance test is intended to exercise.
  const body = new URLSearchParams(init.body);
  body.set('source', 'tok_chargeCustomerFail');
  console.log('Using Stripe decline-after-attach fixture for staging revenue-recovery acceptance.');
  return { ...init, body };
}

globalThis.fetch = async function watchdogStagingResilientFetch(input, init) {
  const url = requestUrl(input);
  const normalizedInit = normalizeStripeDeclineFixture(url, init);
  const isStagingEdgeCall = Boolean(stagingFunctionsPrefix) && url.startsWith(stagingFunctionsPrefix);
  if (!isStagingEdgeCall) return originalFetch(input, normalizedInit);

  let lastResponse = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await originalFetch(input, normalizedInit);
    lastResponse = response;
    if (response.ok) return response;

    const probe = response.clone();
    const text = await probe.text().catch(() => '');
    let payload = {};
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }

    if (!isExplicitEdgeRuntimeFailure(response, text, payload) || attempt === maxAttempts) {
      return response;
    }

    const waitMs = 1000 * (2 ** (attempt - 1));
    const code = String(payload?.code || 'SUPABASE_EDGE_RUNTIME_TRANSIENT');
    console.log(`Transient staging Edge Runtime response ${code}; retrying in ${waitMs}ms (${attempt}/${maxAttempts}).`);
    await delay(waitMs);
  }

  return lastResponse;
};

await import('./staging-stripe-lifecycle-acceptance-core.mjs');
