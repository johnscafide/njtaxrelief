# NJW-167 SECURITY DEFINER audit — 2026-08-17

Project: `uvkvaxljhhngydvlrzom`

This document classifies the Supabase Security Advisor `security_definer_view`, `anon_security_definer_function_executable`, and `authenticated_security_definer_function_executable` findings reviewed for NJW-167. The goal is not to make the advisor silent by blanket-revoking application APIs. It is to remove unnecessary privilege elevation, prevent cross-user/global-write abuse, and explicitly record the functions that must remain exposed because they are the intended application API.

## Remediated in NJW-167

- `workbench_provider_registry_summary` — **authenticated Data Workbench read**. Convert from security-definer view to `security_invoker=true`; the base `data_center_provider_coverage` table currently has RLS enabled with no policy, so add an explicit entitled-user SELECT policy and grant authenticated callers only the three base columns needed by the summary.
- `watchdog_effective_plan(uuid)` — **service/internal helper**. Revoke browser execution. Authenticated browser code must use an owner-scoped entitlement API instead of passing an arbitrary UUID.
- `can_use_data_workbench(uuid)` — **authenticated owner-scoped entitlement helper**. It must remain executable because RLS policies depend on it, but authenticated callers are restricted to `auth.uid()`; only service-role requests may evaluate an explicit target UUID.
- `save_public_watchdog_score_cache(jsonb)` — **service-only global write**. Revoke `PUBLIC`, `anon`, and `authenticated`; retain `service_role` only.
- `marketing_direct_mail_quote(...)` — **authenticated compatibility wrapper**. Convert the wrapper to `SECURITY INVOKER`; the delegated `marketing_direct_mail_product_quote(...)` remains the owner/plan-enforcing privileged API.

## Intentional public SECURITY DEFINER API

These functions expose public/non-user-specific score data or sanitized product telemetry. They remain callable by `anon` and `authenticated`; their advisor warnings are accepted rather than breaking public property/town surfaces.

- `get_public_property_watchdog_scores(text[])` — public property score rows only.
- `get_public_realtime_watchdog_scores(jsonb)` — public score computation; input is bounded by the function contract.
- `get_public_town_watchdog_scores()` — public town-level score output.
- `get_public_watchdog_score_cache(text[])` — public cached score output.
- `record_product_event(...)` — public product telemetry ingest; no privileged customer data is returned. Abuse/rate-limit hardening, if needed, is operational hardening rather than a reason to expose underlying tables.

## Intentional authenticated owner-scoped/core APIs

These remain `SECURITY DEFINER` because they intentionally cross otherwise-closed RLS/table boundaries, while deriving the caller from `auth.uid()` or delegating to an owner-scoped entitlement contract.

- `get_agent_usage()`
- `get_latest_workbench_refresh()`
- `get_my_entitlement()`
- `get_workbench_marker_aliases()`
- `get_workbench_provider_coverage()`
- `has_watchdog_plan(text)`
- `is_watchdog_developer()`
- `request_verify_code(text,text)`
- `redeem_verify_code(text,text)`
- `save_property(jsonb)`
- `verification_delivery_status()`

`record_lookup(jsonb)` is currently authenticated-only and is intentionally not broadened or redesigned in NJW-167. Its payload validation, rate limiting and warehouse-poisoning review is tracked by NJW-35.

## Intentional authenticated Marketing Studio APIs

The Security Advisor flags these because signed-in users can execute a definer function. Review of the deployed function bodies shows the application-facing functions derive `auth.uid()` and enforce Data Workbench/Marketing Studio entitlement and/or campaign/list ownership before privileged reads or writes. The three `marketing_direct_mail_admin_*` functions additionally enforce the developer check. These warnings are therefore accepted as intentional application API boundaries unless a future caller audit proves an RPC is unused.

