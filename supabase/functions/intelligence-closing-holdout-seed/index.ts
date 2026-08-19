import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// One-time Closing Review v3 fresh-holdout seeding completed on 2026-08-19.
// The write-capable implementation remains auditable in Git history at commit
// 96f741aace70f428655f27b2d3b01e2249b6cffa. Keep this endpoint retired so a
// reviewed/partially reviewed calibration queue cannot be silently reseeded.
Deno.serve(() => new Response(JSON.stringify({
  error: "Retired. Closing Review v3 fresh holdout has already been seeded.",
  calibration_set_id: "dac7ead3-46ec-46ab-ab51-2b9d0bf8138e",
  seeded_cases: 35,
  reviewer_blind: true,
}), {
  status: 410,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "private, no-store",
  },
}));
