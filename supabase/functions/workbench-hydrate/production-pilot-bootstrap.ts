// NJW-143 bounded production composition for observed NJ DCA PILOT facts.
// This wrapper runs after the existing certified Workbench bootstrap so its
// authentication, entitlement, CORS, City, permit-lifecycle and warranty
// behavior stays unchanged. Only the exact observed PILOT subset is enriched.
import { enrichPilotObserved } from './pilot-observed-provider.ts';

const nativeServe = Deno.serve.bind(Deno);

function withPilotObserved(handler: Deno.ServeHandler): Deno.ServeHandler {
  return async (request, info) => {
    const pilotRequest = request.clone();
    const response = await handler(request, info);
    return enrichPilotObserved(pilotRequest, response);
  };
}

const wrappedServe = ((first: unknown, second?: unknown) => {
  if (typeof first === 'function') {
    return nativeServe(withPilotObserved(first as Deno.ServeHandler));
  }
  if (typeof second === 'function') {
    return nativeServe(first as Deno.ServeOptions, withPilotObserved(second as Deno.ServeHandler));
  }
  return nativeServe(first as Deno.ServeOptions);
}) as typeof Deno.serve;

Object.defineProperty(Deno, 'serve', {
  configurable: true,
  writable: true,
  value: wrappedServe,
});

// Pin the reviewed main snapshot that includes the permit-lifecycle syntax
// repair caught by the deployment gate. Its relative imports resolve from this
// immutable commit; this wrapper changes no existing provider semantics.
await import('https://raw.githubusercontent.com/johnscafide/njtaxrelief/933bf3b83e47f87d41920258940e40d55e3f26ad/supabase/functions/workbench-hydrate/production-bootstrap.ts');
