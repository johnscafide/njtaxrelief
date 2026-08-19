-- STAGING ONLY. Cover action-mirror FKs used by Intelligence integration tests.
create index if not exists professional_case_activity_user_idx
  on public.professional_case_activity(user_id,created_at desc);
create index if not exists professional_reports_case_idx
  on public.professional_reports(case_id)
  where case_id is not null;
