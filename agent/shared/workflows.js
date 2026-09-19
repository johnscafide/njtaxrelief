(function(){
'use strict';
if(window.WatchdogAgentWorkflows)return;
var db=null,user=null;
function client(){if(db)return db;try{db=window.NJPTRSupabaseRuntime&&window.NJPTRSupabaseRuntime.createClient?window.NJPTRSupabaseRuntime.createClient():null}catch(_){db=null}return db}
function clean(v){return String(v==null?'':v).trim()}
function esc(v){return clean(v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function money(v){var n=Number(v);return Number.isFinite(n)?n.toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}):'—'}
function number(v){var n=Number(v);return Number.isFinite(n)?n.toLocaleString('en-US'):'—'}
function date(v){if(!v)return'—';var d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—'}
function dateTime(v){if(!v)return'—';var d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}):'—'}
async function auth(){if(user)return user;var c=client();if(!c)throw new Error('Watchdog data service unavailable');var r=await c.auth.getUser();user=r&&r.data&&r.data.user;if(!user)throw new Error('Sign in to use Agent Workspace');return user}
async function propertySearch(query,limit){query=clean(query);if(query.length<3)return[];var c=client();await auth();var s=await c.auth.getSession(),token=s&&s.data&&s.data.session&&s.data.session.access_token;if(!token)throw new Error('Sign in required');var url='/api/agent-property-search?q='+encodeURIComponent(query)+'&limit='+encodeURIComponent(Math.min(Math.max(Number(limit)||8,1),15)),r=await fetch(url,{headers:{Authorization:'Bearer '+token,Accept:'application/json'}}),body=await r.json().catch(function(){return{}});if(!r.ok)throw new Error(body.error||'Property search is unavailable');return Array.isArray(body.rows)?body.rows:[]}
function place(row){return [clean(row&& (row.city||row.town)),clean(row&&row.county)?clean(row.county)+' County':'',clean(row&&row.zip)].filter(Boolean).join(' · ')}
function propertyUrl(row){var pin=clean(row&&row.pams_pin);return pin?'/home?pin='+encodeURIComponent(pin):'/property/'}
function showNote(node,text,kind){if(!node)return;node.textContent=text||'';node.className='ag-note'+(kind?' '+kind:'')}
function copy(value){if(navigator.clipboard&&navigator.clipboard.writeText)return navigator.clipboard.writeText(value);return Promise.reject(new Error('Clipboard unavailable'))}
function todayIso(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
window.WatchdogAgentWorkflows=Object.freeze({client:client,auth:auth,clean:clean,esc:esc,money:money,number:number,date:date,dateTime:dateTime,propertySearch:propertySearch,place:place,propertyUrl:propertyUrl,showNote:showNote,copy:copy,todayIso:todayIso});
})();