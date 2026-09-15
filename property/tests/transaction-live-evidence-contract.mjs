import fs from 'node:fs';

const read = p => fs.readFileSync(p, 'utf8');
const must = (ok, msg) => { if (!ok) throw new Error(msg); };

const migration = read('supabase/migrations/20260915182500_transaction_live_evidence_warehouse.sql');
const builder = read('property/scripts/build_transaction_modiv_snapshot.py');
const stateFn = read('supabase/functions/transaction-state-evidence/index.ts');
const wrapper = read('supabase/functions/transaction-evidence-sweep/production-state-evidence-bootstrap.ts');
const preflight = read('transaction/preflight.js');
const config = read('supabase/config.toml');

for (const table of ['transaction_data_releases','transaction_evidence_observations']) {
  must(migration.includes(`alter table public.${table} enable row level security`), `${table} must have RLS`);
  must(migration.includes(`revoke all on table public.${table} from public, anon, authenticated`), `${table} browser access must be revoked`);
}
must(migration.includes("'transaction-evidence-private'"), 'Private transaction evidence bucket must exist');
must(migration.includes('activate_transaction_data_release'), 'Release promotion RPC must be present');

for (const field of ['tax_account_number','deed_book','deed_page','deed_date','delinquent_code','last_year_tax','current_year_tax','bill_status_flag']) {
  must(builder.includes(`"${field}"`), `MOD-IV builder must retain ${field}`);
}
for (const forbidden of ['OWNER-NAME','owner_name','mailing_address','MORTGAGE-ACCOUNT-NUMBER']) {
  must(!builder.includes(`"${forbidden}"`), `Builder must not persist sensitive field ${forbidden}`);
}
must(builder.includes('raw_archives_persisted": False'), 'Builder must keep raw source archives ephemeral');
must(builder.includes('source_rows < 3_000_000'), 'Builder must fail closed on implausible statewide coverage');
must(builder.includes('len(partitions) < 560'), 'Builder must fail closed on district coverage');
must(builder.includes('activate(project, key, args.release_id)'), 'Validated source release must be promoted atomically');

must(stateFn.includes('RANK.pro_plus'), 'State evidence provider must remain Pro+ gated');
must(stateFn.includes('transaction_evidence_observations'), 'State evidence must append to the governed evidence ledger');
must(stateFn.includes('current_balance_state:"not_determined"'), 'Annual MOD-IV must not imply live municipal clearance');
must(stateFn.includes('tax_sale_state:"not_determined"'), 'MOD-IV delinquency must not imply tax-sale certificate status');
must(stateFn.includes('delinquent?"issue_observed"'), 'Delinquency evidence must surface as an issue when observed');

must(wrapper.includes('transaction-state-evidence'), 'Evidence sweep must invoke state evidence provider');
must(wrapper.includes('7ac96705b68b9f1f5e81e4cf138b157c00ec2505'), 'Wrapper must pin the certified prior evidence sweep source');
must(config.includes('[functions.transaction-state-evidence]\nverify_jwt = true'), 'New state provider must require JWT');

must(preflight.includes("2026 state tax-list evidence"), 'Transaction UI must display concrete state tax evidence');
must(preflight.includes("Annual delinquency evidence checked"), 'Transaction UI must display concrete delinquency evidence');
must(preflight.includes("Tax-sale certificate"), 'Transaction UI must distinguish delinquency evidence from tax-sale status');

console.log('Transaction live evidence contract checks passed.');
