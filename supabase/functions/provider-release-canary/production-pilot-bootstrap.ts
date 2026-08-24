// NJW-143 bounded extension of the existing provider release canary.
// The pilot_observed_v1 scenario is handled by the local authenticated helper;
// every pre-existing scenario is delegated unchanged to the pinned production handler.
import { handlePilotCanary } from './pilot-canary.ts';

const nativeServe = Deno.serve.bind(Deno);

function withPilotScenario(handler: Deno.ServeHandler): Deno.ServeHandler {
  return async (request, info) => {
    if (request.method === 'POST') {
      try {
        const body = await request.clone().json();
        if (String(body?.scenario || '').trim() === 'pilot_observed_v1') {
          return handlePilotCanary(request);
        }
      } catch {
        // Delegate malformed/non-PILOT requests to the existing handler so its
        // established error contract remains authoritative.
      }
    }
    return handler(request, info);
  };
}

const wrappedServe = ((first: unknown, second?: unknown) => {
  if (typeof first === 'function') return nativeServe(withPilotScenario(first as Deno.ServeHandler));
  if (typeof second === 'function') return nativeServe(first as Deno.ServeOptions, withPilotScenario(second as Deno.ServeHandler));
  return nativeServe(first as Deno.ServeOptions);
}) as typeof Deno.serve;

Object.defineProperty(Deno, 'serve', {
  configurable: true,
  writable: true,
  value: wrappedServe,
});

await import('https://raw.githubusercontent.com/johnscafide/njtaxrelief/ec612c488474af94ea4ba897b431a5c182645484/supabase/functions/provider-release-canary/production-bootstrap.ts');
