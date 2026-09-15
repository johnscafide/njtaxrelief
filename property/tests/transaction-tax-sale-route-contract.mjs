import fs from 'node:fs';

const route=fs.readFileSync('supabase/functions/transaction-tax-sale-route/index.ts','utf8');
const bootstrap=fs.readFileSync('supabase/functions/transaction-evidence-sweep/production-state-evidence-bootstrap.ts','utf8');
const publisher=fs.readFileSync('property/scripts/publish_transaction_provider_registry.py','utf8');
const must=(ok,msg)=>{if(!ok)throw new Error(msg)};

must(route.includes('.eq("provider_key","nj_tax_sale_portal")'),'tax-sale route must use governed provider registry entries');
must(route.includes('function preserveStronger'),'manual tax-sale route must preserve completed stronger evidence');
must(route.includes('t==="live_municipal_account"'),'live municipal account evidence must outrank manual route discovery');
must(route.includes('source_type:"official_search_required"'),'unsearched auction portal must display as search required');
must(route.includes('source_checked_at:null'),'route discovery must not look like a completed source check');
must(route.includes('search_state:"not_run"'),'tax-sale route must persist not-run search state');
must(route.includes('search_completed:false'),'route discovery must remain incomplete');
must(route.includes('can_report_none:false'),'route discovery must never permit a no-record conclusion');
must(route.includes('automation_authorized:false'),'route must fail closed on machine-access authorization');
must(route.includes('manual_search_required:true'),'route must explicitly hand off to an authorized manual search');
must(!route.includes('evidence_state:"clear_observed"'),'manual tax-sale route must never create a clear result');

must(publisher.includes('return "public_tax_sale_portal", "review_required"'),'registry refresh must not promote tax-sale portals to adapter-pending without an authorized machine contract');
must(publisher.includes('"automation_authorized":False'),'published tax-sale routes must preserve unauthorized automation state');
must(publisher.includes('"manual_search_required":True'),'published tax-sale routes must preserve manual-search handoff');
must(publisher.includes('"search_completed":False'),'published tax-sale routes must remain explicitly unsearched');

const livePos=Math.max(bootstrap.indexOf('transaction-municipal-evidence'),bootstrap.indexOf('transaction-cite-evidence'));
const routePos=bootstrap.indexOf('transaction-tax-sale-route');
must(routePos>livePos,'tax-sale manual route must run after live municipal providers');

console.log('transaction tax sale route contract: ok');
