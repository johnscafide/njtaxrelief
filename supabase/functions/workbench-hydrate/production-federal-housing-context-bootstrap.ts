// Governed federal housing/commute enrichment layered around the currently
// certified production Workbench Hydrate chain, including EPA walkability.
import { enrichFederalHousingContext } from './federal-housing-context-provider.ts';

const nativeServe = Deno.serve.bind(Deno);
const wrappedServe = ((first: unknown, second?: unknown) => {
  const wrap = (handler: Deno.ServeHandler): Deno.ServeHandler => async (request, info) => {
    const federalRequest = request.clone();
    const response = await handler(request, info);
    return enrichFederalHousingContext(federalRequest, response);
  };
  if (typeof first === 'function') return nativeServe(wrap(first as Deno.ServeHandler));
  if (typeof second === 'function') return nativeServe(first as Deno.ServeOptions, wrap(second as Deno.ServeHandler));
  return nativeServe(first as Deno.ServeOptions);
}) as typeof Deno.serve;

Object.defineProperty(Deno, 'serve', { configurable: true, writable: true, value: wrappedServe });

// Preserve the exact currently certified production chain and layer this source
// family outside it. Relative imports inside this immutable module resolve at
// the pinned commit and therefore cannot drift with branch changes.
await import('https://raw.githubusercontent.com/johnscafide/njtaxrelief/3203bd1eaa22cbc2e8ca9af6a06a85166d99734e/supabase/functions/workbench-hydrate/production-epa-walkability-bootstrap.ts');
