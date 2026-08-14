-- Marketing Studio mutations are server-authoritative.
revoke insert,update,delete on public.marketing_campaigns,public.marketing_audiences,public.marketing_brand_profiles from authenticated;

drop policy if exists marketing_campaigns_owner on public.marketing_campaigns;
create policy marketing_campaigns_owner on public.marketing_campaigns for select to authenticated
  using (user_id=auth.uid() and public.can_use_data_workbench(auth.uid()));
drop policy if exists marketing_audiences_owner on public.marketing_audiences;
create policy marketing_audiences_owner on public.marketing_audiences for select to authenticated
  using (user_id=auth.uid() and public.can_use_data_workbench(auth.uid()));
drop policy if exists marketing_brand_owner on public.marketing_brand_profiles;
create policy marketing_brand_owner on public.marketing_brand_profiles for select to authenticated
  using (user_id=auth.uid() and public.can_use_data_workbench(auth.uid()));
