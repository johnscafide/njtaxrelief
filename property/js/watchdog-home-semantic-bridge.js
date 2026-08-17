(function(){
'use strict';
if(window.__wdHomeSemanticBridge)return;window.__wdHomeSemanticBridge=true;
var installed=false,lastPin='';
function client(){
  try{var a=window.NJPTRAccess&&window.NJPTRAccess.client&&window.NJPTRAccess.client();if(a)return a}catch(_e){}
  try{var d=window.NJDashboard&&window.NJDashboard.client&&window.NJDashboard.client();if(d)return d}catch(_e){}
  return null;
}
function validPin(v){v=String(v||'').trim();return /^\d{4}_.+/.test(v)?v:''}
function currentPin(){var select=document.getElementById('hm-switch'),fromSelect=select&&validPin(select.value);if(fromSelect)return fromSelect;try{return validPin(new URLSearchParams(location.search).get('pin'))}catch(_e){return''}}
function publish(reason){var pin=currentPin();if(!pin)return;if(pin===lastPin&&reason!=='force')return;lastPin=pin;window.dispatchEvent(new CustomEvent('watchdog:property-context',{detail:{surface:'home',scope_type:'property',pams_pins:[pin],pams_pin:pin,section:window.WatchdogPageContext&&window.WatchdogPageContext.section?window.WatchdogPageContext.section():'overview',context_key:'home:'+pin,reason:reason||'property'}}));}
function installHistory(){
  window.watchdogScoreHistory=function(r,markerId){
    var sb=client(),pin=validPin(r&&r.pams_pin),marker=String(markerId||'watchdog.score').trim();
    if(!sb||!pin||!marker)return Promise.resolve([]);
    return sb.from('score_observations').select('marker_id,score,observed_at,model_version').eq('pams_pin',pin).eq('marker_id',marker).order('observed_at',{ascending:true}).limit(240).then(function(result){if(result.error)throw result.error;return result.data||[];});
  };
  installed=true;
}
function boot(){
  installHistory();
  var select=document.getElementById('hm-switch');if(select)select.addEventListener('change',function(){setTimeout(function(){publish('property_switch')},0)});
  var body=document.getElementById('hm-body');if(body&&'MutationObserver'in window)new MutationObserver(function(){if(!installed)installHistory();publish('report_render')}).observe(body,{childList:true,subtree:true});
  window.addEventListener('popstate',function(){publish('navigation')});
  window.addEventListener('watchdog:context-refresh',function(){publish('force')});
  setTimeout(function(){installHistory();publish('boot')},50);
  setTimeout(function(){installHistory();publish('settled')},900);
}
window.WatchdogHomeSemanticBridge={publish:function(){publish('force')},scoreHistory:function(r,markerId){return window.watchdogScoreHistory(r,markerId)},contract:'global-property-marker-history-v1'};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
