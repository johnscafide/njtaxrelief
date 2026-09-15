import fs from 'node:fs';

const src=fs.readFileSync('supabase/functions/transaction-county-evidence/index.ts','utf8');
const must=(ok,msg)=>{if(!ok)throw new Error(msg)};

must(src.includes('ADAPTER_RANK'),'county routing must rank provider maturity');
must(src.includes('function bestRoute'),'county routing must select per-evidence-family routes');
must(src.includes('["liens","clerk_land_records","deeds_mortgages"]'),'lien routing must prefer lien/land-record families');
must(src.includes('["clerk_land_records","legal_notices","liens"]'),'lis pendens routing must prefer county recording families');
must(src.includes('["deeds_mortgages","clerk_land_records"]'),'deed routing must prefer deed/land-record families');
must(src.includes('source_type:"official_search_required"'),'unsearched lien/title routes must render as search required');
must(src.includes('source_checked_at:null'),'routing discovery must not masquerade as completed search time');
must(src.includes('search_state:"not_run"'),'routing payload must expose not-run state');
must(src.includes('can_report_none:false'),'routing alone must forbid no-record conclusions');
must(src.includes('family_ranked:true'),'observation metadata must record family-ranked routing');
must(src.includes('/click here|register|subscription|premium access/i'),'customer-facing provider labels must normalize scraped CTA text');
must(!src.includes('evidence_state:"clear_observed"'),'county routing function must never create a clear result');

console.log('transaction county route ranking contract: ok');
