// NJW-143 bounded release-canary extensions.
// New scenarios are handled by exact git-pinned helpers; every pre-existing
// scenario delegates unchanged to the exact git-pinned production canary graph.
const { handleV036Canary } = await import(
  'https://raw.githubusercontent.com/johnscafide/njtaxrelief/4fba90939e2a96d62fd029245bcc2d8bfa48fe19/supabase/functions/provider-release-canary/v036-sources-canary.ts'
);
const { handleModivRecordChangeCanary } = await import(
  'https://raw.githubusercontent.com/johnscafide/njtaxrelief/6bd3f6220dd5a1631fd38f78e11fd415ef645fca/supabase/functions/provider-release-canary/modiv-record-change-canary.ts'
);

const nativeServe = Deno.serve.bind(Deno);

function withReleaseScenarios(handler: Deno.ServeHandler): Deno.ServeHandler {
  return async (request, info) => {
    if (request.method === 'POST') {
      try {
        const body = await request.clone().json();
        const scenario=String(body?.scenario || '').trim();
        if (scenario === 'v036_sources_v1') return handleV036Canary(request);
        if (scenario === 'modiv_record_change_v1') return handleModivRecordChangeCanary(request);
      } catch {
        // Preserve the existing production handler's malformed-request contract.
      }
    }
    return handler(request, info);
  };
}

const wrappedServe = ((first: unknown, second?: unknown) => {
  if (typeof first === 'function') return nativeServe(withReleaseScenarios(first as Deno.ServeHandler));
  if (typeof second === 'function') return nativeServe(first as Deno.ServeOptions, withReleaseScenarios(second as Deno.ServeHandler));
  return nativeServe(first as Deno.ServeOptions);
}) as typeof Deno.serve;

Object.defineProperty(Deno, 'serve', {
  configurable: true,
  writable: true,
  value: wrappedServe,
});

await import('https://raw.githubusercontent.com/johnscafide/njtaxrelief/4fba90939e2a96d62fd029245bcc2d8bfa48fe19/supabase/functions/provider-release-canary/production-pilot-bootstrap.ts');
