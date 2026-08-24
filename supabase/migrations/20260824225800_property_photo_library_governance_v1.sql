alter table public.property_photos
  drop constraint if exists property_photos_shared_exterior_chk;
alter table public.property_photos
  add constraint property_photos_shared_exterior_chk check (
    visibility <> 'contribution' or photo_type in ('front_exterior','side_exterior')
  );

drop policy if exists "property photos insert own" on public.property_photos;
create policy "property photos insert own"
on public.property_photos for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and source = 'homeowner_upload'
  and (
    (visibility = 'private' and moderation_status = 'private')
    or (
      visibility = 'contribution'
      and moderation_status = 'pending'
      and exists (
        select 1 from public.saved_properties s
        where s.user_id = (select auth.uid())
          and s.pams_pin = property_photos.pams_pin
          and s.verified = true
      )
    )
  )
);

drop policy if exists "property photos update own or developer" on public.property_photos;
create policy "property photos update own or developer"
on public.property_photos for update to authenticated
using ((select auth.uid()) = user_id or (select is_watchdog_developer()))
with check (
  (select is_watchdog_developer())
  or (
    (select auth.uid()) = user_id
    and source = 'homeowner_upload'
    and (
      (visibility = 'private' and moderation_status = 'private')
      or (
        visibility = 'contribution'
        and moderation_status = 'pending'
        and exists (
          select 1 from public.saved_properties s
          where s.user_id = (select auth.uid())
            and s.pams_pin = property_photos.pams_pin
            and s.verified = true
        )
      )
    )
  )
);
