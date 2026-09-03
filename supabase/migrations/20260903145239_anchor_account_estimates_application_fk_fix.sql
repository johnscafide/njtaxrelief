-- NJW-302: keep the saved ANCHOR estimate owner immutable when its linked
-- encrypted application is deleted. The original composite FK used an
-- unqualified ON DELETE SET NULL, which would attempt to null both
-- application_id and user_id. Only application_id may be cleared.

alter table public.anchor_estimates
  drop constraint if exists anchor_estimates_application_owner_fk;

alter table public.anchor_estimates
  add constraint anchor_estimates_application_owner_fk
  foreign key (application_id, user_id)
  references public.anchor_applications(id, user_id)
  on delete set null (application_id);
