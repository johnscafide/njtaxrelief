alter table public.marketing_direct_mail_recipients drop constraint if exists marketing_direct_mail_recipients_validation_status_check;
alter table public.marketing_direct_mail_recipients add constraint marketing_direct_mail_recipients_validation_status_check check (validation_status = any (array['valid'::text,'invalid'::text,'excluded'::text]));
