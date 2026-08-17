-- Cover the Intelligence run -> model foreign key for model lifecycle operations.
create index if not exists intelligence_runs_model_key_idx
  on public.intelligence_runs(model_key);
