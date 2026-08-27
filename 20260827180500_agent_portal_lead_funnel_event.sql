-- NJW-61: add the explicit portal lead conversion event to Agent Control's governed funnel vocabulary.
alter table public.agent_funnel_events
  drop constraint if exists agent_funnel_events_event_name_check;

alter table public.agent_funnel_events
  add constraint agent_funnel_events_event_name_check
  check (event_name = any (array[
    'signal_viewed'::text,
    'evidence_opened'::text,
    'property_opened'::text,
    'watched'::text,
    'conversation_started'::text,
    'reply'::text,
    'valuation_request'::text,
    'appointment'::text,
    'listing'::text,
    'dismissed'::text,
    'portal_lead_captured'::text
  ]));
