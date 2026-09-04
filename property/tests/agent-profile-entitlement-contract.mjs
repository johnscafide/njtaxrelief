import fs from 'node:fs';

function read(path){ return fs.readFileSync(path,'utf8'); }
function must(value,message){ if(!value) throw new Error(message); }

const vanity = read('property/js/agent-vanity-profile.js');
const branding = read('property/js/agent-branding-profile.js');
const license = read('property/js/professional-license-verification.js');
const migration = read('supabase/migrations/20260904090922_njw_309_fix_agent_vanity_entitlement_boundary.sql');

must(vanity.includes("client.rpc('get_my_entitlement')"), 'Agent vanity profile must use the governed entitlement RPC.');
must(!vanity.includes("from('account_entitlements')"), 'Browser vanity code must never read the server-owned account_entitlements table.');
must(vanity.includes("if (role === 'developer') return true;"), 'Developer accounts must retain Agent-portal eligibility.');

must(migration.includes("public.has_watchdog_plan('agent')"), 'Vanity trigger must authorize paid Agent+ access through has_watchdog_plan.');
const guardStart = migration.indexOf('create or replace function public.guard_agent_vanity_slug()');
const guardEnd = migration.indexOf('$$;', guardStart);
const guardBlock = migration.slice(guardStart, guardEnd);
must(guardStart >= 0 && guardEnd > guardStart, 'Vanity guard migration must define the trigger function.');
must(!guardBlock.includes('public.account_entitlements'), 'Authenticated vanity trigger must not query account_entitlements directly.');
must(guardBlock.includes("new.account_role = 'developer'"), 'Vanity trigger must explicitly preserve Developer eligibility.');

must(branding.includes("update({pro_agent:pro})"), 'Agent branding must remain owner-profile writable.');
must(branding.includes('brokerage_name') && branding.includes('license_number'), 'Agent branding must retain brokerage and license identity fields.');
must(branding.includes('headshot_url') && branding.includes('brokerage_logo_url'), 'Agent branding must retain headshot and brokerage logo fields.');

must(license.includes("primary_profession !== 'real_estate'"), 'License UI must stay tied to the real-estate professional profile context.');
must(license.includes("submit_my_professional_license_v1"), 'NJ license verification must use the governed submit RPC.');

console.log('Developer + Agent profile entitlement contract passed.');
