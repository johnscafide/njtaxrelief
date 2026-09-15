-- NJW-361: private closing-document vault foundation.
-- Public-record evidence remains separate from private/document-supplied findings.

create table if not exists public.transaction_documents (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null,
  user_id uuid not null default auth.uid(),
  document_type text not null check (document_type in (
    'title_commitment','mortgage_payoff','lender_commitment','appraisal','inspection_report',
    'attorney_review','hoa_condo','solar_agreement','tenancy','estate_probate','divorce',
    'bankruptcy','final_walkthrough','closing_package','other'
  )),
  document_label text,
  original_name text not null check (length(original_name) between 1 and 240),
  storage_bucket text not null default 'transaction-documents' check (storage_bucket = 'transaction-documents'),
  storage_path text not null unique check (length(storage_path) between 1 and 700),
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png')),
  file_size bigint not null check (file_size > 0 and file_size <= 26214400),
  version integer not null default 1 check (version > 0),
  status text not null default 'uploaded' check (status in ('uploaded','review_required','accepted','failed','replaced')),
  extraction_status text not null default 'not_requested' check (extraction_status in ('not_requested','queued','processing','complete','failed')),
  extraction jsonb not null default '{}'::jsonb check (jsonb_typeof(extraction) = 'object'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  constraint transaction_documents_workspace_fk foreign key (transaction_id, user_id)
    references public.transaction_workspaces(id, user_id) on delete cascade
);

create index if not exists transaction_documents_tx_created_idx
  on public.transaction_documents(transaction_id, created_at desc);
create index if not exists transaction_documents_user_type_idx
  on public.transaction_documents(user_id, document_type, created_at desc);
create index if not exists transaction_documents_extraction_idx
  on public.transaction_documents(user_id, extraction_status)
  where extraction_status <> 'not_requested';

create table if not exists public.transaction_document_findings (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  transaction_id uuid not null,
  user_id uuid not null default auth.uid(),
  finding_type text not null check (finding_type in ('deadline','amount','condition','exception','contact','property_fact','task','other')),
  label text not null check (length(label) between 1 and 240),
  value jsonb not null default '{}'::jsonb,
  target_item_key text,
  page_reference text,
  severity text not null default 'review' check (severity in ('info','review','attention','blocked')),
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  review_state text not null default 'proposed' check (review_state in ('proposed','accepted','rejected')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_document_findings_document_fk foreign key (document_id, user_id)
    references public.transaction_documents(id, user_id) on delete cascade,
  constraint transaction_document_findings_workspace_fk foreign key (transaction_id, user_id)
    references public.transaction_workspaces(id, user_id) on delete cascade
);

create index if not exists transaction_document_findings_doc_idx
  on public.transaction_document_findings(document_id, review_state, created_at);
create index if not exists transaction_document_findings_tx_idx
  on public.transaction_document_findings(transaction_id, review_state, severity);

alter table public.transaction_documents enable row level security;
alter table public.transaction_document_findings enable row level security;

revoke all on public.transaction_documents from anon, authenticated;
revoke all on public.transaction_document_findings from anon, authenticated;
grant select, insert, update, delete on public.transaction_documents to authenticated;
grant select, insert, update, delete on public.transaction_document_findings to authenticated;

drop policy if exists transaction_documents_select on public.transaction_documents;
create policy transaction_documents_select on public.transaction_documents for select to authenticated
using (
  user_id = (select auth.uid())
  and (select public.has_watchdog_plan('pro_plus'))
);

drop policy if exists transaction_documents_insert on public.transaction_documents;
create policy transaction_documents_insert on public.transaction_documents for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (select public.has_watchdog_plan('pro_plus'))
  and exists (
    select 1 from public.transaction_workspaces w
    where w.id = transaction_id and w.user_id = (select auth.uid())
  )
);

drop policy if exists transaction_documents_update on public.transaction_documents;
create policy transaction_documents_update on public.transaction_documents for update to authenticated
using (
  user_id = (select auth.uid())
  and (select public.has_watchdog_plan('pro_plus'))
)
with check (
  user_id = (select auth.uid())
  and (select public.has_watchdog_plan('pro_plus'))
  and exists (
    select 1 from public.transaction_workspaces w
    where w.id = transaction_id and w.user_id = (select auth.uid())
  )
);

drop policy if exists transaction_documents_delete on public.transaction_documents;
create policy transaction_documents_delete on public.transaction_documents for delete to authenticated
using (
  user_id = (select auth.uid())
  and (select public.has_watchdog_plan('pro_plus'))
);

drop policy if exists transaction_document_findings_select on public.transaction_document_findings;
create policy transaction_document_findings_select on public.transaction_document_findings for select to authenticated
using (
  user_id = (select auth.uid())
  and (select public.has_watchdog_plan('pro_plus'))
);

drop policy if exists transaction_document_findings_insert on public.transaction_document_findings;
create policy transaction_document_findings_insert on public.transaction_document_findings for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (select public.has_watchdog_plan('pro_plus'))
  and exists (
    select 1 from public.transaction_documents d
    where d.id = document_id and d.transaction_id = transaction_id and d.user_id = (select auth.uid())
  )
);

