import fs from 'node:fs';

const discovery=fs.readFileSync('property/scripts/discover_county_record_sources.py','utf8');
const publisher=fs.readFileSync('property/scripts/publish_transaction_provider_registry.py','utf8');
const routing=fs.readFileSync('supabase/functions/transaction-county-evidence/index.ts','utf8');
const must=(ok,msg)=>{if(!ok)throw new Error(msg)};

must(discovery.includes("import argparse, concurrent.futures, datetime as dt, html.parser, json, pathlib, re"),'discovery must use regex term boundaries');
must(discovery.includes('def has_term(hay,term):'),'discovery must match whole terms instead of raw substrings');
must(discovery.includes("'payment program for aliens'"),'discovery must explicitly reject the known aliens/lien false positive');
must(discovery.includes("'military discharge'"),'discovery must reject military discharge as deed/mortgage evidence');
must(discovery.includes("'public records search'"),'discovery should recognize explicit public record search portals');
must(publisher.includes('COUNTY_NOISE'),'registry publisher must independently reject known county-discovery noise');
must(publisher.includes('def county_noise(item: dict) -> bool:'),'registry publisher must apply a county noise predicate');
must(publisher.includes('if county_noise(item): continue'),'noisy cached discovery rows must not be republished');
must(publisher.includes('"search_completed":False'),'published county route metadata must stay explicitly unsearched');
must(routing.includes('function isNoise'),'live county router must reject known non-property route noise');
must(routing.includes('["liens","search_portal","clerk_land_records","deeds_mortgages"]'),'lien routing must prefer actual search portals');
must(routing.includes('["search_portal","clerk_land_records","legal_notices","liens"]'),'lis pendens routing must prefer actual search portals');
must(routing.includes('["search_portal","deeds_mortgages","clerk_land_records"]'),'deed routing must prefer actual search portals');
must(routing.includes("access==='official_public_search'"),'official public search routes must receive a strong routing boost');
must(routing.includes('noise_filtered:true'),'evidence observation must record noise-filtered routing');
must(!routing.includes('evidence_state:"clear_observed"'),'routing must never manufacture a clear result');

console.log('transaction county discovery quality contract: ok');
