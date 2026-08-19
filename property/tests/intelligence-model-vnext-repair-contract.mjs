import fs from 'node:fs';
import vm from 'node:vm';

const files={
  draft:'supabase/migrations/20260819143000_watchdog_intelligence_model_vnext_drafts.sql',
  restore:'supabase/migrations/20260819141600_restore_property_change_v3_until_fresh_holdout.sql',
  gate:'supabase/migrations/20260819141700_enforce_failed_model_promotion_gate.sql',
  readiness:'supabase/functions/intelligence-model-repair-readiness/index.ts',
  shadow:'supabase/functions/intelligence-model-shadow-evaluate/index.ts',
  config:'supabase/config.toml',
  page:'property/intelligence/calibration-review/index.html',
  panel:'property/js/intelligence-model-repair-readiness.js',
  css:'property/css/intelligence-model-repair-readiness.css'
};
for(const p of Object.values(files))if(!fs.existsSync(p))throw new Error(`${p} must exist`);
const read=p=>fs.readFileSync(p,'utf8');
const draft=read(files.draft),restore=read(files.restore),gate=read(files.gate),readiness=read(files.readiness),shadow=read(files.shadow),config=read(files.config),page=read(files.page),panel=read(files.panel),css=read(files.css);
const expect=(ok,msg)=>{if(!ok)throw new Error(msg)};
new vm.Script(panel,{filename:files.panel});

expect(draft.includes("m.model_key='closing_review'")&&draft.includes("m.model_key='property_change_priority'"),'vNext draft migration must define both failed-model repair paths.');
expect(draft.includes("m.model_key,\n  3")||draft.includes("m.model_key,3"),'Closing Review repair must use a new immutable v3 model version.');
expect(draft.includes("m.model_key,\n  4")||draft.includes("m.model_key,4"),'Property Change repair research must use a new immutable v4 model version.');
expect(draft.includes("'draft'")&&draft.includes("'uncalibrated'"),'Repair model definitions must begin draft and uncalibrated.');
expect(draft.includes("'event.recency_vnext',1,'event.occurred_at'"),'Property Change vNext must repair the recency source-key mismatch.');
expect(draft.includes("'source_refresh':0")||draft.includes('"source_refresh":0'),'Property Change vNext must explicitly neutralize operational source_refresh events.');
expect(draft.includes("'excluded_event_types', jsonb_build_array('source_refresh')")||draft.includes("'excluded_event_types',jsonb_build_array('source_refresh')"),'Property Change repair contract must exclude source_refresh from the decision-material input contract.');
expect(draft.includes("'reuse_v2_labels_as_promotion_proof', false")||draft.includes("'reuse_v2_labels_as_promotion_proof',false"),'Closing v2 tuning labels must not become v3 promotion proof.');
expect(draft.includes("'reuse_v3_labels_as_promotion_proof', false")||draft.includes("'reuse_v3_labels_as_promotion_proof',false"),'Property Change v3 tuning labels must not become repair promotion proof.');
expect(!/update\s+public\.intelligence_models[\s\S]{0,300}set\s+version\s*=\s*[34]/i.test(draft),'Draft architecture migration must not move current model pointers.');

expect(restore.includes("v.version = 3")&&restore.includes("m.version in (4,5)"),'Safety reconciliation must restore Property Change to reviewed v3 if an uncalibrated repair becomes current.');
expect(restore.includes("model_version in (4,5)")&&restore.includes("status = 'rejected'"),'Unsafe uncalibrated repair holdouts must be rejected rather than soliciting labels.');
expect(restore.includes("fresh_independent_holdout_still_required"),'Restore migration must preserve the fresh-label requirement.');

expect(gate.includes('enforce_failed_intelligence_model_promotion_gate'),'Database promotion interlock must exist.');
expect(gate.includes("new.model_key not in ('closing_review','property_change_priority')"),'Promotion interlock must scope to the two failed models.');
expect(gate.includes('new.version <= old.version'),'Promotion interlock must permit rollback.');
expect(gate.includes("new.calibration_state <> 'calibrated'"),'Forward promotion must require calibrated state.');
expect(gate.includes("s.status = 'accepted'")&&gate.includes('z.passes_gate = true'),'Forward promotion must require an accepted passing calibration set.');
expect(gate.includes('z.reviewed_cases >= s.minimum_reviewed_cases'),'Forward promotion must enforce the minimum independent review count.');
expect(gate.includes("fresh_holdout_required")&&gate.includes("do_not_reuse_prior_calibration_cases"),'Forward promotion must require a fresh non-reused holdout contract.');
expect(gate.includes("closing_review' and version=2")&&gate.includes("property_change_priority' and version=3"),'Promotion interlock installation must assert known-safe current pointers.');

