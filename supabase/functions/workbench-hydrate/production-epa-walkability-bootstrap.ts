// Governed EPA National Walkability Index enrichment layered around the
// currently certified Workbench Hydrate production chain.
import { enrichEpaWalkability } from './epa-walkability-provider.ts';

const nativeServe = Deno.serve.bind(Deno);
const wrappedServe = ((first: unknown, second?: unknown) => {
  const wrap = (handler: Deno.ServeHandler): Deno.ServeHandler => async (request, info) => {
    const walkabilityRequest = request.clone();
    const response = await handler(request, info);
    return enrichEpaWalkability(walkabilityRequest, response);
  };
  if (typeof first === 'function') return nativeServe(wrap(first as Deno.ServeHandler));
  if (typeof second === 'function') return nativeServe(first as Deno.ServeOptions, wrap(second as Deno.ServeHandler));
  return nativeServe(first as Deno.ServeOptions);
}) as typeof Deno.serve;

Object.defineProperty(Deno, 'serve', { configurable: true, writable: true, value: wrappedServe });

// Pin the previously deployed v75 entrypoint graph. Relative imports inside
// that module continue to resolve against this immutable GitHub commit.
await import('https://raw.githubusercontent.com/johnscafide/njtaxrelief/f473028961606ae69e95065d5d896b68033773c7/supabase/functions/workbench-hydrate/production-njw294-pilot-restore-bootstrap.ts');
