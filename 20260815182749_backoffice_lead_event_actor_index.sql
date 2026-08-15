create index if not exists backoffice_lead_events_actor_user_idx
  on public.backoffice_lead_events (actor_user_id)
  where actor_user_id is not null;
