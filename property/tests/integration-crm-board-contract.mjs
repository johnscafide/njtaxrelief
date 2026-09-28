import { readFileSync } from 'node:fs';

// Integration Center board redesign + CRM <-> property connection.
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const must = (condition, message) => { if (!condition) throw new Error(message); };

const page = read('property/integrations/index.html');
must(page.includes('data-sidebar-page="integrations"'), 'Integrations page must keep data-sidebar-page="integrations".');
must(!/sidemenu\.js/.test(page), 'Integration Center must not load the legacy sidebar controller.');
must(/integrations-board\.css\?v=\d{8}[a-z]/.test(page), 'Board stylesheet must load with a cache version.');
must(page.indexOf('integrations-board.css') > page.indexOf('integrations-direct-crm.css'), 'Board stylesheet must load after the legacy integration styles.');
must(/<script src="\/property\/js\/integrations-crm-properties\.js\?v=\d{8}[a-z]" defer><\/script>/.test(page), 'CRM property panel script must load deferred with a cache version.');
must(/<section class="igx" id="igx-crm"[^>]*hidden><\/section>/.test(page), 'CRM property panel container must start hidden.');
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

console.log('Integration Center board and CRM property contract passed');
