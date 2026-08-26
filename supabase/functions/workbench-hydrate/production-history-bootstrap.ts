import { enrichHistory } from './history-provider.ts';

const nativeServe = Deno.serve.bind(Deno);

function withHistory(handler: Deno.ServeHandler): Deno.ServeHandler {
  return async (request, info) => {
    const historyRequest = request.clone();
    const response = await handler(request, info);
    return enrichHistory(historyRequest, response);
  };
}

const wrappedServe = ((first: unknown, second?: unknown) => {
  if (typeof first === 'function') return nativeServe(withHistory(first as Deno.ServeHandler));
  if (typeof second === 'function') return nativeServe(first as Deno.ServeOptions, withHistory(second as Deno.ServeHandler));
  return nativeServe(first as Deno.ServeOptions);
}) as typeof Deno.serve;

Object.defineProperty(Deno, 'serve', { configurable:true, writable:true, value:wrappedServe });

// Preserve the currently deployed bounded PILOT composition exactly, then add
// only the fail-closed longitudinal enrichment above it.
await import('./production-pilot-bootstrap.ts');
