import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20260915233600_njw_361_transaction_documents_v1.sql','utf8');
const policyFix=fs.readFileSync('supabase/migrations/20260915234000_njw_361_document_findings_policy_fix.sql','utf8');
const ui=fs.readFileSync('transaction/documents.js','utf8');
const shell=fs.readFileSync('transaction/shell.js','utf8');
const must=(ok,msg)=>{if(!ok)throw new Error(msg)};

must(migration.includes('create table if not exists public.transaction_documents'),'transaction_documents table required');
must(migration.includes('create table if not exists public.transaction_document_findings'),'reviewable document findings table required');
must(migration.includes("'transaction-documents'"),'private transaction-documents bucket required');
must(migration.includes("false,\n  26214400"),'document bucket must remain private with 25 MB cap');
for(const mime of ['application/pdf','image/jpeg','image/png'])must(migration.includes(mime),`bucket must allow ${mime}`);
must(migration.includes("(storage.foldername(name))[1] = 'user'"),'storage path must start with user folder');
must(migration.includes("(storage.foldername(name))[2] = ((select auth.uid()))::text"),'storage path must enforce authenticated owner folder');
must(migration.includes("w.id::text = (storage.foldername(name))[3]"),'storage path must resolve an owned transaction');
must(migration.includes("public.has_watchdog_plan('pro_plus')"),'document DB/storage access must require Pro+');
must(migration.includes('transaction_documents_workspace_fk'),'documents must be transaction-owned by composite FK');
must(migration.includes('transaction_document_findings_document_fk'),'findings must be tied to the owned source document');
must(migration.includes("review_state text not null default 'proposed'"),'extracted findings must default to proposed review');
must(policyFix.includes('d.id = transaction_document_findings.document_id'),'finding policy must bind the owned source document explicitly');
must(policyFix.includes('d.transaction_id = transaction_document_findings.transaction_id'),'finding policy must bind document and finding to the same transaction');
must(!policyFix.includes('d.transaction_id = d.transaction_id'),'finding transaction check must never collapse to a tautology');

must(ui.includes("const BUCKET='transaction-documents'"),'browser vault must use private transaction bucket');
must(ui.includes('MAX_BYTES=25*1024*1024'),'browser must enforce 25 MB upload limit');
must(ui.includes("new Set(['application/pdf','image/jpeg','image/png'])"),'browser must restrict upload MIME types');
must(ui.includes('crypto.randomUUID()'),'each uploaded document must get a fresh document id/path');
must(ui.includes("`user/${u.id}/${txId}/${id}/${name}`"),'upload path must preserve user + transaction ownership');
must(ui.includes('.createSignedUrl(path,300)'),'private document viewing must use short-lived signed URLs');
must(!ui.includes('getPublicUrl'),'private closing documents must never use public URLs');
must(ui.includes("independent_public_evidence:false"),'uploads/review must explicitly remain separate from public evidence');
must(!ui.includes('clear_observed'),'document workflow must never manufacture a clear public-evidence state');
must(ui.includes("from('transaction_documents').delete()"),'document delete flow must remove metadata after private object removal');
must(shell.includes('/transaction/documents.js'),'transaction shell must load the document vault module');

// AI output may become a readiness follow-up only after an explicit human accept.
must(ui.includes("c.functions.invoke('transaction-document-extract'"),'analysis must be an explicit browser action');
must(ui.includes("review_state:decision"),'findings must persist explicit accepted/rejected review');
must(ui.includes("category:'Documents'"),'accepted findings must create separate document checklist items');
must(ui.includes("item_key:findingItemKey(f.id)"),'accepted findings must use isolated per-finding item keys');
must(ui.includes("evidence_state:'verify'"),'accepted private findings must remain verify, never clear');
must(ui.includes("source_type:'private_document'"),'accepted findings must preserve private document provenance');
must(ui.includes("accepted_by_user:true"),'readiness follow-up must require explicit human acceptance');
must(ui.includes("target_item_key:f.target_item_key||null"),'target public item key may be preserved only as a hint in private payload');
must(!ui.includes(".eq('item_key',f.target_item_key"),'document review must never update an existing public item by target key');

console.log('transaction document vault contract: ok');
