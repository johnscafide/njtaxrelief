import fs from 'node:fs';

const route=fs.readFileSync('supabase/functions/transaction-account-route/index.ts','utf8');
const bootstrap=fs.readFileSync('supabase/functions/transaction-evidence-sweep/production-state-evidence-bootstrap.ts','utf8');
const publisher=fs.readFileSync('property/scripts/publish_transaction_provider_registry.py','utf8');
const must=(ok,msg)=>{if(!ok)throw new Error(msg)};

must(route.includes('["edmunds_govpay","municipay","municipal_software"]'),'fallback must be limited to governed pending/manual provider families');
must(route.includes('clean(item.source_type,80)==="live_municipal_account"'),'successful live municipal evidence must outrank fallback routing');
must(route.includes('source_type:"official_search_required"'),'fallback portal must render as official search required');
must(route.includes('source_checked_at:null'),'route discovery must not look like a completed account search');
must(route.includes('search_state:"not_run"'),'fallback must persist not-run state');
must(route.includes('search_completed:false'),'fallback must remain incomplete');
must(route.includes('can_report_none:false'),'fallback must forbid no-record/balance conclusions');
must(route.includes('manual_search_required:true'),'fallback must explicitly hand off to authorized manual search');
must(!route.includes('evidence_state:"clear_observed"'),'account route fallback must never manufacture clear_observed');

const livePos=Math.max(bootstrap.indexOf('transaction-municipal-evidence'),bootstrap.indexOf('transaction-cite-evidence'));
const fallbackPos=bootstrap.indexOf('transaction-account-route');
must(fallbackPos>livePos,'account fallback must run after live municipal providers');

must(publisher.includes('if provider_key in {"municipay","edmunds_govpay"}: return "public_or_guest_portal", "review_required"'),'GovPay/Municipay must publish as review-required until a certified adapter exists');
must(publisher.includes('if provider_key == "municipal_software": return "public_or_guest_portal", "adapter_pending"'),'Municipal Software may remain adapter-pending while public query contract is being proven');
must(publisher.includes('"canonical_evidence_provider":"edmunds_wipp"'),'GovPay must become supplemental when the same municipality already has WIPP');
must(publisher.includes('"supplemental_payment_portal":True'),'publisher must mark redundant GovPay payment links as supplemental');

console.log('transaction account route contract: ok');
