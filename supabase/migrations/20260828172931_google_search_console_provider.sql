insert into public.marketing_providers (
  provider_key, display_name, provider_type, capabilities, default_mode,
  config_schema, active, adapter_version, auth_strategy, docs_url,
  operations, compliance, credential_schema, billing_model
) values (
  'google_search_console',
  'Google Search Console',
  'search_analytics',
  '{"search_analytics":true,"queries":true,"pages":true,"countries":true,"devices":true}'::jsonb,
  'not_connected',
  '{}'::jsonb,
  true,
  '1',
  'oauth2_multi_user',
  'https://developers.google.com/webmaster-tools/v1/searchanalytics/query',
  '["health","sites","search_analytics","status"]'::jsonb,
  '{"aggregate_search_performance_only":true,"personal_identity_data":false,"property_search_data":false}'::jsonb,
  '{"per_user_oauth":true,"server_secrets":["GOOGLE_ADS_CLIENT_ID","GOOGLE_ADS_CLIENT_SECRET"],"scopes":["https://www.googleapis.com/auth/webmasters.readonly"]}'::jsonb,
  'included'
)
on conflict (provider_key) do update set
  display_name=excluded.display_name,
  provider_type=excluded.provider_type,
  capabilities=excluded.capabilities,
  active=excluded.active,
  adapter_version=excluded.adapter_version,
  auth_strategy=excluded.auth_strategy,
  docs_url=excluded.docs_url,
  operations=excluded.operations,
  compliance=excluded.compliance,
  credential_schema=excluded.credential_schema,
  billing_model=excluded.billing_model,
  updated_at=now();
