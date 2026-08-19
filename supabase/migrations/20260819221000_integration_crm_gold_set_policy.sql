create table if not exists public.integration_crm_match_policy (
  provider text not null,
  match_method text not null,
  auto_verify_enabled boolean not null default false,
  minimum_human_reviews integer not null default 50 check (minimum_human_reviews >= 1),
  maximum_false_positive_rate numeric(6,5) not null default 0.01000 check (maximum_false_positive_rate >= 0 and maximum_false_positive_rate <= 1),
  policy_version integer not null default 1 check (policy_version >= 1),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider, match_method)
);

alter table public.integration_crm_match_policy enable row level security;
revoke all on table public.integration_crm_match_policy from public, anon, authenticated;
grant select, insert, update, delete on table public.integration_crm_match_policy to service_role;

insert into public.integration_crm_match_policy (
  provider,
  match_method,
  auto_verify_enabled,
  minimum_human_reviews,
  maximum_false_positive_rate,
  policy_version,
  notes
)
values (
  'boldtrail',
  'exact_normalized_street_and_zip_unique',
  false,
  50,
  0.01000,
  1,
  'Human-confirmed mode. Unique exact normalized street plus ZIP matches remain review candidates. Auto-verification requires a later explicit policy review after at least 50 human-reviewed examples and must never infer ownership or seller intent.'
)
on conflict (provider, match_method) do update
set auto_verify_enabled = false,
    minimum_human_reviews = excluded.minimum_human_reviews,
    maximum_false_positive_rate = excluded.maximum_false_positive_rate,
    policy_version = greatest(public.integration_crm_match_policy.policy_version, excluded.policy_version),
    notes = excluded.notes,
    updated_at = now();

update public.integration_crm_property_links
set evidence = coalesce(evidence, '{}'::jsonb) || jsonb_build_object(
      'gold_set', true,
      'gold_rule', 'exact_normalized_street_and_zip_unique',
      'match_tier', 'human_verified_gold',
      'gold_set_promoted_at', now()
    ),
    updated_at = now()
where status = 'verified'
  and evidence->>'match_policy' = 'exact_normalized_street_and_zip';

update public.integration_crm_property_links
set evidence = coalesce(evidence, '{}'::jsonb) || jsonb_build_object(
      'gold_rule', 'exact_normalized_street_and_zip_unique',
      'match_tier', 'high_confidence_recommended'
    ),
    updated_at = now()
where status = 'candidate'
  and link_method = 'exact_address_candidate'
  and candidate_count = 1
  and evidence->>'match_policy' = 'exact_normalized_street_and_zip';
