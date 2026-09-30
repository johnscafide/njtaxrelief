-- Transactions: add the Certificate of Occupancy (CO / CCO) document type.
--
-- What it does:
--   Adds 'certificate_of_occupancy' to the allowed values of
--   public.transaction_documents.document_type. Every existing value is kept.
--   The old CHECK was declared inline in 20260915233600 (auto-named
--   transaction_documents_document_type_check), so it is found by definition,
--   not by name, and replaced with an explicitly named constraint.
--
-- Rollout order:
--   1. Apply this migration.
--   2. Deploy the transaction-collaboration Edge Function.
--   3. Ship the frontend (transaction/documents.js, transaction/shared/index.html).
--   The Edge Function and transaction/documents.js both retry a rejected
--   certificate_of_occupancy insert as 'other' with the label
--   "Certificate of Occupancy (CO / CCO)", so an out-of-order rollout degrades
--   to "Other" instead of failing the upload.
--
-- Load safety:
--   lock_timeout makes the ALTER give up quickly instead of queueing behind busy
--   sessions (a queued ACCESS EXCLUSIVE request would block readers). The new
--   CHECK is added NOT VALID and then validated. Both run in this migration's
--   transaction, so the lock is held until commit; the table holds one row per
--   uploaded closing document, so the validation scan is short.
--
-- Other constraints checked: transaction_document_findings has no
-- document_type column, and no other table or policy constrains document types
-- (api/transaction-client-room.js and the Edge Function only read or pass the value).

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
end
$$;

alter table public.transaction_documents
  add constraint transaction_documents_document_type_check check (document_type in (
    'title_commitment','mortgage_payoff','lender_commitment','appraisal','inspection_report',
    'attorney_review','hoa_condo','solar_agreement','tenancy','estate_probate','divorce',
    'bankruptcy','final_walkthrough','closing_package','certificate_of_occupancy','other'
  )) not valid;

alter table public.transaction_documents
  validate constraint transaction_documents_document_type_check;
