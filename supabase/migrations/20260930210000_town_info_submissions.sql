-- Town Needs: anyone with the /town-needs link can send what they know about a red-flag town's
-- CO or fire certificate rules, with a document or an official link. Nothing goes live on its own:
-- the owner approves or rejects each one in Backoffice, and approved info goes through the usual
-- checked-requirements publish step.
--
-- Only the server routes touch this data (service role): api/watchdog-town-needs.js takes
-- submissions and api/watchdog-backoffice-town-needs.js serves the review queue.

create table if not exists public.town_info_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  municipality_code text not null check (municipality_code ~ '^\d{4}$'),
  municipality_name text not null check (char_length(municipality_name) between 1 and 120),
  need_keys text[] not null check (
    cardinality(need_keys) between 1 and 5
    and need_keys <@ array['co_required', 'co_fee', 'co_contact', 'fire_fee', 'fire_contact']::text[]
  ),
  answer text not null default '' check (char_length(answer) <= 2000),
  source_url text check (source_url is null or (char_length(source_url) <= 1000 and source_url ~* '^https://[^\s]+$')),
  file_path text check (file_path is null or (char_length(file_path) <= 300 and file_path ~ '^pending/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,120}$')),
  file_name text check (file_name is null or char_length(file_name) <= 200),
  file_type text check (file_type is null or file_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif')),
  file_size integer check (file_size is null or file_size between 1 and 10485760),
  file_status text not null default 'none' check (file_status in ('none', 'awaiting_upload', 'uploaded', 'rejected_type')),
  submitter_name text check (submitter_name is null or char_length(submitter_name) <= 120),
  submitter_email text check (submitter_email is null or char_length(submitter_email) <= 254),
  submitter_role text check (submitter_role is null or char_length(submitter_role) <= 80),
  client_hash text not null check (char_length(client_hash) = 64),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'published')),
  review_note text check (review_note is null or char_length(review_note) <= 1000),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  evidence_url text check (evidence_url is null or char_length(evidence_url) <= 1000),
  constraint town_info_submissions_has_source check (source_url is not null or file_path is not null)
);

create index if not exists town_info_submissions_queue_idx on public.town_info_submissions (status, created_at desc);
create index if not exists town_info_submissions_town_idx on public.town_info_submissions (municipality_code, created_at desc);

alter table public.town_info_submissions enable row level security;
revoke all on table public.town_info_submissions from public, anon, authenticated;

comment on table public.town_info_submissions is
  'Town Needs submissions (CO / fire certificate info with a document or official link). Service role only; reviewed in Backoffice before anything is published.';

-- Uploads stay private until the owner approves them. Approved files are copied to the public
-- evidence bucket so agents can open them as the source once the info is published.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('town-info-submissions', 'town-info-submissions', false, 10485760,
   array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']),
  ('town-info-evidence', 'town-info-evidence', true, 10485760,
   array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
