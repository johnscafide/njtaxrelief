-- NJW-331 follow-up: SECURITY DEFINER owner RPCs are authenticated-only.
revoke all on function public.set_my_anchor_filing_state(uuid,text,date,text) from public, anon;
grant execute on function public.set_my_anchor_filing_state(uuid,text,date,text) to authenticated;

revoke all on function public.set_my_anchor_reminder(uuid,smallint,boolean) from public, anon;
grant execute on function public.set_my_anchor_reminder(uuid,smallint,boolean) to authenticated;

revoke all on function public.verify_anchor_reminder_worker_token_v1(text) from public, anon, authenticated;
grant execute on function public.verify_anchor_reminder_worker_token_v1(text) to service_role;

revoke all on function public.claim_due_anchor_filing_reminders_v1(integer) from public, anon, authenticated;
grant execute on function public.claim_due_anchor_filing_reminders_v1(integer) to service_role;

revoke all on function public.complete_anchor_filing_reminder_v1(uuid,boolean,text) from public, anon, authenticated;
grant execute on function public.complete_anchor_filing_reminder_v1(uuid,boolean,text) to service_role;

revoke all on function public.invoke_anchor_filing_reminder_worker() from public, anon, authenticated;
