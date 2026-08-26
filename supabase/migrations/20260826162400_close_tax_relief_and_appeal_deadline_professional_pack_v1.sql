-- User-scoped tax-relief pathway input completeness. This never determines eligibility or benefit amount.
create or replace function public.refresh_tax_relief_pathway_fit_for_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_score numeric;
  v_inputs jsonb;
  v_present int;
begin
  select
    (case when nullif(trim(coalesce(owner_status,'')),'') is not null then 1 else 0 end) +
    (case when household_size is not null and household_size > 0 then 1 else 0 end) +
    (case when birth_year is not null or nullif(trim(coalesce(age_band,'')),'') is not null then 1 else 0 end) +
    (case when gross_income is not null or nj_taxable_income is not null then 1 else 0 end) +
    (case when income_year is not null then 1 else 0 end) +
    (case when is_veteran is not null then 1 else 0 end) +
    (case when claims_anchor is not null or claims_stay_nj is not null or claims_senior_freeze is not null or claims_vet_deduction is not null or claims_senior_deduction is not null then 1 else 0 end),
    jsonb_build_object(
      'owner_status_present', nullif(trim(coalesce(owner_status,'')),'') is not null,
      'household_size_present', household_size is not null and household_size > 0,
      'age_context_present', birth_year is not null or nullif(trim(coalesce(age_band,'')),'') is not null,
      'income_present', gross_income is not null or nj_taxable_income is not null,
      'income_year_present', income_year is not null,
      'veteran_status_known', is_veteran is not null,
      'relief_claim_status_known', claims_anchor is not null or claims_stay_nj is not null or claims_senior_freeze is not null or claims_vet_deduction is not null or claims_senior_deduction is not null
    )
  into v_present, v_inputs
  from public.profiles
  where id = p_user_id;

  if not found then
    delete from public.score_observations where user_id=p_user_id and marker_id='watchdog.consumer.tax_relief_pathway_fit';
    return;
  end if;

  v_score := round(v_present::numeric / 7 * 100);

  delete from public.score_observations o
  where o.user_id=p_user_id
    and o.marker_id='watchdog.consumer.tax_relief_pathway_fit'
    and not exists (select 1 from public.saved_properties sp where sp.user_id=p_user_id and sp.pams_pin=o.pams_pin);

  insert into public.score_observations(user_id,pams_pin,marker_id,score,observed_on,observed_at,model_version,evidence_coverage,inputs,formula)
  select p_user_id,sp.pams_pin,'watchdog.consumer.tax_relief_pathway_fit',v_score,current_date,now(),'watchdog-tax-relief-inputs-v1',v_score,v_inputs,
         'eligibility input families present / 7 * 100; completeness only, not eligibility'
  from public.saved_properties sp
  where sp.user_id=p_user_id and sp.pams_pin is not null
  on conflict(user_id,pams_pin,marker_id,observed_on) do update
    set score=excluded.score,observed_at=excluded.observed_at,model_version=excluded.model_version,evidence_coverage=excluded.evidence_coverage,inputs=excluded.inputs,formula=excluded.formula;
end;
$$;
revoke all on function public.refresh_tax_relief_pathway_fit_for_user(uuid) from public, anon, authenticated;
grant execute on function public.refresh_tax_relief_pathway_fit_for_user(uuid) to service_role;

create or replace function public.trg_refresh_tax_relief_pathway_fit_profile()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.refresh_tax_relief_pathway_fit_for_user(new.id);
  return new;
end; $$;
revoke all on function public.trg_refresh_tax_relief_pathway_fit_profile() from public, anon, authenticated;

create or replace function public.trg_refresh_tax_relief_pathway_fit_saved_property()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='DELETE' then
    perform public.refresh_tax_relief_pathway_fit_for_user(old.user_id);
    return old;
  end if;
  perform public.refresh_tax_relief_pathway_fit_for_user(new.user_id);
  if tg_op='UPDATE' and old.user_id is distinct from new.user_id then
    perform public.refresh_tax_relief_pathway_fit_for_user(old.user_id);
  end if;
  return new;
end; $$;
revoke all on function public.trg_refresh_tax_relief_pathway_fit_saved_property() from public, anon, authenticated;

drop trigger if exists refresh_tax_relief_pathway_fit_profile on public.profiles;
create trigger refresh_tax_relief_pathway_fit_profile
after insert or update of owner_status,household_size,birth_year,age_band,gross_income,nj_taxable_income,income_year,is_veteran,claims_anchor,claims_stay_nj,claims_senior_freeze,claims_vet_deduction,claims_senior_deduction
on public.profiles for each row execute function public.trg_refresh_tax_relief_pathway_fit_profile();

drop trigger if exists refresh_tax_relief_pathway_fit_saved_property on public.saved_properties;
create trigger refresh_tax_relief_pathway_fit_saved_property
after insert or update of user_id,pams_pin or delete on public.saved_properties
for each row execute function public.trg_refresh_tax_relief_pathway_fit_saved_property();

do $$ declare r record; begin
  for r in select id from public.profiles loop
    perform public.refresh_tax_relief_pathway_fit_for_user(r.id);
  end loop;
