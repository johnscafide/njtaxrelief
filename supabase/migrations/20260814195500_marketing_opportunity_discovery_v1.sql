-- NJW-155 Marketing Studio 2.0: explainable property-data opportunity discovery.
create or replace function public.marketing_discover_opportunities(p_town text default null) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare uid uuid:=auth.uid(); town_filter text:=nullif(trim(coalesce(p_town,'')),''); yr int:=extract(year from current_date)::int; result jsonb;
begin
 if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
 with base as (
   select pams_pin,address,town,zip,last_sale_year,year_built,last_year_tax,assessed_value from public.property_lookups
   where pams_pin is not null and address is not null and town is not null and zip is not null and (town_filter is null or upper(town)=upper(town_filter))
 ), tax_threshold as (
   select percentile_cont(0.75) within group(order by last_year_tax) as p75 from base where last_year_tax is not null and last_year_tax>0
 ), plays as (
   select 'long_term_ownership'::text play_key,'Long-Term Ownership Farm'::text title,'Properties with a recorded sale 15+ years ago. Useful for long-term geographic farming without asserting seller intent.'::text explanation,'realtor'::text profession,'seller_leads'::text goal,count(*)::int property_count from base where last_sale_year is not null and last_sale_year<=yr-15
   union all select 'recent_purchase','Recent Buyer Welcome','Properties with a recorded purchase in the last two calendar years. Useful for relationship-building and homeowner resource campaigns.','realtor','relationship',count(*)::int from base where last_sale_year is not null and last_sale_year>=yr-2
   union all select 'older_housing_stock','Older Housing Stock','Properties recorded as 40+ years old. Useful for contractor, home-services and property-maintenance marketing where appropriate.','contractor','property_services',count(*)::int from base where year_built is not null and year_built<=yr-40
   union all select 'high_tax_exposure','Upper-Quartile Property Tax','Properties in the top quartile of recorded property tax within the selected geography. Useful for tax-review education and professional outreach without promising savings.','attorney','tax_appeal_education',count(*)::int from base,tax_threshold where last_year_tax is not null and tax_threshold.p75 is not null and last_year_tax>=tax_threshold.p75
 ) select jsonb_build_object('town',town_filter,'generated_at',now(),'plays',coalesce(jsonb_agg(jsonb_build_object('play_key',play_key,'title',title,'explanation',explanation,'profession',profession,'goal',goal,'property_count',property_count) order by property_count desc),'[]'::jsonb)) into result from plays;
 return result;
end $$;
revoke all on function public.marketing_discover_opportunities(text) from public,anon;
grant execute on function public.marketing_discover_opportunities(text) to authenticated;

create or replace function public.marketing_create_campaign_from_opportunity(p_play_key text,p_town text default null,p_limit integer default 1000) returns jsonb
language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); town_filter text:=nullif(trim(coalesce(p_town,'')),''); yr int:=extract(year from current_date)::int; lim int:=least(greatest(coalesce(p_limit,1000),1),5000); keys jsonb; cnt int; aid uuid; sid uuid; cid uuid; title text; goal text; profession text; explanation text; threshold numeric;
begin
 if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
 case p_play_key
  when 'long_term_ownership' then title:='Long-Term Ownership Farm'; goal:='seller_leads'; profession:='realtor'; explanation:='Recorded sale 15+ years ago; audience is property-data based and does not assert seller intent.';
  when 'recent_purchase' then title:='Recent Buyer Welcome'; goal:='relationship'; profession:='realtor'; explanation:='Recorded purchase in the last two calendar years.';
  when 'older_housing_stock' then title:='Older Housing Stock'; goal:='property_services'; profession:='contractor'; explanation:='Recorded construction year is 40+ years old.';
  when 'high_tax_exposure' then title:='Upper-Quartile Property Tax'; goal:='tax_appeal_education'; profession:='attorney'; explanation:='Recorded property tax is in the upper quartile for the selected geography; no savings or appeal result is implied.';
  else raise exception 'Unsupported opportunity play';
 end case;
 if p_play_key='high_tax_exposure' then select percentile_cont(0.75) within group(order by last_year_tax) into threshold from public.property_lookups where last_year_tax is not null and last_year_tax>0 and pams_pin is not null and address is not null and town is not null and zip is not null and (town_filter is null or upper(town)=upper(town_filter)); end if;
 with selected as (
   select pams_pin from public.property_lookups
   where pams_pin is not null and address is not null and town is not null and zip is not null and (town_filter is null or upper(town)=upper(town_filter))
     and case p_play_key when 'long_term_ownership' then last_sale_year is not null and last_sale_year<=yr-15 when 'recent_purchase' then last_sale_year is not null and last_sale_year>=yr-2 when 'older_housing_stock' then year_built is not null and year_built<=yr-40 when 'high_tax_exposure' then last_year_tax is not null and threshold is not null and last_year_tax>=threshold else false end
   order by pams_pin limit lim
 ) select coalesce(jsonb_agg(pams_pin),'[]'::jsonb),count(*)::int into keys,cnt from selected;
 if cnt=0 then raise exception 'No properties matched this opportunity in the selected geography'; end if;
 insert into public.marketing_audiences(user_id,name,source_type,criteria,dynamic,status) values(uid,title||coalesce(' · '||town_filter,''),'opportunity_discovery',jsonb_build_object('play_key',p_play_key,'town',town_filter,'explanation',explanation),true,'active') returning id into aid;
 insert into public.marketing_audience_snapshots(audience_id,user_id,property_keys,qualification_summary,property_count) values(aid,uid,keys,jsonb_build_object('play_key',p_play_key,'town',town_filter,'explanation',explanation),cnt) returning id into sid;
 insert into public.marketing_campaigns(user_id,audience_id,audience_snapshot_id,name,goal,profession,status,settings) values(uid,aid,sid,title||coalesce(' · '||town_filter,''),goal,profession,'draft',jsonb_build_object('opportunity_play',p_play_key,'dynamic_audience',true)) returning id into cid;
 insert into public.marketing_campaign_versions(campaign_id,version,user_id,definition) values(cid,1,uid,jsonb_build_object('source','opportunity_discovery','play_key',p_play_key,'town',town_filter,'property_count',cnt,'explanation',explanation));
 insert into public.marketing_events(user_id,campaign_id,event_type,source,payload) values(uid,cid,'campaign.created_from_opportunity','watchdog',jsonb_build_object('play_key',p_play_key,'town',town_filter,'property_count',cnt));
 return jsonb_build_object('campaign_id',cid,'audience_id',aid,'property_count',cnt,'title',title,'goal',goal,'profession',profession,'explanation',explanation);
end $$;
revoke all on function public.marketing_create_campaign_from_opportunity(text,text,integer) from public,anon;
grant execute on function public.marketing_create_campaign_from_opportunity(text,text,integer) to authenticated;
