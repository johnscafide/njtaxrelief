-- Transactions: add the Certificate of Occupancy (CO / CCO) document type.
--
-- What it does:
--   1. Adds 'certificate_of_occupancy' to the allowed values of
--      public.transaction_documents.document_type. Every existing value is kept.
--      The old CHECK was declared inline in 20260915233600 (auto-named
--      transaction_documents_document_type_check), so it is found by definition,
--      not by name, and replaced with an explicitly named constraint. The drop
--      and the add run inside one DO block, so they always commit together.
--   2. Reclassifies fallback rows. Until this migration is applied, the vault
--      (transaction/documents.js) and the transaction-collaboration Edge
--      Function save a rejected CO upload as document_type 'other' with the
--      label "Certificate of Occupancy (CO / CCO)" and
--      metadata.requested_document_type = 'certificate_of_occupancy'. The
--      collaborator form (transaction/shared/shared.js) also sends that label,
--      so an older Edge Function that stores an unknown type as 'other' still
--      keeps it. Rows with the marker or with exactly that label become
--      certificate_of_occupancy; the automatic label is cleared, a custom label
--      is kept. Ordinary 'other' rows are untouched. Safe to re-run.
--
-- Must run as a single transaction (supabase db push and apply_migration do
-- this). Under plain `psql -f` autocommit, SET LOCAL is ignored.
--
-- Rollout order (any order works; this is the tidiest):
--   1. Deploy the transaction-collaboration Edge Function.
--   2. Ship the frontend (transaction/documents.js, transaction/shared/*).
--   3. Apply this migration. It widens the CHECK and reclassifies any fallback
--      rows saved in the meantime. Applying it first is also safe; the backfill
--      then has nothing to do.
--
-- Load safety:
--   lock_timeout makes the ALTER give up quickly instead of queueing behind busy
--   sessions (a queued ACCESS EXCLUSIVE request would block readers). The new
--   CHECK is added NOT VALID and then validated. Both run in this migration's
--   transaction, so the lock is held until commit; the table holds one row per
--   uploaded closing document, so the validation scan and the backfill are short.
--
-- Other constraints checked: transaction_document_findings has no
-- document_type column, and no other table, trigger or policy constrains
-- document types (api/transaction-client-room.js and the Edge Function only
-- read or pass the value).

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.transaction_documents'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%document_type%'
  loop
    execute format('alter table public.transaction_documents drop constraint %I', c.conname);
  end loop;

  alter table public.transaction_documents
    add constraint transaction_documents_document_type_check check (document_type in (
      'title_commitment','mortgage_payoff','lender_commitment','appraisal','inspection_report',
      'attorney_review','hoa_condo','solar_agreement','tenancy','estate_probate','divorce',
      'bankruptcy','final_walkthrough','closing_package','certificate_of_occupancy','other'
    )) not valid;
end
$$;

alter table public.transaction_documents
  validate constraint transaction_documents_document_type_check;

update public.transaction_documents
set document_type = 'certificate_of_occupancy',
    document_label = nullif(document_label, 'Certificate of Occupancy (CO / CCO)'),
    metadata = metadata - 'requested_document_type',
    updated_at = now()
where document_type = 'other'
  and (metadata->>'requested_document_type' = 'certificate_of_occupancy'
       or document_label = 'Certificate of Occupancy (CO / CCO)');