end $$;

insert into public.data_center_provider_coverage(marker_id,scopes,provider_key,value_status,source_keys,last_verified_at,notes,provider_kind,source_fields,calculation_key,freshness_seconds,cache_policy,bulk_capable) values
('watchdog.consumer.tax_relief_pathway_fit',array['property'],'score_observations','live',array['profiles','saved_properties'],now(),'User-scoped completeness of seven tax-relief discussion input families. It does not determine ANCHOR, Stay NJ, Senior Freeze, veteran deduction, senior deduction, or any other benefit eligibility/amount.','trusted_observation',array['profiles.owner_status','profiles.household_size','profiles.age_context','profiles.income','profiles.income_year','profiles.is_veteran','profiles.relief_claim_status'],'watchdog-tax-relief-inputs-v1',86400,'refresh_on_demand',true)
on conflict(marker_id) do update set scopes=excluded.scopes,provider_key=excluded.provider_key,value_status='live',source_keys=excluded.source_keys,last_verified_at=excluded.last_verified_at,notes=excluded.notes,provider_kind=excluded.provider_kind,source_fields=excluded.source_fields,calculation_key=excluded.calculation_key,freshness_seconds=excluded.freshness_seconds,cache_policy=excluded.cache_policy,bulk_capable=excluded.bulk_capable;

-- User-scoped appeal deadline/evidence collision. No statewide deadline is guessed.
create or replace function public.refresh_appeal_deadline_collision_observation()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_days int;
  v_deadline_risk numeric;
  v_evidence_gap numeric;
  v_score numeric;
begin
  if tg_op='UPDATE' and (old.user_id is distinct from new.user_id or old.pams_pin is distinct from new.pams_pin) then
    delete from public.score_observations where user_id=old.user_id and pams_pin=old.pams_pin and marker_id='watchdog.attorney.deadline_evidence_collision';
  end if;

  if new.filing_deadline is null or new.evidence_score is null or new.pams_pin is null then
    delete from public.score_observations where user_id=new.user_id and pams_pin=new.pams_pin and marker_id='watchdog.attorney.deadline_evidence_collision';
    return new;
  end if;

  v_days := new.filing_deadline - current_date;
  v_deadline_risk := case when v_days <= 0 then 100 else greatest(0,least(100,(90-v_days)::numeric/90*100)) end;
  v_evidence_gap := greatest(0,least(100,100-new.evidence_score));
  v_score := round(v_deadline_risk * v_evidence_gap / 100);

  insert into public.score_observations(user_id,pams_pin,marker_id,score,observed_on,observed_at,model_version,evidence_coverage,inputs,formula)
  values(new.user_id,new.pams_pin,'watchdog.attorney.deadline_evidence_collision',v_score,current_date,now(),'watchdog-appeal-deadline-collision-v1',100,
         jsonb_build_object('filing_deadline',new.filing_deadline,'days_remaining',v_days,'deadline_risk',round(v_deadline_risk,1),'evidence_score',new.evidence_score,'evidence_gap',round(v_evidence_gap,1)),
         'deadline risk over final 90 days * evidence gap / 100; actual workspace deadline only')
  on conflict(user_id,pams_pin,marker_id,observed_on) do update
    set score=excluded.score,observed_at=excluded.observed_at,model_version=excluded.model_version,evidence_coverage=excluded.evidence_coverage,inputs=excluded.inputs,formula=excluded.formula;
  return new;
end;
$$;
revoke all on function public.refresh_appeal_deadline_collision_observation() from public, anon, authenticated;

drop trigger if exists refresh_appeal_deadline_collision on public.appeal_case_workspaces;
create trigger refresh_appeal_deadline_collision
after insert or update of user_id,pams_pin,filing_deadline,evidence_score on public.appeal_case_workspaces
for each row execute function public.refresh_appeal_deadline_collision_observation();

update public.appeal_case_workspaces set updated_at=updated_at where filing_deadline is not null and evidence_score is not null and pams_pin is not null;

insert into public.data_center_provider_coverage(marker_id,scopes,provider_key,value_status,source_keys,last_verified_at,notes,provider_kind,source_fields,calculation_key,freshness_seconds,cache_policy,bulk_capable) values
('watchdog.attorney.deadline_evidence_collision',array['property'],'score_observations','live',array['appeal_case_workspaces'],now(),'User-scoped collision of actual workspace filing deadline and evidence gap. No deadline is inferred or hard-coded; no workspace/deadline means no value.','trusted_observation',array['appeal_case_workspaces.filing_deadline','appeal_case_workspaces.evidence_score'],'watchdog-appeal-deadline-collision-v1',3600,'refresh_on_demand',true)
on conflict(marker_id) do update set scopes=excluded.scopes,provider_key=excluded.provider_key,value_status='live',source_keys=excluded.source_keys,last_verified_at=excluded.last_verified_at,notes=excluded.notes,provider_kind=excluded.provider_kind,source_fields=excluded.source_fields,calculation_key=excluded.calculation_key,freshness_seconds=excluded.freshness_seconds,cache_policy=excluded.cache_policy,bulk_capable=excluded.bulk_capable;