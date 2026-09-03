alter table public.anchor_relief_profiles
  add column if not exists source_application_id uuid references public.anchor_applications(id) on delete cascade;

create or replace function public.sync_anchor_relief_profile_from_application()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.anchor_relief_profiles (
    user_id,
    vault_key_id,
    source_application_id,
    source_tax_year,
    schema_version,
    profile_ciphertext_b64,
    profile_iv_b64,
    profile_cipher_sha256,
    crypto_algorithm,
    created_at,
    updated_at
  ) values (
    new.user_id,
    new.vault_key_id,
    new.id,
    new.tax_year,
    new.schema_version,
    new.answers_ciphertext_b64,
    new.answers_iv_b64,
    new.answers_cipher_sha256,
    new.crypto_algorithm,
    coalesce(new.created_at, now()),
    now()
  )
  on conflict (user_id) do update set
    vault_key_id = excluded.vault_key_id,
    source_application_id = excluded.source_application_id,
    source_tax_year = excluded.source_tax_year,
    schema_version = excluded.schema_version,
    profile_ciphertext_b64 = excluded.profile_ciphertext_b64,
    profile_iv_b64 = excluded.profile_iv_b64,
    profile_cipher_sha256 = excluded.profile_cipher_sha256,
    crypto_algorithm = excluded.crypto_algorithm,
    updated_at = now();
  return new;
end;
$$;

revoke all on function public.sync_anchor_relief_profile_from_application() from public;

create trigger anchor_applications_sync_relief_profile
after insert or update of vault_key_id, tax_year, schema_version, answers_ciphertext_b64, answers_iv_b64, answers_cipher_sha256, crypto_algorithm
on public.anchor_applications
for each row execute function public.sync_anchor_relief_profile_from_application();

insert into public.anchor_relief_profiles (
  user_id,
  vault_key_id,
  source_application_id,
  source_tax_year,
  schema_version,
  profile_ciphertext_b64,
  profile_iv_b64,
  profile_cipher_sha256,
  crypto_algorithm,
  created_at,
  updated_at
)
select distinct on (a.user_id)
  a.user_id,
  a.vault_key_id,
  a.id,
  a.tax_year,
  a.schema_version,
  a.answers_ciphertext_b64,
  a.answers_iv_b64,
  a.answers_cipher_sha256,
  a.crypto_algorithm,
  a.created_at,
  a.updated_at
from public.anchor_applications a
order by a.user_id, a.updated_at desc
on conflict (user_id) do update set
  vault_key_id = excluded.vault_key_id,
  source_application_id = excluded.source_application_id,
  source_tax_year = excluded.source_tax_year,
  schema_version = excluded.schema_version,
  profile_ciphertext_b64 = excluded.profile_ciphertext_b64,
  profile_iv_b64 = excluded.profile_iv_b64,
  profile_cipher_sha256 = excluded.profile_cipher_sha256,
  crypto_algorithm = excluded.crypto_algorithm,
  updated_at = excluded.updated_at;

alter table public.anchor_relief_profiles
  alter column source_application_id set not null;

comment on column public.anchor_relief_profiles.source_application_id is
'Application whose ciphertext/AAD context is mirrored into this reusable profile. Future clients decrypt using the original application id and source tax year.';
