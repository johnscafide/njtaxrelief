alter table public.intelligence_daily_digests
  drop constraint if exists intelligence_daily_digests_user_id_scope_id_model_key_curre_key;

alter table public.intelligence_daily_digests
  add constraint intelligence_daily_digests_user_scope_model_date_key
  unique(user_id,scope_id,model_key,digest_date);
