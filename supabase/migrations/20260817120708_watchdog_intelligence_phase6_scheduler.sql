create extension if not exists pg_cron;

-- The recurring dispatcher is configured in the later environment-safe scheduler
-- migration. Worker URLs are project-specific and must never be hardcoded here.
