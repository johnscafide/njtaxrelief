revoke execute on function public.marketing_recipient_source_catalog(uuid) from public, anon;
revoke execute on function public.marketing_recipient_source_map(uuid,text[]) from public, anon;
revoke execute on function public.marketing_set_recipient_source(uuid,text,text,boolean) from public, anon;
revoke execute on function public.marketing_direct_mail_recipient_summary(uuid) from public, anon;
revoke execute on function public.marketing_direct_mail_recipient_page(uuid,text,text,integer,integer) from public, anon;
revoke execute on function public.marketing_set_direct_mail_recipient_excluded(uuid,text,boolean,text) from public, anon;
revoke execute on function public.marketing_save_direct_mail_settings(uuid,text,text) from public, anon;
revoke execute on function public.marketing_direct_mail_quote(uuid,integer,text,text,text) from public, anon;

grant execute on function public.marketing_recipient_source_catalog(uuid) to authenticated;
grant execute on function public.marketing_recipient_source_map(uuid,text[]) to authenticated;
grant execute on function public.marketing_set_recipient_source(uuid,text,text,boolean) to authenticated;
grant execute on function public.marketing_direct_mail_recipient_summary(uuid) to authenticated;
grant execute on function public.marketing_direct_mail_recipient_page(uuid,text,text,integer,integer) to authenticated;
grant execute on function public.marketing_set_direct_mail_recipient_excluded(uuid,text,boolean,text) to authenticated;
grant execute on function public.marketing_save_direct_mail_settings(uuid,text,text) to authenticated;
grant execute on function public.marketing_direct_mail_quote(uuid,integer,text,text,text) to authenticated;
