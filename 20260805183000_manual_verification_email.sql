-- Safe follow-up for projects that already applied the original PostGrid migration.
alter table if exists public.ownership_verifications
  alter column provider set default 'manual_email';

alter table if exists public.ownership_verifications
  drop constraint if exists ownership_verifications_status_check;

alter table if exists public.ownership_verifications
  add constraint ownership_verifications_status_check
  check (status in ('queued','awaiting_mail','mailed','delivered','verified','expired','failed'));

update public.ownership_verifications
set provider='manual_email'
where provider='postgrid' and status='queued';
