import fs from 'node:fs';

const read=p=>fs.readFileSync(p,'utf8');
const must=(ok,msg)=>{if(!ok)throw new Error(msg)};
const workflow=read('transaction/municipal-clearance.js');
const shell=read('transaction/shell.js');

for(const state of ['not_requested','prepared','submitted','awaiting_municipality','received','exceptions_follow_up','completed']){
  must(workflow.includes(`'${state}'`)||workflow.includes(`"${state}"`),`missing municipal clearance workflow state: ${state}`);
}

must(workflow.includes("eq('item_key','municipal_lien_clearance')"),'workflow must target municipal_lien_clearance only');
must(workflow.includes("eq('user_id',user.id)"),'workflow updates must retain user ownership filter in addition to RLS');
must(workflow.includes("action:'municipal_lien_workflow'"),'workflow changes must write transaction activity');
must(workflow.includes("patch.evidence_state='issue_observed'"),'recording exceptions must create an issue-observed evidence state');
must(!/patch\.evidence_state\s*=\s*['\"]clear_observed['\"]/.test(workflow),'workflow must never set clear_observed merely from workflow completion');
must(workflow.includes('Workflow completion does not by itself convert the evidence result to “clear.”'),'customer UX must state completion is not clearance');
must(workflow.includes('N.J.A.C')===false,'runtime should link the official state rule rather than embed a potentially stale legal citation string');
must(shell.includes('/transaction/municipal-clearance.js?v=20260915a'),'transaction shell must load municipal clearance workflow');
must(shell.includes('data-transaction-municipal-clearance'),'transaction shell must de-duplicate municipal clearance workflow loading');

console.log('transaction municipal clearance workflow contract: ok');
