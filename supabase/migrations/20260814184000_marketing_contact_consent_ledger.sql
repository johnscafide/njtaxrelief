-- Email/SMS consent is explicit and independent from property data.
create table if not exists public.marketing_contact_consents (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 channel text not null check(channel in ('email','sms')), subject_hash text not null check(subject_hash ~ '^[a-f0-9]{64}$'),
 status text not null default 'granted' check(status in ('granted','revoked','expired')),
 source text not null, evidence jsonb not null default '{}'::jsonb,
 granted_at timestamptz not null default now(), revoked_at timestamptz, expires_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id,channel,subject_hash)
);
create index if not exists marketing_contact_consents_active_idx on public.marketing_contact_consents(user_id,channel,subject_hash) where status='granted';
alter table public.marketing_contact_consents enable row level security;
create policy marketing_contact_consents_owner_read on public.marketing_contact_consents for select to authenticated using (user_id=auth.uid() and public.can_use_data_workbench(auth.uid()));
revoke insert,update,delete on public.marketing_contact_consents from anon,authenticated;
grant all on public.marketing_contact_consents to service_role;

create or replace function public.marketing_has_contact_consent(p_user_id uuid,p_channel text,p_subject_hash text) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.marketing_contact_consents c where c.user_id=p_user_id and c.channel=lower(trim(p_channel)) and c.subject_hash=lower(trim(p_subject_hash)) and c.status='granted' and (c.expires_at is null or c.expires_at>now()))
 and not public.marketing_is_suppressed(p_user_id,lower(trim(p_channel)),lower(trim(p_subject_hash)))
$$;
revoke all on function public.marketing_has_contact_consent(uuid,text,text) from public,anon,authenticated;
grant execute on function public.marketing_has_contact_consent(uuid,text,text) to service_role;

create or replace function public.marketing_record_contact_consent(p_user_id uuid,p_channel text,p_subject_hash text,p_status text,p_source text,p_evidence jsonb default '{}'::jsonb,p_expires_at timestamptz default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare ch text:=lower(trim(coalesce(p_channel,''))); h text:=lower(trim(coalesce(p_subject_hash,''))); st text:=lower(trim(coalesce(p_status,''))); cid uuid;
begin
 if ch not in ('email','sms') then raise exception 'Unsupported consent channel'; end if;
 if h !~ '^[a-f0-9]{64}$' then raise exception 'Consent subject must be a SHA-256 hash'; end if;
 if st not in ('granted','revoked','expired') then raise exception 'Invalid consent status'; end if;
 if nullif(trim(coalesce(p_source,'')),'') is null then raise exception 'Consent source is required'; end if;
 insert into public.marketing_contact_consents(user_id,channel,subject_hash,status,source,evidence,granted_at,revoked_at,expires_at,updated_at)
 values(p_user_id,ch,h,st,left(trim(p_source),120),coalesce(p_evidence,'{}'::jsonb),now(),case when st='revoked' then now() else null end,p_expires_at,now())
 on conflict(user_id,channel,subject_hash) do update set status=excluded.status,source=excluded.source,evidence=excluded.evidence,revoked_at=excluded.revoked_at,expires_at=excluded.expires_at,updated_at=now()
 returning id into cid;
 return cid;
end $$;
revoke all on function public.marketing_record_contact_consent(uuid,text,text,text,text,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.marketing_record_contact_consent(uuid,text,text,text,text,jsonb,timestamptz) to service_role;
