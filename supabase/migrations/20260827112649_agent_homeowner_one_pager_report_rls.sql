create policy "professional reports own agent homeowner one pager"
on public.professional_reports
for all
to authenticated
using (
  (select auth.uid()) = user_id
  and preset = 'homeowner_one_pager'
  and has_watchdog_plan('agent')
)
with check (
  (select auth.uid()) = user_id
  and preset = 'homeowner_one_pager'
  and has_watchdog_plan('agent')
);

create policy "professional report versions own agent homeowner one pager"
on public.professional_report_versions
for all
to authenticated
using (
  (select auth.uid()) = user_id
  and has_watchdog_plan('agent')
  and exists (
    select 1
    from public.professional_reports r
    where r.id = professional_report_versions.report_id
      and r.user_id = (select auth.uid())
      and r.preset = 'homeowner_one_pager'
  )
)
with check (
  (select auth.uid()) = user_id
  and has_watchdog_plan('agent')
  and exists (
    select 1
    from public.professional_reports r
    where r.id = professional_report_versions.report_id
      and r.user_id = (select auth.uid())
      and r.preset = 'homeowner_one_pager'
  )
);

create policy "professional report shares own agent homeowner one pager"
on public.professional_report_shares
for all
to authenticated
using (
  (select auth.uid()) = user_id
  and has_watchdog_plan('agent')
  and exists (
    select 1
    from public.professional_reports r
    where r.id = professional_report_shares.report_id
      and r.user_id = (select auth.uid())
      and r.preset = 'homeowner_one_pager'
  )
)
with check (
  (select auth.uid()) = user_id
  and has_watchdog_plan('agent')
  and exists (
    select 1
    from public.professional_reports r
    where r.id = professional_report_shares.report_id
      and r.user_id = (select auth.uid())
      and r.preset = 'homeowner_one_pager'
  )
);
