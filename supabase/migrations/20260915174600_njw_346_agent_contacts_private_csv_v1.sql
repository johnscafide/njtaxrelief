create table if not exists public.agent_contact_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'upload' check (kind in ('upload','export')),
  parent_file_id uuid references public.agent_contact_files(id) on delete set null,
  target text not null default 'source' check (target in ('source','generic','boldtrail')),
  original_name text not null check (length(original_name) between 1 and 240),
  storage_path text not null unique check (length(storage_path) between 1 and 700),
  file_size bigint not null default 0 check (file_size >= 0 and file_size <= 26214400),
  mime_type text,
  row_count integer not null default 0 check (row_count >= 0),
  source_column_count integer not null default 0 check (source_column_count >= 0),
  column_names jsonb not null default '[]'::jsonb check (jsonb_typeof(column_names) = 'array'),
  mapping jsonb not null default '{}'::jsonb check (jsonb_typeof(mapping) = 'object'),
  stats jsonb not null default '{}'::jsonb check (jsonb_typeof(stats) = 'object'),
  status text not null default 'ready' check (status in ('processing','ready','failed')),
  last_opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_contact_files_user_created_idx
  on public.agent_contact_files (user_id, created_at desc);
create index if not exists agent_contact_files_parent_idx
  on public.agent_contact_files (parent_file_id)
  where parent_file_id is not null;

alter table public.agent_contact_files enable row level security;

revoke all on public.agent_contact_files from anon;
grant select, insert, update, delete on public.agent_contact_files to authenticated;

drop policy if exists agent_contact_files_select_own on public.agent_contact_files;
create policy agent_contact_files_select_own
on public.agent_contact_files for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists agent_contact_files_insert_own on public.agent_contact_files;
create policy agent_contact_files_insert_own
on public.agent_contact_files for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists agent_contact_files_update_own on public.agent_contact_files;
create policy agent_contact_files_update_own
on public.agent_contact_files for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists agent_contact_files_delete_own on public.agent_contact_files;
create policy agent_contact_files_delete_own
on public.agent_contact_files for delete to authenticated
using (user_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'agent-contact-files',
  'agent-contact-files',
  false,
  26214400,
  array['text/csv','application/csv','application/vnd.ms-excel','text/plain','application/octet-stream']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists agent_contact_files_storage_select on storage.objects;
create policy agent_contact_files_storage_select
on storage.objects for select to authenticated
using (
  bucket_id = 'agent-contact-files'
  and (storage.foldername(name))[1] = 'user'
  and (storage.foldername(name))[2] = ((select auth.uid()))::text
);

drop policy if exists agent_contact_files_storage_insert on storage.objects;
create policy agent_contact_files_storage_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'agent-contact-files'
  and (storage.foldername(name))[1] = 'user'
  and (storage.foldername(name))[2] = ((select auth.uid()))::text
);

drop policy if exists agent_contact_files_storage_update on storage.objects;
create policy agent_contact_files_storage_update
on storage.objects for update to authenticated
using (
  bucket_id = 'agent-contact-files'
  and (storage.foldername(name))[1] = 'user'
  and (storage.foldername(name))[2] = ((select auth.uid()))::text
)
with check (
  bucket_id = 'agent-contact-files'
  and (storage.foldername(name))[1] = 'user'
  and (storage.foldername(name))[2] = ((select auth.uid()))::text
);

drop policy if exists agent_contact_files_storage_delete on storage.objects;
create policy agent_contact_files_storage_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'agent-contact-files'
  and (storage.foldername(name))[1] = 'user'
  and (storage.foldername(name))[2] = ((select auth.uid()))::text
);

comment on table public.agent_contact_files is 'NJW-346 private per-user CSV history for Agent Contacts. Contact rows stay in private Storage rather than being duplicated into structured relational tables.';
