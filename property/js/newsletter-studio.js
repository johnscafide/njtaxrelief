(function(){
'use strict';
if(window.__WATCHDOG_NEWSLETTER_STUDIO__)return;
window.__WATCHDOG_NEWSLETTER_STUDIO__=true;

var db=null;
var state={crm:null,email:null,catalog:{tags:[],segments:[]}};
var busy=false;
var $=function(id){return document.getElementById(id);};

function show(id,on){var n=$(id);if(n)n.hidden=!on;}
function text(id,v){var n=$(id);if(n)n.textContent=v==null?'':String(v);}
function fmt(v){if(!v)return'Not yet';var d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Not yet';}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c];});}
function note(id,msg,error){var n=$(id);if(!n)return;n.textContent=msg||'';n.classList.toggle('error',!!error);}
function setClass(id,name,on){var n=$(id);if(n)n.classList.toggle(name,!!on);}
function disableWithin(id,on){var n=$(id);if(!n)return;n.querySelectorAll('button,input,select,textarea').forEach(function(el){el.disabled=!!on;});}
function setBusy(on){busy=!!on;var app=$('nl-workspace');if(app)app.setAttribute('aria-busy',busy?'true':'false');document.querySelectorAll('#nl-workspace button').forEach(function(n){n.disabled=busy;});}

async function call(action,body){
  if(!db)throw new Error('Watchdog connection unavailable');
  var s=await db.auth.getSession();
  var session=s&&s.data&&s.data.session;
  var token=session&&session.access_token;
  if(!token)throw new Error('Sign in required');
  var rt=window.NJPTRSupabaseRuntime;
  if(!rt||!rt.url||!rt.key)throw new Error('Watchdog runtime unavailable');
  var r=await fetch(rt.url+'/functions/v1/tmp-boldtrail-probe',{
    method:'POST',
    headers:{apikey:rt.key,authorization:'Bearer '+token,'content-type':'application/json'},
    body:JSON.stringify(Object.assign({action:action},body||{}))
  });
  var d=await r.json().catch(function(){return{};});
  if(!r.ok)throw Object.assign(new Error(d.error||'Request failed'),{status:r.status,data:d});
  return d;
}

function status(node,value){
  if(!node)return;
  node.className='nl-status';
  node.textContent=value;
  if(/connected|ready/i.test(value))node.classList.add('good');
  else if(/sync|pending|setup|required|checking/i.test(value))node.classList.add('warn');
  else if(/error|attention|degraded/i.test(value))node.classList.add('bad');
}
function countSuppressed(e){e=e||{};return Number(e.suppressed||0)+Number(e.unsubscribed||0)+Number(e.bounced||0)+Number(e.complained||0)+Number(e.invalid||0);}
function crmConnected(cp){return !!cp;}
function crmSynced(cp){return !!(cp&&cp.last_success_at);}
function kitConnected(ep){return !!(ep&&ep.status==='connected');}

function renderSetup(cp,ep){
  var cConnected=crmConnected(cp),cSynced=crmSynced(cp),kConnected=kitConnected(ep);
  var crmBox=$('nl-setup-crm'),kitBox=$('nl-setup-kit'),readyBox=$('nl-setup-ready');
  [crmBox,kitBox,readyBox].forEach(function(n){if(n)n.classList.remove('good','warn','bad');});

  if(cSynced){
    if(crmBox)crmBox.classList.add('good');
    text('nl-setup-crm-title','BoldTrail connected');
    text('nl-setup-crm-copy','Your existing Watchdog CRM sync is ready.');
  }else if(cConnected){
    if(crmBox)crmBox.classList.add('warn');
    text('nl-setup-crm-title','BoldTrail connected');
    text('nl-setup-crm-copy','First contact sync is still completing.');
  }else{
    if(crmBox)crmBox.classList.add('warn');
    text('nl-setup-crm-title','Connect BoldTrail');
    text('nl-setup-crm-copy','Add your CRM credentials to start the first sync.');
  }

  if(kConnected){
    if(kitBox)kitBox.classList.add('good');
    text('nl-setup-kit-title','Kit connected');
    text('nl-setup-kit-copy','Your personal Kit account is ready for drafts.');
  }else if(ep&&ep.status==='degraded'){
    if(kitBox)kitBox.classList.add('bad');
    text('nl-setup-kit-title','Kit needs attention');
    text('nl-setup-kit-copy','Check or reconnect your Kit credentials.');
  }else{
    if(kitBox)kitBox.classList.add('warn');
    text('nl-setup-kit-title','Connect your Kit');
    text('nl-setup-kit-copy','Enter your Kit V4 API key to unlock drafting.');
  }

  if(kConnected&&cConnected){
    if(readyBox)readyBox.classList.add('good');
    text('nl-setup-ready-title','Newsletter Studio ready');
    text('nl-setup-ready-copy','Reconcile your audience or create a Kit draft.');
  }else if(kConnected){
    if(readyBox)readyBox.classList.add('good');
    text('nl-setup-ready-title','Drafting unlocked');
    text('nl-setup-ready-copy','Connect BoldTrail when you want CRM-to-Kit matching.');
  }else{
    if(readyBox)readyBox.classList.add('warn');
    text('nl-setup-ready-title','Finish Kit setup');
    text('nl-setup-ready-copy','Kit credentials are required to create newsletter drafts.');
  }
}

function render(){
  var crm=state.crm||{};
  var cp=crm.provider||null;
  var email=state.email||{};
  var ep=email.provider||null;
  var cConnected=crmConnected(cp),cSynced=crmSynced(cp),kConnected=kitConnected(ep);

  renderSetup(cp,ep);

  var crmLabel='Setup required';
  if(cp){
    if(cp.sync_status==='error')crmLabel='Needs attention';
    else if(cp.sync_status==='syncing')crmLabel='Syncing';
    else if(cSynced)crmLabel='Connected';
    else crmLabel='Connected · sync pending';
  }
  status($('nl-crm-status'),crmLabel);
  show('nl-crm-connect',!cConnected);
  show('nl-crm-connected',cConnected);
  setClass('nl-crm-card','syncing',!!(cp&&cp.sync_status==='syncing'));
  setClass('nl-crm-card','attention',!!(cp&&cp.sync_status==='error'));
  text('nl-crm-total',Number(crm.total_contacts||email.crm&&email.crm.total_contacts||0).toLocaleString());
  text('nl-crm-email',Number(crm.contacts_with_email||email.crm&&email.crm.contacts_with_email||0).toLocaleString());
  text('nl-crm-last',cp?fmt(cp.last_success_at):'Not yet');
  text('nl-pipe-crm',cConnected?(cSynced?'BoldTrail connected':'BoldTrail syncing'):'Connect BoldTrail');
  if(cConnected){
    text('nl-crm-connected-copy',cSynced?'Your existing CRM sync is available to Newsletter Studio. No new BoldTrail credentials are needed.':'BoldTrail is connected. The first contact sync is still completing; you can refresh this page in a moment.');
  }

  var kitLabel='Setup required';
  if(ep){kitLabel=ep.status==='degraded'?'Needs attention':ep.status==='connected'?'Connected':'Setup required';}
  status($('nl-kit-status'),kitLabel);
  show('nl-kit-connect',!kConnected);
  show('nl-kit-connected',kConnected||!!(ep&&ep.status==='degraded'));
  text('nl-pipe-email',kConnected?'Kit connected':'Connect Kit');
  text('nl-pipe-newsletter',kConnected?'Draft ready':'Kit required');
  if(ep){text('nl-kit-account',ep.account_name||'Kit');text('nl-kit-plan',ep.plan_type?ep.plan_type+' plan':'');}

  var sender=(email.senders||[]).find(function(s){return s.is_default;})||(email.senders||[])[0];
  text('nl-default-sender',sender?((sender.display_name?sender.display_name+' · ':'')+sender.email_address):'Set a sender');
  text('nl-sender-verification',sender?String(sender.verification_status||'declared').replace(/_/g,' '):'');

  var linked=Number(email.linked_contacts||0),elig=email.eligibility||{},eligible=Number(elig.eligible||0),suppressed=countSuppressed(elig);
  text('nl-aud-crm',Number(email.crm&&email.crm.contacts_with_email||crm.contacts_with_email||0).toLocaleString());
  text('nl-aud-linked',linked.toLocaleString());
  text('nl-aud-eligible',eligible.toLocaleString());
  text('nl-aud-suppressed',suppressed.toLocaleString());
  text('nl-pipe-audience',linked?linked.toLocaleString()+' linked':(cConnected&&kConnected?'Ready to reconcile':'Not reconciled'));

  var audienceReady=cConnected&&kConnected;
  var audienceGate=$('nl-audience-gate');
  if(audienceGate){
    audienceGate.classList.toggle('ready',audienceReady);
    audienceGate.innerHTML=audienceReady?'<i class="fas fa-circle-check"></i><span>Both services are connected. Reconcile when you are ready to compare existing Kit subscribers with BoldTrail contacts.</span>':(!cConnected&&!kConnected?'<i class="fas fa-lock"></i><span>Connect BoldTrail and Kit to reconcile your audience.</span>':!cConnected?'<i class="fas fa-lock"></i><span>Connect BoldTrail to enable CRM-to-Kit audience matching.</span>':'<i class="fas fa-lock"></i><span>Connect your Kit account to enable audience matching.</span>');
  }
  if($('nl-reconcile'))$('nl-reconcile').disabled=busy||!audienceReady;

  var composeGate=$('nl-compose-gate');
  if(composeGate){
    composeGate.classList.toggle('ready',kConnected);
    composeGate.innerHTML=kConnected?'<i class="fas fa-circle-check"></i><span>Kit is connected. Drafts created here will be saved to your Kit account for review.</span>':'<i class="fas fa-lock"></i><span>Connect your Kit account to unlock newsletter drafting.</span>';
  }
  setClass('nl-compose-card','locked',!kConnected);
  disableWithin('nl-broadcast-form',busy||!kConnected);

  renderBroadcasts(email.recent_broadcasts||[]);
}

function renderBroadcasts(rows){
  var body=$('nl-broadcasts');if(!body)return;
  body.innerHTML=rows.map(function(r){
    var t=r.target_definition||{};
    var aud=t.all_subscribers?'All Kit subscribers':((t.type||'target')+' '+((t.ids||[]).join(', ')));
    return'<tr><td><b>'+esc(r.subject)+'</b></td><td><span class="nl-pill '+esc(r.status||'draft')+'">'+esc(r.status||'draft')+'</span></td><td>'+esc(r.from_email||'Kit default')+'</td><td>'+esc(aud)+'</td><td>'+esc(r.send_at?fmt(r.send_at):'Draft only')+'</td><td>'+esc(fmt(r.updated_at))+'</td></tr>';
  }).join('');
  show('nl-broadcasts-empty',!rows.length);
}

async function loadStatus(){
  var results=await Promise.allSettled([call('crm.status'),call('email.status')]);
  var denied=results.some(function(r){return r.status==='rejected'&&r.reason&&r.reason.status===403;});
  if(denied){show('nl-denied',true);show('nl-workspace',false);return false;}
  if(results[0].status==='rejected')throw results[0].reason;
  if(results[1].status==='rejected')throw results[1].reason;
  state.crm=results[0].value;
  state.email=results[1].value;
  show('nl-workspace',true);
  show('nl-denied',false);
  render();
  return true;
}

async function loadCatalog(){
  if(!state.email||!kitConnected(state.email.provider))return;
  try{state.catalog=await call('kit.catalog');renderTargets();}
  catch(err){note('nl-broadcast-note','Kit tags/segments could not be loaded: '+err.message,true);}
}
function renderTargets(){
  var type=$('nl-target-type').value,select=$('nl-target-id');
  show('nl-target-row',!!type);
  if(!type){select.innerHTML='';return;}
  var list=type==='tag'?(state.catalog.tags||[]):(state.catalog.segments||[]);
  select.innerHTML='<option value="">Choose '+type+'</option>'+list.map(function(x){return'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>';}).join('');
}

async function refresh(){
  if(busy)return;
  setBusy(true);show('nl-error',false);
  try{var ok=await loadStatus();if(ok)await loadCatalog();}
  catch(err){show('nl-error',true);text('nl-error-copy',err.message);}
  finally{setBusy(false);render();}
}

async function connectCrm(e){
  e.preventDefault();if(busy)return;
  var token=$('nl-crm-token').value.trim();
  if(token.length<20){note('nl-crm-note','Enter a valid BoldTrail API token.',true);return;}
  setBusy(true);note('nl-crm-note','Validating BoldTrail and preparing your first sync…');
  try{
    await call('boldtrail.connect',{api_token:token,external_account_label:$('nl-crm-label').value.trim()});
    $('nl-crm-token').value='';
    note('nl-crm-note','BoldTrail connected. Your first CRM sync has been queued.');
    await loadStatus();
    window.setTimeout(refresh,3000);
  }catch(err){note('nl-crm-note',err.message,true);}
  finally{setBusy(false);render();}
}
async function syncCrm(){
  if(busy)return;setBusy(true);note('nl-crm-status-note','Sync queued…');
  try{await call('boldtrail.sync');note('nl-crm-status-note','BoldTrail sync queued.');window.setTimeout(refresh,3000);}
  catch(err){note('nl-crm-status-note',err.message,true);}
  finally{setBusy(false);render();}
}
async function disconnectCrm(){
  if(busy||!window.confirm('Disconnect BoldTrail from this Watchdog login and remove its normalized CRM context?'))return;
  setBusy(true);
  try{await call('boldtrail.disconnect');state.crm=null;state.email=null;await loadStatus();}
  catch(err){note('nl-crm-status-note',err.message,true);}
  finally{setBusy(false);render();}
}

async function connectKit(e){
  e.preventDefault();if(busy)return;
  var key=$('nl-kit-key').value.trim();
  if(key.length<16){note('nl-kit-note','Enter a valid Kit V4 API key.',true);return;}
  setBusy(true);note('nl-kit-note','Validating your Kit account…');
  try{
    await call('kit.connect',{api_key:key,sender_name:$('nl-sender-name').value.trim(),sender_email:$('nl-sender-email').value.trim()});
    $('nl-kit-key').value='';$('nl-kit-key').type='password';
    note('nl-kit-note','Kit connected. Newsletter drafting is now unlocked.');
    await loadStatus();await loadCatalog();
  }catch(err){note('nl-kit-note',err.message,true);}
  finally{setBusy(false);render();}
}
async function healthKit(){
  if(busy)return;setBusy(true);note('nl-kit-status-note','Checking Kit…');
  try{var d=await call('kit.health');note('nl-kit-status-note','Kit connection checked '+fmt(d.checked_at)+'.');await loadStatus();}
  catch(err){note('nl-kit-status-note',err.message,true);}
  finally{setBusy(false);render();}
}
async function saveSender(e){
  e.preventDefault();if(busy)return;setBusy(true);
  try{await call('sender.save',{display_name:$('nl-new-sender-name').value.trim(),email_address:$('nl-new-sender-email').value.trim(),is_default:true});$('nl-new-sender-name').value='';$('nl-new-sender-email').value='';note('nl-kit-status-note','Default sender saved.');await loadStatus();}
  catch(err){note('nl-kit-status-note',err.message,true);}
  finally{setBusy(false);render();}
}
async function disconnectKit(){
  if(busy||!window.confirm('Disconnect Kit from this Watchdog login? Existing drafts in Kit are not deleted.'))return;
  setBusy(true);
  try{await call('kit.disconnect');state.email=null;state.catalog={tags:[],segments:[]};await loadStatus();}
  catch(err){note('nl-kit-status-note',err.message,true);}
  finally{setBusy(false);render();}
}

async function reconcile(){
  if(busy)return;setBusy(true);show('nl-reconcile-result',true);text('nl-reconcile-result','Comparing BoldTrail email addresses with subscribers already in your Kit account…');
  try{var d=await call('kit.reconcile_existing');text('nl-reconcile-result',d.matched.toLocaleString()+' existing Kit subscribers matched to '+d.unique_crm_emails.toLocaleString()+' unique BoldTrail email addresses. CRM-only addresses were not uploaded.');await loadStatus();}
  catch(err){text('nl-reconcile-result',err.message);}
  finally{setBusy(false);render();}
}

function safePreview(html){
  var t=document.createElement('template');t.innerHTML=String(html||'');
  t.content.querySelectorAll('script,iframe,object,embed').forEach(function(n){n.remove();});
  t.content.querySelectorAll('*').forEach(function(n){Array.from(n.attributes).forEach(function(a){if(/^on/i.test(a.name)||/^javascript:/i.test(a.value))n.removeAttribute(a.name);});});
  return t.innerHTML;
}
function updatePreview(){
  text('nl-preview-subject',$('nl-subject').value.trim()||'Your subject');
  text('nl-preview-preheader',$('nl-preview').value.trim()||'Preview text will appear here.');
  $('nl-email-preview').innerHTML=safePreview($('nl-content').value)||'<p>Your newsletter preview will appear as you type.</p>';
}
async function createBroadcast(e){
  e.preventDefault();if(busy)return;
  if(!state.email||!kitConnected(state.email.provider)){note('nl-broadcast-note','Connect your Kit account first.',true);return;}
  var targetType=$('nl-target-type').value,targetId=Number($('nl-target-id').value||0),sender=(state.email.senders||[]).find(function(s){return s.is_default;})||(state.email.senders||[])[0];
  setBusy(true);note('nl-broadcast-note','Creating a draft in your Kit account…');
  try{
    var d=await call('broadcast.create',{subject:$('nl-subject').value.trim(),preview_text:$('nl-preview').value.trim(),content:$('nl-content').value,email_address:sender&&sender.email_address||null,target_type:targetType||null,target_mode:'all',target_ids:targetType&&targetId?[targetId]:[]});
    note('nl-broadcast-note','Kit draft created'+(d.broadcast&&d.broadcast.external_broadcast_id?' · #'+d.broadcast.external_broadcast_id:'')+'. Review it in Kit before sending.');
    $('nl-broadcast-form').reset();renderTargets();updatePreview();await loadStatus();
  }catch(err){note('nl-broadcast-note',err.message,true);}
  finally{setBusy(false);render();}
}

function toggleKitKey(){
  var input=$('nl-kit-key'),btn=$('nl-kit-key-toggle');if(!input||!btn)return;
  var showKey=input.type==='password';input.type=showKey?'text':'password';
  btn.setAttribute('aria-label',showKey?'Hide Kit API key':'Show Kit API key');
  btn.innerHTML=showKey?'<i class="fas fa-eye-slash"></i>':'<i class="fas fa-eye"></i>';
}

async function boot(){
  try{
    db=window.NJPTRSupabaseRuntime&&window.NJPTRSupabaseRuntime.createClient?window.NJPTRSupabaseRuntime.createClient():null;
    if(!db)throw new Error('Watchdog runtime unavailable');
    var s=await db.auth.getSession(),session=s&&s.data&&s.data.session;
    if(!session){show('nl-signin',true);return;}
    show('nl-signin',false);await refresh();
  }catch(err){show('nl-error',true);text('nl-error-copy',err.message);}
}

document.addEventListener('submit',function(e){
  if(e.target.id==='nl-crm-form')connectCrm(e);
  else if(e.target.id==='nl-kit-form')connectKit(e);
  else if(e.target.id==='nl-sender-form')saveSender(e);
  else if(e.target.id==='nl-broadcast-form')createBroadcast(e);
});
document.addEventListener('click',function(e){
  var button=e.target.closest('button');var id=button&&button.id;
  if(id==='nl-refresh')refresh();
  else if(id==='nl-crm-sync')syncCrm();
  else if(id==='nl-crm-disconnect')disconnectCrm();
  else if(id==='nl-kit-health')healthKit();
  else if(id==='nl-kit-disconnect')disconnectKit();
  else if(id==='nl-reconcile')reconcile();
  else if(id==='nl-kit-key-toggle')toggleKitKey();
});
document.addEventListener('change',function(e){if(e.target.id==='nl-target-type')renderTargets();});
['nl-subject','nl-preview','nl-content'].forEach(function(id){document.addEventListener('input',function(e){if(e.target.id===id)updatePreview();});});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
