import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const fail = (message) => {
  console.error(`CRM resolution enrichment contract failed: ${message}`);
  process.exitCode = 1;
};
const requireText = (text, needle, label) => {
  if (!text.includes(needle)) fail(`${label} missing: ${needle}`);
};
const forbidText = (text, needle, label) => {
  if (text.includes(needle)) fail(`${label} contains forbidden text: ${needle}`);
};

const worker = read('supabase/functions/integration-crm-resolution-worker/index.ts');
const resolver = read('supabase/functions/integration-crm-resolver/index.ts');
const migration = read('supabase/migrations/20260820054800_integration_crm_missing_zip_enrichment.sql');
const ui = read('property/js/integrations-crm-resolution.js');
const gold = read('property/docs/compliance/CRM-RESOLUTION-GOLD-SET-2026-08-19.md');

requireText(worker, 'NJ_Geocode/GeocodeServer/findAddressCandidates', 'worker geocoder');
requireText(worker, 'score<95', 'worker score gate');
requireText(worker, 'norm!==a.norm', 'worker exact street gate');
requireText(worker, 'origNumber!==candidateNumber', 'worker house-number gate');
requireText(worker, 'esriSpatialRelIntersects', 'worker parcel point lookup');
requireText(worker, 'njogis_zip_enriched_exact_street_spatial_parcel', 'worker match policy');
requireText(worker, 'enriched_zip_exact_candidate', 'worker candidate method');
requireText(worker, 'confidence:candidateCount===1?(enriched?0.92:0.95)', 'worker confidence separation');
requireText(worker, 'ownership_inferred:false', 'worker ownership boundary');
requireText(worker, 'name_match_used:false', 'worker name boundary');
forbidText(worker, 'status:"verified"', 'worker automatic address verification');

requireText(resolver, 'human_verified_gold', 'resolver positive review evidence');
requireText(resolver, 'human_rejected_gold', 'resolver negative review evidence');
requireText(resolver, 'human_verified_manual', 'resolver manual evidence class');
requireText(resolver, 'geocode_score', 'resolver enriched evidence output');
requireText(resolver, 'zip_source', 'resolver ZIP lineage output');
requireText(resolver, 'address_matches:"candidate_only"', 'resolver candidate-only policy');

requireText(migration, 'auto_verify_enabled', 'policy migration');
requireText(migration, "'boldtrail','njogis_zip_enriched_exact_street_spatial_parcel',false,50,0.01000", 'policy gate');
requireText(migration, 'enable row level security', 'shadow RLS');
requireText(migration, 'revoke all on table public.integration_crm_address_enrichment_shadow from public, anon, authenticated', 'shadow browser isolation');
requireText(migration, 'shadow_only_no_property_link_writes', 'shadow no-write contract');
requireText(migration, 'esriSpatialRelIntersects', 'shadow spatial parcel lookup');

requireText(ui, 'NJOGIS ZIP recovery + exact street + parcel point check', 'Integration Center evidence explanation');
requireText(ui, 'Address evidence stays candidate-only', 'Integration Center verification boundary');
requireText(ui, 'human-reviewed negative evidence', 'Integration Center rejection explanation');
forbidText(ui, '?v=', 'Integration Center CRM resolution asset');

requireText(gold, '27 relationships are explicitly human verified', 'gold-set count');
requireText(gold, 'wrong parcel candidates: **0**', 'gold-set fail-closed result');
requireText(gold, '85.19% reproduction rate', 'gold-set shadow result');
requireText(gold, '0 human-rejected relationships', 'gold-set negative-sample caveat');

if (!process.exitCode) console.log('CRM resolution enrichment contract passed.');
