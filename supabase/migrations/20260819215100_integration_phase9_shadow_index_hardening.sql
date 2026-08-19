create index if not exists integration_policy_evaluations_event_idx on public.integration_policy_evaluations(event_id) where event_id is not null;
create index if not exists integration_policy_evaluations_policy_idx on public.integration_policy_evaluations(policy_id,created_at desc);
create index if not exists integration_shadow_actions_evaluation_idx on public.integration_shadow_actions(evaluation_id,created_at);
create index if not exists integration_shadow_actions_user_idx on public.integration_shadow_actions(user_id,created_at desc);
