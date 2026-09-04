revoke execute on function public.link_my_watchdog_signup_attribution(uuid,uuid,text,text) from anon;
grant execute on function public.link_my_watchdog_signup_attribution(uuid,uuid,text,text) to authenticated;

comment on function public.link_my_watchdog_signup_attribution(uuid,uuid,text,text) is 'Authenticated-only first-touch signup linker. Uses auth.uid(), accepts only accounts created within two hours, and never exposes direct table reads.';
