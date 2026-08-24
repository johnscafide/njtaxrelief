create table if not exists public.property_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pams_pin text not null,
  storage_path text not null unique,
  photo_type text not null default 'front_exterior' check (photo_type in ('front_exterior','side_exterior','rear_exterior','yard','renovation','other')),
  visibility text not null default 'private' check (visibility in ('private','contribution')),
  moderation_status text not null default 'private' check (moderation_status in ('private','pending','approved','rejected')),
  source text not null default 'homeowner_upload' check (source in ('homeowner_upload','agent_upload','watchdog_staff','community_contribution')),
  is_primary boolean not null default false,
  contributor_license_version text,
  contributor_consented_at timestamptz,
  contribution_revoked_at timestamptz,
  captured_at timestamptz,
  exif_stripped boolean not null default false,
  normalized_width integer,
  normalized_height integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint property_photos_contribution_consent_chk check (
    visibility <> 'contribution' or (
      contributor_license_version is not null and contributor_consented_at is not null and contribution_revoked_at is null
    )
  )
);

create index if not exists property_photos_user_pin_idx on public.property_photos(user_id, pams_pin, created_at desc);
create index if not exists property_photos_contribution_idx on public.property_photos(moderation_status, created_at desc) where visibility = 'contribution';
create unique index if not exists property_photos_one_primary_idx on public.property_photos(user_id, pams_pin) where is_primary;

alter table public.property_photos enable row level security;

drop policy if exists "property photos select own or developer" on public.property_photos;
create policy "property photos select own or developer"
on public.property_photos for select to authenticated
using ((select auth.uid()) = user_id or (select is_watchdog_developer()));

drop policy if exists "property photos insert own" on public.property_photos;
create policy "property photos insert own"
on public.property_photos for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and (
    visibility = 'private'
    or exists (
      select 1 from public.saved_properties s
      where s.user_id = (select auth.uid())
        and s.pams_pin = property_photos.pams_pin
        and s.verified = true
    )
  )
);

drop policy if exists "property photos update own or developer" on public.property_photos;
create policy "property photos update own or developer"
on public.property_photos for update to authenticated
using ((select auth.uid()) = user_id or (select is_watchdog_developer()))
with check (
  ((select auth.uid()) = user_id or (select is_watchdog_developer()))
  and (
    visibility = 'private'
    or (select is_watchdog_developer())
    or exists (
      select 1 from public.saved_properties s
      where s.user_id = (select auth.uid())
        and s.pams_pin = property_photos.pams_pin
        and s.verified = true
    )
  )
);

drop policy if exists "property photos delete own or developer" on public.property_photos;
create policy "property photos delete own or developer"
on public.property_photos for delete to authenticated
using ((select auth.uid()) = user_id or (select is_watchdog_developer()));

grant select, insert, update, delete on public.property_photos to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('property-photos', 'property-photos', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "property_photos_storage_select" on storage.objects;
create policy "property_photos_storage_select"
on storage.objects for select to authenticated
using (
  bucket_id = 'property-photos'
  and (
    ((storage.foldername(name))[1] = 'user' and (storage.foldername(name))[2] = (select auth.uid())::text)
    or (select is_watchdog_developer())
  )
);

drop policy if exists "property_photos_storage_insert" on storage.objects;
create policy "property_photos_storage_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'property-photos'
  and (storage.foldername(name))[1] = 'user'
  and (storage.foldername(name))[2] = (select auth.uid())::text
);

drop policy if exists "property_photos_storage_update" on storage.objects;
create policy "property_photos_storage_update"
on storage.objects for update to authenticated
using (
  bucket_id = 'property-photos'
  and (
    ((storage.foldername(name))[1] = 'user' and (storage.foldername(name))[2] = (select auth.uid())::text)
    or (select is_watchdog_developer())
  )
)
with check (
  bucket_id = 'property-photos'
  and (
    ((storage.foldername(name))[1] = 'user' and (storage.foldername(name))[2] = (select auth.uid())::text)
    or (select is_watchdog_developer())
  )
);

drop policy if exists "property_photos_storage_delete" on storage.objects;
create policy "property_photos_storage_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'property-photos'
  and (
    ((storage.foldername(name))[1] = 'user' and (storage.foldername(name))[2] = (select auth.uid())::text)
    or (select is_watchdog_developer())
  )
);
