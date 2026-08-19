import fs from 'node:fs';

function read(path){ return fs.readFileSync(path,'utf8'); }
function must(value,message){ if(!value) throw new Error(message); }

const runtime=read('property/js/supabase-runtime.js');
const page=read('property/onboarding/index.html');
const onboarding=read('property/js/onboarding.js');
const css=read('property/css/onboarding.css');
const migration=read('supabase/migrations/20260819150000_required_watchdog_onboarding_v1.sql');

must(runtime.includes("'/property/onboarding/?next='"),'OAuth runtime must route through the onboarding page.');
must(runtime.includes('instance.auth.signInWithOAuth = function'),'Canonical runtime must wrap every known Watchdog OAuth client.');
must(runtime.includes("get_my_watchdog_onboarding_state"),'Protected member routes must check onboarding state.');
must(runtime.includes("google: { label:'Google', enabled:true }"),'Google must remain enabled.');
must(runtime.includes("apple: { label:'Apple', enabled:false }"),'Apple must be provider-ready but disabled until credentials exist.');
must(runtime.includes("facebook: { label:'Facebook', enabled:true }"),'Facebook must remain enabled after production provider configuration.');
must(runtime.includes("linkedin_oidc: { label:'LinkedIn', enabled:true }"),'LinkedIn OIDC must be enabled after production provider configuration.');
must(runtime.includes("Object.defineProperty(window, 'plSignInPrompt'"),'Legacy public sign-in triggers must be bridged immediately on cold browsers.');
must(runtime.includes('openSignIn: openOnboarding'),'Shared auth runtime must expose a direct onboarding sign-in entry.');
must(runtime.includes("querySelectorAll('.auth-magic')"),'Legacy email/magic-link signup UI must be removed by the shared runtime.');
must(!runtime.match(/\.js\?v=|\.css\?v=/),'Onboarding runtime must not introduce version-query assets.');

must(page.includes('/property/js/onboarding.js'),'Onboarding page must load the dedicated survey controller.');
must(page.includes('/property/css/onboarding.css'),'Onboarding page must load its dedicated visual layer.');
must(!/sign in link|magic link/i.test(page),'Onboarding page must not offer email magic-link signup.');
must(css.includes('.wd-onboarding-card'),'Onboarding must render as the dedicated overlay/card experience.');

must(onboarding.includes("complete_my_watchdog_onboarding"),'Survey completion must use the governed completion RPC.');
must(onboarding.includes("Prefer not to say"),'Sensitive demographic steps must include a Prefer not to say path.');
must(onboarding.includes("professional_priorities"),'Professional workflow priorities must be captured.');
must(onboarding.includes("professional_volume_band"),'Professional workflow volume must be captured.');
must(onboarding.includes("primary_profession"),'Professional role must be captured.');
must(!onboarding.match(/\.js\?v=|\.css\?v=/),'Onboarding assets must not introduce version-query filenames.');

must(migration.includes('alter table public.watchdog_onboarding_profiles enable row level security'),'Onboarding table must have RLS enabled.');
must(migration.includes('for select to authenticated using ((select auth.uid()) = user_id)'),'Users may read only their own onboarding record.');
must(migration.includes('revoke insert, update, delete on public.watchdog_onboarding_profiles from authenticated'),'Raw survey writes must remain behind the completion RPC.');
must(migration.includes("'grandfathered_existing_member'"),'Existing members must be grandfathered so rollout does not lock them out.');
must(migration.includes("set search_path = public, pg_temp"),'Onboarding functions must pin search_path.');
must(migration.includes("'allowed_use','member_personalization_not_housing_targeting'"),'Intelligence context must carry an explicit non-targeting use boundary.');

const intelStart=migration.indexOf('insert into public.intelligence_assumptions');
const intelEnd=migration.indexOf('return query select',intelStart);
const intelBlock=migration.slice(intelStart,intelEnd);
must(intelStart>=0 && intelEnd>intelStart,'Migration must seed governed Intelligence context.');
must(!intelBlock.includes("'age_band'"),'Age band must not be copied into Intelligence assumptions.');
must(!intelBlock.includes("'household_income_band'"),'Income band must not be copied into Intelligence assumptions.');
must(!intelBlock.includes("'household_size'"),'Household size must not be copied into Intelligence assumptions.');

console.log('Required Watchdog onboarding contract passed.');
