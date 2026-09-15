import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const must=(ok,msg)=>{if(!ok)throw new Error(msg)};
const fn=read('supabase/functions/transaction-municipal-evidence/index.ts');
const wrapper=read('supabase/functions/transaction-evidence-sweep/production-state-evidence-bootstrap.ts');

must(fn.includes('wippPropInfo/search?propertyLoc='),'WIPP provider must use the verified anonymous property search');
must(fn.includes('/wippTaxes/'),'WIPP provider must retrieve live property-tax detail');
must(fn.includes('/wippUtil/search?propertyLoc='),'WIPP provider must search live utility accounts');
must(fn.includes('/wippUtil/'),'WIPP provider must retrieve live utility detail');
must(fn.includes('pickAddressMatch'),'Provider must require property-address reconciliation');
must(fn.includes('no_exact_address_match'),'Provider must fail closed when a unique exact address match is absent');
must(fn.includes('live_past_due_balance'),'Tax evidence must retain live past-due amount');
must(fn.includes('live_tax_sale_flag'),'Tax evidence must retain the live municipal tax-sale flag');
must(fn.includes('live_delinquent_balance'),'Utility evidence must retain delinquent balance');
must(fn.includes('transaction_evidence_observations'),'Live provider must append governed evidence observations');
must(fn.includes('municipal_lien_certificate:false'),'Live tax account must not masquerade as a municipal lien certificate');
must(fn.includes('final_reading_clearance:false'),'Utility account must not masquerade as final-reading clearance');
must(fn.includes('RANK.pro_plus'),'Transaction municipal provider must enforce Pro+ entitlement');
must(!fn.includes('for(let account'),'Provider must never enumerate municipal account numbers');

const baseCall=wrapper.indexOf('const response = await handler');
const stateCall=wrapper.indexOf('transaction-state-evidence');
const municipalCall=wrapper.indexOf('transaction-municipal-evidence');
must(baseCall>=0&&stateCall>baseCall&&municipalCall>stateCall,'Base sweep must run before state evidence, with live municipal evidence layered last');
console.log('transaction WIPP evidence contract: ok');