drop policy if exists transaction_document_findings_update on public.transaction_document_findings;
create policy transaction_document_findings_update on public.transaction_document_findings for update to authenticated
using (
  user_id = (select auth.uid())
  and (select public.has_watchdog_plan('pro_plus'))
)
with check (
  user_id = (select auth.uid())
  and (select public.has_watchdog_plan('pro_plus'))
  and exists (
    select 1 from public.transaction_documents d
    where d.id = document_id and d.transaction_id = transaction_id and d.user_id = (select auth.uid())
  )
);

drop policy if exists transaction_document_findings_delete on public.transaction_document_findings;
create policy transaction_document_findings_delete on public.transaction_document_findings for delete to authenticated
using (
  user_id = (select auth.uid())
  and (select public.has_watchdog_plan('pro_plus'))
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'transaction-documents',
  'transaction-documents',
  false,
  26214400,
  array['application/pdf','image/jpeg','image/png']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Path contract: user/<uid>/<transaction_id>/<document_id>/<filename>
-- Storage source metadata is read-only; object operations go through the Storage API.
drop policy if exists transaction_documents_storage_select on storage.objects;
create policy transaction_documents_storage_select
on storage.objects for select to authenticated
using (
  bucket_id = 'transaction-documents'
  and (storage.foldername(name))[1] = 'user'
  and (storage.foldername(name))[2] = ((select auth.uid()))::text
  and (select public.has_watchdog_plan('pro_plus'))
  and exists (
    select 1 from public.transaction_workspaces w
    where w.id::text = (storage.foldername(name))[3]
      and w.user_id = (select auth.uid())
  )
);

drop policy if exists transaction_documents_storage_insert on storage.objects;
create policy transaction_documents_storage_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'transaction-documents'
  and (storage.foldername(name))[1] = 'user'
  and (storage.foldername(name))[2] = ((select auth.uid()))::text
  and (select public.has_watchdog_plan('pro_plus'))
  and exists (
    select 1 from public.transaction_workspaces w
    where w.id::text = (storage.foldername(name))[3]
      and w.user_id = (select auth.uid())
  )
);

drop policy if exists transaction_documents_storage_update on storage.objects;
create policy transaction_documents_storage_update
on storage.objects for update to authenticated
using (
  bucket_id = 'transaction-documents'
  and (storage.foldername(name))[1] = 'user'
  and (storage.foldername(name))[2] = ((select auth.uid()))::text
  and (select public.has_watchdog_plan('pro_plus'))
  and exists (
    select 1 from public.transaction_workspaces w
    where w.id::text = (storage.foldername(name))[3]
      and w.user_id = (select auth.uid())
  )
)
with check (
  bucket_id = 'transaction-documents'
  and (storage.foldername(name))[1] = 'user'
  and (storage.foldername(name))[2] = ((select auth.uid()))::text
  and (select public.has_watchdog_plan('pro_plus'))
  and exists (
    select 1 from public.transaction_workspaces w
    where w.id::text = (storage.foldername(name))[3]
      and w.user_id = (select auth.uid())
  )
);

drop policy if exists transaction_documents_storage_delete on storage.objects;
create policy transaction_documents_storage_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'transaction-documents'
  and (storage.foldername(name))[1] = 'user'
  and (storage.foldername(name))[2] = ((select auth.uid()))::text
  and (select public.has_watchdog_plan('pro_plus'))
  and exists (
    select 1 from public.transaction_workspaces w
    where w.id::text = (storage.foldername(name))[3]
      and w.user_id = (select auth.uid())
  )
);

comment on table public.transaction_documents is 'NJW-361 private closing documents. Document-supplied facts never replace authoritative public evidence without explicit user review.';
comment on table public.transaction_document_findings is 'NJW-361 reviewable findings proposed from private closing documents. Accepted findings remain document-supplied provenance.';
