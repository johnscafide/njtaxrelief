import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// The one-shot Closing Review v7 development sanity set was successfully seeded
// on 2026-08-19. Keep this endpoint retired so the fixed 10-case product sanity
// queue cannot be silently replaced or expanded after human review begins.
Deno.serve(() => new Response(JSON.stringify({
  error: "Retired. Closing Review v7 development sanity queue has already been seeded.",
  development_only: true,
  promotion_proof: false,
  seeded_cases: 10,
}), {
  status: 410,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "private, no-store",
  },
}));
