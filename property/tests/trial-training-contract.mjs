import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=(p)=>fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const html=read('agent/training/index.html');
const js=read('agent/training/training.js');
const runtime=read('property/js/supabase-runtime.js');
const guard=read('property/js/access-guard.js');
const migration=read('supabase/migrations/20260920102000_agent_trial_training_onboarding.sql');
const enforcement=read('supabase/migrations/20260925224500_require_professional_training.sql');
const middleware=read('middleware.js');
const canonicalMirror=read('property/agent/training/index.html');

const modules=['welcome','property_intelligence','agent_workspace','property_pulse','contacts_crm','transactions','pro_plus','roadmap'];
for(const module of modules){
  assert.ok(html.includes('data-module="'+module+'"'),'Training page missing module '+module);
  assert.ok(migration.includes("'"+module+"'"),'Training migration missing module '+module);
}
assert.ok(html.includes('Live today')&&html.includes('Beta / limited')&&html.includes('Planned'),'Training must distinguish live, beta and planned capabilities.');
assert.ok(html.includes('Training mode'),'Training page must remain explicitly labeled as training.');
assert.ok(html.includes('Watchdog does not replace title work'),'Training must state the evidence boundary.');
assert.ok(js.includes("get_my_agent_training_state"),'Training page must load server training state.');
assert.ok(js.includes("update_my_agent_training_progress"),'Training page must persist reviewed modules through RPC.');
assert.ok(js.includes("complete_my_agent_training"),'Training page must use governed completion RPC.');
assert.ok(js.includes("ensureRoadmapReviewed")&&js.includes("p_module:'roadmap'"),'Final acknowledgement must persist lesson 8 before completion.');
assert.ok(runtime.includes("get_my_agent_training_state"),'Shared runtime must enforce trial training.');
assert.ok(runtime.includes("trainingPath = '/agent/training/'"),'Shared runtime must know the training route.');
assert.ok(runtime.includes("agent|transaction"),'Shared protected route gate must cover Agent and Transaction workspaces.');
assert.ok(guard.includes("Training required"),'Access guard must enforce training on guarded pages.');
assert.ok(migration.includes('revoke insert, update, delete on public.watchdog_agent_training_progress from authenticated'),'Clients must not directly write completion state.');
assert.ok(migration.includes('account_entitlements_trial_training_sync'),'Future trial entitlements must automatically create training state.');
assert.ok(migration.includes("subscription_status = 'trialing'"),'Initial training rollout must still cover trial entitlements.');
assert.ok(enforcement.includes("subscription_status in ('active','trialing','past_due')"),'Current professional accounts must be required to complete training until complete.');
assert.ok(guard.includes("pagePath !== '/agent/training'"),'Guarded professional pages must check training regardless of developer or trial-only shortcuts.');
assert.ok(middleware.includes("'/agent/training'"),'Canonical host must serve Agent Training directly instead of proxying it through the clean-page adapter.');
assert.ok(canonicalMirror.includes('Watchdog Agent Academy'),'Canonical property mirror must contain the Agent Training page as a safe compatibility fallback.');
assert.ok(html.includes('/agent/assets/platform-live.png')&&html.includes('Actual Watchdog screen'),'Training should use the existing real Watchdog screenshot where it accurately represents the product.');
assert.ok(html.includes('Illustrative training view'),'Illustrative private-workspace visuals must be explicitly labeled and never presented as live screenshots.');
console.log('trial-training-contract: ok');
