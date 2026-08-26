-- Keep the experimental direct history_metric catalog rows fail-closed until a catalog/runtime contract is added.
update public.derived_formula_registry set status='planned', updated_at=now()
where marker_id like 'watchdog.history.%' and operation='history_metric';
update public.data_center_provider_coverage set value_status='planned', last_verified_at=now(), notes=coalesce(notes,'') || ' Backend metric foundation exists; customer-facing runtime/catalog promotion remains gated.'
where marker_id like 'watchdog.history.%' and provider_key='watchdog-history-v1';

-- Materialize bounded internal longitudinal components through the already-trusted score observation channel.
with ranked as (
  select user_id,pams_pin,score,observed_at,id,
         row_number() over(partition by user_id,pams_pin order by observed_at,id) as rn_first,
         row_number() over(partition by user_id,pams_pin order by observed_at desc,id desc) as rn_last,
         count(*) over(partition by user_id,pams_pin) as n
  from public.score_observations
  where marker_id='watchdog.score'
), agg as (
  select user_id,pams_pin,max(n)::int observation_count,
         max(score) filter(where rn_first=1) as first_score,
         max(score) filter(where rn_last=1) as last_score
  from ranked group by user_id,pams_pin having max(n)>=2
)
insert into public.score_observations(user_id,pams_pin,marker_id,score,observed_on,observed_at,model_version,evidence_coverage,inputs,formula)
select user_id,pams_pin,'watchdog.history.score_change_attention',least(100,abs(last_score-first_score)*10),current_date,now(),'watchdog-history-component-v1',100,
       jsonb_build_object('observation_count',observation_count,'first_score',first_score,'last_score',last_score),
       'min(100, abs(latest_watchdog_score - earliest_watchdog_score) * 10)'
from agg
on conflict(user_id,pams_pin,marker_id,observed_on) do update set score=excluded.score,observed_at=excluded.observed_at,model_version=excluded.model_version,evidence_coverage=excluded.evidence_coverage,inputs=excluded.inputs,formula=excluded.formula;

with ranked as (
  select user_id,pams_pin,score,observed_at,id,
         row_number() over(partition by user_id,pams_pin order by observed_at,id) as rn_first,
         row_number() over(partition by user_id,pams_pin order by observed_at desc,id desc) as rn_last,
         count(*) over(partition by user_id,pams_pin) as n
  from public.score_observations
  where marker_id='watchdog.tax_pressure'
), agg as (
  select user_id,pams_pin,max(n)::int observation_count,
         max(score) filter(where rn_first=1) as first_score,
         max(score) filter(where rn_last=1) as last_score
  from ranked group by user_id,pams_pin having max(n)>=2
)
insert into public.score_observations(user_id,pams_pin,marker_id,score,observed_on,observed_at,model_version,evidence_coverage,inputs,formula)
select user_id,pams_pin,'watchdog.history.tax_pressure_change_attention',least(100,abs(last_score-first_score)*10),current_date,now(),'watchdog-history-component-v1',100,
       jsonb_build_object('observation_count',observation_count,'first_score',first_score,'last_score',last_score),
       'min(100, abs(latest_tax_pressure - earliest_tax_pressure) * 10)'
from agg
on conflict(user_id,pams_pin,marker_id,observed_on) do update set score=excluded.score,observed_at=excluded.observed_at,model_version=excluded.model_version,evidence_coverage=excluded.evidence_coverage,inputs=excluded.inputs,formula=excluded.formula;

with watch as (
  select user_id,pams_pin,count(*)::int watched_markers,
         count(*) filter(where last_changed_at>first_observed_at)::int changed_markers,
         max(checked_at) as latest_check
  from public.intelligence_source_fact_watch_state
  group by user_id,pams_pin
)
insert into public.score_observations(user_id,pams_pin,marker_id,score,observed_on,observed_at,model_version,evidence_coverage,inputs,formula)
select user_id,pams_pin,'watchdog.history.source_material_change_attention',least(100,changed_markers*25)::numeric,current_date,now(),'watchdog-source-fact-change-v1',100,
       jsonb_build_object('watched_markers',watched_markers,'changed_markers',changed_markers,'latest_check',latest_check),
       'min(100, source-fact markers changed since baseline * 25); baseline-only checks score 0'
from watch
on conflict(user_id,pams_pin,marker_id,observed_on) do update set score=excluded.score,observed_at=excluded.observed_at,model_version=excluded.model_version,evidence_coverage=excluded.evidence_coverage,inputs=excluded.inputs,formula=excluded.formula;

