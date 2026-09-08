import fs from 'node:fs';

function read(path){ return fs.readFileSync(path,'utf8'); }
function must(value,message){ if(!value) throw new Error(message); }

const runtime=read('property/js/signup-attribution.js');
const onboardingEmail=read('property/js/onboarding-email-auth.js');
const anchorLibrary=read('property/anchor/applications/index.html');
const analyticsPage=read('property/analytics/index.html');
const schema=read('supabase/migrations/20260904164622_watchdog_signup_attribution_analytics.sql');
const reporting=read('supabase/migrations/20260904165216_watchdog_signup_attribution_reporting_hardening.sql');
const leastPrivilege=read('supabase/migrations/20260904165518_watchdog_signup_attribution_least_privilege.sql');
const lifecycle=read('supabase/migrations/20260908202000_watchdog_user_lifecycle.sql');

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
must(runtime.includes("'auth_failure'"),'Authentication failures must be recorded without PII.');
must(runtime.includes("'signInWithOAuth'"),'Social OAuth failures must be instrumented.');
must(runtime.includes("'signInWithOtp'"),'Email OTP request failures must be instrumented.');
must(runtime.includes("'verifyOtp'"),'Email OTP verification failures must be instrumented.');
must(runtime.includes("params.has('error_code')"),'OAuth callback failures must be detected after provider redirect.');
must(!runtime.includes('wd-library-email'),'Runtime must not read the ANCHOR email field.');
must(!runtime.includes('wd-email-address'),'Runtime must not read the onboarding email field.');
must(onboardingEmail.includes('/property/js/signup-attribution.js'),'Canonical onboarding must load signup attribution.');
must(anchorLibrary.includes('/property/js/signup-attribution.js'),'ANCHOR application library must load signup attribution.');
must(anchorLibrary.includes('never Private Vault contents'),'ANCHOR privacy boundary must stay explicit.');

must(runtime.includes('watchdog_signup_context'),'First-party signup context must be attached to new OTP-created auth users.');
must(runtime.includes('record_my_watchdog_signup_origin'),'Fresh authenticated accounts must persist signup origin independently of optional analytics.');
must(runtime.indexOf("document.addEventListener('click', onClick, true)") < runtime.indexOf('if (analyticsAllowed()) init();'),'First-party signup lifecycle capture must initialize even when analytics consent is absent.');
must(lifecycle.includes('create table if not exists public.watchdog_user_lifecycle'),'Lifecycle migration must persist account/email lifecycle state.');
must(lifecycle.includes('revoke all on table public.watchdog_user_lifecycle from public, anon, authenticated'),'Lifecycle email PII must never be directly browser-readable.');
must(lifecycle.includes('record_my_watchdog_signup_origin'),'Lifecycle migration must expose a bounded authenticated first-party origin RPC.');
must(lifecycle.includes('get_watchdog_user_lifecycle'),'Lifecycle roster must be developer-only and segmentable for future recovery/re-engagement.');
must(lifecycle.includes("contact_permission in ('transactional_only','marketing_opt_in','unsubscribed','suppressed')"),'Lifecycle ledger must preserve contact-permission and suppression states.');

must(analyticsPage.includes("get_watchdog_acquisition_analytics"),'Developer Analytics must load the governed signup acquisition report.');
must(analyticsPage.includes('id="signup-acquisition"'),'Developer Analytics must render signup acquisition.');
must(analyticsPage.includes('id="auth-funnel"'),'Developer Analytics must render the authentication funnel.');
must(analyticsPage.includes('Auth failures'),'Developer Analytics must surface authentication failure sessions.');

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

console.log('Watchdog signup attribution + lifecycle contract passed.');
