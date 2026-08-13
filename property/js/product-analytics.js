(function(){'use strict';
var ENDPOINT='https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/product-analytics';
var EVENTS=new Set(['page_view','tool_open','marker_viewed','property_lookup_started','property_lookup_succeeded','export_started','export_completed','upgrade_cta_clicked','checkout_started','subscription_confirmed']);
if(navigator.globalPrivacyControl===true||navigator.doNotTrack==='1')return;
function uuid(){return (crypto&&crypto.randomUUID)?crypto.randomUUID():'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){var r=Math.random()*16|0,v=c==='x'?r:(r&3|8);return v.toString(16)});}
function safeStore(store,key,make){try{var v=store.getItem(key);if(!v){v=make();store.setItem(key,v)}return v}catch(_){return make()}}
var visitor=safeStore(localStorage,'wd_visitor_id',uuid),session=safeStore(sessionStorage,'wd_session_id',uuid);
function clean(v,n){return String(v||'').trim().slice(0,n||120)}
function pathOnly(v){try{var u=new URL(v,location.origin);return u.pathname.slice(0,240)}catch(_){return location.pathname.slice(0,240)}}
function firstTouch(){var key='wd_first_touch';try{var old=JSON.parse(localStorage.getItem(key)||'null');if(old)return old}catch(_){}
 var q=new URLSearchParams(location.search),r='';try{r=document.referrer?new URL(document.referrer).hostname.slice(0,120):''}catch(_){}
 var t={utm_source:clean(q.get('utm_source'),80),utm_medium:clean(q.get('utm_medium'),80),utm_campaign:clean(q.get('utm_campaign'),120),utm_content:clean(q.get('utm_content'),120),utm_term:clean(q.get('utm_term'),120),referrer_host:r,landing_path:pathOnly(location.href),captured_at:new Date().toISOString()};
 try{localStorage.setItem(key,JSON.stringify(t))}catch(_){}return t}
var touch=firstTouch(),sentPage=false;
function toolFromPath(){var p=location.pathname.toLowerCase();if(p.includes('data-workbench'))return'data_workbench';if(p.includes('data-center'))return'data_center';if(p.includes('dashboard'))return'dashboard';if(p.includes('home'))return'home';if(p.includes('pro'))return'pricing';return''}
function scrubProps(obj){var out={},allowed=['marker_id','plan','tool','action','format','source','result_count_bucket','status','billing_period','tier'];obj=obj||{};allowed.forEach(function(k){if(obj[k]!=null)out[k]=clean(obj[k],100)});return out}
function track(name,props){if(!EVENTS.has(name))return;var payload={event_name:name,visitor_id:visitor,session_id:session,path:pathOnly(location.href),tool:clean((props&&props.tool)||toolFromPath(),80),referrer_host:touch.referrer_host,utm_source:touch.utm_source,utm_medium:touch.utm_medium,utm_campaign:touch.utm_campaign,utm_content:touch.utm_content,utm_term:touch.utm_term,properties:scrubProps(props)};
 var body=JSON.stringify(payload);try{if(navigator.sendBeacon&&document.visibilityState==='hidden'){var blob=new Blob([body],{type:'application/json'});if(navigator.sendBeacon(ENDPOINT,blob))return}}catch(_){}
 fetch(ENDPOINT,{method:'POST',mode:'cors',keepalive:true,headers:{'Content-Type':'application/json'},body:body}).catch(function(){});
}
window.WatchdogAnalytics={track:track,visitorId:function(){return visitor},sessionId:function(){return session}};
window.addEventListener('watchdog:analytics',function(e){var d=e.detail||{};track(d.event_name||d.name,d.properties||d)});
function auto(){if(sentPage)return;sentPage=true;track('page_view');var t=toolFromPath();if(t&&t!=='pricing')track('tool_open',{tool:t});
 document.addEventListener('click',function(e){var el=e.target.closest('a,button,[data-marker-id]');if(!el)return;
  if(el.matches('[data-marker-id]'))track('marker_viewed',{marker_id:el.getAttribute('data-marker-id'),tool:t});
  var href=(el.getAttribute('href')||'').toLowerCase(),txt=(el.textContent||'').toLowerCase();
  if(href.includes('/property/pro')||/\b(upgrade|see plans|view plans)\b/.test(txt))track('upgrade_cta_clicked',{tool:t});
  if(href.includes('checkout.paddle.com')||el.hasAttribute('data-paddle-price-id'))track('checkout_started',{tool:t});
  if(/\b(export|download)\b/.test(txt))track('export_started',{tool:t,format:(el.getAttribute('data-format')||'')});
 },true);
 document.addEventListener('submit',function(e){var f=e.target;if(!f||!f.querySelector)return;if(f.querySelector('input[type="search"],input[name*="address" i],input[placeholder*="address" i]'))track('property_lookup_started',{tool:t});},true);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',auto,{once:true});else auto();
})();