insert into public.derived_formula_registry(marker_id,engine_version,formula,dependencies,confidence,status,explanation,operation,config,updated_at) values
('watchdog.agent.listing_change_alert','watchdog-history-unlock-v1','35% permit activity + 35% governed tax-change watch + 30% observed Watchdog Score change attention',array['watchdog.permit_activity_score','watchdog.consumer.tax_change_watch','watchdog.history.score_change_attention'],'high','live','V1 listing-change alert combines current permit activity, governed tax-change context, and bounded magnitude of actual repeated Watchdog Score movement. It requires repeated score observations and is a review-priority signal, not a prediction of transaction outcome.','weighted_scores','{"require_all":true,"items":[{"dep":"watchdog.permit_activity_score","weight":35,"transform":"identity"},{"dep":"watchdog.consumer.tax_change_watch","weight":35,"transform":"identity"},{"dep":"watchdog.history.score_change_attention","weight":30,"transform":"identity"}]}'::jsonb,now()),
('watchdog.consumer.property_change_attention','watchdog-history-unlock-v1','40% observed Watchdog Score change attention + 35% permit activity + 25% governed source-fact material-change attention',array['watchdog.history.score_change_attention','watchdog.permit_activity_score','watchdog.history.source_material_change_attention'],'high','live','V1 property-change attention requires repeated Watchdog Score observations and an established source-fact watch baseline. Source refreshes alone do not count as material change. It prioritizes review; it does not assert that the physical property changed.','weighted_scores','{"require_all":true,"items":[{"dep":"watchdog.history.score_change_attention","weight":40,"transform":"identity"},{"dep":"watchdog.permit_activity_score","weight":35,"transform":"identity"},{"dep":"watchdog.history.source_material_change_attention","weight":25,"transform":"identity"}]}'::jsonb,now()),
('watchdog.title.closing_source_currency','watchdog-source-currency-v1','Exact title-facing alias of governed core authoritative provider-SLA currency',array['watchdog.attorney.case_file_source_freshness'],'high','live','V1 closing source currency reuses the governed core-authoritative provider-SLA currency score. It measures provider verification currency, not legal sufficiency or release-date currency of every closing document.','source_alias','{"dep":"watchdog.attorney.case_file_source_freshness"}'::jsonb,now()),
('watchdog.attorney.closing_record_aging','watchdog-history-unlock-v1','50% normalized years since last recorded sale/deed + 50% inverse governed case-file source freshness',array['watchdog.years_since_last_sale','watchdog.attorney.case_file_source_freshness'],'medium','live','V1 closing-record aging is deliberately narrowed to deed/sale age and provider-SLA freshness. Open-permit age remains excluded until a governed permit event-date field is available. It is a source-review prompt, not a legal conclusion.','weighted_scores','{"require_all":true,"items":[{"dep":"watchdog.years_since_last_sale","weight":50,"transform":"count20"},{"dep":"watchdog.attorney.case_file_source_freshness","weight":50,"transform":"inverse_identity"}]}'::jsonb,now())
on conflict(marker_id) do update set engine_version=excluded.engine_version,formula=excluded.formula,dependencies=excluded.dependencies,confidence=excluded.confidence,status=excluded.status,explanation=excluded.explanation,operation=excluded.operation,config=excluded.config,updated_at=now();

insert into public.data_center_provider_coverage(marker_id,scopes,provider_key,value_status,source_keys,last_verified_at,notes,provider_kind,source_fields,calculation_key,freshness_seconds,cache_policy,bulk_capable) values
('watchdog.agent.listing_change_alert',array['property'],'watchdog-derived','live',array['score_observations','data_center_provider_coverage'],now(),'Repeated score history + permit activity + governed tax-change watch; fail-closed when repeated history is absent.','derived_governed',array['watchdog.permit_activity_score','watchdog.consumer.tax_change_watch','watchdog.history.score_change_attention'],'watchdog-history-unlock-v1',86400,'refresh_on_demand',true),
('watchdog.consumer.property_change_attention',array['property'],'watchdog-derived','live',array['score_observations','intelligence_source_fact_watch_state'],now(),'Repeated score history + permit activity + source-fact watch changes; source refresh alone is not material change.','derived_governed',array['watchdog.history.score_change_attention','watchdog.permit_activity_score','watchdog.history.source_material_change_attention'],'watchdog-history-unlock-v1',86400,'refresh_on_demand',true),
('watchdog.title.closing_source_currency',array['property'],'watchdog-derived','live',array['data_center_provider_coverage'],now(),'Title-facing alias of governed core-authoritative provider verification currency.','derived_governed',array['watchdog.attorney.case_file_source_freshness'],'watchdog-source-currency-v1',3600,'refresh_on_demand',true),
('watchdog.attorney.closing_record_aging',array['property'],'watchdog-derived','live',array['score_observations','data_center_provider_coverage'],now(),'Bounded v1 deed/source-aging prompt; permit-event age remains gated.','derived_governed',array['watchdog.years_since_last_sale','watchdog.attorney.case_file_source_freshness'],'watchdog-history-unlock-v1',86400,'refresh_on_demand',true)
on conflict(marker_id) do update set scopes=excluded.scopes,provider_key=excluded.provider_key,value_status='live',source_keys=excluded.source_keys,last_verified_at=excluded.last_verified_at,notes=excluded.notes,provider_kind=excluded.provider_kind,source_fields=excluded.source_fields,calculation_key=excluded.calculation_key,freshness_seconds=excluded.freshness_seconds,cache_policy=excluded.cache_policy,bulk_capable=excluded.bulk_capable;