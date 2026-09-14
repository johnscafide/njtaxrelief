-- Keep product analytics DB constraints aligned with the edge/client event vocabulary.
alter table public.watchdog_product_events
  drop constraint if exists watchdog_product_events_event_name_check;

alter table public.watchdog_product_events
  add constraint watchdog_product_events_event_name_check check (event_name in (
    'page_view','tool_open','marker_viewed','property_lookup_started','property_lookup_succeeded',
    'property_saved','monitoring_enabled','export_started','export_completed','upgrade_cta_clicked',
    'checkout_started','subscription_confirmed','intelligence_exposed','intelligence_reasoning_inspected',
    'intelligence_action_started','intelligence_action_completed','intent_question_shown','intent_question_answered',
    'intent_question_skipped','today_item_reviewed','today_item_snoozed','today_item_dismissed',
    'today_item_reopened','trust_evidence_opened','presence_heartbeat','data_center_tab_viewed',
    'data_center_searched','data_center_filtered','data_center_field_selected','data_center_build_started',
    'data_center_dataset_built','data_center_view_saved','data_center_export_completed','data_center_delivery_scheduled'
  ));