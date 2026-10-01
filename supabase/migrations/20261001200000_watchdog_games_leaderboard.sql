-- Watchdog Games leaderboard.
--
-- Playing stays open to everyone without an account. Getting on the
-- leaderboard needs a Watchdog account plus an opt-in public nickname. Only
-- the nickname is ever shown; names, emails and profile fields are not.
--
-- Flow
--   1. A signed-in player picks a nickname: api/watchdog-games-board.js
--      (service key, after checking the player's access token) upserts
--      watchdog_game_players.
--   2. When a daily puzzle is finished, the page sends the play (the guesses,
--      not a score). The API replays it against the real puzzle, computes
--      0-100 points and inserts one row per player, game and day. The first
--      finished play counts; later submissions for the same day are ignored.
--   3. watchdog_game_board() ranks players for one game or all games over a
--      date range (today or this week).
--
-- Both tables are server-only: no browser role can read or write them.

create table if not exists public.watchdog_game_players (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null check (char_length(nickname) between 3 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists watchdog_game_players_nickname_key on public.watchdog_game_players (lower(nickname));

create table if not exists public.watchdog_game_scores (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.watchdog_game_players (user_id) on delete cascade,
  game text not null check (game in ('sold', 'town-shapes', 'pin-drop', 'lineup', 'fair-or-unfair', 'blocks')),
  puzzle_date date not null,
  points smallint not null check (points between 0 and 100),
  solved boolean not null default false,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, game, puzzle_date)
);
create index if not exists watchdog_game_scores_board_idx on public.watchdog_game_scores (puzzle_date, game);

alter table public.watchdog_game_players enable row level security;
alter table public.watchdog_game_scores enable row level security;
revoke all on table public.watchdog_game_players from public, anon, authenticated;
revoke all on table public.watchdog_game_scores from public, anon, authenticated;
grant select, insert, update, delete on table public.watchdog_game_players to service_role;
grant select, insert, update, delete on table public.watchdog_game_scores to service_role;

create or replace function public.watchdog_game_board(
  p_game text,
  p_from date,
  p_to date,
  p_user uuid default null,
  p_limit integer default 25
)
returns table (rank bigint, nickname text, points bigint, plays bigint, is_me boolean, players bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with totals as (
    select s.user_id, sum(s.points)::bigint as points, count(*)::bigint as plays, min(s.created_at) as first_at
    from public.watchdog_game_scores s
    where s.puzzle_date between p_from and p_to
      and (p_game = 'all' or s.game = p_game)
    group by s.user_id
  ),
  ranked as (
    select t.*,
           rank() over (order by t.points desc) as rank,
           row_number() over (order by t.points desc, t.first_at asc) as pos,
           count(*) over () as players
    from totals t
  )
  select r.rank, p.nickname, r.points, r.plays, coalesce(r.user_id = p_user, false) as is_me, r.players
  from ranked r
  join public.watchdog_game_players p on p.user_id = r.user_id
  where r.pos <= greatest(1, least(coalesce(p_limit, 25), 100))
     or r.user_id = p_user
  order by r.pos;
$function$;

revoke all on function public.watchdog_game_board(text, date, date, uuid, integer) from public, anon, authenticated;
grant execute on function public.watchdog_game_board(text, date, date, uuid, integer) to service_role;
