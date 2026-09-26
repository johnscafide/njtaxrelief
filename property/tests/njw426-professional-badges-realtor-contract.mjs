import fs from 'node:fs';

function read(path){ return fs.readFileSync(new URL('../../'+path, import.meta.url),'utf8'); }
function expect(value,message){ if(!value) throw new Error(message); }

const account=read('property/js/account.js');
const refresh=read('property/css/account-refresh-20260925.css');
const accountPage=read('property/account/index.html');
const branding=read('property/js/agent-branding-profile.js');
const brandApi=read('api/brokerage-brand-discovery.js');
const licenseApi=read('api/njrec-license-verify.js');
const realtor=read('property/js/realtor-verification.js');
const professionalPage=read('property/account/professional-profile/index.html');
const migration=read('supabase/migrations/20260925161000_njw_426_realtor_verification.sql');

expect(fs.statSync(new URL('../../property/assets/brokerages/opus-elite-logo.png', import.meta.url)).size>1000,'Supplied Opus logo asset missing');
expect(branding.includes('/property/assets/brokerages/opus-elite-logo.png'),'Agent branding does not use supplied Opus logo');
expect(brandApi.includes('/property/assets/brokerages/opus-elite-logo.png'),'Curated brokerage API does not use supplied Opus logo');
expect(account.includes('professionalBadgeMarkup'),'Account professional badge renderer missing');
expect(account.includes('REALTOR®')&&account.includes('Licensed Agent'),'Professional badge labels missing');
expect(account.indexOf('REALTOR®')<account.indexOf('Licensed Agent'),'REALTOR badge must supersede Licensed Agent');
expect(account.includes("client.rpc('my_realtor_verification_v1')"),'Account does not load REALTOR verification');
expect(account.includes('ac-hero-broker'),'Brokerage hero chip missing');
expect(refresh.includes('.ac-pro-badge.realtor')&&refresh.includes('.ac-hero-broker'),'Professional hero styling missing');
expect(accountPage.includes('account.js?v=20260925b'),'Account JS cache key missing');
expect(accountPage.includes('account-refresh-20260925.css?v=20260925g'),'Account CSS cache key missing');
expect(professionalPage.includes('realtor-verification.css?v=20260925a'),'REALTOR CSS not loaded');
expect(professionalPage.includes('realtor-verification.js?v=20260925a'),'REALTOR JS not loaded');
expect(realtor.includes("db.rpc('submit_my_realtor_verification_v1'"),'REALTOR submit RPC missing');
expect(realtor.includes("db.rpc('my_realtor_verification_v1')"),'REALTOR read RPC missing');
expect(realtor.includes('does not yet have a direct NAR membership-verification API connection'),'Manual-review disclosure missing');
expect(migration.includes('create table if not exists public.professional_realtor_verifications'),'REALTOR verification table missing');
expect(migration.includes('alter table public.professional_realtor_verifications enable row level security'),'REALTOR RLS missing');
expect(migration.includes('create policy "realtor verification owner read"'),'REALTOR owner read policy missing');
expect(migration.includes('grant execute on function public.submit_my_realtor_verification_v1(text,text,text,text) to authenticated'),'Authenticated submit grant missing');
expect(migration.includes('revoke all on function public.review_realtor_verification_v1(uuid,text,text,text,text,timestamptz) from public, anon, authenticated'),'Review RPC is not protected');
expect(migration.includes('grant execute on function public.review_realtor_verification_v1(uuid,text,text,text,text,timestamptz) to service_role'),'Service review grant missing');
expect(licenseApi.includes('actively\\s+licensed'),'NJDOBI ACTIVELY LICENSED compatibility missing');
expect(migration.includes('actively[[:space:]]+licensed'),'Database NJDOBI active compatibility missing');

console.log('NJW-426 professional badges and REALTOR verification contract passed');
