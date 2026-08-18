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

globalThis.fetch = async function watchdogStagingResilientFetch(input, init) {
  const url = requestUrl(input);
  const isStagingEdgeCall = Boolean(stagingFunctionsPrefix) && url.startsWith(stagingFunctionsPrefix);
  if (!isStagingEdgeCall) return originalFetch(input, init);

  let lastResponse = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await originalFetch(input, init);
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
