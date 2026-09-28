import { readFileSync } from 'node:fs';

// Integration Center board redesign + CRM <-> property connection, plus the CRM
// address and matcher fixes behind it.
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const must = (condition, message) => { if (!condition) throw new Error(message); };

const page = read('property/integrations/index.html');
must(page.includes('data-sidebar-page="integrations"'), 'Integrations page must keep data-sidebar-page="integrations".');
must(!/sidemenu\.js/.test(page), 'Integration Center must not load the legacy sidebar controller.');
must(/integrations-board\.css\?v=\d{8}[a-z]/.test(page), 'Board stylesheet must load with a cache version.');
must(page.indexOf('integrations-board.css') > page.indexOf('integrations-direct-crm.css'), 'Board stylesheet must load after the legacy integration styles.');
must(/<script src="\/property\/js\/integrations-crm-properties\.js\?v=\d{8}[a-z]" defer><\/script>/.test(page), 'CRM property panel script must load deferred with a cache version.');
must(/<section class="igx" id="igx-crm"[^>]*hidden>/.test(page), 'CRM property panel must start hidden.');
// Static structure and copy live in the page; the script only fills in data.
['loading', 'upsell', 'connect', 'error'].forEach((state) => must(page.includes(`data-igx-state="${state}"`), `CRM panel ${state} state must be static HTML.`));
['ready', 'dashboard', 'missing', 'review', 'search'].forEach((name) => must(page.includes(`data-igx-empty="${name}"`), `CRM panel ${name} empty state must be static HTML.`));
must(page.includes('Nothing is linked until you say so') && page.includes('Watchdog never writes to your CRM on its own'), 'CRM panel intros must live in the page HTML.');
must(/Agent and Pro/.test(page) && /Automations need Pro\+ or Teams/.test(page), 'Plan gate must say the CRM panel works on Agent and Pro.');

