-- NJW-427: seed notification/audit state for REALTOR® submissions that
-- were already pending when the Professional Reviews inbox launched.

insert into public.professional_review_events(
  user_id, entity_type, entity_key, event_type, details
)
select
  r.user_id,
  'realtor_verification',
  r.user_id::text,
  'realtor_verification.submitted',
  jsonb_build_object(
    'nar_member_id', r.nar_member_id,
    'local_association', r.local_association,
    'submitted_at', r.submitted_at,
    'backfilled', true
  )
from public.professional_realtor_verifications r
where r.verification_status = 'pending'
  and not exists (
    select 1
    from public.professional_review_events e
    where e.user_id = r.user_id
      and e.entity_type = 'realtor_verification'
      and e.event_type = 'realtor_verification.submitted'
      and e.created_at >= r.submitted_at - interval '1 minute'
  );

insert into public.professional_notification_outbox(
  user_id, event_type, idempotency_key, payload
)
select
  r.user_id,
  'realtor_verification.submitted',
  'realtor_submission:' || r.user_id::text || ':' || extract(epoch from r.submitted_at)::bigint::text,
  jsonb_build_object(
    'nar_member_id', r.nar_member_id,
    'local_association', r.local_association,
    'submitted_at', r.submitted_at,
    'backfilled', true
  )
from public.professional_realtor_verifications r
where r.verification_status = 'pending'
on conflict (idempotency_key) do nothing;
