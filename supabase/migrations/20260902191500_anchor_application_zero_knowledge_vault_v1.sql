-- NJW-303: zero-knowledge lifetime vault for guided NJ property-tax-relief applications.
-- Sensitive answers and completed PDFs are encrypted in the browser before they reach Supabase.
-- The database stores ciphertext + minimal account ownership metadata only. Vault keys are never stored server-side.

create table if not exists public.anchor_application_vault_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key_fingerprint text not null check (key_fingerprint ~ '^[a-f0-9]{64}$'),
  crypto_version smallint not null default 1 check (crypto_version = 1),
  status text not null default 'active' check (status in ('active','retired')),
  created_at timestamptz not null default now(),
  retired_at timestamptz,
  unique (id, user_id),
  unique (user_id, key_fingerprint)
);

comment on table public.anchor_application_vault_keys is
  'Zero-knowledge Watchdog application vault key registry. Stores only a SHA-256 fingerprint of a user-held recovery key; never the key itself.';

create table if not exists public.anchor_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tax_year smallint not null check (tax_year between 2020 and 2100),
  status text not null default 'draft' check (status in ('draft','ready','generated','archived')),
  schema_version text not null default '2025.1' check (length(schema_version) between 1 and 40),
  vault_key_id uuid not null,
  answers_ciphertext_b64 text not null check (length(answers_ciphertext_b64) between 24 and 250000),
  answers_iv_b64 text not null check (length(answers_iv_b64) between 12 and 64),
  answers_cipher_sha256 text not null check (answers_cipher_sha256 ~ '^[a-f0-9]{64}$'),
  crypto_algorithm text not null default 'AES-256-GCM' check (crypto_algorithm = 'AES-256-GCM'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  generated_at timestamptz,
  archived_at timestamptz,
  unique (id, user_id),
  constraint anchor_applications_vault_owner_fk
    foreign key (vault_key_id, user_id)
    references public.anchor_application_vault_keys(id, user_id)
    on delete restrict
);

comment on table public.anchor_applications is
  'Owner-only encrypted NJ property-tax-relief application state. No plaintext SSN, income, disability, name, address, or form-answer payload is stored.';
comment on column public.anchor_applications.answers_ciphertext_b64 is
  'AES-GCM ciphertext produced in the customer browser before persistence; Watchdog does not receive the plaintext application payload.';

create index if not exists anchor_applications_user_year_idx
  on public.anchor_applications(user_id, tax_year desc, updated_at desc);

create table if not exists public.anchor_application_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique check (storage_path <> ''),
  document_kind text not null default 'application_pdf' check (document_kind = 'application_pdf'),
  cipher_iv_b64 text not null check (length(cipher_iv_b64) between 12 and 64),
  cipher_sha256 text not null check (cipher_sha256 ~ '^[a-f0-9]{64}$'),
  cipher_bytes integer not null check (cipher_bytes between 1 and 20971520),
  crypto_algorithm text not null default 'AES-256-GCM' check (crypto_algorithm = 'AES-256-GCM'),
  template_sha256 text check (template_sha256 is null or template_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  constraint anchor_application_documents_application_owner_fk
    foreign key (application_id, user_id)
    references public.anchor_applications(id, user_id)
    on delete cascade
);

comment on table public.anchor_application_documents is
  'Metadata for lifetime encrypted customer copies of generated NJ application PDFs. Storage objects contain ciphertext only.';

create index if not exists anchor_application_documents_user_app_idx
  on public.anchor_application_documents(user_id, application_id, created_at desc);

alter table public.anchor_application_vault_keys enable row level security;
alter table public.anchor_applications enable row level security;
alter table public.anchor_application_documents enable row level security;

revoke all on public.anchor_application_vault_keys from anon, authenticated;
revoke all on public.anchor_applications from anon, authenticated;
revoke all on public.anchor_application_documents from anon, authenticated;
grant select, insert, update, delete on public.anchor_application_vault_keys to authenticated;
grant select, insert, update, delete on public.anchor_applications to authenticated;
grant select, insert, update, delete on public.anchor_application_documents to authenticated;

