-- NJW-254 Phase G performance hardening for creative learning lineage.
-- Cover foreign-key lookups that will become material as approved creative history grows.

create index if not exists marketing_creative_learning_context_user_idx
  on public.marketing_creative_learning_contexts(user_id, approved_at desc);

create index if not exists marketing_creative_learning_context_brief_idx
  on public.marketing_creative_learning_contexts(intelligence_brief_id)
  where intelligence_brief_id is not null;

create index if not exists marketing_creative_learning_context_recommendation_id_idx
  on public.marketing_creative_learning_contexts(recommendation_id)
  where recommendation_id is not null;