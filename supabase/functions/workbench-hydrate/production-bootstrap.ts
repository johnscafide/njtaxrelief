// Git-pinned production bootstrap for Watchdog Workbench hydration.
// Supabase bundles this exact reviewed module graph at deploy time.
//
// Domain-cutover compatibility shim:
// - preserve the two legacy NJPropertyTaxRelief browser origins handled by the pinned Workbench module;
// - additionally allow the canonical WatchdogIndex browser origins;
// - never use wildcard CORS;
// - do not change the legacy NJPropertyTaxRelief static-data base used by the Workbench module.

const WATCHDOG_INDEX_ORIGINS = new Set([
  'https://watchdogindex.com',
  'https://www.watchdogindex.com',
]);

const nativeServe = Deno.serve.bind(Deno);

function withWatchdogIndexCors(handler: Deno.ServeHandler): Deno.ServeHandler {
  return async (request, info) => {
    const origin = request.headers.get('origin') || '';
    const response = await handler(request, info);

    if (!WATCHDOG_INDEX_ORIGINS.has(origin)) return response;

    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', origin);
    const vary = headers.get('Vary') || '';
    const varyParts = vary.split(',').map((part) => part.trim().toLowerCase()).filter(Boolean);
    if (!varyParts.includes('origin')) headers.set('Vary', vary ? `${vary}, Origin` : 'Origin');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}

const wrappedServe = ((first: unknown, second?: unknown) => {
  if (typeof first === 'function') {
    return nativeServe(withWatchdogIndexCors(first as Deno.ServeHandler));
  }
  if (typeof second === 'function') {
    return nativeServe(first as Deno.ServeOptions, withWatchdogIndexCors(second as Deno.ServeHandler));
  }
  return nativeServe(first as Deno.ServeOptions);
}) as typeof Deno.serve;

Object.defineProperty(Deno, 'serve', {
  configurable: true,
  writable: true,
  value: wrappedServe,
});

// Keep the current certified Workbench provider graph pinned. This is the same
// provider graph used by production v49; only browser-origin handling changes here.
await import('https://raw.githubusercontent.com/johnscafide/njtaxrelief/666fe7392ae43a8be7b7f2512b76894dc64262a2/supabase/functions/workbench-hydrate/index.ts');
