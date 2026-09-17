(function(){
'use strict';
if(window.__WATCHDOG_TRANSACTION_COLLABORATION__)return;
window.__WATCHDOG_TRANSACTION_COLLABORATION__=true;
var db=null,busy=false,lastInvite=null;

function $(s,r){return (r||document).querySelector(s)}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function clean(v){return String(v==null?'':v).trim()}
function client(){if(db)return db;try{db=window.NJPTRSupabaseRuntime&&window.NJPTRSupabaseRuntime.createClient?window.NJPTRSupabaseRuntime.createClient():null}catch(e){}return db}
function txId(){var v2=$('.txv2-list-row.active');if(v2&&v2.dataset.v2TxId)return clean(v2.dataset.v2TxId);var legacy=$('.tx-list-card.active');return clean(legacy&&legacy.dataset&&legacy.dataset.txId)}
function address(){return clean($('#txv2-property-title')&&$('#txv2-property-title').textContent)||'this transaction'}
function roleLabel(v){return ({title:'Title / settlement',lender:'Lender',tc:'Transaction coordinator',attorney:'Attorney',other:'Other professional'}[v]||v)}
function date(v){if(!v)return'';var d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):''}
function toast(msg){var n=$('#tx-collab-toast');if(!n)return;n.textContent=msg;n.hidden=false;clearTimeout(n._timer);n._timer=setTimeout(function(){n.hidden=true},2600)}
async function invoke(action,body){var c=client();if(!c)throw new Error('Watchdog data service unavailable');var r=await c.functions.invoke('transaction-collaboration',{body:Object.assign({action:action},body||{})});if(r.error)throw new Error(r.error.message||'Collaboration service unavailable');if(r.data&&r.data.error)throw new Error(r.data.error);return r.data||{}}

function ensure(){
  var layer=$('#tx-collab-layer');if(layer)return layer;
  layer=document.createElement('div');layer.id='tx-collab-layer';layer.className='tx-collab-layer';layer.hidden=true;
  layer.innerHTML='<button class="tx-collab-backdrop" type="button" data-collab-action="close" aria-label="Close"></button>'
    +'<section class="tx-collab-modal" role="dialog" aria-modal="true" aria-labelledby="tx-collab-title">'
    +'<button class="tx-collab-x" type="button" data-collab-action="close" aria-label="Close"><i class="fas fa-xmark"></i></button>'
    +'<div class="tx-collab-kicker"><i class="fas fa-user-group"></i> TRANSACTION ACCESS</div>'
    +'<h2 id="tx-collab-title">Invite a professional</h2>'
    +'<p class="tx-collab-lead">Share <strong id="tx-collab-address">this transaction</strong> with a title rep, lender, transaction coordinator or attorney. They will not see your other transactions or client disclosures.</p>'
    +'<form id="tx-collab-form" class="tx-collab-form">'
    +'<label><span>Email address</span><input name="email" type="email" autocomplete="email" required placeholder="pro@company.com"></label>'
    +'<label><span>Role</span><select name="role"><option value="title">Title / settlement</option><option value="lender">Lender</option><option value="tc">Transaction coordinator</option><option value="attorney">Attorney</option><option value="other">Other professional</option></select></label>'
    +'<div class="tx-collab-scope"><i class="fas fa-shield-halved"></i><div><b>Only this transaction</b><span>View shared closing context and upload closing documents. Access can be revoked anytime.</span></div></div>'
    +'<button class="tx-collab-send" id="tx-collab-send" type="submit"><i class="fas fa-paper-plane"></i> Create invite</button>'
    +'</form>'
    +'<div class="tx-collab-created" id="tx-collab-created" hidden></div>'
    +'<div class="tx-collab-list-head"><h3>Shared access</h3><button type="button" data-collab-action="reload"><i class="fas fa-rotate"></i> Refresh</button></div>'
    +'<div id="tx-collab-list" class="tx-collab-list"><div class="tx-collab-loading"><i class="fas fa-circle-notch fa-spin"></i> Loading access…</div></div>'
    +'<p class="tx-collab-conversion"><b>Watchdog guest access is transaction-specific.</b> Invitees can later choose Pro or Pro+ if they want their own Watchdog professional workspace.</p>'
    +'</section><div class="tx-collab-toast" id="tx-collab-toast" hidden></div>';
  document.body.appendChild(layer);
  $('#tx-collab-form',layer).addEventListener('submit',createInvite);
  return layer;
}
function close(){var layer=$('#tx-collab-layer');if(layer)layer.hidden=true;document.body.classList.remove('tx-collab-open')}
async function open(){
  var id=txId();if(!id){toast('Select a transaction first.');return}
  var layer=ensure();$('#tx-collab-address').textContent=address();layer.hidden=false;document.body.classList.add('tx-collab-open');
  await load();
}
async function load(){
  var id=txId(),host=$('#tx-collab-list');if(!id||!host)return;
  host.innerHTML='<div class="tx-collab-loading"><i class="fas fa-circle-notch fa-spin"></i> Loading access…</div>';
  try{
    var data=await invoke('list_collaborators',{transaction_id:id}),members=(data.members||[]).filter(function(x){return x.status==='active'&&!x.revoked_at}),invites=(data.invites||[]).filter(function(x){return !x.revoked_at&&!x.accepted_at&&new Date(x.expires_at).getTime()>Date.now()});
    var rows=[];
    members.forEach(function(m){rows.push('<div class="tx-collab-person"><span class="tx-collab-avatar"><i class="fas fa-user-check"></i></span><div><b>'+esc(m.invited_email)+'</b><small>'+esc(roleLabel(m.role))+' · Active since '+esc(date(m.joined_at))+'</small></div><button type="button" data-collab-action="revoke-member" data-id="'+esc(m.id)+'">Revoke</button></div>')});
    invites.forEach(function(i){rows.push('<div class="tx-collab-person pending"><span class="tx-collab-avatar"><i class="fas fa-envelope"></i></span><div><b>'+esc(i.invited_email)+'</b><small>'+esc(roleLabel(i.role))+' · Invite expires '+esc(date(i.expires_at))+'</small></div><button type="button" data-collab-action="revoke-invite" data-id="'+esc(i.id)+'">Cancel</button></div>')});
    host.innerHTML=rows.length?rows.join(''):'<div class="tx-collab-empty"><i class="fas fa-user-plus"></i><b>No professionals invited yet</b><span>Create an invite above when a title rep, lender, TC or attorney needs access.</span></div>';
  }catch(e){host.innerHTML='<div class="tx-collab-empty error"><b>Shared access could not load</b><span>'+esc(e.message)+'</span></div>'}
}
async function createInvite(e){
  e.preventDefault();if(busy)return;var id=txId(),form=e.currentTarget,fd=new FormData(form),button=$('#tx-collab-send');if(!id)return;
  busy=true;button.disabled=true;button.innerHTML='<i class="fas fa-circle-notch fa-spin"></i> Creating';
  try{
    var data=await invoke('create_invite',{transaction_id:id,email:clean(fd.get('email')),role:clean(fd.get('role'))}),inv=data.invite||{},url=clean(data.invite_url);
    lastInvite={url:url,email:inv.invited_email,role:inv.role};
    var created=$('#tx-collab-created');created.hidden=false;created.innerHTML='<div><i class="fas fa-circle-check"></i><span><b>Invite ready</b><small>'+esc(inv.invited_email)+' · '+esc(roleLabel(inv.role))+'</small></span></div>'
      +'<label>Secure invite link<input id="tx-collab-link" readonly value="'+esc(url)+'"></label>'
      +'<div class="tx-collab-created-actions"><button type="button" data-collab-action="copy"><i class="fas fa-link"></i> Copy link</button><button type="button" data-collab-action="email"><i class="fas fa-envelope"></i> Email invite</button></div>';
    form.reset();toast('Transaction invite created.');await load();
  }catch(err){toast(err.message||'Could not create invite.')}finally{busy=false;button.disabled=false;button.innerHTML='<i class="fas fa-paper-plane"></i> Create invite'}
}
async function revoke(kind,id){
  if(busy||!id)return;busy=true;
  try{var body={transaction_id:txId()};body[kind==='member'?'membership_id':'invite_id']=id;await invoke('revoke',body);toast('Access revoked.');await load()}catch(e){toast(e.message)}finally{busy=false}
}
function copyInvite(){
  var input=$('#tx-collab-link');if(!input)return;var value=input.value;
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(value).then(function(){toast('Invite link copied.')}).catch(function(){input.select();document.execCommand('copy');toast('Invite link copied.')});
  else{input.select();document.execCommand('copy');toast('Invite link copied.')}
}
function emailInvite(){
  if(!lastInvite||!lastInvite.url)return;
  var subject='Watchdog transaction access: '+address();
  var body='You have been invited as '+roleLabel(lastInvite.role)+' to collaborate on one transaction in Watchdog.\n\nSign in or create a free Watchdog account using this email address, then open this secure link:\n'+lastInvite.url+'\n\nYou will only have access to this transaction.';
  location.href='mailto:'+encodeURIComponent(lastInvite.email)+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
}

document.addEventListener('click',function(e){
  var b=e.target.closest('[data-collab-action]');if(!b)return;
  var a=b.dataset.collabAction;
  if(a==='open'){e.preventDefault();open()}
  else if(a==='close'){close()}
  else if(a==='reload'){load()}
  else if(a==='copy'){copyInvite()}
  else if(a==='email'){emailInvite()}
  else if(a==='revoke-member'){revoke('member',b.dataset.id)}
  else if(a==='revoke-invite'){revoke('invite',b.dataset.id)}
});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&document.body.classList.contains('tx-collab-open'))close()});
})();