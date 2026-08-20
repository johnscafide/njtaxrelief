import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const fail=(m)=>{console.error(`Integration Phase 9 contract failed: ${m}`);process.exitCode=1;};
const requireText=(text,needle,label)=>{if(!text.includes(needle))fail(`${label} missing: ${needle}`);};
const forbidText=(text,needle,label)=>{if(text.includes(needle))fail(`${label} contains forbidden text: ${needle}`);};

const foundation=read('supabase/migrations/20260819214600_integration_phase9_shadow_policy_foundation.sql');
const evidence=read('supabase/migrations/20260819222157_integration_phase9_evidence_relationship_proof.sql');
const approvals=read('supabase/migrations/20260820094603_integration_proof_explorer_outcomes_approvals.sql');
const ui=read('property/js/integrations-shadow-lab.js');

requireText(foundation,"mode text not null default 'shadow' check (mode='shadow')",'shadow evaluation mode');
requireText(foundation,"blocked_reason text not null default 'shadow_mode_no_execution'",'shadow action execution block');
requireText(foundation,"'executed',false",'shadow decision execution flag');
requireText(foundation,"'execution_allowed',false",'shadow run execution flag');
requireText(foundation,'coalesce(max(version),0)+1','immutable policy version increment');
requireText(foundation,"status text not null default 'draft' check (status in ('draft','shadow','paused','archived'))",'policy lifecycle');
requireText(foundation,'revoke all on public.integration_automation_policies,public.integration_shadow_runs,public.integration_policy_evaluations,public.integration_shadow_actions from anon,authenticated','shadow table browser denial');

for(const key of ['min_materiality','min_evidence_coverage','max_evidence_age_hours','required_authority','require_verified_relationship']){
  requireText(evidence,key,'evidence-aware shadow conditions');
}
requireText(evidence,"'evidence_not_fully_governed'",'authority fail-closed reason');
requireText(evidence,"'verified_relationship_missing'",'relationship fail-closed reason');
requireText(evidence,"'execution_allowed',false",'evidence replay execution flag');
requireText(evidence,"'shadow_mode_no_execution'",'evidence replay blocked action');
requireText(evidence,'integration_create_finding_proof','proof artifact creation');

requireText(approvals,'execution_allowed boolean not null default false check (execution_allowed = false)','approval database execution lock');
requireText(approvals,"'status','pending'",'approval request state');
requireText(approvals,"v_status not in ('approved','rejected')",'approval decision contract');
requireText(approvals,'execution_allowed=false','approval decision execution lock');
requireText(approvals,'External execution remains disabled in this phase.','approved-is-not-executed contract');
requireText(approvals,"'automation.approval.'||v_status",'approval audit trail');

requireText(ui,'Shadow Lab','shadow lab UI');
requireText(ui,'No CRM write, email, task or other external action is executed','shadow lab zero-write copy');
requireText(ui,'integration_run_shadow_policy','shadow replay UI');
requireText(ui,'integration_request_automation_approval','approval request UI');
requireText(ui,'integration_decide_automation_approval','approval decision UI');
forbidText(ui,'?v=','shadow lab asset loading');

if(!process.exitCode)console.log('Integration Phase 9 shadow-policy contract passed.');
