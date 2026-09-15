import fs from 'node:fs';

const route=fs.readFileSync('supabase/functions/transaction-code-violation-route/index.ts','utf8');
const bootstrap=fs.readFileSync('supabase/functions/transaction-evidence-sweep/production-state-evidence-bootstrap.ts','utf8');
const must=(ok,msg)=>{if(!ok)throw new Error(msg)};

must(route.includes('.eq("provider_key","municipal_code_enforcement")'),'code route must use curated municipal_code_enforcement providers only');
must(route.includes('.eq("item_key","open_violations")'),'code route must target open_violations only');
must(route.includes('function preserveStronger'),'code route must preserve stronger completed evidence');
must(route.includes('evidence==="issue_observed"||evidence==="clear_observed"'),'observed issue/clear evidence must outrank route discovery');
must(route.includes('source_type:"official_manual"'),'unsearched code-enforcement route must display as official manual verification');
must(route.includes('source_checked_at:null'),'route discovery must not look like a completed parcel search');
must(route.includes('search_state:"not_run"'),'route must persist not-run search state');
must(route.includes('search_completed:false'),'route discovery must remain incomplete');
must(route.includes('can_report_none:false'),'route discovery must never permit a no-violation conclusion');
must(route.includes('automation_authorized:false'),'route must fail closed on machine-access authorization');
must(route.includes('manual_verification_required:true'),'route must explicitly require municipal verification');
must(!route.includes('evidence_state:"clear_observed"'),'manual code route must never create a clear result');
must(bootstrap.includes('transaction-code-violation-route'),'evidence sweep must invoke the code-violation route');

console.log('transaction code violation route contract: ok');