const js = read('property/js/integrations-crm-properties.js');
['get_my_crm_property_overview', 'add_my_crm_properties_to_dashboard', 'review_my_crm_property_matches'].forEach((rpc) => {
  must(js.includes(`'${rpc}'`), `CRM panel must call ${rpc}.`);
});
must(!/functions\.invoke\(/.test(js), 'CRM panel reads through RPCs, not Edge Functions.');
must(/function route\(path\)/.test(js) && js.includes('NJPTRSupabaseRuntime') && js.includes('routePrefix'), 'Links must use the routePrefix route() helper.');
must(!/['"]\/property\//.test(js), 'CRM panel must not hard-code /property/ links.');
must(!/ZIP5/.test(js.replace(/\/\/[^\n]*/g, '')), 'NJOGIS ZIP5 is the owner mailing ZIP and must not be requested.');
must(/PGRST202/.test(js) && /root\.hidden = true/.test(js), 'Panel must hide itself if the overview RPC is not deployed yet.');
must(!/root\.innerHTML\s*=/.test(js) && !/Nothing is linked until you say so/.test(js), 'CRM panel script must not own the static panel markup or copy.');
must(/function esc\(/.test(js), 'CRM panel must escape rendered text.');
must(js.includes("/^[=+\\-@]/.test(s)"), 'CSV export must neutralize spreadsheet formulas.');

const css = read('property/css/integrations-board.css');
must(css.includes('html body[data-sidebar-page="integrations"]{'), 'Board tokens must be scoped to the integrations page.');
must(/min-height:44px/.test(css), 'Board controls must keep 44px touch targets.');
must(/@media print/.test(css) && /prefers-reduced-motion/.test(css), 'Board stylesheet needs print and reduced-motion rules.');
must(!/border-left\s*:/.test(css), 'Board design does not use border-left accents.');
must(!/content:\s*["'][^"']+["']/.test(css), 'Board stylesheet must not inject text with content:.');

const cc = read('property/js/integrations-command-center.js');
must(cc.includes("numberFrom('ig-stat-crm')") && cc.includes("numberFrom('ig-stat-retries')"), 'Overview health must read the stat ids the page actually renders.');

const sql = read('supabase/migrations/20260928210000_crm_property_connection.sql');
['get_my_crm_property_overview', 'add_my_crm_properties_to_dashboard', 'review_my_crm_property_matches'].forEach((fn) => {
  must(new RegExp(`function public\\.${fn}\\([^)]*\\)[\\s\\S]*?security definer[\\s\\S]*?set search_path = public, pg_temp`).test(sql), `${fn} must be security definer with a fixed search_path.`);
  must(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon;`).test(sql), `${fn} must not be callable anonymously.`);
  must(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to authenticated;`).test(sql), `${fn} must be granted to signed-in users only.`);
});
must((sql.match(/v_plan not in \('agent', 'pro', 'pro_plus', 'teams', 'developer'\)/g) || []).length === 3, 'Every CRM property RPC must gate on Agent and up.');
must(/l\.status = 'verified'/.test(sql) && /public\.save_property\(v_payload\)/.test(sql), 'Only verified CRM links can be added, through save_property().');
must(/integration_crm_property_limit/.test(sql) && /v_saved >= v_limit/.test(sql), 'Adding CRM properties must respect the plan property limit.');
must(/public\.integration_bulk_decide_crm_candidates\(v_user, p_link_ids, p_decision/.test(sql), 'Match review must go through integration_bulk_decide_crm_candidates for the signed-in user.');
must(!/insert into public\.integration_crm_property_links/i.test(sql), 'The overview migration must not create CRM links itself.');

const fix = read('supabase/migrations/20260928205000_crm_link_method_enriched_fix.sql');
must(fix.includes("'enriched_zip_exact_candidate'") && fix.includes("'exact_address_candidate'") && fix.includes("'verified_address'"), 'link_method check must allow the enriched candidate label and keep existing labels.');
must(/detail_status = 'pending'[\s\S]*where s\.detail_status = 'candidate'[\s\S]*not exists/.test(fix), 'Only candidate states without any link are re-queued.');

// BoldTrail re-syncs send no address; they must not erase the one the resolver stored.
const keep = read('supabase/migrations/20260928220000_crm_sync_keeps_resolved_address.sql');
must(keep.includes("property_address = coalesce(excluded.property_address, integration_crm_context.property_address),"), 'CRM sync upsert must keep the stored address when the incoming row has none.');
must(/raise exception 'integration_upsert_crm_context_batch changed/.test(keep), 'Address rule rewrite must stop if the upsert function changed shape.');
const requeue = read('supabase/migrations/20260928223000_crm_requeue_blanked_addresses.sql');
must(/c\.property_address is null/.test(requeue) && /s\.normalized_address is not null/.test(requeue) && /not in \('pending', 'error'\)/.test(requeue), 'Only resolved contacts that lost their address are re-queued.');
must(!/delete from/i.test(requeue), 'Address recovery must not delete CRM links.');

// The matcher must not report success when a save fails.
const worker = read('supabase/functions/integration-crm-resolution-worker/index.ts');
must(/async function setState[^\n]*if\(error\)throw new Error\(`crm_resolution_state_update_failed/.test(worker), 'Resolution state saves must throw on error.');
must(/async function clearAddressCandidates[^\n]*if\(error\)throw new Error\(`crm_candidate_link_clear_failed/.test(worker), 'Clearing old candidates must throw on error.');
must(worker.includes('crm_candidate_link_read_failed') && worker.includes('crm_candidate_link_write_failed') && worker.includes('crm_explicit_link_refresh_failed'), 'Candidate link reads, writes, and explicit link refresh must check for errors.');
must(/if\(!written\)\{await setState\(admin,ctx\.id,\{detail_status:alreadyVerified\?"enriched":"no_match"/.test(worker), 'A contact whose matches were all reviewed must not be left as a pending candidate.');
must(worker.includes('crm_resolution_error_state_failed'), 'A failure to record an error must be logged, not swallowed.');

// Parcel matching: NJOGIS ZIP5 is the owner's mailing ZIP, so it must never decide which parcel a CRM address is.
const workerCode = worker.replace(/\/\/[^\n]*/g, '');
must(!/ZIP5/.test(workerCode), 'The resolution worker must not match or filter parcels on NJOGIS ZIP5 (owner mailing ZIP).');
must(/admin\.rpc\("integration_find_crm_parcels"/.test(worker) && worker.includes('crm_parcel_match_failed'), 'The worker must match through integration_find_crm_parcels and fail loudly when it errors.');
must(/function parsedAddress\(/.test(worker), 'The worker must store the street, town, state and ZIP split out of one-line CRM addresses.');
must(worker.includes('status:"candidate"') && !worker.includes('status:"verified"'), 'Local parcel matches stay candidates for review.');
const localMatch = read('supabase/migrations/20260928240000_crm_parcel_match_local.sql');
must(/function public\.integration_find_crm_parcels\([\s\S]*?security definer[\s\S]*?set search_path = public, pg_temp/.test(localMatch), 'integration_find_crm_parcels must be security definer with a fixed search_path.');
must(localMatch.includes('revoke all on function public.integration_find_crm_parcels(text, text, text, text) from public, anon, authenticated;') && localMatch.includes('grant execute on function public.integration_find_crm_parcels(text, text, text, text) to service_role;'), 'integration_find_crm_parcels is for the service role only.');
must(localMatch.includes('alter table public.nj_zip_districts enable row level security;') && localMatch.includes('revoke all on table public.nj_zip_districts from public, anon, authenticated;'), 'The ZIP to town table stays server-only.');
must(/create index if not exists property_lookups_address_prefix_idx\s+on public\.property_lookups \(address text_pattern_ops\)\s+where county is not null and county <> ''/.test(read('supabase/migrations/20260928210000_instant_parcel_search.sql')) && (localMatch.match(/r\.county is not null and r\.county <> ''/g) || []).length === 2 && (localMatch.match(/r\.address ~>=~ \(v_house \|\| ' '\) and r\.address ~<~ \(v_house \|\| '!'\)/g) || []).length === 2, 'Parcel lookups must stay on the house-number index range, never a statewide scan.');
must(/function public\.watchdog_norm_street\(p text\)[\s\S]*?immutable/.test(localMatch), 'Street normalization must be immutable so it can back an index.');
must(/v_statewide = 1 and not v_zip_known/.test(localMatch), 'A contact with no town evidence only matches an address that is unique in New Jersey, and never against a known ZIP.');
must(!/owner_name|mailing/i.test(localMatch.replace(/--[^\n]*/g, '')), 'Parcel matching must not use owner names or owner mailing addresses.');
const page2 = read('property/integrations/index.html');
must(!page2.includes('matches exactly one New Jersey parcel') && page2.includes('in the same town'), 'The "How matching works" copy must describe town-based matching.');

console.log('Integration Center board and CRM property contract passed');
