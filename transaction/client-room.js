(function(){
'use strict';
if(window.__WATCHDOG_TX_CLIENT_ROOM__)return;window.__WATCHDOG_TX_CLIENT_ROOM__=true;
var db=null,user=null,busy=false,currentTx='',room=null,items=[],docs=[],lastUrl='';
function $(s,r){return(r||document).querySelector(s)}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function clean(v){return String(v==null?'':v).trim()}
function client(){if(db)return db;try{db=window.NJPTRSupabaseRuntime&&window.NJPTRSupabaseRuntime.createClient?window.NJPTRSupabaseRuntime.createClient():null}catch(_){db=null}return db}
function txId(){var a=$('.txv2-list-row.active');if(a&&a.dataset.v2TxId)return clean(a.dataset.v2TxId);var legacy=$('.tx-list-card.active');return clean(legacy&&legacy.dataset&&legacy.dataset.txId)}
function txAddress(){return clean($('#txv2-property-title')&&$('#txv2-property-title').textContent)||'this transaction'}
function label(v){return clean(v).replace(/_/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase()})}
function ensure(){
 var layer=$('#tx-client-room-layer');if(layer)return layer;
 layer=document.createElement('div');layer.id='tx-client-room-layer';layer.className='tx-client-room-layer';layer.hidden=true;
 layer.innerHTML='<button class="tx-client-room-backdrop" type="button" data-client-room="close" aria-label="Close client room settings"></button>'
 +'<section class="tx-client-room-modal" role="dialog" aria-modal="true" aria-labelledby="tx-client-room-title">'
 +'<header class="tx-client-room-head"><div><span>CLIENT-SAFE SHARING</span><h2 id="tx-client-room-title">Client room</h2></div><button class="tx-client-room-x" type="button" data-client-room="close" aria-label="Close"><i class="fas fa-xmark"></i></button></header>'
 +'<div class="tx-client-room-body"><div class="tx-client-room-safety"><i class="fas fa-shield-halved"></i><div><b>Nothing internal is shared automatically.</b><small>Client disclosures, Watchdog evidence details, private notes and professional collaborator access stay private. Only the milestones and documents you explicitly select below can appear in the client room.</small></div></div>'
 +'<div class="tx-client-room-form"><label>Client label<input id="tx-client-room-label" maxlength="160" placeholder="Buyer / seller name"></label><label>Room status<div style="padding-top:10px"><label style="display:flex;align-items:center;gap:8px;font-weight:600"><input id="tx-client-room-active" type="checkbox" style="width:auto"> Active</label></div></label><label class="wide">Message to client<textarea id="tx-client-room-message" maxlength="2000" placeholder="A short update or instruction shown at the top of the room."></textarea></label></div>'
 +'<section class="tx-client-room-section"><header><h3>Shared milestones</h3><small>Select only client-safe items</small></header><div class="tx-client-room-options" id="tx-client-room-items"></div></section>'
 +'<section class="tx-client-room-section"><header><h3>Shared documents</h3><small>Pro+ document vault</small></header><div class="tx-client-room-options" id="tx-client-room-docs"></div></section>'
 +'<div class="tx-client-room-actions"><button class="primary" id="tx-client-room-save" type="button"><i class="fas fa-link"></i> Create / rotate secure link</button><button id="tx-client-room-settings-save" type="button"><i class="fas fa-check"></i> Save sharing</button><span id="tx-client-room-note" class="tx-client-room-note" aria-live="polite"></span></div>'
 +'<div class="tx-client-room-link" id="tx-client-room-link" hidden><b>Secure client link</b><p>Rotating the link immediately invalidates the previous token. The room expires automatically and can be disabled anytime.</p><div class="tx-client-room-link-row"><input id="tx-client-room-url" readonly><button type="button" data-client-room="copy"><i class="fas fa-copy"></i> Copy</button></div></div>'
 +'</div></section>';
 document.body.appendChild(layer);$('#tx-client-room-save').addEventListener('click',rotate);$('#tx-client-room-settings-save').addEventListener('click',saveSharing);return layer
}
function note(t){var n=$('#tx-client-room-note');if(n)n.textContent=t||''}
function render(){
 $('#tx-client-room-label').value=(room&&room.client_label)||'';
 $('#tx-client-room-message').value=(room&&room.message)||'';
 $('#tx-client-room-active').checked=room?room.active!==false:true;
 var ih=$('#tx-client-room-items');ih.innerHTML=items.length?items.map(function(i){return'<label class="tx-client-room-option"><input type="checkbox" data-share-item="'+esc(i.id)+'" '+(i.client_visible?'checked':'')+'><span><b>'+esc(label(i.item_key))+'</b><small>'+esc(clean(i.description)||'Transaction milestone')+(i.due_date?' · Due '+esc(i.due_date):'')+'</small></span></label>'}).join(''):'<div class="tx-client-room-empty">No transaction milestones are available to share.</div>';
 var dh=$('#tx-client-room-docs');dh.innerHTML=docs.length?docs.map(function(d){return'<label class="tx-client-room-option"><input type="checkbox" data-share-doc="'+esc(d.id)+'" '+(d.client_visible?'checked':'')+'><span><b>'+esc(d.document_label||d.original_name||label(d.document_type)||'Document')+'</b><small>'+esc(label(d.document_type))+'</small></span></label>'}).join(''):'<div class="tx-client-room-empty">No documents are available in this transaction. Document sharing remains optional.</div>';
}
async function load(){
 var c=client();currentTx=txId();if(!c||!currentTx)return;note('Loading…');
 if(!user){var a=await c.auth.getUser();user=a&&a.data&&a.data.user;if(!user){note('Sign in required.');return}}
 var results=await Promise.all([
   c.from('transaction_client_rooms').select('id,client_label,message,active,expires_at').eq('transaction_id',currentTx).eq('owner_user_id',user.id).maybeSingle(),
   c.from('transaction_items').select('id,item_key,description,state,due_date,client_visible').eq('transaction_id',currentTx).eq('user_id',user.id).order('sort_order'),
   c.from('transaction_documents').select('id,document_type,document_label,original_name,client_visible').eq('transaction_id',currentTx).eq('user_id',user.id).neq('status','deleted').order('created_at',{ascending:false})
 ]);
 room=results[0].error?null:results[0].data;items=results[1].error?[]:(results[1].data||[]);docs=results[2].error?[]:(results[2].data||[]);render();note(results[2].error?'Document sharing is unavailable on this plan.':'');
}
async function open(){
 if(!txId())return;var layer=ensure();$('#tx-client-room-title').textContent='Client room · '+txAddress();layer.hidden=false;document.body.classList.add('tx-client-room-open');await load()
}
function close(){var layer=$('#tx-client-room-layer');if(layer)layer.hidden=true;document.body.classList.remove('tx-client-room-open')}
async function persistSelections(){
 var c=client(),ops=[];
 items.forEach(function(i){var n=$('[data-share-item="'+i.id+'"]');var value=!!(n&&n.checked);if(value!==!!i.client_visible)ops.push(c.from('transaction_items').update({client_visible:value,updated_at:new Date().toISOString()}).eq('id',i.id).eq('user_id',user.id))});
 docs.forEach(function(d){var n=$('[data-share-doc="'+d.id+'"]');var value=!!(n&&n.checked);if(value!==!!d.client_visible)ops.push(c.from('transaction_documents').update({client_visible:value,updated_at:new Date().toISOString()}).eq('id',d.id).eq('user_id',user.id))});
 var results=await Promise.all(ops);var failed=results.find(function(r){return r&&r.error});if(failed)throw failed.error
}
async function saveSharing(){
 if(busy||!currentTx)return;busy=true;note('Saving…');try{await persistSelections();if(room){var r=await client().from('transaction_client_rooms').update({client_label:clean($('#tx-client-room-label').value)||null,message:clean($('#tx-client-room-message').value)||null,active:$('#tx-client-room-active').checked,updated_at:new Date().toISOString()}).eq('id',room.id).eq('owner_user_id',user.id).select('id,client_label,message,active,expires_at').single();if(r.error)throw r.error;room=r.data}await load();note('Sharing settings saved.')}catch(e){note(e.message||'Could not save sharing.')}finally{busy=false}}
async function rotate(){
 if(busy||!currentTx)return;busy=true;$('#tx-client-room-save').disabled=true;note('Creating secure link…');try{await persistSelections();var r=await client().rpc('rotate_transaction_client_room_v1',{p_transaction_id:currentTx,p_client_label:clean($('#tx-client-room-label').value)||null,p_message:clean($('#tx-client-room-message').value)||null});if(r.error)throw r.error;var token=r.data&&r.data.token;if(!token)throw new Error('Secure link was not returned');lastUrl=location.origin+'/client-room?token='+encodeURIComponent(token);$('#tx-client-room-url').value=lastUrl;$('#tx-client-room-link').hidden=false;await load();note('Secure client link ready.')}catch(e){note(e.message||'Could not create client room.')}finally{busy=false;$('#tx-client-room-save').disabled=false}}
function copyLink(){var value=$('#tx-client-room-url')&&$('#tx-client-room-url').value;if(!value)return;if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(value).then(function(){note('Link copied.')}).catch(function(){});else{var input=$('#tx-client-room-url');input.select();document.execCommand('copy');note('Link copied.')}}
document.addEventListener('click',function(e){var b=e.target.closest('[data-client-room]');if(!b)return;var a=b.dataset.clientRoom;if(a==='open'){e.preventDefault();open()}else if(a==='close')close();else if(a==='copy')copyLink()});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&document.body.classList.contains('tx-client-room-open'))close()});
})();