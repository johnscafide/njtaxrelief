(function(){
'use strict';
if(window.WatchdogIdentityManager||!window.NJPTRSupabaseRuntime)return;
var db;try{db=window.NJPTRSupabaseRuntime.createClient();}catch(_){return;}
if(!db||!db.auth)return;
var RETURN_KEY='wd-social-linked',POPUP_NAME='watchdogSocialIdentity',busy=false,popup=null,poll=null,listeners=[];
function config(provider){return window.WatchdogAuth&&window.WatchdogAuth.providers&&window.WatchdogAuth.providers[provider]||{enabled:true,label:provider}}
function label(provider){var row=config(provider);return row&&row.label||provider}
function providerEnabled(provider){var row=config(provider);return !row||row.enabled!==false}
function popupFeatures(){var width=620,height=720,left=Math.max(0,Math.round((screen.width-width)/2)),top=Math.max(0,Math.round((screen.height-height)/2));return'popup=yes,width='+width+',height='+height+',left='+left+',top='+top+',resizable=yes,scrollbars=yes'}
function openPopup(){try{return window.open('about:blank',POPUP_NAME,popupFeatures())}catch(_){return null}}
function stopWatch(){if(poll){clearInterval(poll);poll=null}}
function emit(detail){listeners.slice().forEach(function(fn){try{fn(detail)}catch(_){}});try{document.dispatchEvent(new CustomEvent('watchdog:identities-changed',{detail:detail||{}}))}catch(_){}}
function callbackError(){var values=[];try{var search=new URLSearchParams(location.search||'');values.push(search.get('error_description'),search.get('error'),search.get('error_code'))}catch(_){}try{var hash=new URLSearchParams(String(location.hash||'').replace(/^#/,''));values.push(hash.get('error_description'),hash.get('error'),hash.get('error_code'))}catch(_){}return values.filter(Boolean).join(' · ')}
function cleanReturnMarker(){try{var url=new URL(location.href);url.searchParams.delete(RETURN_KEY);history.replaceState(null,document.title,url.pathname+(url.search||'')+(url.hash||''))}catch(_){}}
async function identities(){var result=await db.auth.getUserIdentities();if(result.error)throw result.error;return result.data&&result.data.identities||[]}
function finishBusy(){busy=false;stopWatch();popup=null}
function watchPopup(win){stopWatch();poll=setInterval(function(){if(!win||win.closed){finishBusy();emit({type:'popup_closed'})}},500)}
async function link(provider){
 if(busy)throw new Error('identity_action_busy');
 if(!providerEnabled(provider))throw new Error('provider_disabled');
 if(typeof db.auth.linkIdentity!=='function')throw new Error('identity_linking_unavailable');
 busy=true;popup=openPopup();
 if(popup){try{popup.document.write('<!doctype html><title>Connect sign-in</title><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:Arial,sans-serif;padding:32px;color:#10294b"><strong>Connecting '+String(label(provider)).replace(/[<>]/g,'')+'…</strong><p>This window will close when the connection is complete.</p></body>');popup.document.close()}catch(_){}}
 try{
   var returnUrl=new URL(location.href);returnUrl.hash='';returnUrl.searchParams.set(RETURN_KEY,provider);
   var result=await db.auth.linkIdentity({provider:provider,options:{redirectTo:returnUrl.href,skipBrowserRedirect:true}});
   if(result.error)throw result.error;
   if(!result.data||!result.data.url)throw new Error('provider_url_unavailable');
   if(popup&&!popup.closed){popup.location.replace(result.data.url);watchPopup(popup);return{popup:true}}
   location.href=result.data.url;return{popup:false};
 }catch(error){try{if(popup&&!popup.closed)popup.close()}catch(_){}finishBusy();throw error}
}
async function unlink(provider){
 if(busy)throw new Error('identity_action_busy');
 if(typeof db.auth.unlinkIdentity!=='function')throw new Error('identity_unlinking_unavailable');
 busy=true;
 try{
   var rows=await identities();
   if(rows.length<2)throw new Error('last_identity_cannot_be_removed');
   var identity=rows.find(function(row){return row&&row.provider===provider});
   if(!identity)throw new Error('identity_not_found');
   var result=await db.auth.unlinkIdentity(identity);if(result.error)throw result.error;
   var fresh=await identities();emit({type:'unlinked',provider:provider,identities:fresh});return fresh;
 }finally{busy=false}
}
async function handleReturn(){
 var params;try{params=new URLSearchParams(location.search||'')}catch(_){return false}
 var provider=params.get(RETURN_KEY);if(!provider)return false;
 var error=callbackError(),isPopup=window.opener&&!window.opener.closed&&window.name===POPUP_NAME;
 if(isPopup){try{window.opener.postMessage({type:'watchdog-social-identity-result',provider:provider,ok:!error,error:error},location.origin)}catch(_){}setTimeout(function(){try{window.close()}catch(_){}},120);return true}
 cleanReturnMarker();finishBusy();var rows=[];try{rows=await identities()}catch(_){}emit({type:error?'link_failed':'linked',provider:provider,error:error,identities:rows});return true;
}
async function popupMessage(event){if(event.origin!==location.origin||!event.data||event.data.type!=='watchdog-social-identity-result')return;finishBusy();var rows=[];try{rows=await identities()}catch(_){}emit({type:event.data.ok?'linked':'link_failed',provider:event.data.provider,error:event.data.error||'',identities:rows})}
function onChange(fn){if(typeof fn!=='function')return function(){};listeners.push(fn);return function(){listeners=listeners.filter(function(item){return item!==fn})}}
window.addEventListener('message',popupMessage);
window.WatchdogIdentityManager=Object.freeze({providers:['google','facebook','linkedin_oidc'],providerEnabled:providerEnabled,label:label,identities:identities,link:link,unlink:unlink,onChange:onChange,handleReturn:handleReturn,isBusy:function(){return busy}});
handleReturn();
})();