import fs from 'node:fs';
function read(path){return fs.readFileSync(path,'utf8')}
function must(v,m){if(!v)throw new Error(m)}
const brandApi=read('api/brokerage-brand-discovery.js');
const searchApi=read('api/njrec-license-search.js');
const verifyApi=read('api/njrec-license-verify.js');
const branding=read('property/js/agent-branding-profile.js');
const verifyUi=read('property/js/professional-license-verification.js');
const page=read('property/account/professional-profile/index.html');
const migration=read('supabase/migrations/20260925185700_njw_424_professional_license_official_verification.sql');

must(branding.includes("url:'https://opusagent.com/'"),'Opus must use opusagent.com.');
must(branding.includes("url:'https://kw.com/'"),'KW must use canonical kw.com.');
must(branding.includes("https://www.remax.com/usa/en"),'RE/MAX preset URL missing.');
must(branding.includes("https://www.coldwellbanker.com/"),'Coldwell Banker preset URL missing.');
must(branding.includes("https://www.compass.com/"),'Compass preset URL missing.');
must(branding.includes("https://www.exprealty.com/"),'eXp preset URL missing.');
must(branding.includes("https://www.weichert.com/"),'Weichert preset URL missing.');
must(branding.includes("https://www.century21.com/"),'Century 21 preset URL missing.');
must(branding.includes("https://www.bhhs.com/"),'BHHS preset URL missing.');
must(branding.includes("https://www.sothebysrealty.com/"),'Sothebys preset URL missing.');
must(brandApi.includes("source:'curated_registry'"),'Known brokerages must bypass scraping.');
must(brandApi.includes("site_icon_fallback"),'Blocked custom sites need a graceful fallback.');
must(!brandApi.includes("return res.status(e.status||422).json({error:e.message||'Could not analyze that brokerage website.'})"),'Raw upstream 403 errors must not escape for valid public sites.');
must(branding.includes('Last name (recommended) or NJ license #'),'Last-name guidance missing from license finder.');
must(searchApi.includes('last name (recommended)'),'NJREC API guidance missing.');
must(branding.includes("watchdog:njrec-license-selected"),'License finder must sync selected result to verification.');
must(verifyUi.includes("if (profile && !document.getElementById('ac-professional-verification'))"),'Verification observer must not endlessly rerender its own input.');
must(verifyUi.includes('/api/njrec-license-verify'),'Verification UI must use official exact-match endpoint.');
must(verifyUi.includes('queueManual'),'Verification must retain temporary-outage fallback.');
must(verifyApi.includes('verify_professional_license_official_v2'),'Verify endpoint must persist through service-only RPC.');
must(verifyApi.includes("No exact NJDOBI record matched this number"),'Exact record matching guard missing.');
must(migration.includes("grant execute on function public.verify_professional_license_official_v2(uuid,text,text,text) to service_role"),'Official verification RPC must be service-role only.');
must(migration.includes("where user_id = v_uid\n  limit 1"),'Manual fallback must not require completed onboarding state.');
must(page.includes('agent-branding-profile.js?v=20260925b'),'Branding cache version missing.');
must(page.includes('professional-license-verification.js?v=20260925b'),'Verification cache version missing.');
console.log('NJW-424 brokerage and professional verification contract passed');
