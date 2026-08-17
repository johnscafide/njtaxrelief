-- ANCHOR estimator acquisition attribution and Google Places evidence.
-- Keeps ingestion source (anchor-estimator) separate from the visitor's
-- self-reported discovery source and stores the selected Google Place ID.

alter table public.backoffice_leads
  add column if not exists referral_source text,
  add column if not exists referral_source_detail text,
  add column if not exists google_place_id text;

comment on column public.backoffice_leads.referral_source is
  'Visitor self-reported discovery source for acquisition analytics (for example google, friend_family, ai_assistant).';
comment on column public.backoffice_leads.referral_source_detail is
  'Optional self-reported detail, such as the AI assistant name or an Other-source description.';
comment on column public.backoffice_leads.google_place_id is
  'Google Places place_id selected in the ANCHOR estimator before lead submission.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'backoffice_leads_referral_source_length'
      and conrelid = 'public.backoffice_leads'::regclass
  ) then
    alter table public.backoffice_leads
      add constraint backoffice_leads_referral_source_length
      check (referral_source is null or char_length(referral_source) between 1 and 80);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'backoffice_leads_referral_source_detail_length'
      and conrelid = 'public.backoffice_leads'::regclass
  ) then
    alter table public.backoffice_leads
      add constraint backoffice_leads_referral_source_detail_length
      check (referral_source_detail is null or char_length(referral_source_detail) <= 120);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'backoffice_leads_google_place_id_length'
      and conrelid = 'public.backoffice_leads'::regclass
  ) then
    alter table public.backoffice_leads
      add constraint backoffice_leads_google_place_id_length
      check (google_place_id is null or char_length(google_place_id) <= 255);
  end if;
end
$$;

create index if not exists backoffice_leads_referral_source_created_idx
  on public.backoffice_leads (referral_source, created_at desc)
  where referral_source is not null;

create or replace function public.backoffice_sync_anchor_attribution()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  raw_source text;
  raw_detail text;
  raw_place_id text;
  google_selected boolean;
begin
  if new.source <> 'anchor-estimator' then
    return new;
  end if;

  raw_source := nullif(btrim(coalesce(new.raw_payload #>> '{lead,referral_source}', '')), '');
  raw_detail := nullif(btrim(coalesce(new.raw_payload #>> '{lead,referral_source_detail}', '')), '');
  raw_place_id := nullif(btrim(coalesce(new.raw_payload #>> '{lead,google_place_id}', '')), '');
  google_selected := lower(coalesce(new.raw_payload #>> '{lead,google_address_selected}', 'false'))
    in ('true', '1', 'yes');

  if raw_source is not null then
    new.referral_source := left(raw_source, 80);
  end if;
  if raw_detail is not null then
    new.referral_source_detail := left(raw_detail, 120);
  end if;
  if raw_place_id is not null then
    new.google_place_id := left(raw_place_id, 255);
  end if;

  if google_selected then
    new.submitted_address_json := coalesce(new.submitted_address_json, '{}'::jsonb)
      || jsonb_strip_nulls(jsonb_build_object(
        'entry_method', 'google_places',
        'google_place_id', new.google_place_id
      ));
  end if;

  return new;
end
$$;

revoke all on function public.backoffice_sync_anchor_attribution() from public, anon, authenticated;

drop trigger if exists backoffice_sync_anchor_attribution on public.backoffice_leads;
create trigger backoffice_sync_anchor_attribution
before insert or update of raw_payload, referral_source, referral_source_detail, google_place_id
on public.backoffice_leads
for each row
execute function public.backoffice_sync_anchor_attribution();
