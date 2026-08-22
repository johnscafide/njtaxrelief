import fs from 'node:fs';

function read(path){ return fs.readFileSync(path,'utf8'); }
function must(value,message){ if(!value) throw new Error(message); }

const runtime=read('property/js/supabase-runtime.js');
const page=read('property/onboarding/index.html');
const onboarding=read('property/js/onboarding.js');
const emailAuth=read('property/js/onboarding-email-auth.js');
const css=read('property/css/onboarding.css');
const migration=read('supabase/migrations/20260819150000_required_watchdog_onboarding_v1.sql');
const contactMigration=read('supabase/migrations/20260819190000_watchdog_onboarding_contact_email_v2.sql');
const otpTemplate=read('supabase/templates/watchdog-email-otp.html');

must(runtime.includes("var onboardingPath = routePrefix + '/onboarding/';") && runtime.includes("return location.origin + onboardingPath + '?next='"),'OAuth runtime must route through the onboarding page on both Watchdog domains.');
must(runtime.includes('instance.auth.signInWithOAuth = function'),'Canonical runtime must wrap every known Watchdog OAuth client.');
must(runtime.includes("get_my_watchdog_onboarding_state"),'Protected member routes must check onboarding state.');
must(runtime.includes("google: { label:'Google', enabled:true }"),'Google must remain enabled.');
must(runtime.includes("apple: { label:'Apple', enabled:false }"),'Apple must remain disabled while deferred.');
must(runtime.includes("facebook: { label:'Facebook', enabled:true }"),'Facebook must remain enabled after production provider configuration.');
must(runtime.includes("linkedin_oidc: { label:'LinkedIn', enabled:true }"),'LinkedIn OIDC must remain enabled after production provider configuration.');
must(runtime.includes("Object.defineProperty(window, 'plSignInPrompt'"),'Legacy public sign-in triggers must be bridged immediately on cold browsers.');
must(runtime.includes('openSignIn: openOnboarding'),'Shared auth runtime must expose a direct onboarding sign-in entry.');
must(runtime.includes("querySelectorAll('.auth-magic')"),'Legacy email/magic-link signup UI must be removed by the shared runtime.');
must(!runtime.match(/\.js\?v=|\.css\?v=/),'Onboarding runtime must not introduce version-query assets.');

must(page.includes('/property/js/onboarding.js'),'Onboarding page must load the dedicated survey controller.');
must(page.includes('/property/js/onboarding-email-auth.js'),'Onboarding page must load the passwordless email controller.');
must(page.includes('/property/css/onboarding.css'),'Onboarding page must load its dedicated visual layer.');
must(page.includes("Watchdog's <a href=\"/property/terms\""),'Authentication must present linked Watchdog Terms at the point of sign-in.');
must(!/sign in link|magic link/i.test(page),'Onboarding page must not offer email magic-link signup.');
must(css.includes('.wd-onboarding-card'),'Onboarding must render as the dedicated overlay/card experience.');

must(emailAuth.includes('db.auth.signInWithOtp'),'Email fallback must use native Supabase passwordless OTP.');
must(emailAuth.includes('shouldCreateUser: true'),'Email OTP must create a real Supabase account for new verified users.');
must(emailAuth.includes('db.auth.verifyOtp'),'Email code entry must verify through Supabase Auth.');
must(emailAuth.includes("type: 'email'"),'Email OTP verification must use the email verification type.');
must(emailAuth.includes("autocomplete=\"one-time-code\""),'Email code input must expose one-time-code autocomplete semantics.');
must(emailAuth.includes('window.location.reload()'),'Successful email verification must re-enter the canonical onboarding session gate.');
must(!/signInWithPassword|password\s*:/i.test(emailAuth),'Email fallback must remain passwordless.');
must(otpTemplate.includes('{{ .Token }}'),'Watchdog OTP email template must render the Supabase six-digit token.');
must(!otpTemplate.includes('{{ .ConfirmationURL }}'),'Watchdog OTP email template must not fall back to a magic link.');

must(onboarding.includes("id:'contact_email'"),'Onboarding must ask the member to confirm a contact email.');
must(onboarding.includes("autocomplete:'email'"),'Contact email input must use email autocomplete semantics.');
must(onboarding.includes('Marketing permission is always separate'),'Onboarding must keep contact email separate from marketing consent.');
must(onboarding.includes("complete_my_watchdog_onboarding_v2"),'Survey completion must use the contact-email-aware governed completion RPC.');
must(onboarding.includes('session.user.email'),'Authenticated email should prefill the contact email when available.');
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

must(contactMigration.includes('contact_email text'),'Onboarding schema must persist a dedicated contact email.');
must(contactMigration.includes('contact_email_confirmed_at'),'Confirmed contact email must carry a confirmation timestamp.');
must(contactMigration.includes('complete_my_watchdog_onboarding_v2'),'Contact email must be validated and persisted through a governed RPC.');
must(contactMigration.includes('Separate from auth identity and separate from marketing consent'),'Contact email semantics must remain separate from identity and marketing consent.');

const intelStart=migration.indexOf('insert into public.intelligence_assumptions');
const intelEnd=migration.indexOf('return query select',intelStart);
const intelBlock=migration.slice(intelStart,intelEnd);
must(intelStart>=0 && intelEnd>intelStart,'Migration must seed governed Intelligence context.');
must(!intelBlock.includes("'age_band'"),'Age band must not be copied into Intelligence assumptions.');
must(!intelBlock.includes("'household_income_band'"),'Income band must not be copied into Intelligence assumptions.');
must(!intelBlock.includes("'household_size'"),'Household size must not be copied into Intelligence assumptions.');
must(!intelBlock.includes("'contact_email'"),'Contact email must not be copied into Intelligence assumptions.');

console.log('Required Watchdog onboarding contract passed.');