drop policy if exists "anchor_vault_keys_owner_select" on public.anchor_application_vault_keys;
create policy "anchor_vault_keys_owner_select"
on public.anchor_application_vault_keys for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "anchor_vault_keys_owner_insert" on public.anchor_application_vault_keys;
create policy "anchor_vault_keys_owner_insert"
on public.anchor_application_vault_keys for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "anchor_vault_keys_owner_update" on public.anchor_application_vault_keys;
create policy "anchor_vault_keys_owner_update"
on public.anchor_application_vault_keys for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "anchor_vault_keys_owner_delete" on public.anchor_application_vault_keys;
create policy "anchor_vault_keys_owner_delete"
on public.anchor_application_vault_keys for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "anchor_applications_owner_select" on public.anchor_applications;
create policy "anchor_applications_owner_select"
on public.anchor_applications for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "anchor_applications_owner_insert" on public.anchor_applications;
create policy "anchor_applications_owner_insert"
on public.anchor_applications for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "anchor_applications_owner_update" on public.anchor_applications;
create policy "anchor_applications_owner_update"
on public.anchor_applications for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "anchor_applications_owner_delete" on public.anchor_applications;
create policy "anchor_applications_owner_delete"
on public.anchor_applications for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "anchor_application_documents_owner_select" on public.anchor_application_documents;
create policy "anchor_application_documents_owner_select"
on public.anchor_application_documents for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "anchor_application_documents_owner_insert" on public.anchor_application_documents;
create policy "anchor_application_documents_owner_insert"
on public.anchor_application_documents for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "anchor_application_documents_owner_update" on public.anchor_application_documents;
create policy "anchor_application_documents_owner_update"
on public.anchor_application_documents for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "anchor_application_documents_owner_delete" on public.anchor_application_documents;
create policy "anchor_application_documents_owner_delete"
on public.anchor_application_documents for delete to authenticated
using ((select auth.uid()) = user_id);

drop trigger if exists anchor_applications_touch_updated_at on public.anchor_applications;
create trigger anchor_applications_touch_updated_at
before update on public.anchor_applications
for each row execute function public.touch_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'anchor-application-vault',
  'anchor-application-vault',
  false,
  20971520,
  array['application/octet-stream']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- No developer override is intentional. Even authenticated staff can only use their own user/UID folder.
drop policy if exists "anchor_application_vault_storage_select" on storage.objects;
create policy "anchor_application_vault_storage_select"
on storage.objects for select to authenticated
using (
  bucket_id = 'anchor-application-vault'
  and (storage.foldername(name))[1] = 'user'
  and (storage.foldername(name))[2] = (select auth.uid())::text
);

drop policy if exists "anchor_application_vault_storage_insert" on storage.objects;
create policy "anchor_application_vault_storage_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'anchor-application-vault'
  and (storage.foldername(name))[1] = 'user'
  and (storage.foldername(name))[2] = (select auth.uid())::text
);

drop policy if exists "anchor_application_vault_storage_update" on storage.objects;
create policy "anchor_application_vault_storage_update"
on storage.objects for update to authenticated
using (
  bucket_id = 'anchor-application-vault'
  and (storage.foldername(name))[1] = 'user'
  and (storage.foldername(name))[2] = (select auth.uid())::text
)
with check (
  bucket_id = 'anchor-application-vault'
  and (storage.foldername(name))[1] = 'user'
  and (storage.foldername(name))[2] = (select auth.uid())::text
);

drop policy if exists "anchor_application_vault_storage_delete" on storage.objects;
create policy "anchor_application_vault_storage_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'anchor-application-vault'
  and (storage.foldername(name))[1] = 'user'
  and (storage.foldername(name))[2] = (select auth.uid())::text
);
