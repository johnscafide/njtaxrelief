import fs from 'node:fs';
import assert from 'node:assert/strict';

const proof = fs.readFileSync('supabase/migrations/20260820130218_integration_proof_reference_contract.sql','utf8');
const repair = fs.readFileSync('supabase/migrations/20260820135500_integration_proof_reference_passport_repairs.sql','utf8');
const proofIndex = fs.readFileSync('supabase/migrations/20260820134300_integration_proof_reference_proof_id_index.sql','utf8');
const doc = fs.readFileSync('property/docs/automation/AUTOMATION-PROOF-CONTRACT.md','utf8');

function has(text, needle, label){ assert.ok(text.includes(needle), label); }

has(proof, "proof_reference ~ '^wdp_[0-9a-f]{32}$'", 'opaque proof reference format must be constrained');
has(proof, "proof_digest ~ '^[0-9a-f]{64}$'", 'proof digest must be SHA-256 hex');
has(proof, "disclosure_scope in ('external_minimal','watchdog_internal')", 'proof disclosure scopes must be closed');
has(proof, 'alter table public.integration_automation_proof_references enable row level security', 'proof-reference storage must have RLS');
has(proof, 'revoke all on public.integration_automation_proof_references from anon,authenticated', 'browser roles must not receive direct proof-reference table access');
has(proofIndex, 'integration_automation_proof_refs_proof_id_idx', 'proof-reference foreign key must have a covering index');
has(proofIndex, 'integration_automation_proof_references(proof_id)', 'proof-reference proof_id index must cover the foreign key');

// Production repair must use an installed pgcrypto signature, not rely on unknown-type resolution.
has(repair, "extensions.digest(v_proof.envelope::text,'sha256'::text)", 'proof digest must call pgcrypto with text,text');
has(repair, "extensions.digest(v_pin,'sha256'::text)", 'Passport ID digest must call pgcrypto with text,text');
assert.ok(!repair.includes('set search_path = public, private, extensions'), 'do not broaden SECURITY DEFINER search path merely for pgcrypto');
has(repair, "'digest_valid',v_ref.proof_digest=v_current_digest", 'proof reconstruction must verify current envelope digest');
has(repair, "where user_id=v_user", 'proof reconstruction must remain user scoped');
has(repair, "'execution_allowed',false", 'proof and Passport paths must remain non-executing');

const externalBranch = repair.split("if v_scope='external_minimal' then")[1]?.split('\n  else')[0] || '';
assert.ok(externalBranch.length > 0, 'external-minimal disclosure branch must exist');
assert.ok(!externalBranch.includes("'envelope'"), 'external-minimal disclosure must not contain full proof envelope');
for (const pii of ["'email'","'phone'","'contact_name'","'raw_payload'"]) {
  assert.ok(!externalBranch.includes(pii), `external-minimal disclosure must not include ${pii}`);
}

has(repair, "'canonical_key','pams_pin'", 'PAMS PIN must remain canonical Passport key');
has(repair, "'exact_pams_required',true", 'Passport must require exact PAMS identity');
has(repair, "'fuzzy_address_resolution',false", 'Passport must prohibit fuzzy address resolution');
has(repair, "'person_name_matching',false", 'Passport must prohibit person-name identity matching');
has(repair, "'crm_address_can_be_canonical',false", 'CRM address must not become canonical identity');
has(repair, "'ambiguous_identity_fails_closed',true", 'ambiguous Passport identity must fail closed');
has(repair, "'unresolved_identity_fails_closed',true", 'unresolved Passport identity must fail closed');
has(repair, "'unit_or_qualifier_conflict_fails_closed',true", 'unit/qualifier conflict must fail closed');
has(repair, "when v_exact_sources=0 then 'unresolved'", 'Passport unresolved state must be deterministic');
has(repair, "when v_distinct_addresses>1 or v_distinct_parcels>1 then 'ambiguous'", 'Passport ambiguity state must be deterministic');
has(repair, "'identity_usable_for_policy',(v_identity_status='resolved')", 'only resolved Passport identity can be policy-usable');
has(repair, "'historical_aliases_status','not_governed_yet'", 'historical aliases must not be invented');

has(doc, 'Policy-driven external execution remains disabled', 'R&D contract must preserve the no-execution boundary');
has(doc, '`digest_valid=true`', 'R&D contract must require proof integrity verification');
has(doc, 'CRM address cannot become canonical property truth', 'R&D document must preserve CRM truth boundary');
has(doc, 'historical aliases remain unavailable until supported by governed historical identity evidence', 'R&D document must not overclaim address history');
has(doc, 'Proof tampering', 'threat model must cover proof tampering');
has(doc, 'Reference enumeration', 'threat model must cover opaque-reference enumeration');
has(doc, 'This milestone does **not** approve public API availability or autonomous external writes.', 'R&D milestone must not imply launch/autonomy approval');

console.log('Integration proof + Property Passport contract: PASS');
