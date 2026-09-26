// content-architecture: dynamic — Agent Desk Today is rendered from the signed-in agent's live transaction, listing-prep, buyer and open-house state.
/* Fills the "Today" task list and the Workflows counts on Agent Desk.
   Uses the canonical access-guard client (window.NJPTRAccess), the same one every
   other Agent Desk runtime uses, so it works on every page that loads the guard. */
(function(){
'use strict';
if(window.__WD_AGENT_TODAY__)return;
window.__WD_AGENT_TODAY__=true;
var queue=document.getElementById('ad-today-queue');
if(!queue)return;

function $(s){return document.querySelector(s);}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function dt(v){if(!v)return null;var d=new Date(v);return Number.isFinite(d.getTime())?d:null;}
function days(v){var d=dt(v);if(!d)return null;return Math.ceil((d-Date.now())/86400000);}
function card(id,count,sub){var n=$('#ad-today-'+id);if(n)n.textContent=String(count);var s=$('#ad-today-'+id+'-sub');if(s)s.textContent=sub;}
function task(t){return'<a class="ad-today-task" href="'+esc(t.href)+'"><i class="fas '+esc(t.icon)+'" aria-hidden="true"></i><span><b>'+esc(t.title)+'</b><small>'+esc(t.sub)+'</small></span><em>'+esc(t.tag)+'</em></a>';}
function empty(text){queue.innerHTML='<div class="ad-today-empty"><i class="fas fa-circle-check" aria-hidden="true"></i> '+esc(text)+'</div>';}

function render(tx,lp,buyers,oh){
  var txAttention=tx.filter(function(x){var d=days(x.closing_date);return['attention','blocked'].indexOf(x.readiness_status)>=0||(d!==null&&d>=0&&d<=14);});
  card('transactions',txAttention.length,txAttention.length?'Need attention or close within 14 days':(tx.length?tx.length+' active, none urgent':'No active closings'));
  card('listings',lp.length,lp.length?'Active prep packs':'No listing prep in progress');
  card('buyers',buyers.length,buyers.length?'Active shortlists':'No active shortlists');
  card('openhouses',oh.length,oh.length?'In the next 14 days':'None scheduled');
  var tasks=[];
  txAttention.forEach(function(x){var d=days(x.closing_date);tasks.push({p:d===null?20:d,title:x.address,sub:x.readiness_status==='blocked'?'Transaction is blocked':x.readiness_status==='attention'?'Readiness needs attention'+(d!==null&&d>=0?' · closing in '+d+' day'+(d===1?'':'s'):''):'Closing '+(d===0?'today':'in '+d+' day'+(d===1?'':'s')),href:'/transaction/?tx='+encodeURIComponent(x.id),icon:'fa-file-signature',tag:'Closing'});});
  oh.forEach(function(x){var d=days(x.event_at),when=dt(x.event_at);tasks.push({p:d===null?15:d+1,title:x.title||x.address,sub:[x.address,when?when.toLocaleString('en-US',{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):''].filter(Boolean).join(' · '),href:'/agent/open-house?id='+encodeURIComponent(x.id),icon:'fa-qrcode',tag:'Open house'});});
  lp.filter(function(x){return x.status==='ready';}).forEach(function(x){tasks.push({p:8,title:x.address,sub:(x.client_label?x.client_label+' · ':'')+'Listing prep marked ready',href:'/agent/listing-prep?id='+encodeURIComponent(x.id),icon:'fa-house-chimney',tag:'Listing prep'});});
  tasks.sort(function(a,b){return a.p-b.p;});
  if(!tasks.length){empty('Nothing dated or flagged today.');return;}
  // content-architecture: dynamic — this queue markup is selected from the signed-in agent's computed cross-workspace task state.
  queue.innerHTML=tasks.slice(0,6).map(task).join('')+(tasks.length>6?'<div class="ad-today-more">+'+(tasks.length-6)+' more in your workflows</div>':'');
}

function load(ctx){
  var db=window.NJPTRAccess&&window.NJPTRAccess.client?window.NJPTRAccess.client():null;
  var user=ctx&&ctx.user;
  if(!db||!user)return;
  var future=new Date(Date.now()+14*86400000).toISOString();
  var rows=function(r){return r&&!r.error&&Array.isArray(r.data)?r.data:[];};
  return Promise.all([
    db.from('transaction_workspaces').select('id,address,closing_date,readiness_status,status').eq('user_id',user.id).not('status','in','("closed","canceled")').order('closing_date',{ascending:true,nullsFirst:false}),
    db.from('agent_listing_packs').select('id,address,client_label,status,updated_at').eq('user_id',user.id).in('status',['draft','ready']).order('updated_at',{ascending:false}).limit(20),
    db.from('agent_buyer_shortlists').select('id,name,client_label,status,updated_at').eq('user_id',user.id).eq('status','active').order('updated_at',{ascending:false}).limit(20),
    db.from('agent_open_houses').select('id,title,address,event_at,status').eq('user_id',user.id).in('status',['scheduled','live']).lte('event_at',future).order('event_at',{ascending:true,nullsFirst:false}).limit(20)
  ]).then(function(rs){render(rows(rs[0]),rows(rs[1]),rows(rs[2]),rows(rs[3]));});
}

Promise.resolve(window.njptrAccessReady).then(load).catch(function(){
  // content-architecture: dynamic — this recovery state replaces the live Today queue only when its authenticated data requests fail.
  empty('Today’s summary could not load. Your worklist below is unaffected.');
});
})();
