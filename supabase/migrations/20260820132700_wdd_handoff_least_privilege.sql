-- Browser roles may read their own handoff state through RLS/RPC, but may not mutate schema or rows.
revoke references, trigger on table public.marketing_pcm_studio_handoffs from anon, authenticated;
