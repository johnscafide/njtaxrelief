-- NJW-361 follow-up: make document-finding transaction binding explicit.
-- The original policy used an unqualified transaction_id inside the correlated
-- subquery. Qualify the outer column so an owned document can only propose a
-- finding for that document's own transaction.

drop policy if exists transaction_document_findings_insert on public.transaction_document_findings;
create policy transaction_document_findings_insert
on public.transaction_document_findings for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (select public.has_watchdog_plan('pro_plus'))
  and exists (
    select 1 from public.transaction_documents d
    where d.id = transaction_document_findings.document_id
      and d.transaction_id = transaction_document_findings.transaction_id
      and d.user_id = (select auth.uid())
  )
);

drop policy if exists transaction_document_findings_update on public.transaction_document_findings;
create policy transaction_document_findings_update
on public.transaction_document_findings for update to authenticated
using (
  user_id = (select auth.uid())
  and (select public.has_watchdog_plan('pro_plus'))
)
with check (
  user_id = (select auth.uid())
  and (select public.has_watchdog_plan('pro_plus'))
  and exists (
    select 1 from public.transaction_documents d
    where d.id = transaction_document_findings.document_id
      and d.transaction_id = transaction_document_findings.transaction_id
      and d.user_id = (select auth.uid())
  )
);
