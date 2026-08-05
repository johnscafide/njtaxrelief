alter table public.profiles
  add column if not exists account_role text not null default 'user',
  add column if not exists plan_tier text not null default 'standard';

alter table public.profiles drop constraint if exists profiles_account_role_check;
alter table public.profiles add constraint profiles_account_role_check
  check (account_role in ('user', 'developer', 'admin'));

alter table public.profiles drop constraint if exists profiles_plan_tier_check;
alter table public.profiles add constraint profiles_plan_tier_check
  check (plan_tier in ('standard', 'pro', 'pro_plus'));

update public.profiles p
set account_role = 'developer', plan_tier = 'pro_plus'
from auth.users u
where p.id = u.id
  and lower(u.email) = 'john.v.scafide@gmail.com';

comment on column public.profiles.account_role is 'Internal product role. Developer bypass is separate from customer plan tier.';
comment on column public.profiles.plan_tier is 'Customer entitlement: standard, pro, or pro_plus.';
