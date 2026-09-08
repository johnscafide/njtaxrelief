import fs from 'node:fs';

function read(path){ return fs.readFileSync(path,'utf8'); }
function must(value,message){ if(!value) throw new Error(message); }

const client=read('anchor-watchdog-handoff.js');
const edge=read('supabase/functions/anchor-result-handoff/index.ts');
const migration=read('supabase/migrations/20260908204500_anchor_estimator_watchdog_auth_unification.sql');

must(edge.includes('db.auth.admin.generateLink'),'Verified ANCHOR handoff must create or resolve the Watchdog Auth identity server-side.');
must(edge.includes('type: "magiclink"'),'Auth handoff must use a one-time passwordless Supabase link.');
must(edge.includes('watchdog_signup_context: "anchor_estimator"'),'New ANCHOR accounts must carry the first-party signup context.');
must(edge.includes('watchdog_account_source: "verified_anchor_estimator"'),'New ANCHOR accounts must carry the bounded verified-estimator source.');
must(edge.includes('auth_handoff_url'),'Stage response must return the one-time account sign-in handoff.');
must(edge.includes('origin_source: "verified_anchor_handoff"'),'Lifecycle origin must distinguish verified estimator account creation.');
must(edge.includes('auth_user_id: userId'),'Retained lead rows must link to their Watchdog Auth account.');
must(edge.includes('.not("verified_at", "is", null)'),'Account handoff must remain gated by a verified estimator OTP.');
must(edge.includes('.gte("verified_at", cutoff)'),'Account handoff must require recent verification rather than an old lead record.');

must(client.includes("var AUTH_HOST='uvkvaxljhhngydvlrzom.supabase.co'"),'Client must pin the accepted Auth handoff host.');
must(client.includes("u.pathname!=='/auth/v1/verify'"),'Client must accept only the Supabase Auth verification endpoint.');
must(client.includes('body&&body.auth_handoff_url'),'Client must use the server-issued authenticated handoff.');
must(client.includes('location.replace(authUrl)'),'Estimator must route through Auth before opening Watchdog.');
must(!client.includes("location.replace('https://www.watchdogindex.com/#anchor-result='+token)"),'Estimator must not bypass Auth with the old anonymous direct redirect.');
must(client.includes('Your free Watchdog account is included.'),'Estimator must disclose automatic free Watchdog account creation before verification.');
must(client.includes('This does not subscribe you to marketing emails.'),'Account creation disclosure must remain separate from marketing permission.');

must(migration.includes('auth_user_id uuid references auth.users(id)'),'Lead records must have a governed Auth-user relationship.');
must(migration.includes("'verified_anchor_handoff'"),'Lifecycle constraint must allow verified ANCHOR handoff provenance.');

console.log('ANCHOR estimator Watchdog Auth handoff contract passed.');
