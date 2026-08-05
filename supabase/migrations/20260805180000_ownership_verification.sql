create extension if not exists pgcrypto;

create table if not exists public.ownership_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pams_pin text not null,
  delivery_address jsonb not null,
  code_hash text not null,
  code_nonce text not null,
  status text not null default 'queued' check (status in ('queued','awaiting_mail','mailed','delivered','verified','expired','failed')),
  provider text not null default 'manual_email',
  provider_id text,
  provider_message text,
  attempts integer not null default 0,
  expires_at timestamptz not null default (now() + interval '30 days'),
  mailed_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ownership_verifications_user_pin_idx on public.ownership_verifications(user_id,pams_pin,created_at desc);
alter table public.ownership_verifications enable row level security;
revoke all on public.ownership_verifications from anon, authenticated;

create or replace function public.redeem_verify_code(p_pin text, p_code text)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare v_row public.ownership_verifications; v_code text;
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'reason','Sign in required'); end if;
  v_code := upper(regexp_replace(coalesce(p_code,''),'[^A-Z0-9]','','g'));
  select * into v_row from public.ownership_verifications
   where user_id=auth.uid() and pams_pin=p_pin and status in ('queued','awaiting_mail','mailed','delivered')
   order by created_at desc limit 1 for update;
  if v_row.id is null then return jsonb_build_object('ok',false,'reason','No active code found'); end if;
  if v_row.expires_at < now() then update public.ownership_verifications set status='expired',updated_at=now() where id=v_row.id; return jsonb_build_object('ok',false,'reason','Code expired'); end if;
  if v_row.attempts >= 6 then return jsonb_build_object('ok',false,'reason','Too many attempts'); end if;
  update public.ownership_verifications set attempts=attempts+1,updated_at=now() where id=v_row.id;
  if encode(digest(v_code || v_row.code_nonce,'sha256'),'hex') <> v_row.code_hash then return jsonb_build_object('ok',false,'reason','wrong code'); end if;
  update public.ownership_verifications set status='verified',verified_at=now(),updated_at=now() where id=v_row.id;
  update public.saved_properties set verify_level='mail' where user_id=auth.uid() and pams_pin=p_pin;
  return jsonb_build_object('ok',true,'verified_at',now());
end $$;
grant execute on function public.redeem_verify_code(text,text) to authenticated;

create or replace function public.verification_delivery_status()
returns jsonb language sql security definer set search_path=public as $$
  select jsonb_build_object(
    'ok',true,
    'active',count(*) filter(where status in ('queued','awaiting_mail','mailed','delivered')),
    'verified',count(*) filter(where status='verified'),
    'failed',count(*) filter(where status='failed'),
    'latest',max(created_at)
  ) from public.ownership_verifications where user_id=auth.uid();
$$;
grant execute on function public.verification_delivery_status() to authenticated;