expect(readiness.includes('account_role')&&readiness.includes('developer'),'Repair-readiness endpoint must require developer role.');
expect(readiness.includes('aggregate_model_repair_readiness_no_property_identifiers'),'Repair-readiness output must declare aggregate/no-property-ID privacy.');
expect(readiness.includes('source_refresh_events')&&readiness.includes('non_operational_events')&&readiness.includes('distinct_non_operational_event_types'),'Readiness must measure material event-pool structure.');
expect(readiness.includes('v3_recency_feature_unavailable_in_persisted_evidence'),'Readiness must expose the diagnosed recency mismatch.');
expect(readiness.includes('vnext_direct_feature_dry_run_required_before_fresh_holdout'),'Closing Review must remain blocked until a non-persisting vNext dry run.');
const response=readiness.slice(readiness.indexOf('return out(req,200,{'));
expect(!response.includes('pams_pin:'),'Aggregate readiness response must not return property identifiers.');
expect(!response.includes('address:'),'Aggregate readiness response must not return property addresses.');
expect(/\[functions\.intelligence-model-repair-readiness\][\s\S]*?verify_jwt = true/.test(config),'Repair-readiness endpoint must require JWT at the gateway.');

expect(shadow.includes('account_role')&&shadow.includes('developer'),'Shadow evaluator must require developer role.');
expect(shadow.includes('Shadow evaluator accepts draft model versions only'),'Shadow evaluator must reject non-draft model versions.');
expect(shadow.includes('Shadow evaluator refuses the current customer-facing model version'),'Shadow evaluator must refuse the current model pointer.');
expect(shadow.includes('aggregate_shadow_evaluation_no_property_identifiers'),'Shadow output must declare aggregate/no-property-ID privacy.');
expect(shadow.includes('persistence:"none"'),'Shadow evaluator must explicitly declare zero persistence.');
expect(shadow.includes('/functions/v1/workbench-derived')&&shadow.includes('/functions/v1/workbench-hydrate'),'Shadow evaluator must resolve governed derived/raw evidence rather than invent inputs.');
expect(shadow.includes('structurally_ready_for_fresh_holdout'),'Shadow evaluator must produce a structural holdout readiness decision.');
expect(shadow.includes('threshold_positive_candidates')&&shadow.includes('threshold_negative_candidates')&&shadow.includes('unique_feature_vectors'),'Shadow readiness must require both threshold classes and diverse feature vectors.');
expect(shadow.includes('Shadow discrimination is not model validation'),'Shadow evaluator must preserve the calibration boundary.');
const shadowResponse=shadow.slice(shadow.indexOf('return out(req,200,{'));
expect(!shadowResponse.includes('pams_pin:'),'Shadow response must not return property identifiers.');
expect(!shadowResponse.includes('address:'),'Shadow response must not return property addresses.');
expect(!shadow.includes('intelligence_runs").insert')&&!shadow.includes('intelligence_findings").insert')&&!shadow.includes('intelligence_evidence_batches").insert'),'Shadow evaluator must not persist runs, findings, or trusted evidence batches.');
expect(/\[functions\.intelligence-model-shadow-evaluate\][\s\S]*?verify_jwt = true/.test(config),'Shadow evaluator must require JWT at the gateway.');

expect(page.includes('/property/css/intelligence-model-repair-readiness.css'),'Calibration Review must load repair-readiness styling.');
expect(page.includes('/property/js/intelligence-model-repair-readiness.js'),'Calibration Review must load repair-readiness runtime.');
expect(panel.includes("functions.invoke('intelligence-model-repair-readiness'"),'Repair panel must use the governed developer readiness endpoint.');
expect(panel.includes("functions.invoke('intelligence-model-shadow-evaluate'"),'Repair panel must expose the governed shadow evaluator.');
expect(panel.includes("model_key:'closing_review',model_version:3")&&panel.includes('sample_size:100'),'Closing shadow UI must target the immutable v3 draft with a bounded sample.');
expect(panel.includes('fresh holdout actually worth labeling'),'Repair panel must frame the decision around avoiding wasted human labels.');
expect(panel.includes('Draft vNext designs remain non-runnable and uncalibrated'),'Repair panel must not imply draft readiness equals calibration.');
expect(css.includes('.cr-repair-model')&&css.includes('.cr-repair-model.ready')&&css.includes('.cr-repair-shadow-result'),'Repair readiness must have compact blocked/ready and shadow visual states.');

for(const [name,content] of Object.entries({draft,restore,gate,readiness,shadow,config,page,panel,css}))expect(!content.includes('?v='),`${name} must not introduce ?v= asset URLs.`);
console.log('Intelligence model-vNext repair contract passed: immutable drafts, safe rollback, DB promotion interlock, aggregate readiness, non-persisting draft shadow evaluation, developer UI, fresh-holdout boundary, no ?v=.');
