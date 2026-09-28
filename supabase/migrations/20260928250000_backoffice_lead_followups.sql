-- Backoffice follow-ups.
--
-- John and Heather work the inbound lead queue as a pipeline. Each lead can
-- carry one next step with a due date, and the time of the last logged call,
-- text or email. All three columns are nullable, so existing rows and the
-- intake paths that do not know about follow-ups keep working unchanged.
--
-- backoffice-api writes these columns through its session-checked `update`
-- and `log_contact` actions. Browser roles still cannot read the table.

alter table public.backoffice_leads
  add column if not exists next_action text,
  add column if not exists next_action_due date,
  add column if not exists last_contacted_at timestamptz;

comment on column public.backoffice_leads.next_action is
  'Operator-entered next step for this lead (for example "Call back Tuesday about spring listing"). At most 200 characters.';
comment on column public.backoffice_leads.next_action_due is
  'Date the next step is due. Drives the Backoffice Due today / Overdue / Upcoming views.';
comment on column public.backoffice_leads.last_contacted_at is
  'When an operator last logged a call, text or email to this lead from Backoffice.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'backoffice_leads_next_action_length'
      and conrelid = 'public.backoffice_leads'::regclass
  ) then
    alter table public.backoffice_leads
      add constraint backoffice_leads_next_action_length
      check (next_action is null or char_length(next_action) <= 200);
  end if;
end
$$;

-- "My follow-ups due" reads by owner and due date, and only open leads matter.
create index if not exists backoffice_leads_owner_followup_idx
  on public.backoffice_leads (crm_owner, next_action_due)
  where lead_status not in ('closed', 'archived');
