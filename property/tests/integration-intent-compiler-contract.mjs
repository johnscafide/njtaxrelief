import fs from 'node:fs';
import assert from 'node:assert/strict';

const base = fs.readFileSync('supabase/migrations/20260820135730_integration_intent_compiler_autonomy_tiers_v01.sql','utf8');
const composition = fs.readFileSync('supabase/migrations/20260820135902_integration_intent_compiler_v02_appeal_draft_composition.sql','utf8');
const doc = fs.readFileSync('property/docs/automation/INTENT-TO-AUTOMATION-CONTRACT.md','utf8');

const has=(s,n,m)=>assert.ok(s.includes(n),m||`Missing ${n}`);

has(base,'integration_autonomy_contracts','versioned autonomy contract table required');
has(base,"('autonomy-v1',4,'Bounded autonomous actions'",'Tier 4 contract required');
has(base,'cannot be granted by prompt','Tier 4 must explicitly prohibit prompt grants');
has(base,"activation_supported boolean not null default false",'activation capability must be explicit');
has(base,"proposed_autonomy_tier smallint not null check (proposed_autonomy_tier between 0 and 3)",'compiler ledger may never propose Tier 4');
has(base,"'tier4_prompt_grant_allowed',false",'compiler response must deny Tier 4 prompt grants');
has(base,"'activation_allowed',false",'compiler must never return activation authority');
has(base,"'raw_objective_stored',false",'compiler audit must document raw objective is not stored');
has(base,"'raw_external_context_stored',false",'compiler audit must document raw external context is not stored');
has(base,"'used_for_authority',false",'external context must not influence authority');
has(base,"v_status:='needs_clarification'",'unsupported or ambiguous intent must stop for clarification');
has(base,'No integration or action was invented from an unsupported objective.','unsupported intent must not hallucinate an integration');
has(base,'Requested privilege escalation was ignored.','prompt privilege escalation must be ignored explicitly');
has(base,"'policy_status','shadow'",'supported proposals must hand off to shadow mode');
has(base,"'external_execution',false",'shadow handoff must remain non-executing');

for (const key of ['appeal_review','closing_followup','permit_followup','watchlist_notification','report_distribution','client_communication']) {
  has(base,`v_intent_key:='${key}'`,`representative compiler family ${key} required`);
}

has(composition,'alter function public.integration_compile_automation_intent(text,jsonb) rename to integration_compile_automation_intent_v01','v0.2 must preserve v0.1 as immutable delegate');
has(composition,"v_compiler text:='intent-compiler-v0.2'",'v0.2 compiler version required');
has(composition,"'prepare_client_email_draft'",'composed appeal/client intent must draft rather than send');
has(composition,"'send_client_message','included_in_plan',false",'client send must be excluded from composed plan');
has(composition,"'required_tier',3,'required_approval','human','proof_required',true",'future client send must require Tier 3 + human approval + proof');
has(composition,"'activation_allowed',false",'v0.2 cannot activate');

has(doc,'same Watchlist objective was compiled twice','acceptance documentation must include determinism test');
has(doc,'external context remained untrusted and unused for authority','acceptance documentation must include injection test');
has(doc,'This milestone does **not** create a live activation path.','documentation must not overclaim compiler authority');

console.log('Integration intent compiler + autonomy contract: PASS');
