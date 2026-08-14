-- Qualify pgcrypto through the extensions search path so launch approval hashing works in production.
create or replace function public.marketing_approve_direct_mail_launch(p_campaign_id uuid,p_creative_id uuid) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare
  uid uuid:=auth.uid();
  c public.marketing_creatives%rowtype;
  q public.marketing_price_quotes%rowtype;
  p public.marketing_payments%rowtype;
  valid_count int;
  fp text;
  aid uuid;
begin
  if uid is null or not public.can_use_data_workbench(uid) then raise exception 'Marketing Studio requires Agent or higher'; end if;
  select * into c from public.marketing_creatives where id=p_creative_id and campaign_id=p_campaign_id and user_id=uid and channel='direct_mail' and status='approved';
  if c.id is null then raise exception 'Approve a direct-mail creative first'; end if;
  select count(*) into valid_count from public.marketing_direct_mail_recipients where campaign_id=p_campaign_id and user_id=uid and validation_status='valid';
  if valid_count<=0 then raise exception 'Prepare at least one valid mailing recipient'; end if;
  select * into q from public.marketing_price_quotes where campaign_id=p_campaign_id and user_id=uid and channel='direct_mail' and provider_key='pcm' and quantity=valid_count order by created_at desc limit 1;
  if q.id is null then raise exception 'Create a current direct-mail quote for the prepared audience'; end if;
  if q.expires_at is not null and q.expires_at<=now() then raise exception 'The direct-mail quote has expired'; end if;
  select * into p from public.marketing_payments where quote_id=q.id and campaign_id=p_campaign_id and user_id=uid and status='paid' and coalesce(refunded_cents,0)<amount_cents order by created_at desc limit 1;
  if p.id is null then raise exception 'Campaign funding must be captured before launch approval'; end if;
  fp:=encode(digest(convert_to(concat_ws('|',p_campaign_id::text,c.id::text,q.id::text,p.id::text,valid_count::text),'UTF8'),'sha256'),'hex');
  insert into public.marketing_launch_approvals(user_id,campaign_id,channel,provider_key,creative_id,quote_id,payment_id,recipient_count,approval_fingerprint,status)
  values(uid,p_campaign_id,'direct_mail','pcm',c.id,q.id,p.id,valid_count,fp,'approved')
  on conflict(campaign_id,channel,provider_key,approval_fingerprint) do update set status='approved',approved_at=now(),revoked_at=null
  returning id into aid;
  update public.marketing_campaigns set approved_at=now(),status='approved',updated_at=now() where id=p_campaign_id and user_id=uid;
  insert into public.marketing_events(user_id,campaign_id,event_type,source,payload)
  values(uid,p_campaign_id,'direct_mail.launch_approved','watchdog',jsonb_build_object('approval_id',aid,'creative_id',c.id,'quote_id',q.id,'payment_id',p.id,'recipient_count',valid_count));
  return jsonb_build_object('approval_id',aid,'campaign_id',p_campaign_id,'recipient_count',valid_count,'status','approved');
end $$;
revoke all on function public.marketing_approve_direct_mail_launch(uuid,uuid) from public,anon;
grant execute on function public.marketing_approve_direct_mail_launch(uuid,uuid) to authenticated;
