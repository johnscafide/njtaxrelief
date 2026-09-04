import fs from 'node:fs';

function read(path){ return fs.readFileSync(path,'utf8'); }
function must(value,message){ if(!value) throw new Error(message); }

const runtime=read('property/js/signup-attribution.js');
const onboardingEmail=read('property/js/onboarding-email-auth.js');
const anchorLibrary=read('property/anchor/applications/index.html');
const schema=read('supabase/migrations/20260904164622_watchdog_signup_attribution_analytics.sql');
const reporting=read('supabase/migrations/20260904165216_watchdog_signup_attribution_reporting_hardening.sql');
const leastPrivilege=read('supabase/migrations/20260904165518_watchdog_signup_attribution_least_privilege.sql');

must(runtime.includes('watchdog_cookie_preferences_v1'),'Signup attribution must require Watchdog analytics consent.');
must(runtime.includes('navigator.globalPrivacyControl'),'Signup attribution must honor Global Privacy Control.');
must(runtime.includes('navigator.doNotTrack'),'Signup attribution must honor Do Not Track.');
must(runtime.includes("var VISITOR_KEY = 'wd_visitor_id'"),'Signup attribution must share the canonical product analytics visitor ID.');
must(runtime.includes("var SESSION_KEY = 'wd_session_id'"),'Signup attribution must share the canonical product analytics session ID.');
must(runtime.includes("var FIRST_TOUCH_KEY = 'wd_first_touch'"),'Signup attribution must reuse canonical first-touch acquisition metadata.');
must(runtime.includes("var SESSION_TOUCH_KEY = 'wd_session_touch'"),'Signup attribution must reuse canonical session-touch acquisition metadata.');
must(runtime.includes('record_watchdog_auth_funnel_event'),'Anonymous auth funnel must use its governed RPC.');
must(runtime.includes('link_my_watchdog_signup_attribution'),'New-account identity linkage must use its governed RPC.');
must(runtime.includes("'anchor_application'"),'ANCHOR account creation must have a distinct signup context.');
must(runtime.includes("'watchdog_onboarding'"),'Normal Watchdog onboarding must have a distinct signup context.');
must(runtime.includes('[data-provider]'),'Social provider clicks must be measured.');
must(runtime.includes('[data-email-start]'),'Email provider selection must be measured.');
must(!runtime.includes('wd-library-email'),'Runtime must not read the ANCHOR email field.');
must(!runtime.includes('wd-email-address'),'Runtime must not read the onboarding email field.');
must(onboardingEmail.includes('/property/js/signup-attribution.js'),'Canonical onboarding must load signup attribution.');
must(anchorLibrary.includes('/property/js/signup-attribution.js'),'ANCHOR application library must load signup attribution.');
must(anchorLibrary.includes('never Private Vault contents'),'ANCHOR privacy boundary must stay explicit.');

must(schema.includes('alter table public.watchdog_auth_funnel_events enable row level security'),'Auth funnel table must use RLS.');
must(schema.includes('alter table public.watchdog_signup_attribution enable row level security'),'Signup attribution table must use RLS.');
must(schema.includes('revoke all on table public.watchdog_signup_attribution from anon, authenticated'),'Direct browser reads of signup attribution must be revoked.');
must(schema.includes("v_created_at < now() - interval '2 hours'"),'Existing/old accounts must not be relabeled as fresh signups.');
must(schema.includes('on conflict (user_id) do nothing'),'First-touch signup attribution must be immutable.');
must(reporting.includes('analytics_internal_accounts'),'Developer analytics must exclude internal accounts.');
must(reporting.includes("'auth_provider_totals'"),'All-account auth-provider totals must be available.');
must(reporting.includes("'attribution_rate'"),'Source-attribution coverage must be reported.');
must(reporting.includes('optional analytics was allowed'),'Consent-gated source/funnel scope must be disclosed.');
must(leastPrivilege.includes('revoke execute on function public.link_my_watchdog_signup_attribution(uuid,uuid,text,text) from anon'),'Anonymous users must not execute the identity-linking RPC.');
must(leastPrivilege.includes('grant execute on function public.link_my_watchdog_signup_attribution(uuid,uuid,text,text) to authenticated'),'Only authenticated users should receive browser execute permission for identity linking.');

console.log('Watchdog signup attribution contract passed.');
