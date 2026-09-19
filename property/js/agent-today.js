// content-architecture: dynamic — Agent Desk Today is rendered from the signed-in agent's live transaction, listing-prep, buyer, open-house and opportunity state.
(function(){
'use strict';
var host=document.getElementById('ad-today-hub');if(!host||!window.NJPTRSupabaseRuntime)return;var db=window.NJPTRSupabaseRuntime.createClient(),user=null;
function $(s){return document.querySelector(s)}function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function dt(v){if(!v)return null;var d=new Date(v);return Number.isFinite(d.getTime())?d:null}function days(v){var d=dt(v);if(!d)return null;return Math.ceil((d-Date.now())/86400000)}
function card(id,count,sub){var n=$('#ad-today-'+id);if(n)n.textContent=String(count);var s=$('#ad-today-'+id+'-sub');if(s)s.textContent=sub}
function task(icon,title,sub,href,tag){return'<a class="ad-today-task" href="'+esc(href)+'"><i class="fas '+esc(icon)+'"></i><span><b>'+esc(title)+'</b><small>'+esc(sub)+'</small></span><em>'+esc(tag)+'</em></a>'}
async function load(){
 try{var a=await db.auth.getUser();user=a&&a.data&&a.data.user;if(!user)return;
  var today=new Date(),future=new Date(today.getTime()+14*86400000).toISOString();
  var rs=await Promise.all([
    db.from('transaction_workspaces').select('id,address,closing_date,readiness_status,status').eq('user_id',user.id).not('status','in','("closed","canceled")').order('closing_date',{ascending:true,nullsFirst:false}),
    db.from('agent_listing_packs').select('id,address,client_label,status,updated_at').eq('user_id',user.id).in('status',['draft','ready']).order('updated_at',{ascending:false}).limit(20),
    db.from('agent_buyer_shortlists').select('id,name,client_label,status,updated_at').eq('user_id',user.id).eq('status','active').order('updated_at',{ascending:false}).limit(20),
    db.from('agent_open_houses').select('id,title,address,event_at,status').eq('user_id',user.id).in('status',['scheduled','live']).lte('event_at',future).order('event_at',{ascending:true,nullsFirst:false}).limit(20)
  ]);
  var tx=rs[0].error?[]:(rs[0].data||[]),lp=rs[1].error?[]:(rs[1].data||[]),buyers=rs[2].error?[]:(rs[2].data||[]),oh=rs[3].error?[]:(rs[3].data||[]);
  var txAttention=tx.filter(function(x){var d=days(x.closing_date);return ['attention','blocked'].includes(x.readiness_status)||(d!==null&&d>=0&&d<=14)}).length;
  card('transactions',txAttention,txAttention?'closing or readiness attention':'No urgent closing flags');card('listings',lp.length,lp.length?'active prep packs':'No listing prep in progress');card('buyers',buyers.length,buyers.length?'active buyer shortlists':'No active buyer shortlist');card('openhouses',oh.length,oh.length?'next 14 days':'No open house scheduled');
  var tasks=[];
  tx.slice(0,5).forEach(function(x){var d=days(x.closing_date);if(['attention','blocked'].includes(x.readiness_status)||(d!==null&&d>=0&&d<=14))tasks.push({p:d===null?20:d,title:x.address,sub:x.readiness_status==='blocked'?'Transaction is blocked':x.readiness_status==='attention'?'Readiness needs attention':'Closing '+(d===0?'today':'in '+d+' days'),href:'/transaction/?tx='+encodeURIComponent(x.id),icon:'fa-file-signature',tag:'Transaction'})});
  oh.slice(0,3).forEach(function(x){var d=days(x.event_at);tasks.push({p:d===null?15:d+1,title:x.title||x.address,sub:x.address+(x.event_at?' · '+new Date(x.event_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):''),href:'/agent/open-house?id='+encodeURIComponent(x.id),icon:'fa-qrcode',tag:'Open house'})});
  lp.filter(function(x){return x.status==='ready'}).slice(0,2).forEach(function(x){tasks.push({p:8,title:x.address,sub:(x.client_label?x.client_label+' · ':'')+'Listing prep marked ready',href:'/agent/listing-prep?id='+encodeURIComponent(x.id),icon:'fa-house-chimney',tag:'Listing prep'})});
  tasks.sort(function(a,b){return a.p-b.p});var q=$('#ad-today-queue');
  // content-architecture: dynamic — this queue markup is selected from the signed-in agent's computed cross-workspace task state.
  q.innerHTML=tasks.length?tasks.slice(0,7).map(function(t){return task(t.icon,t.title,t.sub,t.href,t.tag)}).join(''):'<div class="ad-today-empty">No dated or flagged work is waiting. Your sourced Opportunity Desk remains below.</div>';
 }catch(e){var q=$('#ad-today-queue');
  // content-architecture: dynamic — this recovery state replaces the live Today queue only when its authenticated data requests fail.
  if(q)q.innerHTML='<div class="ad-today-empty">Today’s cross-workspace summary could not load. Your existing Opportunity Desk is still available below.</div>'}
}
function syncOpportunity(){var source=$('#ad-total'),target=$('#ad-today-opportunities');if(!source||!target)return;target.textContent=source.textContent||'0';var sub=$('#ad-today-opportunities-sub');if(sub)sub.textContent=Number(source.textContent||0)?'sourced property signals':'No active property signals'}
var timer=setInterval(function(){syncOpportunity();if($('#ad-total')){var mo=new MutationObserver(syncOpportunity);mo.observe($('#ad-total'),{childList:true,characterData:true,subtree:true});clearInterval(timer)}},250);setTimeout(function(){clearInterval(timer)},10000);load();
})();