- `marketing_add_suppression(...)`
- `marketing_approve_creative(uuid)`
- `marketing_approve_direct_mail_launch(uuid,uuid)`
- `marketing_audience_hub_apply_keys(...)`
- `marketing_audience_hub_apply_opportunity(...)`
- `marketing_audience_hub_apply_source(...)`
- `marketing_audience_hub_create_farm(...)`
- `marketing_audience_review_filtered_page(...)`
- `marketing_audience_review_keys(uuid)`
- `marketing_audience_review_page(...)`
- `marketing_audience_saved_areas(uuid)`
- `marketing_bind_pcm_design(...)`
- `marketing_campaign_metrics(uuid)`
- `marketing_configure_dynamic_audience(...)`
- `marketing_configure_sequence(...)`
- `marketing_create_campaign_from_opportunity(...)`
- `marketing_create_tracking_link(...)`
- `marketing_creative_studio_bootstrap(uuid)`
- `marketing_credit_quote_adjustment(uuid)`
- `marketing_credit_summary()`
- `marketing_delete_saved_area(uuid)`
- `marketing_direct_mail_admin_customers(...)` — developer-gated.
- `marketing_direct_mail_admin_orders(...)` — developer-gated.
- `marketing_direct_mail_admin_summary(integer)` — developer-gated.
- `marketing_direct_mail_product_options(text)`
- `marketing_direct_mail_product_quote(...)`
- `marketing_direct_mail_recipient_page(...)`
- `marketing_direct_mail_recipient_summary(uuid)`
- `marketing_discover_opportunities(text)`
- `marketing_dynamic_list_scan_status(uuid)`
- `marketing_exclude_invalid_direct_mail_recipients(uuid)`
- `marketing_pcm_design_state(uuid)`
- `marketing_prepare_direct_mail_recipients(uuid)`
- `marketing_recipient_source_catalog(uuid)`
- `marketing_recipient_source_map(uuid,text[])`
- `marketing_record_manual_conversion(...)`
- `marketing_save_brand_profile(...)`
- `marketing_save_creative(...)`
- `marketing_save_direct_mail_settings(...)`
- `marketing_save_pcm_design_variables(...)`
- `marketing_select_pcm_design(...)`
- `marketing_select_provider_account(...)`
- `marketing_set_automation_state(...)`
- `marketing_set_direct_mail_recipient_excluded(...)`
- `marketing_set_pcm_proof_review(...)`
- `marketing_set_recipient_source(...)`
- `marketing_studio_bootstrap()`
- `marketing_studio_create_campaign(...)`
- `marketing_studio_quote(...)`
- `marketing_town_options(...)`

## Advisor findings outside NJW-167

- `auth_leaked_password_protection` remains a separate Auth configuration item in the NJW-35/NJW-42 sequence.
- Most `rls_enabled_no_policy` INFO findings are not evidence of exposure by themselves. Many affected tables are intentionally service-only/closed. Their explicit-policy/operational review belongs to the later targeted security/production-readiness tickets rather than this definer-permission migration. `data_center_provider_coverage` is the exception in this work because converting its summary view to security-invoker requires an explicit entitled-user read policy.

## Production acceptance for this audit

After the migration is merged and applied, verify:

1. `workbench_provider_registry_summary` is `security_invoker=true`, `anon` cannot select it, and entitled authenticated Data Workbench callers retain the minimum underlying column access required by the view through the new explicit RLS policy.
2. `watchdog_effective_plan(uuid)` is not executable by `anon` or `authenticated`, and remains executable by `service_role`.
3. `can_use_data_workbench(uuid)` remains authenticated-callable but rejects a target UUID other than `auth.uid()`; service-role callers retain explicit-target support.
4. `save_public_watchdog_score_cache(jsonb)` is executable only by server/service roles, not `PUBLIC`, `anon`, or `authenticated`.
5. `marketing_direct_mail_quote(...)` is `SECURITY INVOKER` and the delegated product quote remains owner/plan gated.
6. Public property/town score read RPCs retain their existing public grants and outputs.
7. Security Advisor is rerun. The definer-view ERROR and the remediated function warnings must disappear; remaining warnings are compared against the classifications above rather than blanket-revoked.
8. Existing access/security, Marketing Studio, verification, Data Workbench, dashboard and static CI contracts pass.
