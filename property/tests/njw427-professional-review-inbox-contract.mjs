import fs from 'node:fs';

function read(path){return fs.readFileSync(path,'utf8')}
function must(value,message){if(!value)throw new Error(message)}

const migration=read('supabase/migrations/20260925203500_njw_427_professional_review_inbox_connections.sql');
const backfill=read('supabase/migrations/20260925204500_njw_427_realtor_notification_backfill.sql');
const notify=read('supabase/functions/professional-review-notify/index.ts');
const realtor=read('property/js/realtor-verification.js');
const connections=read('property/js/professional-connections.js');
const profilePage=read('property/account/professional-profile/index.html');
const api=read('api/watchdog-backoffice-professional.js');
const adminPage=read('property/backoffice/professional-verifications/index.html');
const adminJs=read('property/backoffice/professional-verifications/professional-verifications.js');
const backofficeAuth=read('property/backoffice/backoffice-dev-auth.js');
const vercel=read('vercel.json');

must(migration.includes("'needs_info'"),'REALTOR review model must support needs_info.');
must(migration.includes('create table if not exists public.professional_review_events'),'Professional review audit table missing.');
must(migration.includes('create table if not exists public.professional_notification_outbox'),'Professional notification outbox missing.');
must(migration.includes('create table if not exists public.professional_provider_connections'),'Professional connection table missing.');
must(migration.includes("check (provider_key in ('bright_mls','reso_mls','realtor_com'))"),'Provider allowlist missing.');
must(migration.includes('enable row level security'),'RLS missing from professional connector foundation.');
must(migration.includes('grant execute on function public.request_my_professional_connection_v1(text,text) to authenticated'),'User connection request RPC missing.');
must(migration.includes('revoke all on function public.review_professional_connection_v1(uuid,text,text,text,text,jsonb,jsonb,text) from public, anon, authenticated'),'Connection review must be service-only.');
must(migration.includes('grant execute on function public.review_realtor_verification_v1(uuid,text,text,text,text,timestamptz) to service_role'),'REALTOR decision must remain service-owned.');
must(migration.includes('professional_realtor_submission_event_trigger'),'REALTOR submission trigger missing.');
must(backfill.includes("where r.verification_status = 'pending'"),'Existing pending REALTOR submissions are not backfilled.');

must(realtor.includes("db.functions.invoke('professional-review-notify'"),'REALTOR submission does not invoke notification sidecar.');
must(realtor.includes("verification_status==='needs_info'"),'User UI does not show information-request state.');
must(notify.includes('professional_notification_outbox'),'Notification function is not outbox-backed.');
must(notify.includes('api.emailjs.com/api/v1.0/email/send'),'EmailJS admin notification delivery missing.');
must(notify.includes('backoffice_queue: true'),'Email failure must preserve Backoffice as source of truth.');

must(connections.includes("key:'bright_mls'"),'Bright MLS request card missing.');
must(connections.includes("key:'reso_mls'"),'Generic RESO MLS request card missing.');
must(connections.includes("key:'realtor_com'"),'Realtor.com request card missing.');
must(connections.includes('does not scrape Realtor.com reviews')||connections.includes('will not scrape reviews'),'Realtor.com no-scrape boundary missing.');
must(connections.includes("db.rpc('request_my_professional_connection_v1'"),'Connection request RPC not wired.');
must(profilePage.includes('professional-connections.js?v=20260925a'),'Professional connections JS not loaded.');
must(profilePage.includes('professional-connections.css?v=20260925a'),'Professional connections CSS not loaded.');

must(api.includes("rpc('review_realtor_verification_v1'"),'Backoffice REALTOR review action missing.');
must(api.includes("is_watchdog_developer"),'Backoffice professional API must require developer authorization.');
must(api.includes("!['needs_action','disconnected'].includes(status)"),'Backoffice must not fabricate a connected provider state.');
must(adminPage.includes('REALTOR® verification queue'),'Professional Reviews queue missing.');
must(adminPage.includes('Professional connection requests'),'Professional connection queue missing.');
must(adminJs.includes("data-review-action=\"verified\""),'Verify REALTOR action missing.');
must(adminJs.includes("data-review-action=\"needs_info\""),'Request-information action missing.');
must(adminJs.includes("data-review-action=\"rejected\""),'Reject action missing.');
must(adminJs.includes('data-expire-user'),'Expire/revoke action missing.');
must(backofficeAuth.includes("PROFESSIONAL_API='/api/watchdog-backoffice-professional'"),'Main Backoffice professional badge API missing.');
must(backofficeAuth.includes('Professional Reviews'),'Main Backoffice Professional Reviews nav missing.');

const config=JSON.parse(vercel);
must(config.rewrites.some(r=>r.source==='/backoffice/professional-verifications'&&r.destination==='/property/backoffice/professional-verifications/index.html'),'Professional Reviews clean route missing.');

console.log('NJW-427 professional review inbox and connector foundation contract passed');
