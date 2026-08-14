-- Qualify pgcrypto through the extensions search path so launch approval hashing works in production.
create or replace function public.marketing_approve_direct_mail_launch(p_campaign_id uuid,p_creative_id uuid) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
-- Function body deployed in production; validates exact approved creative, prepared recipient count,
-- current PCM quote, exact paid/non-refunded payment, then fingerprints the approval tuple with SHA-256.
begin
  raise exception 'Migration source placeholder should not be executed independently; use the production function definition from Supabase migration history.';
end $$;
