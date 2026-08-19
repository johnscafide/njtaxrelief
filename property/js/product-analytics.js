(function(){'use strict';
var ENDPOINT='https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/product-analytics';
var EVENTS=new Set([
 'page_view','tool_open','marker_viewed','property_lookup_started','property_lookup_succeeded','export_started','export_completed','upgrade_cta_clicked','checkout_started','subscription_confirmed',
 'intelligence_exposed','intelligence_reasoning_inspected','intelligence_action_started','intelligence_action_completed',
 'intent_question_shown','intent_question_answered','intent_question_skipped',
 'today_item_reviewed','today_item_snoozed','today_item_dismissed','today_item_reopened','trust_evidence_opened'
]);
if(navigator.globalPrivacyControl===true||navigator.doNotTrack==='1')return;
function uuid(){return (crypto&&crypto.randomUUID)?crypto.randomUUID():'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){var r=Math.random()*16|0,v=c==='x'?r:(r&3|8);return v.toString(16)});}
function safeStore(store,key,make){try{var v=store.getItem(key);if(!v){v=make();store.setItem(key,v)}return v}catch(_){return make()}}
var visitor=safeStore(localStorage,'wd_visitor_id',uuid),session=safeStore(sessionStorage,'wd_session_id',uuid),sentPage=false,seen=new Set();
function clean(v,n){return String(v||'').trim().slice(0,n||120)}
function pathOnly(v){try{var u=new URL(v,location.origin);return u.pathname.slice(0,240)}catch(_){return location.pathname.slice(0,240)}}
function firstTouch(){var key='wd_first_touch';try{var old=JSON.parse(localStorage.getItem(key)||'null');if(old)return old}catch(_){}
 var q=new URLSearchParams(location.search),r='';try{r=document.referrer?new URL(document.referrer).hostname.slice(0,120):''}catch(_){}
 var t={utm_source:clean(q.get('utm_source'),80),utm_medium:clean(q.get('utm_medium'),80),utm_campaign:clean(q.get('utm_campaign'),120),utm_content:clean(q.get('utm_content'),120),utm_term:clean(q.get('utm_term'),120),referrer_host:r,landing_path:pathOnly(location.href),captured_at:new Date().toISOString()};
 try{localStorage.setItem(key,JSON.stringify(t))}catch(_){}return t}
var touch=firstTouch();
function surfaceFromPath(){var p=location.pathname.toLowerCase().replace(/\/+$/,'');if(p.includes('/property/intelligence/daily'))return'daily_intelligence';if(p==='/property/intelligence')return'intelligence_hub';if(p.includes('/data-workbench'))return'data_workbench';if(p.includes('/data-center'))return'data_center';if(p.includes('/agent-desk'))return'agent_control';if(p.includes('/dashboard'))return'dashboard';if(p.includes('/home'))return'property_home';if(p.includes('/scan'))return'scanner';if(p.includes('/trust'))return'trust_center';if(p.includes('/pro'))return'pricing';return'other'}
function toolFromPath(){var s=surfaceFromPath();return s==='property_home'?'home':s==='agent_control'?'agent_desk':s}
function scrubProps(obj){var out={},allowed=['marker_id','plan','tool','action','format','source','result_count_bucket','status','billing_period','tier','surface','interaction','model','intent_status','queue_state','reason_count_bucket'];obj=obj||{};allowed.forEach(function(k){if(obj[k]!=null)out[k]=clean(obj[k],100)});return out}
function track(name,props){if(!EVENTS.has(name))return;var payload={event_name:name,visitor_id:visitor,session_id:session,path:pathOnly(location.href),tool:clean((props&&props.tool)||toolFromPath(),80),referrer_host:touch.referrer_host,utm_source:touch.utm_source,utm_medium:touch.utm_medium,utm_campaign:touch.utm_campaign,utm_content:touch.utm_content,utm_term:touch.utm_term,properties:scrubProps(props)};
 var body=JSON.stringify(payload);try{if(navigator.sendBeacon&&document.visibilityState==='hidden'){var blob=new Blob([body],{type:'application/json'});if(navigator.sendBeacon(ENDPOINT,blob))return}}catch(_){}
 fetch(ENDPOINT,{method:'POST',mode:'cors',keepalive:true,headers:{'Content-Type':'application/json'},body:body}).catch(function(){});
}
function once(key,name,props){if(seen.has(key))return;seen.add(key);track(name,props)}
function reasonBucket(node){var n=node?node.querySelectorAll('.wd-density-reasons li').length:0;return n<=0?'0':n===1?'1':n===2?'2':'3'}
function scanIntelligence(root){root=root||document;var surface=surfaceFromPath();root.querySelectorAll&&root.querySelectorAll('.wdai-compact-summary').forEach(function(el){once('exposed:analyst:'+surface,'intelligence_exposed',{surface:surface,source:'analyst_brief',reason_count_bucket:reasonBucket(el)})});root.querySelectorAll&&root.querySelectorAll('.wdcx-item').forEach(function(){once('exposed:context:'+surface,'intelligence_exposed',{surface:surface,source:'context_suggestion'})});root.querySelectorAll&&root.querySelectorAll('.wd-intent-context.is-question').forEach(function(){once('intent-question:'+surface,'intent_question_shown',{surface:surface,intent_status:'unconfirmed'})});root.querySelectorAll&&root.querySelectorAll('.wdi-today').forEach(function(){once('exposed:today:'+surface,'intelligence_exposed',{surface:surface,source:'today_inbox'})})}
function actionCategory(el){var action=el.getAttribute&&el.getAttribute('data-today-action');if(action)return action==='reviewed'?'review_property':action;var href=(el.getAttribute&&el.getAttribute('href')||'').toLowerCase();if(href.includes('/property/home'))return'open_property';if(href.includes('/property/data-workbench'))return'open_workbench';if(href.includes('/property/trust'))return'open_trust';if(href.includes('/property/compare'))return'compare';if(/export|download/i.test(el.textContent||''))return'export';return'other'}
window.WatchdogAnalytics={track:track,visitorId:function(){return visitor},sessionId:function(){return session}};
window.addEventListener('watchdog:analytics',function(e){var d=e.detail||{};track(d.event_name||d.name,d.properties||d)});
function auto(){if(sentPage)return;sentPage=true;var t=toolFromPath(),surface=surfaceFromPath();track('page_view',{surface:surface});if(t&&t!=='pricing'&&t!=='other')track('tool_open',{tool:t,surface:surface});
 scanIntelligence(document);
 new MutationObserver(function(mutations){mutations.forEach(function(m){Array.prototype.forEach.call(m.addedNodes||[],function(n){if(n&&n.nodeType===1){scanIntelligence(n);if(n.matches&&n.matches('.wdai-compact-summary,.wdcx-item,.wd-intent-context.is-question,.wdi-today'))scanIntelligence(n.parentNode||document)}})})}).observe(document.documentElement,{childList:true,subtree:true});
 document.addEventListener('click',function(e){var el=e.target.closest('a,button,[data-marker-id]');if(!el)return;
  if(el.matches('[data-marker-id]'))track('marker_viewed',{marker_id:el.getAttribute('data-marker-id'),tool:t,surface:surface});
  var href=(el.getAttribute('href')||'').toLowerCase(),txt=(el.textContent||'').toLowerCase();
  if(href.includes('/property/pro')||/\b(upgrade|see plans|view plans)\b/.test(txt))track('upgrade_cta_clicked',{tool:t,surface:surface});
  if(href.includes('checkout.paddle.com')||el.hasAttribute('data-paddle-price-id'))track('checkout_started',{tool:t,surface:surface});
  if(/\b(export|download)\b/.test(txt))track('export_started',{tool:t,format:(el.getAttribute('data-format')||''),surface:surface});
  if(el.matches('.wd-density-toggle,.wdg-expand'))track('intelligence_reasoning_inspected',{surface:surface,source:el.matches('.wdg-expand')?'data_graph':'analyst_brief'});
  if(el.matches('.wd-intent-options [data-intent]'))track('intent_question_answered',{surface:surface,intent_status:'user_selected'});
  if(href.includes('/property/trust')&&(el.closest('.wd-density-trust,.wdai,.wdcx-root,.wd-data-graph')||surface==='intelligence_hub'))track('trust_evidence_opened',{surface:surface,source:'intelligence'});
  if(el.closest('.wdai-next,.wdcx-actions,.wdi-today-actions')&&!el.matches('.wd-density-toggle')&&!href.includes('/property/trust'))track('intelligence_action_started',{surface:surface,action:actionCategory(el)});
 },true);
 document.addEventListener('submit',function(e){var f=e.target;if(!f||!f.querySelector)return;if(f.querySelector('input[type="search"],input[name*="address" i],input[placeholder*="address" i]'))track('property_lookup_started',{tool:t,surface:surface});},true);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',auto,{once:true});else auto();
})();