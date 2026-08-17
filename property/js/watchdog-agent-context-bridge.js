(function(){
'use strict';
if(window.__wdAgentContextBridge)return;window.__wdAgentContextBridge=true;
var timer=null,lastPopulation='';
function validPin(v){v=String(v||'').trim();return /^\d{4}_.+/.test(v)?v:''}
function pinFromHref(href){try{return validPin(new URL(href,location.origin).searchParams.get('pin'))}catch(_e){return''}}
function unique(values){var seen={};return values.filter(function(v){if(!v||seen[v])return false;seen[v]=1;return true})}
function visiblePins(){var links=Array.from(document.querySelectorAll('#ad-focus a[href*="/property/home?pin="],#ad-list a[href*="/property/home?pin="]'));return unique(links.map(function(a){return pinFromHref(a.getAttribute('href')||'')})).slice(0,50)}
function sectionForText(text){text=String(text||'').toLowerCase();if(/permit|title|closing|due diligence|certificate|environment|flood|wetland|tideland/.test(text))return'closing';if(/assessment|appeal|tax|chapter 123|uniformity/.test(text))return'assessment';return'change'}
function dispatch(detail){window.dispatchEvent(new CustomEvent('watchdog:section-context',{detail:detail}))}
function publishPopulation(reason){var pins=visiblePins(),key=pins.slice().sort().join('|');if(!pins.length||key===lastPopulation&&reason!=='force')return;lastPopulation=key;dispatch({surface:'agent_control',section:'overview',scope_type:pins.length===1?'property':'custom',pams_pins:pins,models:['assessment_anomaly','closing_review','property_change_priority'],packs:['identity','assessment_tax','sale_market','appeal_uniformity','permits_closing','environment_risk','municipal_pressure','agent_opportunity'],context_key:'agent_control:worklist:'+key,authoritative:true,reason:reason||'worklist'})}
function focusedContext(target){var card=target&&target.closest&&target.closest('.ad-card'),focus=target&&target.closest&&target.closest('#ad-focus'),host=card||focus;if(!host)return null;var link=host.querySelector('a[href*="/property/home?pin="]'),pin=link&&pinFromHref(link.getAttribute('href')||'');if(!pin)return null;var section=sectionForText(host.textContent||'');return{surface:'agent_control',section:section,scope_type:'property',pams_pins:[pin],context_key:'agent_control:focus:'+section+':'+pin,authoritative:true,reason:'focused_opportunity'}}
function schedule(reason,delay){clearTimeout(timer);timer=setTimeout(function(){publishPopulation(reason)},delay==null?120:delay)}
function boot(){var list=document.getElementById('ad-list'),focus=document.getElementById('ad-focus');if('MutationObserver'in window){if(list)new MutationObserver(function(){schedule('worklist_render',80)}).observe(list,{childList:true,subtree:true});if(focus)new MutationObserver(function(){schedule('focus_render',120)}).observe(focus,{childList:true,subtree:true})}
 document.addEventListener('click',function(event){var target=event.target&&event.target.closest&&event.target.closest('[data-focus="evidence"],.ad-card [data-action="evidence"],.ad-card .ad-address-link,#ad-focus a[href*="/property/home?pin="]');if(!target)return;var ctx=focusedContext(target);if(ctx)dispatch(ctx)},true);
 window.addEventListener('watchdog:context-refresh',function(){publishPopulation('force')});
 setTimeout(function(){publishPopulation('boot')},500);setTimeout(function(){publishPopulation('settled')},1600)}
window.WatchdogAgentContextBridge={publish:function(){publishPopulation('force')},visiblePins:visiblePins,contract:'agent-control-context-v1'};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
