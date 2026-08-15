alter table public.watchdog_test_bootstrap_tokens drop constraint if exists watchdog_test_bootstrap_tokens_email_check;
alter table public.watchdog_test_bootstrap_tokens add constraint watchdog_test_bootstrap_tokens_email_check check (desired_email ~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$');
