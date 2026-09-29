-- Easy mode analytics for the 2025 application: which mode people use, whether the
-- Easy mode offer is accepted, and the furthest step each application reaches.
-- Only widens the allowed event names; recording rules are unchanged.

alter table public.anchor_funnel_events
  drop constraint if exists anchor_funnel_events_event_name_check;

alter table public.anchor_funnel_events
  add constraint anchor_funnel_events_event_name_check check (event_name = any (array[
    'application_started','progress_quarter','progress_half','progress_three_quarters','review_reached',
    'pdf_generated','pdf_saved_to_vault','download_clicked','print_clicked','application_reopened',
    'watchdog_cta_clicked','completion_feedback_saved','referral_share_opened','application_review_saved',
    'property_save_prompt_viewed','property_saved_from_anchor','monitoring_enabled',
    'easy_mode_used','standard_mode_used','easy_mode_nudge_shown','easy_mode_nudge_accepted',
    'step_account','step_vault','step_profile','step_disability','step_route','step_identity','step_address',
    'step_ssn','step_residence','step_housing','step_anc_details','step_pas_history','step_property',
    'step_pas_income','step_schedule','step_finish','step_review','step_complete'
  ]::text[]));

create or replace function public.record_my_anchor_funnel_event(p_application_id uuid, p_event_name text)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $function$
declare v_uid uuid := auth.uid(); v_key text;
begin
  if v_uid is null then return false; end if;
  if p_event_name not in (
    'application_started','progress_quarter','progress_half','progress_three_quarters','review_reached',
    'pdf_generated','pdf_saved_to_vault','download_clicked','print_clicked','application_reopened',
    'watchdog_cta_clicked','completion_feedback_saved','referral_share_opened','application_review_saved',
    'property_save_prompt_viewed','property_saved_from_anchor','monitoring_enabled',
    'easy_mode_used','standard_mode_used','easy_mode_nudge_shown','easy_mode_nudge_accepted',
    'step_account','step_vault','step_profile','step_disability','step_route','step_identity','step_address',
    'step_ssn','step_residence','step_housing','step_anc_details','step_pas_history','step_property',
    'step_pas_income','step_schedule','step_finish','step_review','step_complete'
  ) then return false; end if;
  if not exists(select 1 from public.anchor_applications where id=p_application_id and user_id=v_uid) then return false; end if;
  v_key := v_uid::text||':'||p_application_id::text||':'||p_event_name;
  insert into public.anchor_funnel_events(application_id,user_id,event_name,event_key)
  values(p_application_id,v_uid,p_event_name,v_key)
  on conflict(event_key) do nothing;
  return found;
end;
$function$;

revoke all on function public.record_my_anchor_funnel_event(uuid,text) from public, anon;
grant execute on function public.record_my_anchor_funnel_event(uuid,text) to authenticated;
