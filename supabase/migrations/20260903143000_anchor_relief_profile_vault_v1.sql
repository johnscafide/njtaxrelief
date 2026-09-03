create table if not exists public.anchor_relief_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  vault_key_id uuid not null references public.anchor_application_vault_keys(id) on delete restrict,
  source_tax_year smallint not null check (source_tax_year between 2025 and 2100),
  schema_version text not null default '1',
  profile_ciphertext_b64 text not null,
  profile_iv_b64 text not null,
  profile_cipher_sha256 text not null check (profile_cipher_sha256 ~ '^[0-9a-f]{64}$'),
  crypto_algorithm text not null default 'AES-256-GCM' check (crypto_algorithm = 'AES-256-GCM'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.anchor_relief_profiles enable row level security;

revoke all on table public.anchor_relief_profiles from anon;
grant select, insert, update, delete on table public.anchor_relief_profiles to authenticated;

create policy anchor_relief_profiles_owner_select
on public.anchor_relief_profiles for select to authenticated
using ((select auth.uid()) = user_id);

create policy anchor_relief_profiles_owner_insert
on public.anchor_relief_profiles for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy anchor_relief_profiles_owner_update
on public.anchor_relief_profiles for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy anchor_relief_profiles_owner_delete
on public.anchor_relief_profiles for delete to authenticated
using ((select auth.uid()) = user_id);

create trigger anchor_relief_profiles_touch_updated_at
before update on public.anchor_relief_profiles
for each row execute function public.touch_updated_at();

comment on table public.anchor_relief_profiles is
'Zero-knowledge reusable property-relief profile. Sensitive answers are AES-GCM encrypted in the browser; the vault key is never stored server-side.';
