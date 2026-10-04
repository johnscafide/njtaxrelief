-- The /co lookup's "Report a correction" form sends what is wrong with a live town's CO or fire
-- certificate info through the same Town Needs route, tagged with the need key 'correction'.
-- It lands in the same Backoffice Town Info queue and still needs a document or an https link.

alter table public.town_info_submissions drop constraint if exists town_info_submissions_need_keys_check;
alter table public.town_info_submissions add constraint town_info_submissions_need_keys_check check (
  cardinality(need_keys) between 1 and 6
  and need_keys <@ array['co_required', 'co_fee', 'co_contact', 'fire_fee', 'fire_contact', 'correction']::text[]
);
