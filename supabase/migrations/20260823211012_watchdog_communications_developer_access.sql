grant select, update on table public.watchdog_contact_inbox to authenticated;

drop policy if exists watchdog_contact_inbox_developer_select on public.watchdog_contact_inbox;
create policy watchdog_contact_inbox_developer_select
on public.watchdog_contact_inbox
for select
to authenticated
using ((select public.is_watchdog_developer()));

drop policy if exists watchdog_contact_inbox_developer_update on public.watchdog_contact_inbox;
create policy watchdog_contact_inbox_developer_update
on public.watchdog_contact_inbox
for update
to authenticated
using ((select public.is_watchdog_developer()))
with check ((select public.is_watchdog_developer()));

drop policy if exists watchdog_voice_inbox_developer_select on storage.objects;
create policy watchdog_voice_inbox_developer_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'watchdog-voice-inbox'
  and (select public.is_watchdog_developer())
);
