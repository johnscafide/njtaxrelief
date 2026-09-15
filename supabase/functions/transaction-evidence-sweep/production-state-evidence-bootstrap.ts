// Production wrapper: run the certified Transaction evidence sweep first, then
// layer annual state, live municipal, governed manual routes, energy,
// municipal-requirement and county evidence on top. Strong live observations are
// applied before manual route-only providers so source discovery cannot overwrite
// completed evidence.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const nativeServe = Deno.serve.bind(Deno);

async function invokeProvider(slug: string, url: string, authorization: string, apiKey: string, body: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${url}/functions/v1/${slug}`, {
      method: "POST",
      headers: { Authorization: authorization, apikey: apiKey, "Content-Type": "application/json" },
      body,
      signal: controller.signal,
    });
    if (!response.ok) console.warn(`${slug} additive provider returned HTTP ${response.status}`);
  } catch (error) {
    console.warn(`${slug} additive provider skipped`, error);
  } finally {
    clearTimeout(timeout);
  }
}

const wrappedServe = ((first: unknown, second?: unknown) => {
  const wrap = (handler: Deno.ServeHandler): Deno.ServeHandler => async (request, info) => {
    const body = request.method === "POST" ? await request.clone().text().catch(() => "") : "";
    const response = await handler(request, info);
    if (request.method === "POST" && response.ok && body) {
      const url = Deno.env.get("SUPABASE_URL") || "";
      const authorization = request.headers.get("authorization") || "";
      const apiKey = request.headers.get("apikey") || Deno.env.get("SUPABASE_ANON_KEY") || "";
      if (url && authorization) {
        await invokeProvider("transaction-state-evidence", url, authorization, apiKey, body, 15000);
        await invokeProvider("transaction-municipal-evidence", url, authorization, apiKey, body, 30000);
        await invokeProvider("transaction-munidex-evidence", url, authorization, apiKey, body, 30000);
        await invokeProvider("transaction-hls-evidence", url, authorization, apiKey, body, 30000);
        await invokeProvider("transaction-cite-evidence", url, authorization, apiKey, body, 30000);
        await invokeProvider("transaction-account-route", url, authorization, apiKey, body, 15000);
        await invokeProvider("transaction-tax-sale-route", url, authorization, apiKey, body, 15000);
        await invokeProvider("transaction-code-violation-route", url, authorization, apiKey, body, 15000);
        await invokeProvider("transaction-energy-evidence", url, authorization, apiKey, body, 30000);
        await invokeProvider("transaction-municipal-requirements", url, authorization, apiKey, body, 30000);
        await invokeProvider("transaction-county-evidence", url, authorization, apiKey, body, 15000);
      }
    }
    return response;
  };
  if (typeof first === "function") return nativeServe(wrap(first as Deno.ServeHandler));
  if (typeof second === "function") return nativeServe(first as Deno.ServeOptions, wrap(second as Deno.ServeHandler));
  return nativeServe(first as Deno.ServeOptions);
}) as typeof Deno.serve;

Object.defineProperty(Deno, "serve", { configurable: true, writable: true, value: wrappedServe });
await import("https://raw.githubusercontent.com/johnscafide/njtaxrelief/7ac96705b68b9f1f5e81e4cf138b157c00ec2505/supabase/functions/transaction-evidence-sweep/index.ts");
