import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Closing Review v4 completed its structural diagnostic on 2026-08-19.
// The write-free diagnostic implementation remains auditable in Git history at
// commit 1c7d943b4286f8dfe6ee3a8e58e680897a8ddf77. v4 exposed a checked-no-value
// permit semantics problem and has been frozen as a structural artifact.
Deno.serve(() => new Response(JSON.stringify({
  error: "Retired. Closing Review v4 structural diagnosis is complete.",
  draft_version: 4,
  customer_version_unchanged: 2,
  successor: "closing_review v5",
}), {
  status: 410,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "private, no-store",
  },
}));
