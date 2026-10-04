-- /co town pages: a "Was this helpful?" thumbs up / thumbs down on each town's CO requirements,
-- so visitors can see that other people found a town's info useful.
--
-- One vote per browser per town. voter_hash is an HMAC the server makes from a random id the
-- browser keeps, so no raw id or IP is stored. Changing a vote replaces the
-- old one; vote 0 takes it back. Only api/co-feedback.js (service role) touches this table.

create table if not exists public.co_town_votes (
  municipality_code text not null check (municipality_code ~ '^\d{4}$'),
  voter_hash text not null check (char_length(voter_hash) = 64),
  vote smallint not null check (vote in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (municipality_code, voter_hash)
);

alter table public.co_town_votes enable row level security;
revoke all on table public.co_town_votes from public, anon, authenticated;

comment on table public.co_town_votes is
  'Helpful / not helpful votes on /co town pages. One row per browser per town. Service role only (api/co-feedback.js).';

create or replace function public.co_town_vote_tally(p_code text)
returns table (up integer, down integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*) filter (where vote = 1)::integer as up,
    count(*) filter (where vote = -1)::integer as down
  from public.co_town_votes
  where municipality_code = p_code;
$$;

create or replace function public.co_town_cast_vote(p_code text, p_voter text, p_vote integer)
returns table (up integer, down integer)
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if p_code !~ '^\d{4}$' or char_length(coalesce(p_voter, '')) <> 64 or p_vote not in (-1, 0, 1) then
    raise exception 'invalid vote';
  end if;
  if p_vote = 0 then
    delete from public.co_town_votes where municipality_code = p_code and voter_hash = p_voter;
  else
    insert into public.co_town_votes (municipality_code, voter_hash, vote)
    values (p_code, p_voter, p_vote)
    on conflict (municipality_code, voter_hash) do update
      set vote = excluded.vote, updated_at = now();
  end if;
  return query select * from public.co_town_vote_tally(p_code);
end;
$$;

revoke all on function public.co_town_vote_tally(text) from public, anon, authenticated;
revoke all on function public.co_town_cast_vote(text, text, integer) from public, anon, authenticated;
grant execute on function public.co_town_vote_tally(text) to service_role;
grant execute on function public.co_town_cast_vote(text, text, integer) to service_role;
