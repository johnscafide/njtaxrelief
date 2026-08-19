-- Cover the nullable reviewer FK used by developer calibration review history.
create index if not exists intelligence_calibration_reviews_reviewer_idx
  on public.intelligence_calibration_reviews(reviewer_user_id)
  where reviewer_user_id is not null;
