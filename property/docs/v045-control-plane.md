# Watchdog v0.45 control plane

## What is live

- `watchdog_v045_control_plane` is applied to the primary Supabase project.
- `municipal-data` Edge Function version 3 is active with JWT verification, the current property-lookup schema, and explicit retry timing for rate-limited clients.
- Anonymous execution of `record_lookup(jsonb)` is revoked.
- Agent territories, ZIP-aware sphere rows, and privacy-minimized funnel events are private, Pro-gated records.
- Municipal requests are plan-limited, traced with a delivery UUID, and returned with `Cache-Control: no-store`.

## Static upload

Upload the release ZIP while preserving paths. The shared sidebar file and every HTML file listed in `CHANGED-FILES-v0.45.0.txt` must be uploaded together so their cache-busted script reference stays in sync.

## Acceptance checks after upload

1. Sign in as Standard: Agent Control is not accessible and the protected municipal endpoint returns Standard-sized results.
2. Sign in as Pro: create a municipal, county, and ZIP territory; `Check data` returns a protected inventory count.
3. Open an Agent Desk evidence drawer and property link, then confirm the 30-day funnel advances.
4. Sign in as Pro+: confirm the protected endpoint allows the higher row limit.
5. Sign in as Developer: open Version History and confirm v0.45.0, six active roadmap projects, product-area charts, and deployment confidence.
6. Repeat one endpoint request above its five-minute plan quota and confirm HTTP 429 plus `Retry-After`.

## External security setting still required

Enable leaked-password protection in the Supabase Auth dashboard. The remaining `RLS enabled, no policy` INFO notices are intentional for service-only ledgers and warehouse tables; they have no browser grants. Review signed-in SECURITY DEFINER RPC warnings separately because several are intentional customer actions.

Supabase reference: <https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection>
