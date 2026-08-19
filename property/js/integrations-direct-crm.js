(function(){
'use strict';
if(window.__WATCHDOG_DIRECT_CRM__)return;window.__WATCHDOG_DIRECT_CRM__=true;
var db=null,provider=null,history=[],busy=false,reconnectMode=false,observer=null;
var $=function(id){return document.getElementById(id);};
function installIntegrationTransport(){
  try{
    var rt=window.NJPTRSupabaseRuntime;
    if(!rt||!rt.createClient||!rt.url||!rt.key)return;
    var client=rt.createClient();
    if(!client||client.__watchdogIntegrationTransport)return;
    var fx=client.functions;
    if(!fx||typeof fx.invoke!=='function')return;
    try{Object.defineProperty(client,'functions',{value:fx,configurable:true});}catch(_){return;}
    var original=fx.invoke.bind(fx);
    fx.invoke=async function(name,opts){
      name=String(name||'');
      if(!/^integration-(gateway|key-manager|provider-manager)$/.test(name))return original(name,opts);
      var sessionResult=await client.auth.getSession();
      var session=sessionResult&&sessionResult.data&&sessionResult.data.session;
      var token=session&&session.access_token;
      if(!token)return{data:null,error:new Error('Sign in required')};
      try{
        var response=await window.fetch(rt.url+'/functions/v1/'+name,{method:'POST',headers:{apikey:rt.key,authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(opts&&opts.body||{})});
        if(!response.ok){var edgeError=new Error('Edge Function returned a non-2xx status code');edgeError.context=response;return{data:null,error:edgeError};}
        var data=await response.json().catch(function(){return null;});
        return{data:data,error:null};
      }catch(networkError){return{data:null,error:networkError};}
    };
    try{Object.defineProperty(client,'__watchdogIntegrationTransport',{value:true,configurable:true});}catch(_){}
  }catch(_){}
}
function loadZapierPhase7(){
  if(document.querySelector('script[data-watchdog-zapier-phase7]'))return;
  var script=document.createElement('script');
  script.src='/property/js/integrations-zapier-phase7.js';
  script.defer=true;
  script.dataset.watchdogZapierPhase7='true';
  document.body.appendChild(script);
}
function loadResolutionModule(){
  if(!document.querySelector('link[data-watchdog-crm-resolution]')){var link=document.createElement('link');link.rel='stylesheet';link.href='/property/css/integrations-crm-resolution.css';link.dataset.watchdogCrmResolution='true';document.head.appendChild(link);}
  if(!document.querySelector('script[data-watchdog-crm-resolution]')){var script=document.createElement('script');script.src='/property/js/integrations-crm-resolution.js';script.defer=true;script.dataset.watchdogCrmResolution='true';document.body.appendChild(script);}
}
installIntegrationTransport();
loadZapierPhase7();
function show(id,on){var n=$(id);if(n)n.hidden=!on;}
function text(id,v){var n=$(id);if(n)n.textContent=v;}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function fmt(v){if(!v)return'Not yet';var d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Not yet';}
function note(id,msg,error){var n=$(id);if(!n)return;n.textContent=msg||'';n.classList.toggle('error',!!error);}
async function parseError(error){try{if(error&&error.context&&typeof error.context.json==='function'){var d=await error.context.json();return d&&d.error||error.message;}}catch(_){}return error&&error.message||'Request failed';}
async function invoke(action,body){if(!db)throw new Error('Watchdog connection unavailable');var r=await db.functions.invoke('integration-provider-manager',{body:Object.assign({action:action},body||{})});if(r.error)throw new Error(await parseError(r.error));return r.data||{};}
function setBusy(on){busy=!!on;document.querySelectorAll('#igd-native button,#igd-native input').forEach(function(n){n.disabled=busy;});}
function health(p){if(!p)return['revoked','Not connected'];if(p.sync_status==='error'||p.last_error)return['error','Needs attention'];if(p.sync_status==='syncing')return['syncing','Syncing'];if(p.status!=='active'||p.sync_status==='revoked')return['revoked','Disconnected'];if(p.last_success_at)return['','Connected'];return['','Ready'];}
function suppressNativeGenericCard(){if(!provider||!provider.connection_id)return;var box=$('ig-connections');if(!box)return;var card=box.querySelector('[data-connection="'+CSS.escape(provider.connection_id)+'"]');if(card)card.remove();var cards=box.querySelectorAll('.ig-conn');var empty=$('ig-connections-empty');if(empty)empty.hidden=cards.length>0;}
function watchGenericCards(){var box=$('ig-connections');if(!box||observer)return;observer=new MutationObserver(function(){suppressNativeGenericCard();});observer.observe(box,{childList:true,subtree:false});}
function render(){
  var connected=!!provider&&provider.status==='active'&&provider.sync_status!=='revoked';
  show('igd-connect-panel',!connected||reconnectMode);
  show('igd-connected-panel',connected&&!reconnectMode);
  if(!connected){suppressNativeGenericCard();return;}
  var h=health(provider),healthNode=$('igd-health');healthNode.className='igd-health'+(h[0]?' '+h[0]:'');healthNode.textContent=h[1];
  text('igd-provider-name','BoldTrail Direct');text('igd-account-name',provider.external_account_label||'BoldTrail CRM');
  text('igd-last-success',fmt(provider.last_success_at));text('igd-last-upserted',Number(provider.last_records_upserted||0).toLocaleString()+' contacts');
  text('igd-total-synced',Number(provider.records_synced_total||0).toLocaleString());text('igd-failures',Number(provider.consecutive_failures||0).toLocaleString());
  var err=$('igd-provider-error');if(provider.last_error){err.textContent=provider.last_error;err.hidden=false;}else err.hidden=true;
  var intel=$('igd-intel');intel.checked=!!provider.intelligence_access;text('igd-intel-copy',provider.intelligence_access?'Explicit permission enabled'+(provider.intelligence_access_updated_at?' · '+fmt(provider.intelligence_access_updated_at):''):'Off for this direct connection');
  suppressNativeGenericCard();
}
async function refreshSharedContext(){try{var r=await db.functions.invoke('integration-gateway',{body:{action:'context.summary'}});if(r.error)return;var d=r.data||{};text('ig-stat-crm',Number(d.crm_records||0));text('ig-context-records',Number(d.crm_records||0));text('ig-context-linked',Number(d.property_linked||0));text('ig-context-latest',d.latest?fmt(d.latest.updated_at):'Not yet');}catch(_){}}
async function loadProvider(){var d=await invoke('providers.list');provider=(d.providers||[]).find(function(p){return p.provider==='boldtrail'&&p.sync_status!=='revoked';})||null;render();watchGenericCards();return d;}
async function loadHistory(){if(!provider)return;var d=await invoke('provider.history',{connection_id:provider.connection_id,limit:25});history=d.runs||[];var body=$('igd-history-body');body.innerHTML=history.map(function(r){return'<tr><td>'+esc(fmt(r.started_at))+'</td><td>'+esc(r.trigger_source||'—')+'</td><td><span class="igd-run-status '+esc(r.status)+'">'+esc(r.status)+'</span></td><td>'+esc(Number(r.records_seen||0).toLocaleString())+'</td><td>'+esc(Number(r.records_upserted||0).toLocaleString())+'</td><td>'+esc(fmt(r.completed_at))+(r.error_message?'<br><small>'+esc(String(r.error_message).slice(0,80))+'</small>':'')+'</td></tr>';}).join('');show('igd-history-empty',!history.length);var wrap=document.querySelector('.igd-history-table-wrap');if(wrap)wrap.hidden=!history.length;}
async function connect(e){e.preventDefault();if(busy)return;var token=$('igd-api-token').value.trim();if(token.length<20){note('igd-connect-note','Enter a valid kvCORE API token.',true);return;}setBusy(true);note('igd-connect-note','Validating the token directly with BoldTrail…');try{var d=await invoke('boldtrail.connect',{api_token:token,external_account_label:$('igd-account-label').value.trim(),intelligence_access:$('igd-connect-intel').checked});provider=d.connection||null;reconnectMode=false;$('igd-api-token').value='';show('igd-cancel-reconnect',false);note('igd-connect-note','BoldTrail connected. The first normalized sync has been queued.');render();await refreshSharedContext();setTimeout(function(){loadProvider().then(refreshSharedContext).catch(function(){});},2600);setTimeout(function(){loadProvider().then(refreshSharedContext).catch(function(){});},6500);}catch(err){$('igd-api-token').value='';note('igd-connect-note',err.message,true);}finally{setBusy(false);}}
async function syncNow(){if(!provider||busy)return;setBusy(true);note('igd-status-note','Manual sync queued…');try{await invoke('provider.sync_now',{connection_id:provider.connection_id});note('igd-status-note','Sync queued. Watchdog will update this card when the run finishes.');setTimeout(function(){loadProvider().then(refreshSharedContext).catch(function(){});},2200);setTimeout(function(){loadProvider().then(refreshSharedContext).catch(function(){});},6000);}catch(err){note('igd-status-note',err.message,true);}finally{setBusy(false);}}
async function setIntelligence(input){if(!provider||busy)return;var wanted=input.checked;setBusy(true);try{var d=await invoke('provider.set_intelligence',{connection_id:provider.connection_id,enabled:wanted});provider=d.connection||provider;render();await refreshSharedContext();}catch(err){input.checked=!wanted;alert(err.message);}finally{setBusy(false);}}
function beginReconnect(){if(!provider)return;reconnectMode=true;$('igd-account-label').value=provider.external_account_label||'';$('igd-connect-intel').checked=!!provider.intelligence_access;show('igd-cancel-reconnect',true);note('igd-connect-note','Enter a new token. The existing credential stays active until the replacement validates.');render();$('igd-connect-panel').scrollIntoView({behavior:'smooth',block:'center'});}
function cancelReconnect(){reconnectMode=false;$('igd-api-token').value='';show('igd-cancel-reconnect',false);note('igd-connect-note','');render();}
async function disconnect(){if(!provider||busy)return;if(!confirm('Disconnect BoldTrail? The API token will be deleted from Watchdog Vault and the normalized CRM context imported by this connection will be removed.'))return;setBusy(true);try{await invoke('provider.disconnect',{connection_id:provider.connection_id,purge_context:true});provider=null;history=[];reconnectMode=false;$('igd-api-token').value='';show('igd-history',false);note('igd-connect-note','BoldTrail disconnected. Its stored credential and normalized CRM context were removed.');render();await refreshSharedContext();}catch(err){alert(err.message);}finally{setBusy(false);}}
async function action(btn){var a=btn.dataset.directAction;if(a==='sync'){await syncNow();return;}if(a==='reconnect'){beginReconnect();return;}if(a==='cancel-reconnect'){cancelReconnect();return;}if(a==='disconnect'){await disconnect();return;}if(a==='history'){show('igd-history',true);setBusy(true);try{await loadHistory();}catch(err){alert(err.message);}finally{setBusy(false);return;}if(a==='close-history'){show('igd-history',false);return;}}
async function boot(){var root=$('igd-native');if(!root)return;try{db=window.NJPTRSupabaseRuntime&&window.NJPTRSupabaseRuntime.createClient?window.NJPTRSupabaseRuntime.createClient():null;if(!db)return;var s=await db.auth.getSession(),session=s&&s.data&&s.data.session;if(!session)return;try{var state=await loadProvider();show('igd-direct-workspace',true);show('igd-lock',false);if(state.plan)root.dataset.plan=state.plan;loadResolutionModule();}catch(err){if(/Teams|Native CRM connections require/i.test(err.message)){show('igd-lock',true);show('igd-direct-workspace',false);return;}throw err;}}catch(err){show('igd-direct-workspace',true);note('igd-connect-note',err.message,true);}}
document.addEventListener('submit',function(e){if(e.target&&e.target.id==='igd-connect-form')connect(e);});
document.addEventListener('change',function(e){if(e.target&&e.target.id==='igd-intel')setIntelligence(e.target);});
document.addEventListener('click',function(e){var b=e.target.closest('[data-direct-action]');if(b)action(b);});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
