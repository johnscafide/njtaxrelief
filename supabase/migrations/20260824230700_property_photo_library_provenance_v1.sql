alter table public.property_photos
  drop constraint if exists property_photos_license_version_chk;
alter table public.property_photos
  add constraint property_photos_license_version_chk check (
    visibility <> 'contribution'
    or contributor_license_version = 'watchdog-photo-contribution-v1-2026-08-24'
  );

create or replace function public.touch_property_photos_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists property_photos_touch_updated_at on public.property_photos;
create trigger property_photos_touch_updated_at
before update on public.property_photos
for each row execute function public.touch_property_photos_updated_at();
