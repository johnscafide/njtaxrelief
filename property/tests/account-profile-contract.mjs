import fs from 'node:fs';

function read(path){ return fs.readFileSync(path,'utf8'); }
function must(value,message){ if(!value) throw new Error(message); }

const page=read('property/account/index.html');
const controller=read('property/js/account-profile.js');
const css=read('property/css/account-profile.css');
const migration=read('supabase/migrations/20260819191500_account_profile_preferences_v1.sql');

must(page.includes('/property/js/account-profile.js'),'Account must load the living profile controller.');
must(page.includes('/property/css/account-profile.css'),'Account must load the living profile visual layer.');
must(!page.match(/account-profile\.(js|css)\?v=/),'Profile assets must not use version query suffixes.');
must(controller.includes("from('watchdog_onboarding_profiles')"),'Account profile must read the governed onboarding/profile record.');
must(controller.includes("update_my_watchdog_profile_v1"),'Account profile edits must use the governed update RPC.');
must(controller.includes('contact_email'),'Contact email must be editable in Account.');
must(controller.includes('professional_priorities'),'Professional Intelligence priorities must be editable.');
must(controller.includes('household_income_band'),'Private household context must remain user-editable.');
must(controller.includes('Marketing permission is always separate') || controller.includes('marketing consent'),'Contact email copy must keep marketing consent separate.');
must(css.includes('.acp-editor'),'Living profile must have a dedicated visual layer.');

must(migration.includes('security definer'),'Profile update RPC must be server-governed.');
must(migration.includes('set search_path = public, pg_temp'),'Profile update RPC must pin search_path.');
must(migration.includes("'allowed_use','member_personalization_not_housing_targeting'"),'Intelligence assumptions must retain the non-targeting use boundary.');
const intelStart=migration.indexOf('insert into public.intelligence_assumptions');
const intelEnd=migration.indexOf('return query select',intelStart);
const intelBlock=migration.slice(intelStart,intelEnd);
must(intelStart>=0 && intelEnd>intelStart,'Migration must refresh governed Intelligence context.');
must(!intelBlock.includes("'contact_email'"),'Contact email must not be copied into Intelligence assumptions.');
must(!intelBlock.includes("'age_band'"),'Age band must not be copied into Intelligence assumptions.');
must(!intelBlock.includes("'household_income_band'"),'Income band must not be copied into Intelligence assumptions.');
must(!intelBlock.includes("'household_size'"),'Household size must not be copied into Intelligence assumptions.');

console.log('Watchdog Account living profile contract passed.');
