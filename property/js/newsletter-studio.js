(function(){
'use strict';
if(window.__WATCHDOG_NEWSLETTER_STUDIO__)return;
window.__WATCHDOG_NEWSLETTER_STUDIO__=true;

var db=null;
var state={crm:null,email:null,catalog:{tags:[],segments:[]}};
var busy=false,refreshing=false,catalogLoading=false;
var $=function(id){return document.getElementById(id);};

function show(id,on){var n=$(id);if(n)n.hidden=!on;}
function text(id,v){var n=$(id);if(n)n.textContent=v==null?'':String(v);}
function fmt(v){if(!v)return'Not yet';var d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Not yet';}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function note(id,msg,error){var n=$(id);if(!n)return;n.textContent=msg||'';n.classList.toggle('error',!!error);}
function setClass(id,name,on){var n=$(id);if(n)n.classList.toggle(name,!!on);}
function disableWithin(id,on){var n=$(id);if(!n)return;n.querySelectorAll('button,input,select,textarea').forEach(function(el){el.disabled=!!on;});}
function setActionBusy(on){busy=!!on;var app=$('nl-workspace');if(app)app.setAttribute('aria-busy',busy?'true':'false');render();}
function setRefreshBusy(on){refreshing=!!on;var b=$('nl-refresh');if(!b)return;b.disabled=refreshing;b.setAttribute('aria-busy',refreshing?'true':'false');b.innerHTML=refreshing?'<i class="fas fa-rotate fa-spin"></i> Refreshing':'<i class="fas fa-rotate"></i> Refresh';}

async function call(action,body,timeoutMs){
  if(!db)throw new Error('Watchdog connection unavailable');
  var s=await db.auth.getSession(),session=s&&s.data&&s.data.session,token=session&&session.access_token;
  if(!token)throw Object.assign(new Error('Sign in required'),{status:401});
  var rt=window.NJPTRSupabaseRuntime;
  if(!rt||!rt.url||!rt.key)throw new Error('Watchdog runtime unavailable');
  var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},timeoutMs||12000);
  try{
    var r=await fetch(rt.url+'/functions/v1/tmp-boldtrail-probe',{
      method:'POST',signal:controller.signal,
      headers:{apikey:rt.key,authorization:'Bearer '+token,'content-type':'application/json'},
      body:JSON.stringify(Object.assign({action:action},body||{}))
    });
    var d=await r.json().catch(function(){return{};});
    if(!r.ok)throw Object.assign(new Error(d.error||'Request failed'),{status:r.status,data:d});
    return d;
  }catch(err){
    if(err&&err.name==='AbortError')throw Object.assign(new Error('The connection took too long. Watchdog released the page; try Refresh again.'),{status:408});
    throw err;
  }finally{clearTimeout(timer);}
}

function status(node,value){if(!node)return;node.className='nl-status';node.textContent=value;if(/connected|ready/i.test(value))node.classList.add('good');else if(/sync|pending|setup|required|checking/i.test(value))node.classList.add('warn');else if(/error|attention|degraded/i.test(value))node.classList.add('bad');}
function countSuppressed(e){e=e||{};return Number(e.suppressed||0)+Number(e.unsubscribed||0)+Number(e.bounced||0)+Number(e.complained||0)+Number(e.invalid||0);}
function crmConnected(cp){return !!cp;}
function crmSynced(cp){return !!(cp&&cp.last_success_at);}
function kitConnected(ep){return !!(ep&&ep.status==='connected');}

function renderSetup(cp,ep){
  var cc=crmConnected(cp),cs=crmSynced(cp),kc=kitConnected(ep),c=$('nl-setup-crm'),k=$('nl-setup-kit'),r=$('nl-setup-ready');
  [c,k,r].forEach(function(n){if(n)n.classList.remove('good','warn','bad');});
  if(cs){if(c)c.classList.add('good');text('nl-setup-crm-title','BoldTrail connected');text('nl-setup-crm-copy','Your existing Watchdog CRM sync is ready.');}
  else if(cc){if(c)c.classList.add('warn');text('nl-setup-crm-title','BoldTrail connected');text('nl-setup-crm-copy','First contact sync is still completing.');}
  else{if(c)c.classList.add('warn');text('nl-setup-crm-title','Connect BoldTrail');text('nl-setup-crm-copy','Add your CRM credentials to start the first sync.');}
  if(kc){if(k)k.classList.add('good');text('nl-setup-kit-title','Kit connected');text('nl-setup-kit-copy','Your personal Kit account is ready.');}
  else if(ep&&ep.status==='degraded'){if(k)k.classList.add('bad');text('nl-setup-kit-title','Kit needs attention');text('nl-setup-kit-copy','Check or reconnect your Kit credentials.');}
  else{if(k)k.classList.add('warn');text('nl-setup-kit-title','Connect your Kit');text('nl-setup-kit-copy','Enter your Kit V4 API key to unlock broadcasts.');}
  if(kc&&cc){if(r)r.classList.add('good');text('nl-setup-ready-title','Broadcasts ready');text('nl-setup-ready-copy','Match your audience or create a broadcast.');}
  else if(kc){if(r)r.classList.add('good');text('nl-setup-ready-title','Broadcasting unlocked');text('nl-setup-ready-copy','Connect BoldTrail when you want CRM audience matching.');}
  else{if(r)r.classList.add('warn');text('nl-setup-ready-title','Finish Kit setup');text('nl-setup-ready-copy','Kit credentials are required to create broadcasts.');}
}

function render(){
  var crm=state.crm||{},cp=crm.provider||null,email=state.email||{},ep=email.provider||null,cc=crmConnected(cp),cs=crmSynced(cp),kc=kitConnected(ep);
  renderSetup(cp,ep);
  var crmLabel='Setup required';if(cp){if(cp.sync_status==='error')crmLabel='Needs attention';else if(cp.sync_status==='syncing')crmLabel='Syncing';else crmLabel=cs?'Connected':'Connected · sync pending';}
  status($('nl-crm-status'),crmLabel);show('nl-crm-connect',!cc);show('nl-crm-connected',cc);setClass('nl-crm-card','syncing',!!(cp&&cp.sync_status==='syncing'));setClass('nl-crm-card','attention',!!(cp&&cp.sync_status==='error'));
  text('nl-crm-total',Number(crm.total_contacts||email.crm&&email.crm.total_contacts||0).toLocaleString());text('nl-crm-email',Number(crm.contacts_with_email||email.crm&&email.crm.contacts_with_email||0).toLocaleString());text('nl-crm-last',cp?fmt(cp.last_success_at):'Not yet');text('nl-pipe-crm',cc?(cs?'BoldTrail connected':'BoldTrail syncing'):'Connect BoldTrail');
  if(cc)text('nl-crm-connected-copy',cs?'Your existing CRM sync is available to Broadcasts. No new BoldTrail credentials are needed.':'BoldTrail is connected. The first contact sync is still completing.');
  var kitLabel=ep?(ep.status==='degraded'?'Needs attention':ep.status==='connected'?'Connected':'Setup required'):'Setup required';status($('nl-kit-status'),kitLabel);show('nl-kit-connect',!kc);show('nl-kit-connected',kc||!!(ep&&ep.status==='degraded'));text('nl-pipe-email',kc?'Kit connected':'Connect Kit');text('nl-pipe-newsletter',kc?'Broadcast ready':'Kit required');
  if(ep){text('nl-kit-account',ep.account_name||'Kit');text('nl-kit-plan',ep.plan_type?ep.plan_type+' plan':'');}
  var sender=(email.senders||[]).find(function(s){return s.is_default;})||(email.senders||[])[0];text('nl-default-sender',sender?((sender.display_name?sender.display_name+' · ':'')+sender.email_address):'Set a sender');text('nl-sender-verification',sender?String(sender.verification_status||'declared').replace(/_/g,' '):'');
  var linked=Number(email.linked_contacts||0),elig=email.eligibility||{},eligible=Number(elig.eligible||0),suppressed=countSuppressed(elig);text('nl-aud-crm',Number(email.crm&&email.crm.contacts_with_email||crm.contacts_with_email||0).toLocaleString());text('nl-aud-linked',linked.toLocaleString());text('nl-aud-eligible',eligible.toLocaleString());text('nl-aud-suppressed',suppressed.toLocaleString());text('nl-pipe-audience',linked?linked.toLocaleString()+' linked':(cc&&kc?'Ready to reconcile':'Not reconciled'));
  var ready=cc&&kc,g=$('nl-audience-gate');if(g){g.classList.toggle('ready',ready);g.innerHTML=ready?'<i class="fas fa-circle-check"></i><span>Both services are connected. Refresh the audience match when you want to compare existing Kit subscribers with CRM contacts.</span>':(!cc&&!kc?'<i class="fas fa-lock"></i><span>Connect BoldTrail and Kit to reconcile your audience.</span>':!cc?'<i class="fas fa-lock"></i><span>Connect BoldTrail to enable CRM-to-Kit audience matching.</span>':'<i class="fas fa-lock"></i><span>Connect your Kit account to enable audience matching.</span>');}
  if($('nl-reconcile'))$('nl-reconcile').disabled=busy||!ready;
  var cg=$('nl-compose-gate');if(cg){cg.classList.toggle('ready',kc);cg.innerHTML=kc?'<i class="fas fa-circle-check"></i><span>Kit is connected. Save a draft, schedule it, or send this broadcast from Watchdog.</span>':'<i class="fas fa-lock"></i><span>Connect your Kit account to unlock broadcasts.</span>';}
  setClass('nl-compose-card','locked',!kc);disableWithin('nl-broadcast-form',busy||!kc);renderBroadcasts(email.recent_broadcasts||[]);
}

function renderBroadcasts(rows){var body=$('nl-broadcasts');if(!body)return;body.innerHTML=(rows||[]).map(function(r){var t=r.target_definition||{},aud=t.all_subscribers?'All Kit subscribers':((t.type||'target')+' '+((t.ids||[]).join(', ')));return'<tr><td><b>'+esc(r.subject)+'</b></td><td><span class="nl-pill '+esc(r.status||'draft')+'">'+esc(r.status||'draft')+'</span></td><td>'+esc(r.from_email||'Kit default')+'</td><td>'+esc(aud)+'</td><td>'+esc(r.send_at?fmt(r.send_at):'Draft only')+'</td><td>'+esc(fmt(r.updated_at))+'</td></tr>';}).join('');show('nl-broadcasts-empty',!(rows||[]).length);}

async function loadStatus(){
  var results=await Promise.allSettled([call('crm.status',null,10000),call('email.status',null,10000)]),denied=results.some(function(r){return r.status==='rejected'&&r.reason&&r.reason.status===403;});
  if(denied){show('nl-denied',true);show('nl-workspace',false);return false;}
  if(results[0].status==='rejected')throw results[0].reason;if(results[1].status==='rejected')throw results[1].reason;
  state.crm=results[0].value;state.email=results[1].value;show('nl-workspace',true);show('nl-denied',false);render();return true;
}
async function loadCatalog(){if(catalogLoading||!state.email||!kitConnected(state.email.provider))return;catalogLoading=true;try{state.catalog=await call('kit.catalog',null,10000);renderTargets();note('nl-broadcast-note','');}catch(err){note('nl-broadcast-note','Kit tags/segments are temporarily unavailable. The rest of Broadcasts is still usable. '+err.message,true);}finally{catalogLoading=false;}}
function renderTargets(){var type=$('nl-target-type'),select=$('nl-target-id');if(!type||!select)return;show('nl-target-row',!!type.value);if(!type.value){select.innerHTML='';return;}var list=type.value==='tag'?(state.catalog.tags||[]):(state.catalog.segments||[]);select.innerHTML='<option value="">Choose '+type.value+'</option>'+list.map(function(x){return'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>';}).join('');}

async function refresh(){
  if(refreshing)return;setRefreshBusy(true);show('nl-error',false);var ok=false;
  try{ok=await loadStatus();}
  catch(err){show('nl-error',true);text('nl-error-copy',err.message);}
  finally{setRefreshBusy(false);render();}
  if(ok)loadCatalog();
}

async function connectCrm(e){e.preventDefault();if(busy)return;var token=$('nl-crm-token').value.trim();if(token.length<20){note('nl-crm-note','Enter a valid BoldTrail API token.',true);return;}setActionBusy(true);note('nl-crm-note','Validating BoldTrail and preparing your first sync…');try{await call('boldtrail.connect',{api_token:token,external_account_label:$('nl-crm-label').value.trim()},15000);$('nl-crm-token').value='';note('nl-crm-note','BoldTrail connected. Your first CRM sync has been queued.');await loadStatus();setTimeout(refresh,3000);}catch(err){note('nl-crm-note',err.message,true);}finally{setActionBusy(false);}}
async function syncCrm(){if(busy)return;setActionBusy(true);note('nl-crm-status-note','Sync queued…');try{await call('boldtrail.sync',null,12000);note('nl-crm-status-note','BoldTrail sync queued.');setTimeout(refresh,3000);}catch(err){note('nl-crm-status-note',err.message,true);}finally{setActionBusy(false);}}
async function disconnectCrm(){if(busy||!confirm('Disconnect BoldTrail from this Watchdog login and remove its normalized CRM context?'))return;setActionBusy(true);try{await call('boldtrail.disconnect',null,15000);state.crm=null;state.email=null;await loadStatus();}catch(err){note('nl-crm-status-note',err.message,true);}finally{setActionBusy(false);}}
async function connectKit(e){e.preventDefault();if(busy)return;var key=$('nl-kit-key').value.trim();if(key.length<16){note('nl-kit-note','Enter a valid Kit V4 API key.',true);return;}setActionBusy(true);note('nl-kit-note','Validating your Kit account…');try{await call('kit.connect',{api_key:key,sender_name:$('nl-sender-name').value.trim(),sender_email:$('nl-sender-email').value.trim()},18000);$('nl-kit-key').value='';$('nl-kit-key').type='password';note('nl-kit-note','Kit connected. Broadcasts is now unlocked.');await loadStatus();loadCatalog();}catch(err){note('nl-kit-note',err.message,true);}finally{setActionBusy(false);}}
async function healthKit(){if(busy)return;setActionBusy(true);note('nl-kit-status-note','Checking Kit…');try{var d=await call('kit.health',null,15000);note('nl-kit-status-note','Kit connection checked '+fmt(d.checked_at)+'.');await loadStatus();}catch(err){note('nl-kit-status-note',err.message,true);}finally{setActionBusy(false);}}
async function saveSender(e){e.preventDefault();if(busy)return;setActionBusy(true);try{await call('sender.save',{display_name:$('nl-new-sender-name').value.trim(),email_address:$('nl-new-sender-email').value.trim(),is_default:true},12000);$('nl-new-sender-name').value='';$('nl-new-sender-email').value='';note('nl-kit-status-note','Default sender saved.');await loadStatus();}catch(err){note('nl-kit-status-note',err.message,true);}finally{setActionBusy(false);}}
async function disconnectKit(){if(busy||!confirm('Disconnect Kit from this Watchdog login? Existing broadcasts in Kit are not deleted.'))return;setActionBusy(true);try{await call('kit.disconnect',null,15000);state.email=null;state.catalog={tags:[],segments:[]};await loadStatus();}catch(err){note('nl-kit-status-note',err.message,true);}finally{setActionBusy(false);}}
async function reconcile(){if(busy)return;setActionBusy(true);show('nl-reconcile-result',true);text('nl-reconcile-result','Comparing CRM email addresses with subscribers already in your Kit account…');try{var d=await call('kit.reconcile_existing',null,25000);text('nl-reconcile-result',Number(d.matched||0).toLocaleString()+' existing Kit subscribers matched to '+Number(d.unique_crm_emails||0).toLocaleString()+' unique CRM email addresses. CRM-only addresses were not uploaded.');await loadStatus();}catch(err){text('nl-reconcile-result',err.message);}finally{setActionBusy(false);}}

function safePreview(html){var t=document.createElement('template');t.innerHTML=String(html||'');t.content.querySelectorAll('script,iframe,object,embed').forEach(function(n){n.remove();});t.content.querySelectorAll('*').forEach(function(n){Array.from(n.attributes).forEach(function(a){if(/^on/i.test(a.name)||/^javascript:/i.test(a.value))n.removeAttribute(a.name);});});return t.innerHTML;}
function updatePreview(){if($('nl-preview-subject'))text('nl-preview-subject',$('nl-subject').value.trim()||'Your subject');if($('nl-preview-preheader'))text('nl-preview-preheader',$('nl-preview').value.trim()||'Preview text will appear here.');if($('nl-email-preview'))$('nl-email-preview').innerHTML=safePreview($('nl-content').value)||'<p>Your broadcast preview will appear as you type.</p>';}
async function createBroadcast(e){e.preventDefault();if(busy)return;if(!state.email||!kitConnected(state.email.provider)){note('nl-broadcast-note','Connect your Kit account first.',true);return;}var targetType=$('nl-target-type').value,targetId=Number($('nl-target-id').value||0),sender=(state.email.senders||[]).find(function(s){return s.is_default;})||(state.email.senders||[])[0];setActionBusy(true);note('nl-broadcast-note','Creating a draft in your Kit account…');try{var d=await call('broadcast.create',{subject:$('nl-subject').value.trim(),preview_text:$('nl-preview').value.trim(),content:$('nl-content').value,email_address:sender&&sender.email_address||null,target_type:targetType||null,target_mode:'all',target_ids:targetType&&targetId?[targetId]:[]},18000);note('nl-broadcast-note','Kit draft created'+(d.broadcast&&d.broadcast.external_broadcast_id?' · #'+d.broadcast.external_broadcast_id:'')+'.');$('nl-broadcast-form').reset();renderTargets();updatePreview();await loadStatus();}catch(err){note('nl-broadcast-note',err.message,true);}finally{setActionBusy(false);}}
function toggleKitKey(){var input=$('nl-kit-key'),btn=$('nl-kit-key-toggle');if(!input||!btn)return;var s=input.type==='password';input.type=s?'text':'password';btn.setAttribute('aria-label',s?'Hide Kit API key':'Show Kit API key');btn.innerHTML=s?'<i class="fas fa-eye-slash"></i>':'<i class="fas fa-eye"></i>';}

async function boot(){try{db=window.NJPTRSupabaseRuntime&&window.NJPTRSupabaseRuntime.createClient?window.NJPTRSupabaseRuntime.createClient():null;if(!db)throw new Error('Watchdog runtime unavailable');var s=await db.auth.getSession(),session=s&&s.data&&s.data.session;if(!session){show('nl-signin',true);return;}show('nl-signin',false);refresh();}catch(err){show('nl-error',true);text('nl-error-copy',err.message);}}

document.addEventListener('submit',function(e){if(e.target.id==='nl-crm-form')connectCrm(e);else if(e.target.id==='nl-kit-form')connectKit(e);else if(e.target.id==='nl-sender-form')saveSender(e);else if(e.target.id==='nl-broadcast-form')createBroadcast(e);});
document.addEventListener('click',function(e){var b=e.target.closest('button'),id=b&&b.id;if(id==='nl-refresh')refresh();else if(id==='nl-crm-sync')syncCrm();else if(id==='nl-crm-disconnect')disconnectCrm();else if(id==='nl-kit-health')healthKit();else if(id==='nl-kit-disconnect')disconnectKit();else if(id==='nl-reconcile')reconcile();else if(id==='nl-kit-key-toggle')toggleKitKey();});
document.addEventListener('change',function(e){if(e.target.id==='nl-target-type')renderTargets();});
document.addEventListener('input',function(e){if(e.target.id==='nl-subject'||e.target.id==='nl-preview'||e.target.id==='nl-content')updatePreview();});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();