-- NJW-343 performance hardening: exact covering indexes for composite workspace foreign keys.
create index if not exists transaction_items_workspace_fk_idx
  on public.transaction_items(transaction_id,user_id);

create index if not exists transaction_disclosures_workspace_fk_idx
  on public.transaction_disclosures(transaction_id,user_id);

create index if not exists transaction_activity_workspace_fk_idx
  on public.transaction_activity(transaction_id,user_id);
