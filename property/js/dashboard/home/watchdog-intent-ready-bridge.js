/* Rehydrates confirmed Context Graph intent into the Home Analyst adapter after page load. */
(function(){
'use strict';
if(window.__WATCHDOG_INTENT_READY_BRIDGE__)return;
window.__WATCHDOG_INTENT_READY_BRIDGE__=true;
function pin(){var q=new URLSearchParams(location.search).get('pin');if(q)return q;var s=document.getElementById('hm-switch');return s&&s.value?s.value:'';}
async function run(){var p=pin();if(!p||!window.NJPTRSupabaseRuntime||!window.NJPTRSupabaseRuntime.createClient)return;var c=window.NJPTRSupabaseRuntime.createClient();var u=await c.auth.getUser();var user=u&&u.data&&u.data.user;if(!user)return;var key='property:'+p;var r=await c.from('intelligence_intent_states').select('context_key,active_job,active_job_confidence,confirmed_fields').eq('user_id',user.id).eq('context_key',key).maybeSingle();if(r.error||!r.data||!r.data.active_job)return;var f=r.data.confirmed_fields&&r.data.confirmed_fields.active_job||{};window.dispatchEvent(new CustomEvent('watchdog:intent-ready',{detail:{context_key:key,active_job:r.data.active_job,label:f.label||r.data.active_job,confidence:r.data.active_job_confidence}}));}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(run,80);});else setTimeout(run,80);
})();
