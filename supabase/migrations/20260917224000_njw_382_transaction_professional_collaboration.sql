-- NJW-382: transaction-scoped professional collaboration.
-- Guest access is mediated by the transaction-collaboration Edge Function.
-- No direct browser grants are added for invite/member tables.

create table if not exists public.transaction_professional_invites (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  invited_email text not null check (position('@' in invited_email) > 1 and length(invited_email) <= 320),
  role text not null check (role in ('title','lender','tc','attorney','other')),
  permission text not null default 'view_upload' check (permission in ('view','view_upload')),
  token_hash text not null unique check (length(token_hash) = 64),
  expires_at timestamptz not null default (now() + interval '30 days'),
  accepted_user_id uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_professional_invites_workspace_fk
    foreign key (transaction_id, owner_user_id)
    references public.transaction_workspaces(id, user_id)
    on delete cascade
);

create index if not exists transaction_professional_invites_owner_tx_idx
  on public.transaction_professional_invites(owner_user_id, transaction_id, created_at desc);
create index if not exists transaction_professional_invites_email_idx
  on public.transaction_professional_invites(lower(invited_email), expires_at desc);

create table if not exists public.transaction_professional_memberships (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  member_user_id uuid not null references auth.users(id) on delete cascade,
  invited_email text not null check (position('@' in invited_email) > 1 and length(invited_email) <= 320),
  role text not null check (role in ('title','lender','tc','attorney','other')),
  permission text not null default 'view_upload' check (permission in ('view','view_upload')),
  status text not null default 'active' check (status in ('active','revoked')),
  joined_at timestamptz not null default now(),
  revoked_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint transaction_professional_memberships_workspace_fk
    foreign key (transaction_id, owner_user_id)
    references public.transaction_workspaces(id, user_id)
    on delete cascade,
  unique (transaction_id, member_user_id)
);

create index if not exists transaction_professional_memberships_owner_tx_idx
  on public.transaction_professional_memberships(owner_user_id, transaction_id, status);
create index if not exists transaction_professional_memberships_member_idx
  on public.transaction_professional_memberships(member_user_id, status, joined_at desc);

alter table public.transaction_professional_invites enable row level security;
alter table public.transaction_professional_memberships enable row level security;

revoke all on public.transaction_professional_invites from public, anon, authenticated;
revoke all on public.transaction_professional_memberships from public, anon, authenticated;

alter table public.transaction_documents
  add column if not exists uploaded_by_user_id uuid references auth.users(id) on delete set null;
alter table public.transaction_documents
  add column if not exists uploaded_by_role text
    check (uploaded_by_role is null or uploaded_by_role in ('owner','title','lender','tc','attorney','other'));

alter table public.transaction_activity
  add column if not exists actor_user_id uuid references auth.users(id) on delete set null;

comment on table public.transaction_professional_invites is
  'Service-only transaction-scoped professional invitations. Tokens are stored only as SHA-256 hashes.';
comment on table public.transaction_professional_memberships is
  'Service-only transaction-scoped guest memberships. Shared access never grants a Watchdog paid-plan entitlement.';
comment on column public.transaction_documents.uploaded_by_user_id is
  'Authenticated Watchdog user who supplied the document; owner_user_id remains transaction_documents.user_id.';
comment on column public.transaction_activity.actor_user_id is
  'Authenticated actor responsible for an activity event when different from the transaction owner.';
