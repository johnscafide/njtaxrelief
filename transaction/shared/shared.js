(function(){
'use strict';
var db=null,user=null,txId='',snapshot=null,busy=false;
function $(s,r){return (r||document).querySelector(s)}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function clean(v){return String(v==null?'':v).trim()}
function title(v){return clean(v).replace(/_/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase()})}
function fmtDate(v){if(!v)return'—';var d=new Date(String(v).slice(0,10)+'T12:00:00');return Number.isFinite(d.getTime())?d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—'}
function fmtDateTime(v){if(!v)return'—';var d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'—'}
function fmtSize(n){n=Number(n)||0;if(n<1024)return n+' B';if(n<1048576)return(n/1024).toFixed(1)+' KB';return(n/1048576).toFixed(1)+' MB'}
function roleLabel(v){return ({title:'Title / settlement',lender:'Lender',tc:'Transaction coordinator',attorney:'Attorney',buyer:'Buyer',seller:'Seller',other:'Professional guest'}[v]||title(v))}
function isClient(){var m=snapshot&&snapshot.membership||{};return m.client_room===true||m.role==='buyer'||m.role==='seller'}
function toast(m){var n=$('#sg-toast');n.textContent=m;n.hidden=false;clearTimeout(n._t);n._t=setTimeout(function(){n.hidden=true},2600)}
function gate(icon,h,p,button){var g=$('#sg-gate');g.innerHTML='<i class="'+esc(icon)+'"></i><h1>'+esc(h)+'</h1><p>'+esc(p)+'</p>'+(button||'');g.hidden=false;$('#sg-app').hidden=true}
async function invoke(action,body){var r=await db.functions.invoke('transaction-collaboration',{body:Object.assign({action:action},body||{})});if(r.error)throw new Error(r.error.message||'Collaboration service unavailable');if(r.data&&r.data.error){var e=new Error(r.data.error);e.data=r.data;throw e}return r.data||{}}
function evidenceStatus(i){if(i.evidence_state==='clear_observed'||['verified','resolved','waived','not_applicable'].includes(i.state))return['clear','Verified / clear'];if(i.evidence_state==='issue_observed'||['attention','blocked'].includes(i.severity))return[i.severity==='blocked'?'blocked':'attention',i.severity==='blocked'?'Blocked':'Attention'];return['review','Review']}
function render(){
  var t=snapshot.transaction||{},m=snapshot.membership||{},clientRoom=isClient();$('#sg-role').textContent=roleLabel(m.role).toUpperCase()+(clientRoom?' · CLIENT ROOM':' · SHARED ACCESS');$('#sg-address').textContent=t.address||'Property';$('#sg-meta').textContent=[t.city,t.state,t.postal_code,t.county&&title(t.county)+' County'].filter(Boolean).join(' · ');
  var st=$('#sg-status');st.textContent=t.readiness_status==='ready'?'No unresolved blockers':title(t.readiness_status||'review');st.className='sg-status '+clean(t.readiness_status);
  $('#sg-closing').textContent=fmtDate(t.closing_date);$('#sg-contract').textContent=fmtDate(t.contract_date);$('#sg-stage').textContent=title(t.status||'');$('#sg-reviewed').textContent=t.last_watch_at?fmtDateTime(t.last_watch_at):'Not checked yet';
  var items=(snapshot.items||[]).filter(function(i){return clientRoom||!String(i.item_key||'').startsWith('custom_')||i.assigned_role===m.role}).slice(0,28);
  $('#sg-items').innerHTML=items.length?items.map(function(i){var s=evidenceStatus(i);return '<div class="sg-item"><b>'+esc(i.title)+'</b><p>'+esc(i.description||i.source_label||(clientRoom?'Your real estate professional shared this update.':'Verification state available in Watchdog.'))+'</p><span class="sg-item-status '+esc(s[0])+'"><i></i>'+esc(s[1])+'</span></div>'}).join(''):'<div class="sg-empty">'+(clientRoom?'Your real estate professional has not shared any checklist updates yet.':'No shared evidence or readiness items are available yet.')+'</div>';
  if(clientRoom){
    $('#sg-top-label').textContent='Client Room';$('#sg-share-copy').textContent='This is a view-only Client Room. Your real estate professional controls which updates and documents appear here.';$('#sg-plan-link').hidden=true;
    $('#sg-context-label').textContent='CLIENT ROOM';$('#sg-context-title').textContent='Shared milestones & updates';$('#sg-context-note').textContent='Only agent-approved items appear';
    $('#sg-doc-label').textContent='SHARED DOCUMENTS';$('#sg-upload').hidden=true;$('#sg-doc-fine').innerHTML='<i class="fas fa-lock"></i> Only documents your real estate professional explicitly shares are visible here.';$('#sg-upgrade').hidden=true;
  }else{$('#sg-upload').hidden=m.permission!=='view_upload'}
  renderDocs();$('#sg-gate').hidden=true;$('#sg-app').hidden=false;
}
function renderDocs(){var docs=snapshot.documents||[],host=$('#sg-doc-list');host.innerHTML=docs.length?docs.map(function(d){return '<div class="sg-doc" data-id="'+esc(d.id)+'"><i class="fas '+(d.mime_type==='application/pdf'?'fa-file-pdf':'fa-file-image')+'"></i><div><b>'+esc(d.original_name)+'</b><small>'+esc(title(d.document_type))+' · '+esc(fmtSize(d.file_size))+' · '+esc(fmtDate(d.created_at))+(d.uploaded_by_role?' · '+esc(roleLabel(d.uploaded_by_role)):'')+'</small></div><button type="button" data-doc-open>Open</button></div>'}).join(''):'<div class="sg-empty">No documents have been shared yet.</div>'}
async function load(){snapshot=await invoke('shared_snapshot',{transaction_id:txId});render()}
async function accept(token){var d=await invoke('accept_invite',{token:token});txId=clean(d.transaction_id);history.replaceState(null,'','/transaction/shared/?transaction='+encodeURIComponent(txId));await load()}
async function openDoc(id){try{var d=await invoke('document_url',{transaction_id:txId,document_id:id});window.open(d.url,'_blank','noopener')}catch(e){toast(e.message)}}
async function upload(e){
  e.preventDefault();if(busy)return;var fd=new FormData(e.currentTarget),file=fd.get('file');if(!file||!file.size){toast('Choose a PDF or image first.');return}
  if(!['application/pdf','image/jpeg','image/png'].includes(file.type)||file.size>26214400){toast('Use a PDF, JPG or PNG up to 25 MB.');return}
  var b=e.currentTarget.querySelector('button');busy=true;b.disabled=true;b.innerHTML='<i class="fas fa-circle-notch fa-spin"></i> Uploading';
  try{
    var grant=await invoke('create_upload',{transaction_id:txId,file_name:file.name,mime_type:file.type,file_size:file.size});
    var up=await db.storage.from('transaction-documents').uploadToSignedUrl(grant.path,grant.token,file,{contentType:file.type,cacheControl:'0'});
    if(up.error)throw up.error;
    await invoke('register_upload',{transaction_id:txId,document_id:grant.document_id,path:grant.path,mime_type:file.type,file_size:file.size,document_type:clean(fd.get('document_type'))});
    toast('Document uploaded.');e.currentTarget.reset();await load();
  }catch(err){toast(err.message||'Upload failed.')}finally{busy=false;b.disabled=false;b.innerHTML='<i class="fas fa-cloud-arrow-up"></i> Upload document'}
}
async function boot(){
  try{
    db=window.NJPTRSupabaseRuntime&&window.NJPTRSupabaseRuntime.createClient?window.NJPTRSupabaseRuntime.createClient():null;if(!db)throw new Error('Watchdog data service unavailable');
    var auth=await db.auth.getUser();user=auth&&auth.data&&auth.data.user;
    if(!user){
      var next=location.pathname+location.search+location.hash;
      gate('fas fa-user-lock','Sign in to open this transaction','For security, shared access is tied to the exact email address that received the invitation.','<button type="button" id="sg-signin"><i class="fas fa-right-to-bracket"></i> Sign in or create free account</button>');
      $('#sg-signin').onclick=function(){if(window.NJPTRSupabaseRuntime&&window.NJPTRSupabaseRuntime.openOnboarding)window.NJPTRSupabaseRuntime.openOnboarding(next);else location.href='/onboarding/?next='+encodeURIComponent(next)};
      return;
    }
    var p=new URLSearchParams(location.search),token=clean(p.get('invite')),transaction=clean(p.get('transaction'));
    if(token){try{await accept(token)}catch(e){if(e.data&&e.data.invited_hint){gate('fas fa-envelope-circle-check','Use the invited email address','This link was sent to '+e.data.invited_hint+'. Sign out and reopen it with that Watchdog account.','<button type="button" id="sg-signout"><i class="fas fa-arrow-right-from-bracket"></i> Sign out</button>');$('#sg-signout').onclick=async function(){await db.auth.signOut();location.reload()};return}throw e}}
    else if(transaction){txId=transaction;await load()}
    else gate('fas fa-link-slash','Invitation link required','Open the secure transaction link that your real estate professional sent you.','');
  }catch(e){gate('fas fa-triangle-exclamation','Shared transaction unavailable',e.message||'This invitation could not be verified.','')}
}
document.addEventListener('click',function(e){var b=e.target.closest('[data-doc-open]');if(b){var row=b.closest('.sg-doc');if(row)openDoc(row.dataset.id)}});
$('#sg-upload').addEventListener('submit',upload);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();