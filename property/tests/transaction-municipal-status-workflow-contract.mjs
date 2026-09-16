import fs from 'node:fs';

const ui=fs.readFileSync('transaction/municipal-status.js','utf8');
const shell=fs.readFileSync('transaction/shell.js','utf8');
const must=(ok,msg)=>{if(!ok)throw new Error(msg)};

for(const key of ['permit_certificate_lifecycle','resale_cco','smoke_fire_cert'])must(ui.includes(key),`missing workflow for ${key}`);
for(const state of ['inspection_scheduled','corrections_required','reinspection_scheduled'])must(ui.includes(`'${state}'`),`missing workflow state ${state}`);
must(ui.includes("['final_approved','Final approved / closed']"),'permit workflow must distinguish final approved/closed');
must(ui.includes("['approved_issued','Approved / issued']"),'CO/fire workflows must distinguish approved/issued');
must(ui.includes("supplied_by:'user_workflow'"),'workflow provenance must identify user/team supplied status');
must(ui.includes("independent_public_clearance:false"),'workflow payload and activity must refuse independent-clearance semantics');
must(!/patch\.evidence_state\s*=/.test(ui),'user workflow must never rewrite public evidence_state');
must(!/evidence_state\s*:\s*['\"]clear_observed['\"]/.test(ui),'user workflow must never manufacture clear_observed');
must(ui.includes("action:'municipal_status_workflow'"),'workflow changes must be audited in transaction_activity');
must(ui.includes("eq('user_id',user.id)"),'workflow reads/writes must retain explicit user ownership filters');
must(shell.includes('/transaction/municipal-status.js?v=20260915a'),'transaction shell must load municipal status workflows');
must(shell.includes('data-transaction-municipal-status'),'transaction shell must de-duplicate municipal status loader');

console.log('transaction municipal status workflow contract: ok');
