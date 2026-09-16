# Agent release handoff — September 16, 2026

The owner authorized merging PR #328 and will manually deploy the site. This is a code integration approval; it does not certify the unavailable authenticated staging environment.

## Preserve the latest site

The candidate includes main through `22fbd2fb097676dca6ac97d09125a085ab3ffe49`. It preserves the latest Transaction clean-route fix, municipal/evidence modules, document vault, compact deal-folder presentation, simplified CRM Contact Cleanup and Contact Intelligence, and unrelated ANCHOR changes. Small idempotency repairs prevent the new presentation scripts from repeatedly rewriting their own DOM. Vercel Git deployment remains disabled in `vercel.json`; no deployment setting was changed for this work.

## Deployment sequence

1. Use the final merged main revision for deployment, not an older local checkout.
2. Before enabling the new frontend, apply these two migrations through the normal Supabase migration process, in this order:
   - `supabase/migrations/20260915113017_agent_day_one_owner_access.sql`
   - `supabase/migrations/20260915221914_agent_transaction_workspace_access.sql`
3. Verify that the Agent owner policies require `agent`, that Transaction workspace/disclosure policies require `agent`, that source-populated Transaction items remain Pro+, and that `guard_transaction_evidence_settings` is installed. Retain migration history. Do not blindly apply unrelated pending migrations.
4. Manually deploy the merged frontend using the existing Watchdog deployment procedure. This PR changes no Edge Functions and needs no new function deployment.
5. Manually smoke-test a genuine Agent account: sign in from `/agent-desk`; save/reopen a farm; watch a property; upload/correct/export/reopen a test Contacts CSV; create/edit a Transaction, add a manual task and disclosure, reload and verify persistence. Confirm the Pro+ controls show upgrade information and do not issue paid evidence requests.
6. Check a Pro+ account still opens source evidence and the private document vault. Test a downgrade containing earlier Pro+ evidence before promising continuity of source-linked assignments: those records are gated as complete rows for Agent.

The frontend alone is insufficient: without the database migrations, the old policies still deny Agent operations. Both migrations must precede the new frontend. If migration verification fails, stop the frontend release and investigate the actual database error.

## Remaining certification

Focused route, PostgreSQL, and isolated browser regressions pass. These do not replace real-account acceptance. The configured staging project is unavailable and dedicated Agent credentials are missing. Full purchase/session, PDF/share, portal/QR, notification delivery, cross-session farming and authenticated mobile/WebKit acceptance remain open in NJW-345.

The repository also has pre-existing access-boundary and brand-governance CI failures. The obsolete onboarding breakpoint and typography-literal checks were repaired while retaining minimum readable sizes. The remaining font-governance assertion exposes a real specification mismatch: current shared UI tokens use Plus Jakarta Sans, while the older brand JSON specifies Inter for body text. Current visual styling is preserved. No release check or billing gate was disabled. Keep remaining failures visible and reconcile them separately; merging this fix is not a claim of complete launch certification.

References: [PR #328](https://github.com/johnscafide/njtaxrelief/pull/328), [NJW-345](https://linear.app/njwatchdog/issue/NJW-345), [full review](agent-day-one-readiness-2026-09-15.md).
