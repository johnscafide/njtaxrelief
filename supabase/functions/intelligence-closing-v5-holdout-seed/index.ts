import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// One-time Closing Review v5 fresh holdout seeding completed on 2026-08-19.
// The write-capable implementation remains auditable in Git history at commit
// 0cec53d85e5c5302b328cd72ef2a0e46861233de. Keep this endpoint retired so a
// reviewed/partially reviewed v5 validation queue cannot be silently reseeded.
Deno.serve(() => new Response(JSON.stringify({
  error: "Retired. Closing Review v5 fresh holdout has already been seeded.",
  calibration_set_id: "8b227676-a758-415c-86be-6962ec3b6de0",
  seeded_cases: 35,
  reviewer_blind: true,
}), {
  status: 410,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "private, no-store",
  },
}));
