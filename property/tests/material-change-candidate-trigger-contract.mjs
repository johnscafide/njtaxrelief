import fs from 'node:fs';

const base='supabase/migrations/20260819143800_intelligence_semantic_material_change_candidates.sql';
const patch='supabase/migrations/20260819143900_fix_semantic_material_change_candidate_conflict.sql';
for(const p of [base,patch])if(!fs.existsSync(p))throw new Error(`${p} must exist`);
const b=fs.readFileSync(base,'utf8'),p=fs.readFileSync(patch,'utf8');
const must=(ok,msg)=>{if(!ok)throw new Error(msg)};

must(b.includes('intelligence_material_change_candidates'),'Base candidate ledger migration must remain present.');
must(p.includes('create or replace function public.project_semantic_source_fact_change_candidates()'),'Patch must replace the candidate projector.');
must(p.includes('v_candidate_key text'),'Patch must use an unambiguous local candidate-key variable.');
must(p.includes("v_candidate_key := 'semantic:' || new.pams_pin || ':' || marker_id"),'Patch must retain property-scoped dedupe material.');
must(p.includes('old.facts_hash,new.facts_hash,v_candidate_key'),'Patched insert must use the renamed local variable.');
must(!/declare[\s\S]{0,400}\bcandidate_key\s+text\b/i.test(p),'Patched projector must not reintroduce a local variable named candidate_key.');
must(p.includes('on conflict (user_id,candidate_key) do nothing'),'Database conflict target must remain the table key.');
must(p.includes('revoke all on function public.project_semantic_source_fact_change_candidates() from public, anon, authenticated'),'Patched SECURITY DEFINER projector must remain uncallable by browser roles.');
must(!b.includes('?v=')&&!p.includes('?v='),'Candidate ledger migrations must not introduce version-query asset URLs.');

console.log('Material change candidate trigger contract passed: property-scoped dedupe, unambiguous conflict variable, browser-call boundary preserved.');
