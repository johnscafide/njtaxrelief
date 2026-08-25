-- NJW-238 / NJW-243: distinguish provider-declared capabilities from
-- Watchdog adapter operations that are actually implemented and certified.
-- PCM supports cancellation, but Watchdog intentionally does not advertise
-- `cancel` as an executable adapter operation until the current direct API
-- wire contract is mechanically certified and a pending-only server path ships.

update public.marketing_providers
set
  operations = '["health","quote","validate","submit","status","proof","tracking"]'::jsonb,
  capabilities = coalesce(capabilities, '{}'::jsonb) || jsonb_build_object(
    'provider_cancel_supported', true,
    'cancel_contract_status', 'pending_wire_certification',
    'webhook_signature_contract_status', 'pending_wire_certification',
    'webhook_retry_minutes', jsonb_build_array(1,5,10),
    'webhook_exact_duplicate_ack', true,
    'dynamic_image_variable', 'DynamicImage',
    'dynamic_image_contract_status', 'documented_not_enabled',
    'proof_retention_required', true,
    'live_send_enabled', false
  ),
  updated_at = now()
where provider_key = 'pcm';
