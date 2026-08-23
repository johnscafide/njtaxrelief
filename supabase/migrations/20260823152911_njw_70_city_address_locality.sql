-- NJW-70: make address locality/city first-class without replacing taxing municipality.
-- City is the familiar postal/address locality. town/municipality remains the assessment jurisdiction.

alter table if exists public.saved_properties add column if not exists city text;
alter table if exists public.property_lookups add column if not exists city text;
alter table if exists public.agent_farm_properties add column if not exists city text;
alter table if exists public.professional_campaign_properties add column if not exists city text;
alter table if exists public.professional_cases add column if not exists city text;

comment on column public.saved_properties.city is 'User-facing address locality/city. Distinct from town, which is the taxing municipality.';
comment on column public.property_lookups.city is 'User-facing address locality/city from address/geocoder context. Distinct from town, which is the taxing municipality.';
comment on column public.agent_farm_properties.city is 'User-facing address locality/city. Distinct from municipality.';
comment on column public.professional_cases.city is 'User-facing address locality/city. Distinct from municipality.';

do $do$
begin
  if to_regclass('public.professional_campaign_properties') is not null then
    execute 'comment on column public.professional_campaign_properties.city is ''User-facing address locality/city. Distinct from municipality.''';
  end if;
end
$do$;

do $do$
begin
  if to_regprocedure('public.save_property(jsonb)') is not null then
    execute $fn$
      create or replace function public.save_property(p jsonb)
      returns uuid
      language plpgsql
      security definer
      set search_path to 'public', 'pg_temp'
      as $body$
      declare
        uid uuid := auth.uid();
        k   text := coalesce(p->>'kind', 'watch');
        pin text := left(coalesce(p->>'pams_pin',''), 40);
        existing public.saved_properties%rowtype;
        out_id uuid;
      begin
        if uid is null then raise exception 'not signed in'; end if;
        if pin = '' or pin !~ '^[0-9A-Za-z_.\-]{5,40}$' then raise exception 'bad pin'; end if;
        if k not in ('home','watch') then k := 'watch'; end if;

        select * into existing from public.saved_properties
         where user_id = uid and pams_pin = pin and kind = k;

        if not found then
          insert into public.saved_properties (
            user_id, pams_pin, kind, address, city, town, county, zip, block, lot,
            assessed, last_year_tax, effective_rate, watchdog_value, has_appeal_case, nickname
          ) values (
            uid, pin, k, left(coalesce(p->>'address',''),120), left(p->>'city',80), left(p->>'town',80),
            left(p->>'county',40), left(p->>'zip',10), left(p->>'block',20), left(p->>'lot',20),
            (p->>'assessed')::bigint, (p->>'last_year_tax')::numeric, (p->>'effective_rate')::numeric,
            (p->>'watchdog_value')::bigint, coalesce((p->>'has_appeal_case')::boolean, false),
            left(p->>'nickname',80)
          ) returning id into out_id;
          return out_id;
        end if;

        update public.saved_properties set
          address         = coalesce(nullif(left(p->>'address',120),''), address),
          city            = coalesce(nullif(left(p->>'city',80),''), city),
          town            = coalesce(nullif(left(p->>'town',80),''), town),
          county          = coalesce(nullif(left(p->>'county',40),''), county),
          zip             = coalesce(nullif(left(p->>'zip',10),''), zip),
          block           = coalesce(nullif(left(p->>'block',20),''), block),
          lot             = coalesce(nullif(left(p->>'lot',20),''), lot),
          assessed        = coalesce((p->>'assessed')::bigint, assessed),
          last_year_tax   = coalesce((p->>'last_year_tax')::numeric, last_year_tax),
          effective_rate  = coalesce((p->>'effective_rate')::numeric, effective_rate),
          watchdog_value  = coalesce((p->>'watchdog_value')::bigint, watchdog_value),
          has_appeal_case = coalesce((p->>'has_appeal_case')::boolean, has_appeal_case),
          history = case
            when ((p->>'assessed')::bigint is distinct from existing.assessed
               or (p->>'last_year_tax')::numeric is distinct from existing.last_year_tax)
              and jsonb_array_length(existing.history) < 60
            then existing.history || jsonb_build_object(
                   'seen', existing.updated_at, 'assessed', existing.assessed,
                   'last_year_tax', existing.last_year_tax, 'watchdog_value', existing.watchdog_value)
            else existing.history end
        where id = existing.id
        returning id into out_id;
        return out_id;
      exception when others then
        return null;
      end;
      $body$
    $fn$;
  end if;
end
$do$;
