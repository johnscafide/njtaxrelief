-- Provider OAuth state and token references. Secret values live in Supabase Vault.
create table if not exists public.marketing_provider_oauth_states (
 state_hash text primary key check(state_hash ~ '^[a-f0-9]{64}$'),
 user_id uuid not null references auth.users(id) on delete cascade,
 provider_key text not null references public.marketing_providers(provider_key) on update cascade on delete cascade,
 redirect_path text not null default '/property/marketing-studio.html', expires_at timestamptz not null,
 consumed_at timestamptz, created_at timestamptz not null default now()
);
alter table public.marketing_provider_oauth_states enable row level security;
revoke all on public.marketing_provider_oauth_states from anon,authenticated;
grant all on public.marketing_provider_oauth_states to service_role;
create policy marketing_provider_oauth_states_service on public.marketing_provider_oauth_states for all to service_role using (true) with check (true);

create table if not exists public.marketing_provider_secret_refs (
 id uuid primary key default gen_random_uuid(), connection_id uuid not null references public.marketing_provider_connections(id) on delete cascade,
 secret_type text not null, vault_secret_id uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(connection_id,secret_type)
);
alter table public.marketing_provider_secret_refs enable row level security;
revoke all on public.marketing_provider_secret_refs from anon,authenticated;
grant all on public.marketing_provider_secret_refs to service_role;
create policy marketing_provider_secret_refs_service on public.marketing_provider_secret_refs for all to service_role using (true) with check (true);

create or replace function public.marketing_store_provider_secret(p_connection_id uuid,p_secret_type text,p_secret text) returns uuid
language plpgsql security definer set search_path=public,vault as $$
declare ref public.marketing_provider_secret_refs%rowtype; sid uuid; st text:=lower(trim(coalesce(p_secret_type,'')));
begin
 if nullif(p_secret,'') is null then raise exception 'Provider secret cannot be empty'; end if;
 if st !~ '^[a-z0-9_]{2,50}$' then raise exception 'Invalid provider secret type'; end if;
 if not exists(select 1 from public.marketing_provider_connections where id=p_connection_id) then raise exception 'Provider connection not found'; end if;
 select * into ref from public.marketing_provider_secret_refs where connection_id=p_connection_id and secret_type=st for update;
 if ref.id is null then
   sid:=vault.create_secret(p_secret,'marketing_provider_'||p_connection_id::text||'_'||st,'Watchdog Marketing Studio provider credential',null);
   insert into public.marketing_provider_secret_refs(connection_id,secret_type,vault_secret_id) values(p_connection_id,st,sid);
 else
   sid:=ref.vault_secret_id;
   perform vault.update_secret(sid,p_secret,'marketing_provider_'||p_connection_id::text||'_'||st,'Watchdog Marketing Studio provider credential',null);
   update public.marketing_provider_secret_refs set updated_at=now() where id=ref.id;
 end if;
 return sid;
end $$;
revoke all on function public.marketing_store_provider_secret(uuid,text,text) from public,anon,authenticated;
grant execute on function public.marketing_store_provider_secret(uuid,text,text) to service_role;

create or replace function public.marketing_get_provider_secret(p_connection_id uuid,p_secret_type text) returns text
language sql stable security definer set search_path=public,vault as $$
 select ds.decrypted_secret from public.marketing_provider_secret_refs r join vault.decrypted_secrets ds on ds.id=r.vault_secret_id
 where r.connection_id=p_connection_id and r.secret_type=lower(trim(p_secret_type)) limit 1
$$;
revoke all on function public.marketing_get_provider_secret(uuid,text) from public,anon,authenticated;
grant execute on function public.marketing_get_provider_secret(uuid,text) to service_role;

create or replace function public.marketing_select_provider_account(p_provider_key text,p_external_account_ref text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); conn public.marketing_provider_connections%rowtype; acct text:=regexp_replace(coalesce(p_external_account_ref,''),'[^0-9]','','g'); allowed boolean:=false;
begin
 if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
 if acct !~ '^[0-9]{10}$' then raise exception 'Invalid account identifier'; end if;
 select * into conn from public.marketing_provider_connections where user_id=uid and provider_key=p_provider_key and connection_scope='user' and status='connected' for update;
 if conn.id is null then raise exception 'Provider account is not connected'; end if;
 select exists(select 1 from jsonb_array_elements_text(coalesce(conn.public_config->'accessible_accounts','[]'::jsonb)) x where regexp_replace(x,'[^0-9]','','g')=acct) into allowed;
 if not allowed then raise exception 'Account is not available to this connection'; end if;
 update public.marketing_provider_connections set external_account_ref=acct,public_config=jsonb_set(public_config,'{selected_account}',to_jsonb(acct),true),updated_at=now() where id=conn.id;
 return jsonb_build_object('provider_key',p_provider_key,'selected_account',acct,'status','connected');
end $$;
revoke all on function public.marketing_select_provider_account(text,text) from public,anon;
grant execute on function public.marketing_select_provider_account(text,text) to authenticated;
