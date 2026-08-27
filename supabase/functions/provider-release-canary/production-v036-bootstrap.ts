// NJW-143 bounded release-canary extension for the v0.36 source pack.
// v036_sources_v1 is handled by the exact git-pinned helper; every pre-existing
// scenario delegates unchanged to the exact git-pinned production canary graph.
const { handleV036Canary } = await import(
  'https://raw.githubusercontent.com/johnscafide/njtaxrelief/4fba90939e2a96d62fd029245bcc2d8bfa48fe19/supabase/functions/provider-release-canary/v036-sources-canary.ts'
);

const nativeServe = Deno.serve.bind(Deno);

function withV036Scenario(handler: Deno.ServeHandler): Deno.ServeHandler {
  return async (request, info) => {
    if (request.method === 'POST') {
      try {
        const body = await request.clone().json();
        if (String(body?.scenario || '').trim() === 'v036_sources_v1') {
          return handleV036Canary(request);
        }
      } catch {
        // Preserve the existing production handler's malformed-request contract.
      }
    }
    return handler(request, info);
  };
}

const wrappedServe = ((first: unknown, second?: unknown) => {
  if (typeof first === 'function') return nativeServe(withV036Scenario(first as Deno.ServeHandler));
  if (typeof second === 'function') return nativeServe(first as Deno.ServeOptions, withV036Scenario(second as Deno.ServeHandler));
  return nativeServe(first as Deno.ServeOptions);
}) as typeof Deno.serve;

Object.defineProperty(Deno, 'serve', {
  configurable: true,
  writable: true,
  value: wrappedServe,
});

await import('https://raw.githubusercontent.com/johnscafide/njtaxrelief/4fba90939e2a96d62fd029245bcc2d8bfa48fe19/supabase/functions/provider-release-canary/production-pilot-bootstrap.ts');
