alter table public.professional_reports
  drop constraint if exists professional_reports_preset_check;

alter table public.professional_reports
  add constraint professional_reports_preset_check
  check (preset = any (array[
    'due_diligence'::text,
    'appeal'::text,
    'listing'::text,
    'lending'::text,
    'investment'::text,
    'title'::text,
    'construction'::text,
    'attorney_title'::text,
    'lender_collateral'::text,
    'broker_listing'::text,
    'investor_diligence'::text,
    'appeal_case'::text,
    'seller_net_sheet'::text,
    'homeowner_one_pager'::text,
    'custom'::text
  ]));

create policy "professional report versions link integrity"
on public.professional_report_versions
as restrictive
for all
to authenticated
using (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.professional_reports r
    where r.id = professional_report_versions.report_id
      and r.user_id = (select auth.uid())
  )
)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.professional_reports r
    where r.id = professional_report_versions.report_id
      and r.user_id = (select auth.uid())
  )
);

create policy "professional report shares link integrity"
on public.professional_report_shares
as restrictive
for all
to authenticated
using (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.professional_reports r
    where r.id = professional_report_shares.report_id
      and r.user_id = (select auth.uid())
  )
  and exists (
    select 1
    from public.professional_report_versions v
    where v.id = professional_report_shares.version_id
      and v.report_id = professional_report_shares.report_id
      and v.user_id = (select auth.uid())
  )
)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.professional_reports r
    where r.id = professional_report_shares.report_id
      and r.user_id = (select auth.uid())
  )
  and exists (
    select 1
    from public.professional_report_versions v
    where v.id = professional_report_shares.version_id
      and v.report_id = professional_report_shares.report_id
      and v.user_id = (select auth.uid())
  )
);
