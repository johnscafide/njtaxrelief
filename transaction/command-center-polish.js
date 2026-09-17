(function(){
'use strict';
if(window.__WATCHDOG_TRANSACTION_WORKSPACE_V2__)return;
window.__WATCHDOG_TRANSACTION_WORKSPACE_V2__=true;

var db=null,user=null,workspaces=[],selectedId='',selected=null,items=[],documents=[];
var evidenceFilter='all',activeView='overview',loadSeq=0,refreshTimer=0,observerTimer=0,drawerRestore=null,loading=false;

var EVIDENCE_GROUPS=[
  {key:'occupancy',label:'Occupancy / resale',itemKeys:['resale_cco','permit_certificate_lifecycle'],sourcePatterns:[/certificate of occupancy/i,/resale/i,/permit.*certificate/i,/permits.*certificates/i]},
  {key:'tax',label:'Property tax',itemKeys:['property_tax_status','tax_sale_delinquency'],sourcePatterns:[/property tax/i,/tax sale/i,/delinquen/i]},
  {key:'deed',label:'Deed / recording',itemKeys:['ownership_vesting','judgment_lien_search','mortgage_payoff','deed_recording_reference','lis_pendens_title_exceptions'],sourcePatterns:[/ownership/i,/vesting/i,/deed/i,/judgment/i,/recorded lien/i,/lis pendens/i,/title filing/i]},
  {key:'municipal-lien',label:'Municipal lien / clearance',itemKeys:['municipal_lien_clearance'],sourcePatterns:[/municipal lien/i,/clearance/i]},
  {key:'fire',label:'Smoke / CO / fire',itemKeys:['smoke_fire_cert'],sourcePatterns:[/smoke/i,/fire cert/i]},
  {key:'utilities',label:'Water / sewer',itemKeys:['water_sewer'],sourcePatterns:[/water/i,/sewer/i]},
  {key:'violations',label:'Open violations',itemKeys:['open_violations'],sourcePatterns:[/violation/i,/code \/ violations/i]},
  {key:'municipal-services',label:'Municipal services',itemKeys:['municipal_services'],sourcePatterns:[/municipal services/i,/move-in/i,/trash/i,/recycling/i]},
  {key:'environment',label:'Environmental / deed controls',itemKeys:['environmental_controls'],sourcePatterns:[/environment/i,/deed control/i,/flood/i,/remediation/i]}
];

function $(s,r){return (r||document).querySelector(s)}
function $$(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))}
function clean(v){return String(v==null?'':v).trim()}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]})}
function titleCase(v){return clean(v).replace(/_/g,' ').toLowerCase().replace(/\b\w/g,function(c){return c.toUpperCase()})}
function money(v){var n=Number(v);return Number.isFinite(n)?n.toLocaleString('en-US',{style:'currency',currency:'USD'}):''}
function fmtDate(v){if(!v)return'—';var d=new Date(String(v).slice(0,10)+'T12:00:00');return Number.isFinite(d.getTime())?d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—'}
function fmtDateTime(v){if(!v)return'—';var d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'—'}
function humanMunicipality(v){var s=titleCase(v);return s.replace(/\bBoro\b/g,'Borough').replace(/\bTwp\b/g,'Township').replace(/\bTwnshp\b/g,'Township')}
function roleLabel(v){return ({tc:'Transaction coordinator',title:'Title',municipality:'Municipality',lender:'Lender',agent:'Agent',attorney:'Attorney',seller:'Seller',buyer:'Buyer',other:'Other'}[v]||titleCase(v))}
function isActiveTx(t){return t&&!['closed','canceled'].includes(t.status)}
function isResolved(i){return i&&(['verified','resolved','waived','not_applicable'].includes(i.state)||i.evidence_state==='clear_observed')}
function isIssue(i){return i&&(i.evidence_state==='issue_observed'||['attention','blocked'].includes(i.severity))}
function needsReview(i){return i&&!isResolved(i)&&(i.evidence_state==='provider_missing'||i.evidence_state==='verify'||i.evidence_state==='unknown'||['open','requested','received'].includes(i.state)||i.severity==='review')}
function payload(i){return i&&i.payload&&typeof i.payload==='object'?i.payload:{}}
function premiumAvailable(){return !!(window.WatchdogTransactionAccess&&window.WatchdogTransactionAccess.evidence===true)}

function readiness(rows){
  var relevant=(rows||[]).filter(function(x){return x.state!=='not_applicable'&&x.evidence_state!=='not_applicable'});
  if(!relevant.length)return{score:null,open:0};
  var resolved=relevant.filter(isResolved).length;
  return{score:Math.round(resolved/relevant.length*100),open:relevant.length-resolved};
}

function client(){
  if(db)return db;
  try{db=window.NJPTRSupabaseRuntime&&window.NJPTRSupabaseRuntime.createClient?window.NJPTRSupabaseRuntime.createClient():null}catch(e){console.warn('Transaction v2 data client unavailable',e)}
  return db;
}
function legacySelected(){var n=$('.tx-list-card.active');return clean(n&&n.dataset&&n.dataset.txId)}
function legacyCard(id){return $('.tx-list-card[data-tx-id="'+String(id).replace(/"/g,'')+'"]')}
function shellReady(){return $('#tx-app')&&!$('#tx-app').hidden&&client()}

function ensureShell(){
  var app=$('#tx-app');if(!app||$('#tx-v2-shell'))return;
  var wrap=document.createElement('section');wrap.id='tx-v2-shell';wrap.className='txv2-shell';
  wrap.innerHTML=''
    +'<a class="txv2-skip" href="#txv2-property-title">Skip to transaction</a>'
    +'<button class="txv2-drawer-scrim" type="button" data-v2-action="close-drawer" aria-label="Close transaction list" hidden></button>'
    +'<aside class="txv2-rail" id="txv2-rail" aria-label="Active transactions">'
      +'<div class="txv2-rail-head"><div><span>ACTIVE TRANSACTIONS</span><b id="txv2-active-count">0</b></div><button class="txv2-rail-close" type="button" data-v2-action="close-drawer" aria-label="Close transaction list"><i class="fas fa-xmark" aria-hidden="true"></i></button></div>'
      +'<label class="txv2-search"><i class="fas fa-magnifying-glass" aria-hidden="true"></i><input id="txv2-search" type="search" placeholder="Find a transaction" autocomplete="off"></label>'
      +'<div class="txv2-list" id="txv2-list"></div>'
      +'<div class="txv2-portfolio"><h2>Portfolio</h2><div><span>Need attention</span><b id="txv2-need-attention">0</b></div><div><span>Closing in 14 days</span><b id="txv2-closing-soon">0</b></div><div><span>Unresolved blockers</span><b id="txv2-blockers">0</b></div></div>'
    +'</aside>'
    +'<section class="txv2-workspace" id="txv2-workspace" role="main">'
      +'<div class="txv2-utility"><div class="txv2-breadcrumb"><button class="txv2-rail-toggle" type="button" data-v2-action="open-drawer" aria-controls="txv2-rail" aria-expanded="false"><i class="fas fa-bars" aria-hidden="true"></i><span>Transactions</span></button><span class="txv2-bread-desktop">Transactions</span><i>/</i><strong>Property overview</strong></div></div>'
      +'<div class="txv2-empty" id="txv2-empty" hidden><h1 id="txv2-empty-title">Select a transaction</h1><p id="txv2-empty-copy">Choose an active transaction to review its closing evidence.</p><button class="txv2-empty-add" type="button" data-tx-action="add"><i class="fas fa-plus" aria-hidden="true"></i> Add transaction</button></div>'
      +'<article class="txv2-detail" id="txv2-detail" hidden>'
        +'<header class="txv2-property-head">'
          +'<div class="txv2-property-copy"><div class="txv2-title-row"><h1 id="txv2-property-title">Property</h1><span class="txv2-attention" id="txv2-attention"><i></i><span>Needs attention</span></span></div><p id="txv2-property-meta">New Jersey</p></div>'
          +'<div class="txv2-head-actions"><div class="txv2-action-row"><button class="txv2-refresh" type="button" data-v2-action="refresh"><i class="fas fa-rotate" aria-hidden="true"></i><span>Refresh review</span></button><div class="txv2-overflow-wrap"><button class="txv2-icon-button" type="button" data-v2-action="toggle-overflow" aria-label="Transaction actions" aria-expanded="false"><i class="fas fa-ellipsis" aria-hidden="true"></i></button><div class="txv2-menu" id="txv2-overflow-menu" hidden><button type="button" data-tx-action="edit">Edit transaction</button><button type="button" data-tx-action="add">Add transaction</button></div></div></div><small id="txv2-checked">Checked —</small></div>'
        +'</header>'
        +'<nav class="txv2-tabs" aria-label="Transaction workspace sections">'
          +'<button type="button" data-v2-view="overview" aria-current="page">Overview</button><button type="button" data-v2-view="evidence">Evidence</button><button type="button" data-v2-view="documents">Documents</button><button type="button" data-v2-view="timeline">Timeline</button><button type="button" data-v2-view="activity">Activity</button>'
          +'<div class="txv2-more-wrap"><button type="button" data-v2-action="toggle-more" aria-expanded="false">More <i class="fas fa-chevron-down" aria-hidden="true"></i></button><div class="txv2-menu txv2-more-menu" id="txv2-more-menu" hidden><button type="button" data-v2-view="readiness">Readiness</button><button type="button" data-v2-view="disclosures">Client disclosures</button></div></div>'
        +'</nav>'
        +'<section class="txv2-loading" id="txv2-loading" hidden aria-live="polite"><i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i><span>Loading transaction…</span></section>'
        +'<section class="txv2-load-error" id="txv2-load-error" hidden role="alert"><h2>Transaction details could not load</h2><p>Your evidence and readiness details have not been verified. Last-known data has not been replaced.</p><button type="button" data-v2-action="retry">Retry transaction</button></section>'
        +'<div class="txv2-view" id="txv2-overview">'
          +'<div class="txv2-overview-grid">'
            +'<section class="txv2-workarea">'
              +'<section class="txv2-issue" id="txv2-issue" hidden><span class="txv2-issue-icon"><i class="fas fa-triangle-exclamation" aria-hidden="true"></i></span><div><h2>Confirm occupancy / resale requirements</h2><p>Review the municipality’s certificate requirements before closing.</p></div><button type="button" data-v2-evidence="occupancy">Review requirement <i class="fas fa-arrow-right" aria-hidden="true"></i></button></section>'
              +'<section class="txv2-evidence-section" aria-labelledby="txv2-evidence-title">'
                +'<div class="txv2-section-head"><div><h2 id="txv2-evidence-title">Evidence review <span id="txv2-evidence-count">9 categories</span></h2><p>Public records and municipal requirements</p></div><label class="txv2-filter"><span class="sr-only">Filter evidence</span><select id="txv2-evidence-filter"><option value="all">All evidence</option><option value="issues">Issues</option><option value="review">Review needed</option><option value="no_match">No match</option></select><i class="fas fa-chevron-down" aria-hidden="true"></i></label></div>'
                +'<div class="txv2-evidence-table-wrap"><table class="txv2-evidence-table"><thead><tr><th>Category</th><th>Latest finding</th><th>Status</th><th><span class="sr-only">Open</span></th></tr></thead><tbody id="txv2-evidence-body"></tbody></table></div>'
                +'<div class="txv2-evidence-mobile" id="txv2-evidence-mobile"></div>'
                +'<div class="txv2-source-note"><i class="fas fa-circle-info" aria-hidden="true"></i><span>Public records may be incomplete. Open a category to review its source.</span></div>'
              +'</section>'
            +'</section>'
            +'<aside class="txv2-context" aria-label="Transaction context">'
              +'<section><span class="txv2-context-label">CLOSING</span><div class="txv2-close-line"><h2 id="txv2-closing-date">—</h2><span id="txv2-stage">—</span></div><div class="txv2-context-row"><span>Contract date</span><b id="txv2-contract-date">—</b></div></section>'
              +'<section><h2>Readiness score</h2><div class="txv2-score"><strong id="txv2-score">—</strong><span>/ 100</span></div><div class="txv2-meter" role="meter" aria-label="Readiness score" aria-valuemin="0" aria-valuemax="100"><i id="txv2-meter-fill"></i></div><button class="txv2-link" type="button" data-v2-view="readiness">Open readiness checklist <i class="fas fa-arrow-right" aria-hidden="true"></i></button></section>'
              +'<section><h2>Assignments</h2><p class="txv2-context-sub">Open items by team</p><div id="txv2-assignments"></div></section>'
              +'<section><h2>Property details</h2><div class="txv2-context-row"><span>Municipality</span><b id="txv2-municipality">—</b></div><div class="txv2-context-row"><span>Parcel</span><b id="txv2-parcel">—</b></div></section>'
              +'<section><div class="txv2-context-title"><h2>Documents</h2><b id="txv2-document-count">0</b></div><p class="txv2-doc-empty" id="txv2-document-copy">No documents uploaded</p><button class="txv2-upload" type="button" data-v2-action="documents"><i class="fas fa-arrow-up-from-bracket" aria-hidden="true"></i><span>Upload document</span></button><p class="txv2-private"><i class="fas fa-lock" aria-hidden="true"></i> <span id="txv2-private-copy">Private to your account</span></p></section>'
            +'</aside>'
          +'</div>'
        +'</div>'
        +'<section class="txv2-secondary" id="txv2-secondary" hidden></section>'
        +'<div class="txv2-parking" id="txv2-parking" hidden></div>'
      +'</article>'
    +'</section>';
  var first=app.firstElementChild;app.insertBefore(wrap,first||null);
  bindV2();
}

function bindV2(){
  var search=$('#txv2-search');if(search)search.addEventListener('input',renderRail);
  var filter=$('#txv2-evidence-filter');if(filter)filter.addEventListener('change',function(){evidenceFilter=filter.value;renderEvidence()});
  document.addEventListener('click',function(e){
    var tx=e.target.closest&&e.target.closest('[data-v2-tx-id]');if(tx){selectTransaction(tx.dataset.v2TxId);return}
    var view=e.target.closest&&e.target.closest('[data-v2-view]');if(view){activateView(view.dataset.v2View);closeMenus();return}
    var ev=e.target.closest&&e.target.closest('[data-v2-evidence]');if(ev){openEvidence(ev.dataset.v2Evidence);return}
    var action=e.target.closest&&e.target.closest('[data-v2-action]');if(action){handleAction(action.dataset.v2Action,action);return}
    if(!e.target.closest('.txv2-overflow-wrap')&&!e.target.closest('.txv2-more-wrap'))closeMenus();
  });
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape'){closeMenus();closeDrawer();return}
    if(e.key==='Tab'&&document.body.classList.contains('txv2-rail-open'))trapDrawerFocus(e);
  });
  document.addEventListener('watchdog:transaction-preflight-complete',function(){setTimeout(refreshSelected,450)});
  document.addEventListener('click',function(e){if(e.target.closest('#tx-doc-upload,[data-doc-action]')){setTimeout(refreshSelected,1400);setTimeout(refreshSelected,5000)}});
}

function handleAction(action,node){
  if(action==='refresh'){runRefresh();return}
  if(action==='toggle-overflow'){toggleMenu('#txv2-overflow-menu',node);return}
  if(action==='toggle-more'){toggleMenu('#txv2-more-menu',node);return}
  if(action==='open-drawer'){openDrawer(node);return}
  if(action==='close-drawer'){closeDrawer();return}
  if(action==='retry'){if(selectedId)loadSelected(selectedId);return}
  if(action==='documents'){activateView('documents');return}
  if(action==='clear-search'){var s=$('#txv2-search');if(s){s.value='';renderRail()}return}
  if(action==='show-all'){evidenceFilter='all';var f=$('#txv2-evidence-filter');if(f)f.value='all';renderEvidence();return}
}
function toggleMenu(sel,button){var menu=$(sel);if(!menu)return;var next=menu.hidden;closeMenus();menu.hidden=!next;if(button)button.setAttribute('aria-expanded',String(next))}
function closeMenus(){$$('.txv2-menu').forEach(function(m){m.hidden=true});$$('[data-v2-action="toggle-overflow"],[data-v2-action="toggle-more"]').forEach(function(b){b.setAttribute('aria-expanded','false')})}

function openDrawer(button){drawerRestore=button||document.activeElement;document.body.classList.add('txv2-rail-open');var scrim=$('.txv2-drawer-scrim');if(scrim)scrim.hidden=false;var toggle=$('[data-v2-action="open-drawer"]');if(toggle)toggle.setAttribute('aria-expanded','true');setTimeout(function(){var first=$('#txv2-rail input, #txv2-rail button');if(first)first.focus()},0)}
function closeDrawer(){if(!document.body.classList.contains('txv2-rail-open'))return;document.body.classList.remove('txv2-rail-open');var scrim=$('.txv2-drawer-scrim');if(scrim)scrim.hidden=true;var toggle=$('[data-v2-action="open-drawer"]');if(toggle)toggle.setAttribute('aria-expanded','false');if(drawerRestore&&drawerRestore.focus)drawerRestore.focus();drawerRestore=null}
function trapDrawerFocus(e){var rail=$('#txv2-rail');if(!rail)return;var list=$$('button,input,select,a[href]',rail).filter(function(x){return !x.disabled&&x.getClientRects().length});if(!list.length)return;var first=list[0],last=list[list.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}

async function loadAll(){
  var c=client();if(!c)return;
  var auth=await c.auth.getUser();user=auth&&auth.data&&auth.data.user;if(!user)return;
  var r=await c.from('transaction_workspaces').select('*').eq('user_id',user.id).order('closing_date',{ascending:true,nullsFirst:false}).order('created_at',{ascending:false});
  if(r.error){console.warn('Transaction v2 workspaces could not load',r.error);renderEmpty(true);return}
  workspaces=r.data||[];selectedId=legacySelected()||selectedId||(workspaces[0]&&workspaces[0].id)||'';renderRail();renderPortfolio();if(selectedId)await loadSelected(selectedId);else renderEmpty(false);
}

async function loadSelected(id){
  var c=client();if(!c||!id||!user)return;var seq=++loadSeq;selectedId=id;selected=workspaces.find(function(t){return t.id===id})||null;items=[];documents=[];loading=true;renderRail();renderHeader();showLoading();
  var itemQuery=c.from('transaction_items').select('*').eq('transaction_id',id).eq('user_id',user.id).order('sort_order');
  var docsQuery=c.from('transaction_documents').select('id,status,created_at').eq('transaction_id',id).eq('user_id',user.id).order('created_at',{ascending:false});
  var results=await Promise.all([itemQuery,docsQuery]);if(seq!==loadSeq)return;
  var latest=await c.from('transaction_workspaces').select('*').eq('id',id).eq('user_id',user.id).maybeSingle();if(seq!==loadSeq)return;
  if(!latest.error&&latest.data){selected=latest.data;var idx=workspaces.findIndex(function(t){return t.id===id});if(idx>=0)workspaces[idx]=latest.data;else workspaces.unshift(latest.data);renderRail()}
  if(results[0].error){console.warn('Transaction v2 items could not load',results[0].error);loading=false;showLoadError();renderHeader();renderPortfolio();return}
  if(results[1].error&&premiumAvailable())console.warn('Transaction v2 documents could not load',results[1].error);
  items=results[0].data||[];documents=results[1].error?[]:(results[1].data||[]);loading=false;hideLoadState();renderSelected();renderPortfolio();activateView(activeView,true);
}
function refreshSelected(){if(selectedId)loadSelected(selectedId)}

function selectTransaction(id){
  if(!id)return;var same=id===selectedId;selectedId=id;renderRail();var card=legacyCard(id);if(card&&!same)card.click();loadSelected(id);closeDrawer();
}

function renderEmpty(error){
  var empty=$('#txv2-empty'),detail=$('#txv2-detail');if(empty)empty.hidden=false;if(detail)detail.hidden=true;
  var title=$('#txv2-empty-title'),copy=$('#txv2-empty-copy');if(title)title.textContent=error?'Transactions could not load':'No active transactions';if(copy)copy.textContent=error?'Your transaction list is unavailable right now. Try reloading the page.':'Add a transaction to begin tracking closing evidence and readiness.';
}
function renderRail(){
  var host=$('#txv2-list');if(!host)return;var q=clean($('#txv2-search')&&$('#txv2-search').value).toLowerCase();var active=workspaces.filter(isActiveTx),rows=active.filter(function(t){return !q||[t.address,t.city,t.client_label,t.agent_name,t.coordinator_name].join(' ').toLowerCase().includes(q)});
  $('#txv2-active-count').textContent=active.length;
  if(!rows.length){host.innerHTML='<div class="txv2-list-empty">'+(q?'No transactions found':'No active transactions')+(q?'<button type="button" data-v2-action="clear-search">Clear search</button>':'')+'</div>';return}
  host.innerHTML=rows.map(function(t){var sub=[t.city,t.state].filter(Boolean).join(', ');return '<button class="txv2-list-row '+(t.id===selectedId?'active':'')+'" type="button" data-v2-tx-id="'+esc(t.id)+'" '+(t.id===selectedId?'aria-current="true"':'')+'><span><strong>'+esc(t.address||'Property')+'</strong>'+(sub?'<small>'+esc(sub)+'</small>':'')+'</span></button>'}).join('');
}
function renderPortfolio(){
  var active=workspaces.filter(isActiveTx),now=new Date(),soon=new Date(now.getTime()+14*864e5);
  var attention=active.filter(function(t){return ['attention','blocked'].includes(t.readiness_status)}).length;
  var closing=active.filter(function(t){if(!t.closing_date)return false;var d=new Date(t.closing_date+'T23:59:00');return d>=now&&d<=soon}).length;
  var blockers=active.filter(function(t){return t.readiness_status==='blocked'}).length;
  if($('#txv2-need-attention'))$('#txv2-need-attention').textContent=attention;if($('#txv2-closing-soon'))$('#txv2-closing-soon').textContent=closing;if($('#txv2-blockers'))$('#txv2-blockers').textContent=blockers;
}

function renderHeader(){
  if(!selected)return;var empty=$('#txv2-empty'),detail=$('#txv2-detail');if(empty)empty.hidden=true;if(detail)detail.hidden=false;
  $('#txv2-property-title').textContent=selected.address||'Property';
  var place=clean(selected.city)+(selected.state?', '+clean(selected.state):'')+(selected.postal_code?' '+clean(selected.postal_code):'');$('#txv2-property-meta').textContent=(place||'New Jersey')+(selected.county?' · '+titleCase(selected.county)+' County':'');
  var att=$('#txv2-attention'),state=selected.readiness_status||'review';att.className='txv2-attention '+esc(state);att.querySelector('span').textContent=state==='ready'?'No unresolved blockers':state==='blocked'?'Blocked':state==='attention'?'Needs attention':'Review needed';
  $('#txv2-checked').textContent=selected.last_watch_at?'Checked '+fmtDateTime(selected.last_watch_at):'Not checked yet';
  $('#txv2-closing-date').textContent=fmtDate(selected.closing_date);$('#txv2-stage').textContent=titleCase(selected.status||'');$('#txv2-contract-date').textContent=fmtDate(selected.contract_date);
  $('#txv2-municipality').textContent=humanMunicipality(selected.municipality||selected.city)||'—';$('#txv2-parcel').textContent=(selected.block&&selected.lot)?'Block '+selected.block+' · Lot '+selected.lot:'—';
  syncFeatureAvailability();
}
function renderSelected(){
  if(!selected){renderEmpty(false);return}renderHeader();
  var r=readiness(items),score=$('#txv2-score'),fill=$('#txv2-meter-fill'),meter=$('.txv2-meter');score.textContent=r.score==null?'—':r.score;fill.style.width=(r.score==null?0:r.score)+'%';if(r.score==null)meter.removeAttribute('aria-valuenow');else meter.setAttribute('aria-valuenow',String(r.score));meter.setAttribute('aria-label',r.score==null?'Readiness score unavailable':'Readiness score: '+r.score+' out of 100');
  var open=items.filter(function(i){return !isResolved(i)}),roles=['tc','title','municipality','lender'];$('#txv2-assignments').innerHTML=roles.map(function(role){var n=open.filter(function(i){return i.assigned_role===role}).length;return '<div class="txv2-context-row"><span>'+esc(roleLabel(role))+'</span><b>'+n+'</b></div>'}).join('');
  $('#txv2-document-count').textContent=premiumAvailable()?documents.length:'—';$('#txv2-document-copy').textContent=premiumAvailable()?(documents.length?(documents.length+' '+(documents.length===1?'document':'documents')+' uploaded'):'No documents uploaded'):'Private document vault is available with Pro+';
  renderEvidence();syncFeatureAvailability();
}
function syncFeatureAvailability(){
  var premium=premiumAvailable(),refresh=$('[data-v2-action="refresh"]'),doc=$('[data-v2-action="documents"]');if(refresh)refresh.hidden=!premium;if(doc){var span=doc.querySelector('span');if(span)span.textContent=premium?'Upload document':'View Pro+ documents'}var privateCopy=$('#txv2-private-copy');if(privateCopy)privateCopy.textContent=premium?'Private to your account':'Pro+ feature';
}
function showLoading(){var detail=$('#txv2-detail'),load=$('#txv2-loading'),error=$('#txv2-load-error'),overview=$('#txv2-overview'),secondary=$('#txv2-secondary');if(detail)detail.hidden=false;if(load)load.hidden=false;if(error)error.hidden=true;if(overview)overview.hidden=true;if(secondary)secondary.hidden=true}
function showLoadError(){var load=$('#txv2-loading'),error=$('#txv2-load-error'),overview=$('#txv2-overview'),secondary=$('#txv2-secondary');if(load)load.hidden=true;if(error)error.hidden=false;if(overview)overview.hidden=true;if(secondary)secondary.hidden=true}
function hideLoadState(){var load=$('#txv2-loading'),error=$('#txv2-load-error');if(load)load.hidden=true;if(error)error.hidden=true}

function groupItems(group){return items.filter(function(i){return group.itemKeys.includes(i.item_key)})}
function evidenceState(group,rows){
  if(group.key==='municipal-services')return'none';
  if(group.key==='environment'){
    var env=rows.find(function(i){return i.item_key==='environmental_controls'}),p=payload(env),nj=p.njdep||{};
    if(nj.search_state==='checked'&&nj.exact_parcel_match===false&&!(nj.records||[]).length)return'no_match';
  }
  if(rows.some(isIssue))return'issue';
  if(group.key==='tax'&&rows.length)return'review';
  if(rows.some(needsReview)||rows.some(function(i){return !isResolved(i)}))return'review';
  return'none';
}
function evidenceFinding(group,rows){
  var byKey=function(k){return rows.find(function(i){return i.item_key===k})};
  if(group.key==='occupancy'){var co=byKey('resale_cco');if(co)return'Certificate requirements need review';var permit=byKey('permit_certificate_lifecycle');return permit?clean(permit.description).split('.')[0]:'Evidence isn’t available yet'}
  if(group.key==='tax'){var tax=byKey('property_tax_status'),tp=payload(tax);if(Number.isFinite(Number(tp.prior_year_tax))&&Number(tp.prior_year_tax)>0)return'Prior-year baseline: '+money(tp.prior_year_tax);return tax?clean(tax.description).split('.')[0]:'Evidence isn’t available yet'}
  if(group.key==='deed'){if(selected&&selected.block&&selected.lot)return'Block '+selected.block+' · Lot '+selected.lot;var deed=byKey('deed_recording_reference');return deed?clean(deed.description).split('.')[0]:'Evidence isn’t available yet'}
  if(group.key==='municipal-lien'){var ml=byKey('municipal_lien_clearance');if(ml&&ml.evidence_state==='provider_missing')return'Parcel-level source unavailable';return ml?clean(ml.description).split('.')[0]:'Evidence isn’t available yet'}
  if(group.key==='fire'){var fire=byKey('smoke_fire_cert');return fire?'Sale inspection requirements':'Evidence isn’t available yet'}
  if(group.key==='utilities'){var util=byKey('water_sewer'),up=payload(util);if(util&&Number.isFinite(Number(up.live_amount_due)))return'Current amount due: '+money(up.live_amount_due);return util?clean(util.description).split('.')[0]:'No property-specific balance match'}
  if(group.key==='violations'){var vio=byKey('open_violations');return vio?(vio.source_label||'Code enforcement / housing'):'Evidence isn’t available yet'}
  if(group.key==='municipal-services'){var svc=byKey('municipal_services'),sp=payload(svc);return sp.service_provider||svc&&svc.source_label||'Municipal service information'}
  if(group.key==='environment'){var env=byKey('environmental_controls'),ep=payload(env),nj=ep.njdep||{};if(nj.search_state==='checked'&&nj.exact_parcel_match===false&&!(nj.records||[]).length)return'No exact NJDEP parcel record returned';return env?clean(env.description).split('.')[0]:'Evidence isn’t available yet'}
  return rows[0]?clean(rows[0].description).split('.')[0]:'Evidence isn’t available yet';
}
function evidenceRows(){return EVIDENCE_GROUPS.map(function(group){var rows=groupItems(group);return{group:group,status:evidenceState(group,rows),finding:evidenceFinding(group,rows),items:rows}})}
function statusMarkup(status){if(status==='issue')return'<span class="txv2-status issue"><i></i>Issue</span>';if(status==='review')return'<span class="txv2-status review"><i></i>Review needed</span>';if(status==='no_match')return'<span class="txv2-status no-match"><i></i>No match</span>';return'<span class="txv2-status none">—</span>'}
function renderEvidence(){
  var body=$('#txv2-evidence-body'),mobile=$('#txv2-evidence-mobile');if(!body||!mobile)return;var all=evidenceRows(),visible=all.filter(function(r){if(evidenceFilter==='issues')return r.status==='issue';if(evidenceFilter==='review')return r.status==='review';if(evidenceFilter==='no_match')return r.status==='no_match';return true});
  $('#txv2-evidence-count').textContent=(visible.length===all.length?all.length+' categories':visible.length+' of '+all.length+' categories');
  var occupancy=all.find(function(r){return r.group.key==='occupancy'});$('#txv2-issue').hidden=!(occupancy&&occupancy.status==='issue');
  if(!visible.length){body.innerHTML='<tr><td colspan="4" class="txv2-no-results">No categories match this filter. <button type="button" data-v2-action="show-all">Show all evidence</button></td></tr>';mobile.innerHTML='<div class="txv2-no-results">No categories match this filter. <button type="button" data-v2-action="show-all">Show all evidence</button></div>';return}
  body.innerHTML=visible.map(function(r){return '<tr class="'+(r.status==='issue'?'issue':'')+'"><td><button type="button" data-v2-evidence="'+r.group.key+'" aria-label="Open '+esc(r.group.label)+' evidence">'+esc(r.group.label)+'</button></td><td>'+esc(r.finding)+'</td><td>'+statusMarkup(r.status)+'</td><td><button class="txv2-row-open" type="button" data-v2-evidence="'+r.group.key+'" aria-label="Open '+esc(r.group.label)+' evidence"><i class="fas fa-chevron-right" aria-hidden="true"></i></button></td></tr>'}).join('');
  mobile.innerHTML=visible.map(function(r){return '<button class="txv2-mobile-evidence '+(r.status==='issue'?'issue':'')+'" type="button" data-v2-evidence="'+r.group.key+'"><span><strong>'+esc(r.group.label)+'</strong>'+statusMarkup(r.status)+'</span><small>'+esc(r.finding)+'</small></button>'}).join('');
}

function sourceCards(group){
  var grid=$('#tx-source-sweep .tx-source-grid');if(!grid)return[];var cards=$$(':scope > .tx-source-card',grid);return cards.filter(function(card){var title=clean(card.querySelector('strong')&&card.querySelector('strong').textContent);return group.sourcePatterns.some(function(re){return re.test(title)})})
}
function openEvidence(key){
  var group=EVIDENCE_GROUPS.find(function(g){return g.key===key});if(!group)return;var cards=sourceCards(group),rows=groupItems(group),layer=$('#tx-modal-layer'),modal=$('#tx-modal'),content=$('#tx-modal-content');if(!layer||!modal||!content){activateView('evidence');return}
  content.innerHTML='<div class="txv2-deep"><h2>'+esc(group.label)+'</h2><p>'+esc(selected&&selected.address||'')+'</p><div class="txv2-deep-stack"></div></div>';var stack=content.querySelector('.txv2-deep-stack');
  if(cards.length){cards.forEach(function(card){var clone=card.cloneNode(true);clone.removeAttribute('style');stack.appendChild(clone)})}else if(rows.length){stack.innerHTML=rows.map(function(i){return '<article class="txv2-fallback-evidence"><h3>'+esc(i.title||group.label)+'</h3><p>'+esc(i.description||'No summary is available yet.')+'</p>'+(i.source_label?'<small>Source: '+esc(i.source_label)+'</small>':'')+'</article>'}).join('')}else{stack.innerHTML='<p>Evidence isn’t available yet for this category.</p>'}
  modal.classList.add('txv2-modal');layer.hidden=false;document.body.classList.add('tx-modal-open');
}

function park(node){var p=$('#txv2-parking');if(node&&p&&node.parentNode!==p){p.appendChild(node);node.hidden=true}}
function moveToSecondary(node){var host=$('#txv2-secondary');if(!node||!host)return false;host.innerHTML='';host.appendChild(node);node.hidden=false;return true}
function parkSecondary(){var host=$('#txv2-secondary');if(!host)return;Array.prototype.slice.call(host.children).forEach(park);host.hidden=true}
function findViewNode(view){
  if(view==='evidence')return $('#tx-source-sweep');
  if(view==='documents')return $('#tx-documents-card');
  if(view==='timeline')return $('[data-tx-panel="timeline"]');
  if(view==='activity')return $('[data-tx-panel="activity"]');
  if(view==='readiness')return $('[data-tx-panel="checklist"]');
  if(view==='disclosures')return $('[data-tx-panel="disclosures"]');
  return null;
}
function renderPremiumUpgrade(view){var host=$('#txv2-secondary');if(!host)return;host.hidden=false;host.innerHTML='<section class="txv2-upgrade"><span>PRO+ EVIDENCE</span><h2>'+esc(view==='documents'?'Private closing documents':'Watchdog source evidence')+'</h2><p>This workspace is available with Pro+ while your Agent transaction checklist remains unchanged.</p><a href="/pro#plans">Compare Pro+ evidence <i class="fas fa-arrow-right" aria-hidden="true"></i></a></section>'}
function activateView(view,quiet){
  activeView=view||'overview';if(loading)return;var overview=$('#txv2-overview'),secondary=$('#txv2-secondary');
  $$('.txv2-tabs [data-v2-view]').forEach(function(b){b.toggleAttribute('aria-current',b.dataset.v2View===activeView)});var more=$('.txv2-more-wrap>[data-v2-action="toggle-more"]');if(more)more.classList.toggle('active',['readiness','disclosures'].includes(activeView));
  if(activeView==='overview'){parkSecondary();if(overview)overview.hidden=false;return}
  if(overview)overview.hidden=true;
  if((activeView==='documents'||activeView==='evidence')&&!premiumAvailable()){parkSecondary();renderPremiumUpgrade(activeView);return}
  var node=findViewNode(activeView);if(node){moveToSecondary(node);secondary.hidden=false}else{secondary.hidden=false;secondary.innerHTML='<div class="txv2-secondary-empty"><i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i> Loading '+esc(titleCase(activeView))+'…</div>';if(!quiet)setTimeout(function(){activateView(activeView,true)},700)}
}

function runRefresh(){
  var button=$('[data-v2-action="refresh"]'),legacy=$('#tx-run-review');if(!button||!legacy||legacy.hidden)return;if(button.disabled)return;button.disabled=true;button.querySelector('span').textContent='Refreshing…';legacy.click();clearInterval(refreshTimer);var attempts=0;refreshTimer=setInterval(function(){attempts++;if(!legacy.disabled||attempts>45){clearInterval(refreshTimer);button.disabled=false;button.querySelector('span').textContent='Refresh review';refreshSelected()}},1000);
}

function syncLegacySelection(){var id=legacySelected();if(id&&id!==selectedId){selectedId=id;loadSelected(id)}else syncFeatureAvailability()}
function scheduleSync(){clearTimeout(observerTimer);observerTimer=setTimeout(function(){syncLegacySelection();if(activeView!=='overview'&&!loading)activateView(activeView,true)},180)}
function startObserver(){
  var observer=new MutationObserver(function(mutations){for(var i=0;i<mutations.length;i++){var target=mutations[i].target;var el=target&&target.nodeType===1?target:target&&target.parentElement;if(el&&el.closest&&el.closest('#tx-v2-shell'))continue;scheduleSync();break}});
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden','aria-selected']});
}

async function boot(){
  var tries=0,timer=setInterval(async function(){tries++;if(shellReady()){clearInterval(timer);ensureShell();startObserver();await loadAll();setTimeout(function(){syncLegacySelection();if(!loading)activateView(activeView,true)},900)}else if(tries>80){clearInterval(timer)}},150);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();