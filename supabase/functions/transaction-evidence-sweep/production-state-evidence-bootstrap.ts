// Production wrapper: run the current-state evidence provider before the certified
// Transaction evidence sweep. Failure of the additive provider never blocks the
// existing DCA/CO/county evidence path.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const nativeServe = Deno.serve.bind(Deno);
const wrappedServe = ((first: unknown, second?: unknown) => {
  const wrap = (handler: Deno.ServeHandler): Deno.ServeHandler => async (request, info) => {
    if (request.method === "POST") {
      try {
        const url = Deno.env.get("SUPABASE_URL") || "";
        const authorization = request.headers.get("authorization") || "";
        const apiKey = request.headers.get("apikey") || Deno.env.get("SUPABASE_ANON_KEY") || "";
        const body = await request.clone().text();
        if (url && authorization && body) {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15000);
          try {
            await fetch(`${url}/functions/v1/transaction-state-evidence`, {
              method: "POST",
              headers: { Authorization: authorization, apikey: apiKey, "Content-Type": "application/json" },
              body,
              signal: controller.signal,
            });
          } finally { clearTimeout(timeout); }
        }
      } catch (error) {
        console.warn("transaction-state-evidence additive provider skipped", error);
      }
    }
    return handler(request, info);
  };
  if (typeof first === "function") return nativeServe(wrap(first as Deno.ServeHandler));
  if (typeof second === "function") return nativeServe(first as Deno.ServeOptions, wrap(second as Deno.ServeHandler));
  return nativeServe(first as Deno.ServeOptions);
}) as typeof Deno.serve;

Object.defineProperty(Deno, "serve", { configurable: true, writable: true, value: wrappedServe });

// Pin the evidence sweep version that is currently deployed as v1.
await import("https://raw.githubusercontent.com/johnscafide/njtaxrelief/7ac96705b68b9f1f5e81e4cf138b157c00ec2505/supabase/functions/transaction-evidence-sweep/index.ts");
