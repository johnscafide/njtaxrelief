create or replace function public.marketing_town_options(p_query text default null, p_limit integer default 12)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  uid uuid:=auth.uid();
  q text:=upper(trim(coalesce(p_query,'')));
  lim int:=least(greatest(coalesce(p_limit,12),1),50);
  result jsonb;
begin
  if uid is null or not public.can_use_data_workbench(uid) then
    raise exception 'Marketing Studio requires Agent or higher';
  end if;

  with towns as (
    select town, count(*)::int as property_count
    from public.property_lookups
    where town is not null and trim(town)<>''
    group by town
  ), ranked as (
    select town, property_count,
      case
        when q='' then 4
        when upper(town)=q then 0
        when upper(town) like q||'%' then 1
        when upper(town) like '%'||q||'%' then 2
        when replace(replace(replace(upper(town),' TOWNSHIP',''),' TWP',''),' BORO','') = replace(replace(replace(q,' TOWNSHIP',''),' TWP',''),' BORO','') then 1
        else 9
      end as rank
    from towns
    where q='' or upper(town) like '%'||q||'%'
       or replace(replace(replace(upper(town),' TOWNSHIP',''),' TWP',''),' BORO','') like '%'||replace(replace(replace(q,' TOWNSHIP',''),' TWP',''),' BORO','')||'%'
  )
  select coalesce(jsonb_agg(jsonb_build_object('town',town,'property_count',property_count) order by rank, property_count desc, town),'[]'::jsonb)
  into result
  from (select * from ranked where rank<9 order by rank, property_count desc, town limit lim) s;

  return result;
end $function$;

grant execute on function public.marketing_town_options(text, integer) to authenticated;
