(function(){
'use strict';
if(!window.NJPTRSupabaseRuntime)return;
var db=window.NJPTRSupabaseRuntime.createClient();
function $(s){return document.querySelector(s)}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function clean(v){return String(v==null?'':v).trim()}
function day(v){if(!v)return'';var d=new Date(String(v).slice(0,10)+'T12:00:00');return Number.isFinite(d.getTime())?d.toLocaleDateString('en-US',{month:'short',day:'numeric'}):''}
function relativeDate(v){if(!v)return'';var d=new Date(v),now=new Date(),days=Math.floor((now-d)/864e5);if(days<=0)return'Today';if(days===1)return'Yesterday';return days+' days ago'}
function ensure(){
  var app=$('#ad-app');if(!app||app.hidden)return null;var current=$('#ad-today-work');if(current)return current;
  var nav=app.querySelector('.ad-companion-nav'),section=document.createElement('section');section.id='ad-today-work';section.className='ad-today-work';
  // content-architecture: dynamic — Today is an authenticated queue assembled from live transaction, lead, listing-prep and buyer-workflow state.
  section.innerHTML='<header><div><span>TODAY</span><h2>What needs your attention?</h2><p>Client work, deadlines and new consented leads in one queue. Watchdog does not infer that a person intends to buy or sell.</p></div><a href="/agent/workflows"><i class="fas fa-grid-2"></i> Agent workflows</a></header><div class="ad-today-summary" id="ad-today-summary"></div><div class="ad-today-list" id="ad-today-list"><p class="ad-control-loading">Building today’s queue…</p></div>';
  if(nav)nav.insertAdjacentElement('afterend',section);else app.prepend(section);return section
}
function rank(a,b){return(a.weight===b.weight?new Date(b.when||0)-new Date(a.when||0):b.weight-a.weight)}
async function load(){
  var host=ensure();if(!host)return;try{
    var auth=await db.auth.getUser(),user=auth.data&&auth.data.user;if(!user)return;
    var now=new Date(),soon=new Date(now.getTime()+14*864e5),leadSince=new Date(now.getTime()-7*864e5).toISOString();
    var rs=await Promise.all([
      db.from('transaction_workspaces').select('id,address,client_label,side,status,closing_date,updated_at').eq('user_id',user.id).order('updated_at',{ascending:false}).limit(100),
      db.from('transaction_items').select('id,transaction_id,title,state,severity,due_date,updated_at').eq('user_id',user.id).order('updated_at',{ascending:false}).limit(500),
      db.from('agent_portal_leads').select('id,full_name,address,source,open_house_id,created_at').eq('agent_user_id',user.id).gte('created_at',leadSince).order('created_at',{ascending:false}).limit(100),
      db.from('agent_listing_packs').select('id,address,client_label,status,updated_at').eq('user_id',user.id).eq('status','draft').order('updated_at',{ascending:false}).limit(30),
      db.from('agent_buyer_shortlists').select('id,name,client_label,status,updated_at').eq('user_id',user.id).eq('status','active').order('updated_at',{ascending:false}).limit(30)
    ]);
    rs.forEach(function(r){if(r.error)throw r.error});
    var txs=rs[0].data||[],items=rs[1].data||[],leads=rs[2].data||[],packs=rs[3].data||[],lists=rs[4].data||[],txMap=Object.fromEntries(txs.map(function(t){return[t.id,t]})),queue=[];
    txs.filter(function(t){if(['closed','canceled'].includes(t.status)||!t.closing_date)return false;var d=new Date(t.closing_date+'T23:59:00');return d>=now&&d<=soon}).forEach(function(t){queue.push({weight:95,icon:'fa-calendar-day',kind:'Closing',title:t.address,detail:'Closing '+day(t.closing_date)+(t.client_label?' · '+t.client_label:''),href:'/transaction/?select='+encodeURIComponent(t.id),when:t.closing_date})});
    items.filter(function(i){if(!i.due_date||['verified','resolved','waived','not_applicable'].includes(i.state))return false;var d=new Date(i.due_date+'T23:59:00');return d<=soon}).slice(0,20).forEach(function(i){var t=txMap[i.transaction_id];queue.push({weight:i.severity==='blocked'?100:90,icon:'fa-list-check',kind:'Transaction task',title:i.title,detail:(t?t.address+' · ':'')+'Due '+day(i.due_date),href:'/transaction/?select='+encodeURIComponent(i.transaction_id),when:i.due_date})});
    leads.forEach(function(l){queue.push({weight:88,icon:l.source==='open_house'?'fa-qrcode':'fa-user-plus',kind:l.source==='open_house'?'Open-house lead':'Portal lead',title:l.full_name||'New consented lead',detail:(l.address?l.address+' · ':'')+relativeDate(l.created_at),href:l.source==='open_house'?'/agent/workflows#open-house':'/agent-desk',when:l.created_at})});
    packs.slice(0,6).forEach(function(p){queue.push({weight:62,icon:'fa-sign-hanging',kind:'Listing prep',title:p.address,detail:(p.client_label?p.client_label+' · ':'')+'Prep pack still in progress',href:'/agent/workflows?pack='+encodeURIComponent(p.id)+'#listing',when:p.updated_at})});
    lists.slice(0,6).forEach(function(s){queue.push({weight:55,icon:'fa-house-circle-check',kind:'Buyer shortlist',title:s.name,detail:(s.client_label?s.client_label+' · ':'')+'Active comparison',href:'/agent/workflows?shortlist='+encodeURIComponent(s.id)+'#buyer',when:s.updated_at})});
    queue.sort(rank);render(queue.slice(0,10),{closings:txs.filter(function(t){return!['closed','canceled'].includes(t.status)}).length,leads:leads.length,packs:packs.length,shortlists:lists.length});
  // content-architecture: dynamic — failure detail is generated from the live account-scoped queue request and must remain adjacent to the affected runtime state.
  }catch(e){var list=$('#ad-today-list');if(list)list.innerHTML='<div class="ad-today-empty"><b>Today’s queue could not load.</b><span>'+esc(e.message||'Refresh and try again.')+'</span></div>'}
}
function render(queue,counts){
  var summary=$('#ad-today-summary'),list=$('#ad-today-list');if(!summary||!list)return;
  // content-architecture: dynamic — summary copy is computed from the signed-in agent's current queue counts.
  summary.innerHTML='<span><b>'+counts.closings+'</b> active transactions</span><span><b>'+counts.leads+'</b> new leads · 7 days</span><span><b>'+counts.packs+'</b> listing packs in progress</span><span><b>'+counts.shortlists+'</b> buyer shortlists</span>';
  // content-architecture: dynamic — each queue row is rendered from live, account-scoped Agent workflow data.
  list.innerHTML=queue.length?queue.map(function(x){return'<a class="ad-today-row" href="'+esc(x.href)+'"><span class="ad-today-icon"><i class="fas '+esc(x.icon)+'"></i></span><span class="ad-today-copy"><small>'+esc(x.kind)+'</small><b>'+esc(x.title)+'</b><em>'+esc(x.detail)+'</em></span><i class="fas fa-chevron-right"></i></a>'}).join(''):'<div class="ad-today-empty"><i class="fas fa-circle-check"></i><b>No urgent Agent tasks are queued.</b><span>Use Agent Workflows to start listing prep, buyer comparisons or an open house.</span></div>';
}
function start(){var tries=0,t=setInterval(function(){tries++;if(ensure()){clearInterval(t);load()}else if(tries>80)clearInterval(t)},150)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();