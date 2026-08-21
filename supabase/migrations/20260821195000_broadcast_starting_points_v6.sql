-- NJW-264 Phase 5: expand Broadcasts to 10 original Watchdog starting-point templates.
begin;

insert into public.marketing_creative_templates
  (template_key, title, description, creative_type, professions, goals, layout_key, content, active, sort_order)
values
  ('email_basic_clean_v1','Clean Letter','A calm, personal, text-first starting point.','email',array[]::text[],array['update','personal','newsletter']::text[],'email_clean_letter',jsonb_build_object('version',2,'tier','basic','badge','Minimal','summary','A calm, personal, text-first note.','starting_point',true,'renderer','clean'),true,210),
  ('email_deluxe_modern_v1','Modern Brief','A polished modern brief with a strong feature and clean supporting sections.','email',array[]::text[],array['market_update','newsletter','insights']::text[],'email_modern_brief',jsonb_build_object('version',2,'tier','deluxe','badge','Modern','summary','Polished hero with clean story sections.','starting_point',true,'renderer','modern'),true,220),
  ('email_premium_editorial_v1','Editorial Intelligence','A publication-style editorial starting point with premium hierarchy.','email',array[]::text[],array['insights','research','newsletter']::text[],'email_editorial_intelligence',jsonb_build_object('version',2,'tier','premium','badge','Editorial','summary','Publication-style hierarchy and polish.','starting_point',true,'renderer','editorial'),true,230),
  ('email_hero_story_v1','Hero Story','An image-first broadcast built around one dominant feature story.','email',array[]::text[],array['announcement','story','newsletter']::text[],'email_hero_story',jsonb_build_object('version',1,'tier','deluxe','badge','Visual','summary','One dominant image and feature story.','starting_point',true,'renderer','hero'),true,240),
  ('email_market_pulse_v1','Market Pulse','A data-forward starting point for market signals, KPIs and trend updates.','email',array['real_estate_agent']::text[],array['market_update','report','insights']::text[],'email_market_pulse',jsonb_build_object('version',1,'tier','deluxe','badge','Data','summary','Signal cards for market and KPI updates.','starting_point',true,'renderer','pulse'),true,250),
  ('email_property_showcase_v1','Property Showcase','An image-led showcase for a property, development, product or featured destination.','email',array['real_estate_agent']::text[],array['listing','showcase','promotion']::text[],'email_property_showcase',jsonb_build_object('version',1,'tier','premium','badge','Showcase','summary','Image-forward property or product spotlight.','starting_point',true,'renderer','showcase'),true,260),
  ('email_community_digest_v1','Community Digest','A scannable digest for events, openings and local community updates.','email',array[]::text[],array['community','events','newsletter']::text[],'email_community_digest',jsonb_build_object('version',1,'tier','deluxe','badge','Community','summary','Scannable event and local-update digest.','starting_point',true,'renderer','community'),true,270),
  ('email_luxury_journal_v1','Luxury Journal','An elegant editorial layout with restrained detail and premium photography.','email',array['real_estate_agent']::text[],array['luxury','editorial','showcase']::text[],'email_luxury_journal',jsonb_build_object('version',1,'tier','premium','badge','Luxury','summary','Elegant editorial layout with restrained detail.','starting_point',true,'renderer','luxury'),true,280),
  ('email_bold_announcement_v1','Bold Announcement','A high-impact graphical broadcast for one major message and action.','email',array[]::text[],array['announcement','launch','promotion']::text[],'email_bold_announcement',jsonb_build_object('version',1,'tier','premium','badge','Graphic','summary','High-impact headline and one clear action.','starting_point',true,'renderer','bold'),true,290),
  ('email_personal_welcome_v1','Personal Welcome','A warm, human starting point for introductions and relationship-building.','email',array[]::text[],array['welcome','onboarding','personal']::text[],'email_personal_welcome',jsonb_build_object('version',1,'tier','basic','badge','Personal','summary','Warm introduction, signature and simple links.','starting_point',true,'renderer','welcome'),true,300)
on conflict (template_key) do update set
  title=excluded.title,
  description=excluded.description,
  creative_type=excluded.creative_type,
  professions=excluded.professions,
  goals=excluded.goals,
  layout_key=excluded.layout_key,
  content=excluded.content,
  active=excluded.active,
  sort_order=excluded.sort_order,
  updated_at=now();

commit;
