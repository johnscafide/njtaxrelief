import fs from 'node:fs';
import assert from 'node:assert/strict';

const proof = fs.readFileSync('supabase/migrations/20260820130218_integration_proof_reference_contract.sql','utf8');
const fix = fs.readFileSync('supabase/migrations/20260820133715_integration_proof_reference_pgcrypto_schema_fix.sql','utf8');
const passport = fs.readFileSync('supabase/migrations/20260820134053_integration_property_passport_prototype.sql','utf8');
const doc = fs.readFileSync('property/docs/integrations/PROPERTY-PASSPORT-RD.md','utf8');

function has(text, needle, label){ assert.ok(text.includes(needle), label); }

has(proof, "proof_reference ~ '^wdp_[0-9a-f]{32}$'", 'opaque proof reference format must be constrained');
has(proof, "proof_digest ~ '^[0-9a-f]{64}$'", 'proof digest must be SHA-256 hex');
has(proof, "disclosure_scope in ('external_minimal','watchdog_internal')", 'proof disclosure scopes must be closed');
has(proof, 'alter table public.integration_automation_proof_references enable row level security', 'proof-reference storage must have RLS');
has(proof, 'revoke all on public.integration_automation_proof_references from anon,authenticated', 'browser roles must not receive direct proof-reference table access');
has(proof, "'execution_allowed',false", 'proof references must not authorize execution');
has(proof, 'user_id=v_user', 'proof reconstruction must remain user scoped');

has(fix, "extensions.digest(convert_to(v_proof.envelope::text,'UTF8'),'sha256')", 'pgcrypto digest must be explicitly schema-qualified');
assert.ok(!fix.includes('set search_path=public,private,extensions'), 'do not broaden SECURITY DEFINER search path merely for pgcrypto');

const externalBranch = proof.split("if v_scope='external_minimal' then")[1]?.split('\n  else')[0] || '';
assert.ok(externalBranch.length > 0, 'external-minimal disclosure branch must exist');
assert.ok(!externalBranch.includes("'envelope'"), 'external-minimal disclosure must not contain full proof envelope');
for (const pii of ["'email'","'phone'","'contact_name'","'raw_payload'"]) {
  assert.ok(!externalBranch.includes(pii), `external-minimal disclosure must not include ${pii}`);
}

has(passport, "'canonical_key','pams_pin'", 'PAMS PIN must remain canonical Passport key');
has(passport, "'exact_pams_required',true", 'Passport must require exact PAMS identity');
has(passport, "'fuzzy_address_resolution',false", 'Passport must prohibit fuzzy address resolution');
has(passport, "'person_name_matching',false", 'Passport must prohibit person-name identity matching');
has(passport, "'crm_address_can_be_canonical',false", 'CRM address must not become canonical identity');
has(passport, "'ambiguous_identity_fails_closed',true", 'ambiguous Passport identity must fail closed');
has(passport, "'unresolved_identity_fails_closed',true", 'unresolved Passport identity must fail closed');
has(passport, "'unit_or_qualifier_conflict_fails_closed',true", 'unit/qualifier conflict must fail closed');
has(passport, "when v_exact_sources=0 then 'unresolved'", 'Passport unresolved state must be deterministic');
has(passport, "when v_distinct_addresses>1 or v_distinct_parcels>1 then 'ambiguous'", 'Passport ambiguity state must be deterministic');
has(passport, "'execution_allowed',false", 'Passport must never authorize execution');
has(passport, 'revoke execute on function public.integration_get_property_passport(text) from public,anon', 'Passport RPC must not be anon callable');
has(passport, "extensions.digest(convert_to(v_pin,'UTF8'),'sha256')", 'Passport ID must use explicit pgcrypto schema');

has(doc, '**PAMS PIN is the only canonical key in v0.1.**', 'R&D document must declare canonical identity');
has(doc, 'CRM address can never become canonical property identity', 'R&D document must preserve CRM truth boundary');
has(doc, 'Historical aliases are **not yet governed**', 'R&D document must not overclaim address history');
has(doc, 'proof reference used as authorization', 'threat model must cover proof-reference authorization confusion');

console.log('Integration proof + Property Passport contract: PASS');
