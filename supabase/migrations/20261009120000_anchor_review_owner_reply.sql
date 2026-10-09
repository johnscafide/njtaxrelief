alter table public.anchor_application_reviews
  add column if not exists owner_reply text,
  add column if not exists owner_reply_at timestamptz;

alter table public.anchor_application_reviews
  drop constraint if exists anchor_application_reviews_owner_reply_length;
alter table public.anchor_application_reviews
  add constraint anchor_application_reviews_owner_reply_length
  check (owner_reply is null or char_length(owner_reply) between 1 and 1500);
