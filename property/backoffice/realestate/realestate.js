(function(){
'use strict';

var STORAGE_KEY='watchdog.realestate.command-center.v1';
var STATE_VERSION=1;
var DAY=86400000;
var stages=[
  {id:'qualifying',name:'New / Qualifying',short:'Qualifying',weight:.05,help:'New prospects and qualification'},
  {id:'lending',name:'Lending',short:'Lending',weight:.15,help:'Application, documents and lender work'},
  {id:'preapproved',name:'Pre-Approved',short:'Pre-Approved',weight:.25,help:'Financing verified and ready'},
  {id:'searching',name:'Searching',short:'Searching',weight:.35,help:'Active search and showings'},
  {id:'offer',name:'Offer Stage',short:'Offer',weight:.60,help:'Writing, submitted or negotiating'},
  {id:'under_contract',name:'Under Contract',short:'Under Contract',weight:.85,help:'Accepted contract and due diligence'},
  {id:'closing',name:'Closing Process',short:'Closing',weight:.92,help:'Title, mortgage, appraisal and CCO'},
  {id:'clear_to_close',name:'Clear to Close',short:'Clear to Close',weight:.98,help:'Ready for final walkthrough and closing'},
  {id:'closed',name:'Closed',short:'Closed',weight:1,help:'Completed transactions'},
  {id:'nurture',name:'Nurture',short:'Nurture',weight:.02,help:'Future opportunity, not active now'}
];
var state=loadState();
var currentDragId=null;
var els={};

function blankState(){return{version:STATE_VERSION,settings:{annual_goal:0,closed_gci:0},clients:[]};}
function loadState(){
  try{
    var raw=localStorage.getItem(STORAGE_KEY);
    if(!raw)return blankState();
    var parsed=JSON.parse(raw);
    if(!parsed||!Array.isArray(parsed.clients))return blankState();
    parsed.settings=parsed.settings||{annual_goal:0,closed_gci:0};
    parsed.version=STATE_VERSION;
    return parsed;
  }catch(_error){return blankState();}
}
function saveState(){
  localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
}
function num(value){var n=Number(value);return Number.isFinite(n)?n:0;}
function money(value,compact){
  var n=num(value);
  if(compact&&Math.abs(n)>=1000000)return'$'+(n/1000000).toFixed(n>=10000000?1:2).replace(/\.0+$/,'')+'M';
  if(compact&&Math.abs(n)>=1000)return'$'+Math.round(n/1000)+'k';
  return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
}
function esc(value){return String(value==null?'':value).replace(/[&<>'"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c];});}
function stageById(id){return stages.find(function(stage){return stage.id===id;})||stages[0];}
function today(){var d=new Date();d.setHours(0,0,0,0);return d;}
function parseDate(value){if(!value)return null;var p=String(value).split('-').map(Number);if(p.length!==3||!p[0])return null;return new Date(p[0],p[1]-1,p[2]);}
function daysUntil(value){var d=parseDate(value);if(!d)return null;return Math.round((d-today())/DAY);}
function formatDate(value,short){var d=parseDate(value);if(!d)return'Not set';return new Intl.DateTimeFormat('en-US',short?{month:'short',day:'numeric'}:{month:'short',day:'numeric',year:'numeric'}).format(d);}
function dealValue(client){return num(client.transaction_value)||num(client.approved_amount)||num(client.search_max)||0;}
function potentialGci(client){
  var base=num(client.commission_flat);
  if(!base){base=dealValue(client)*(num(client.commission_rate)/100);}
  var referral=Math.max(0,Math.min(100,num(client.referral_fee)));
  return Math.max(0,base*(1-referral/100));
}
function weightedGci(client){return potentialGci(client)*stageById(client.stage).weight;}
function isOpen(client){return client.stage!=='closed'&&client.stage!=='nurture';}
function uid(){return'c_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);}
function toast(message,error){
  els.toast.textContent=message;
  els.toast.classList.toggle('error',!!error);
  els.toast.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer=setTimeout(function(){els.toast.classList.remove('show');},2600);
}
function currentFilters(){return{q:String(els.search.value||'').trim().toLowerCase(),type:els.typeFilter.value,attention:els.attentionFilter.value};}
function attentionFor(client){
  var items=[];
  if(client.stage==='closed')return items;
  var due=daysUntil(client.next_action_due);
  var approval=daysUntil(client.approval_expires);
  var closing=daysUntil(client.closing_date);
  var last=daysUntil(client.last_contact);
  if(client.priority==='critical')items.push({rank:1,type:'priority',label:'Critical priority',detail:'Client marked critical'});
  if(due!==null&&due<0)items.push({rank:1,type:'overdue',label:'Next action overdue',detail:(client.next_action||'Follow up')+' · '+Math.abs(due)+' day'+(Math.abs(due)===1?'':'s')+' late'});
  else if(due===0)items.push({rank:2,type:'today',label:'Next action due today',detail:client.next_action||'Follow up'});
  if(!client.next_action&&client.stage!=='nurture')items.push({rank:3,type:'missing',label:'No next action',detail:'Assign the next step for this client'});
  if(last!==null&&last<-7&&client.stage!=='nurture')items.push({rank:4,type:'stale',label:'Contact is stale',detail:Math.abs(last)+' days since last contact'});
  if(approval!==null&&approval>=0&&approval<=30&&client.stage!=='closed')items.push({rank:4,type:'approval',label:'Pre-approval expiring',detail:formatDate(client.approval_expires,false)});
  if(closing!==null&&closing>=0&&closing<=30&&['under_contract','closing','clear_to_close'].indexOf(client.stage)>=0)items.push({rank:2,type:'closing',label:'Closing in '+closing+' day'+(closing===1?'':'s'),detail:formatDate(client.closing_date,false)});
  return items;
}
function clientMatches(client){
  var f=currentFilters();
  if(f.type!=='all'&&client.type!==f.type)return false;
  if(f.q){
    var hay=[client.name,client.target_areas,client.lender,client.next_action,client.property_address,client.source,client.email,client.phone].join(' ').toLowerCase();
    if(hay.indexOf(f.q)===-1)return false;
  }
  if(f.attention==='attention'&&!attentionFor(client).length)return false;
  if(f.attention==='overdue'&&!attentionFor(client).some(function(a){return a.type==='overdue';}))return false;
  if(f.attention==='closing30'){
    var dc=daysUntil(client.closing_date);
    if(dc===null||dc<0||dc>30)return false;
  }
  return true;
}
function render(){renderStats();renderBoard();renderAttention();renderClosings();renderPerformance();}
function renderStats(){
  var active=state.clients.filter(isOpen);
  var approved=active.filter(function(c){return(c.type==='buyer'||c.type==='investor')&&num(c.approved_amount)>0;}).reduce(function(s,c){return s+num(c.approved_amount);},0);
  var contract=state.clients.filter(function(c){return['under_contract','closing','clear_to_close'].indexOf(c.stage)>=0;}).reduce(function(s,c){return s+dealValue(c);},0);
  var potential=active.reduce(function(s,c){return s+potentialGci(c);},0);
  var weighted=active.reduce(function(s,c){return s+weightedGci(c);},0);
  var needs=active.filter(function(c){return attentionFor(c).length>0;}).length;
  els.statActive.textContent=active.length;
  els.statActiveSub.textContent=needs+' need'+(needs===1?'s':'')+' attention';
  els.statApproved.textContent=money(approved,true);
  els.statContract.textContent=money(contract,true);
  els.statPotential.textContent=money(potential,true);
  els.statWeighted.textContent=money(weighted,true);
}
function renderBoard(){
  var html=stages.map(function(stage){
    var clients=state.clients.filter(function(c){return c.stage===stage.id&&clientMatches(c);});
    var total=clients.reduce(function(s,c){return s+potentialGci(c);},0);
    var cards=clients.map(cardHtml).join('')||'<div class="re-empty-column">Drop a client here</div>';
    return'<section class="re-column" data-stage="'+stage.id+'"><div class="re-column-head"><div><h2>'+esc(stage.name)+'</h2><small>'+esc(stage.help)+'</small></div><span class="re-column-count">'+clients.length+'</span></div><div class="re-column-total">'+money(total,true)+' potential GCI · '+Math.round(stage.weight*100)+'% weight</div><div class="re-card-list">'+cards+'</div></section>';
  }).join('');
  els.board.innerHTML=html;
  bindBoardEvents();
}
function cardHtml(client){
  var due=daysUntil(client.next_action_due);
  var dueClass=due!==null&&due<0?' overdue':due===0?' today':'';
  var price=dealValue(client);
  var meta=client.type==='seller'?(client.property_address||'Seller opportunity'):(client.target_areas||client.property_address||'Search area not set');
  var financing=client.lender?client.lender+(client.loan_type?' · '+client.loan_type:''):(client.type==='seller'?'Listing pipeline':'Lender not set');
  var valueLabel=client.transaction_value?'Deal value':client.approved_amount?'Approved':'Target value';
  return'<article class="re-client-card" draggable="true" data-id="'+esc(client.id)+'">'+
    '<div class="re-card-top"><div><div class="re-card-name">'+esc(client.name||'Unnamed client')+'</div><div class="re-card-sub">'+esc(meta)+'</div></div><span class="re-card-type '+esc(client.type||'buyer')+'">'+esc(client.type||'buyer')+'</span></div>'+
    '<div class="re-card-sub">'+esc(financing)+'</div>'+
    '<div class="re-money-line"><div><span>'+valueLabel+'</span><b>'+money(price,true)+'</b></div><div class="weighted"><span>Weighted GCI</span><b>'+money(weightedGci(client),true)+'</b></div></div>'+
    '<div class="re-next'+dueClass+'"><b>'+esc(client.next_action||'No next action assigned')+'</b><span>'+esc(client.next_action_due?(due===0?'Due today':due!==null&&due<0?'Overdue · '+formatDate(client.next_action_due,true):'Due '+formatDate(client.next_action_due,true)):'Set a due date')+'</span></div>'+
    '<div class="re-card-foot"><div class="re-card-pills">'+(client.priority&&client.priority!=='normal'?'<span class="re-pill '+esc(client.priority)+'">'+esc(client.priority)+'</span>':'')+(client.closing_date?'<span class="re-pill">Close '+esc(formatDate(client.closing_date,true))+'</span>':'')+'</div><button class="re-card-edit" type="button" data-edit="'+esc(client.id)+'">Edit</button></div></article>';
}
function bindBoardEvents(){
  Array.prototype.forEach.call(document.querySelectorAll('.re-client-card'),function(card){
    card.addEventListener('dragstart',function(e){currentDragId=card.dataset.id;card.classList.add('dragging');e.dataTransfer.effectAllowed='move';try{e.dataTransfer.setData('text/plain',currentDragId);}catch(_error){}});
    card.addEventListener('dragend',function(){card.classList.remove('dragging');currentDragId=null;document.querySelectorAll('.re-column').forEach(function(col){col.classList.remove('drag-over');});});
    card.addEventListener('dblclick',function(){openClient(card.dataset.id);});
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-edit]'),function(btn){btn.addEventListener('click',function(e){e.stopPropagation();openClient(btn.dataset.edit);});});
  Array.prototype.forEach.call(document.querySelectorAll('.re-column'),function(col){
    col.addEventListener('dragover',function(e){e.preventDefault();col.classList.add('drag-over');});
    col.addEventListener('dragleave',function(e){if(!col.contains(e.relatedTarget))col.classList.remove('drag-over');});
    col.addEventListener('drop',function(e){
      e.preventDefault();col.classList.remove('drag-over');
      var id=currentDragId||e.dataTransfer.getData('text/plain');
      var client=state.clients.find(function(c){return c.id===id;});
      if(!client||client.stage===col.dataset.stage)return;
      client.stage=col.dataset.stage;
      client.updated_at=new Date().toISOString();
      saveState();render();toast(client.name+' moved to '+stageById(client.stage).name);
    });
  });
}
function renderAttention(){
  var alerts=[];
  state.clients.forEach(function(client){attentionFor(client).forEach(function(a){alerts.push({client:client,alert:a});});});
  alerts.sort(function(a,b){return a.alert.rank-b.alert.rank||(daysUntil(a.client.next_action_due)||999)-(daysUntil(b.client.next_action_due)||999);});
  els.attentionCount.textContent=alerts.length;
  if(!alerts.length){els.attentionList.innerHTML='<div class="re-empty">Nothing urgent right now. Add a next action to every active client to keep this queue useful.</div>';return;}
  els.attentionList.innerHTML=alerts.slice(0,16).map(function(item){var c=item.client,a=item.alert;return'<button type="button" class="re-attention-item '+esc(a.type)+'" data-open-client="'+esc(c.id)+'"><strong>'+esc(a.label)+'</strong><b>'+esc(c.name)+'</b><span>'+esc(a.detail)+'</span></button>';}).join('');
  Array.prototype.forEach.call(els.attentionList.querySelectorAll('[data-open-client]'),function(btn){btn.addEventListener('click',function(){openClient(btn.dataset.openClient);});});
}
function renderClosings(){
  var rows=state.clients.filter(function(c){return c.closing_date&&['under_contract','closing','clear_to_close','closed'].indexOf(c.stage)>=0;}).sort(function(a,b){return String(a.closing_date).localeCompare(String(b.closing_date));});
  if(!rows.length){els.closingList.innerHTML='<div class="re-empty">No dated closings yet. Add a closing date to an under-contract client and it will appear here.</div>';return;}
  els.closingList.innerHTML=rows.map(function(c){var d=parseDate(c.closing_date);return'<div class="re-closing-row" data-open-client="'+esc(c.id)+'"><div class="re-closing-date"><b>'+esc(d?new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric'}).format(d):'No date')+'</b><span>'+esc(d?d.getFullYear():'')+'</span></div><div class="re-closing-client"><b>'+esc(c.name)+'</b><span>'+esc(c.property_address||c.target_areas||'Address not set')+'</span></div><div class="re-closing-cell"><span>Deal value</span><b>'+money(dealValue(c))+'</b></div><div class="re-closing-cell"><span>Potential GCI</span><b>'+money(potentialGci(c))+'</b></div><span class="re-stage-badge">'+esc(stageById(c.stage).short)+'</span></div>';}).join('');
  Array.prototype.forEach.call(els.closingList.querySelectorAll('[data-open-client]'),function(row){row.addEventListener('click',function(){openClient(row.dataset.openClient);});});
}
function renderPerformance(){
  var trackedClosed=state.clients.filter(function(c){return c.stage==='closed';}).reduce(function(s,c){return s+potentialGci(c);},0);
  var closed=num(state.settings.closed_gci)+trackedClosed;
  var target=num(state.settings.annual_goal);
  var weighted=state.clients.filter(isOpen).reduce(function(s,c){return s+weightedGci(c);},0);
  var remaining=Math.max(0,target-closed);
  els.goalClosed.textContent=money(closed);
  els.goalTarget.textContent=money(target);
  els.goalWeighted.textContent=money(weighted);
  els.goalRemaining.textContent=money(remaining);
  els.goalProgress.style.width=(target?Math.min(100,closed/target*100):0)+'%';

  var forecast=stages.filter(function(s){return s.id!=='closed';}).map(function(stage){
    var cs=state.clients.filter(function(c){return c.stage===stage.id;});
    return{label:stage.name,count:cs.length,value:cs.reduce(function(sum,c){return sum+weightedGci(c);},0)};
  }).filter(function(x){return x.count;});
  els.stageForecast.innerHTML=forecast.length?forecast.map(function(x){return'<div class="re-metric-row"><div><b>'+esc(x.label)+'</b><span>'+x.count+' client'+(x.count===1?'':'s')+'</span></div><strong>'+money(x.value)+'</strong></div>';}).join(''):'<div class="re-empty">Stage forecasting will appear as you add clients.</div>';

  var sources={};
  state.clients.forEach(function(c){var key=String(c.source||'Unspecified').trim()||'Unspecified';if(!sources[key])sources[key]={count:0,gci:0};sources[key].count++;sources[key].gci+=c.stage==='closed'?potentialGci(c):weightedGci(c);});
  var sourceRows=Object.keys(sources).map(function(key){return{label:key,count:sources[key].count,value:sources[key].gci};}).sort(function(a,b){return b.value-a.value;});
  els.sourceMetrics.innerHTML=sourceRows.length?sourceRows.map(function(x){return'<div class="re-metric-row"><div><b>'+esc(x.label)+'</b><span>'+x.count+' client'+(x.count===1?'':'s')+'</span></div><strong>'+money(x.value)+'</strong></div>';}).join(''):'<div class="re-empty">Client source performance will appear here.</div>';

  var open=state.clients.filter(isOpen),views=open.reduce(function(s,c){return s+num(c.homes_viewed);},0),offers=open.reduce(function(s,c){return s+num(c.offers_written);},0),dated=open.filter(function(c){return c.next_action_due;}).length,missing=open.filter(function(c){return !c.next_action;}).length;
  els.activityMetrics.innerHTML=[
    ['Homes viewed',views,'Across active clients'],['Offers written',offers,'Across active clients'],['Next actions dated',dated,open.length?Math.round(dated/open.length*100)+'% of active clients':'No active clients'],['Missing next action',missing,missing?'Needs cleanup':'Pipeline is assigned']
  ].map(function(x){return'<div class="re-metric-row"><div><b>'+esc(x[0])+'</b><span>'+esc(x[2])+'</span></div><strong>'+esc(x[1])+'</strong></div>';}).join('');
}
function populateStageSelect(){els.formStage.innerHTML=stages.map(function(s){return'<option value="'+s.id+'">'+esc(s.name)+'</option>';}).join('');}
function openClient(id){
  var form=els.clientForm;
  form.reset();
  var client=id?state.clients.find(function(c){return c.id===id;}):null;
  els.clientTitle.textContent=client?'Edit '+client.name:'Add client';
  els.clientDelete.hidden=!client;
  var data=client||{id:'',type:'buyer',stage:'qualifying',priority:'normal',commission_rate:'2.5',referral_fee:'0'};
  Object.keys(data).forEach(function(key){if(form.elements[key])form.elements[key].value=data[key]==null?'':data[key];});
  els.clientDialog.showModal();
  setTimeout(function(){var first=form.elements.name;if(first)first.focus();},50);
}
function serializeForm(form){
  var fd=new FormData(form),out={};
  fd.forEach(function(value,key){out[key]=typeof value==='string'?value.trim():value;});
  return out;
}
function saveClient(e){
  e.preventDefault();
  var data=serializeForm(els.clientForm);
  if(!data.name){toast('Client name is required.',true);return;}
  var existing=data.id?state.clients.find(function(c){return c.id===data.id;}):null;
  var now=new Date().toISOString();
  if(existing){Object.assign(existing,data,{updated_at:now});}
  else{data.id=uid();data.created_at=now;data.updated_at=now;state.clients.push(data);}
  saveState();els.clientDialog.close();render();toast(existing?'Client updated.':'Client added to pipeline.');
}
function deleteClient(){
  var id=els.clientForm.elements.id.value;
  var client=state.clients.find(function(c){return c.id===id;});
  if(!client)return;
  if(!window.confirm('Delete '+client.name+' from the real estate command center?'))return;
  state.clients=state.clients.filter(function(c){return c.id!==id;});
  saveState();els.clientDialog.close();render();toast('Client deleted.');
}
function openGoal(){els.goalForm.elements.annual_goal.value=num(state.settings.annual_goal)||'';els.goalForm.elements.closed_gci.value=num(state.settings.closed_gci)||'';els.goalDialog.showModal();}
function saveGoal(e){e.preventDefault();state.settings.annual_goal=num(els.goalForm.elements.annual_goal.value);state.settings.closed_gci=num(els.goalForm.elements.closed_gci.value);saveState();els.goalDialog.close();render();toast('Production goal updated.');}
function backup(){
  var payload=JSON.stringify({version:STATE_VERSION,exported_at:new Date().toISOString(),settings:state.settings,clients:state.clients},null,2);
  var blob=new Blob([payload],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='watchdog-real-estate-backup-'+new Date().toISOString().slice(0,10)+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},1000);toast('Private workspace backup downloaded.');
}
function restore(file){
  if(!file)return;
  var reader=new FileReader();
  reader.onload=function(){
    try{
      var parsed=JSON.parse(String(reader.result||''));
      if(!parsed||!Array.isArray(parsed.clients))throw new Error('Invalid backup');
      if(!window.confirm('Replace the current Real Estate Command Center with this backup?'))return;
      state={version:STATE_VERSION,settings:parsed.settings||{annual_goal:0,closed_gci:0},clients:parsed.clients};
      saveState();render();toast('Workspace restored.');
    }catch(_error){toast('That file is not a valid Watchdog real estate backup.',true);}
    els.importFile.value='';
  };
  reader.readAsText(file);
}
function switchView(view){
  document.querySelectorAll('.re-view-tabs button').forEach(function(btn){btn.classList.toggle('active',btn.dataset.view===view);});
  document.querySelectorAll('.re-view').forEach(function(section){section.classList.toggle('active',section.id==='view-'+view);});
}
function cacheEls(){
  els={
    board:document.getElementById('re-board'),toast:document.getElementById('re-toast'),search:document.getElementById('re-search'),typeFilter:document.getElementById('re-type-filter'),attentionFilter:document.getElementById('re-attention-filter'),
    statActive:document.getElementById('stat-active'),statActiveSub:document.getElementById('stat-active-sub'),statApproved:document.getElementById('stat-approved'),statContract:document.getElementById('stat-contract'),statPotential:document.getElementById('stat-potential'),statWeighted:document.getElementById('stat-weighted'),
    attentionCount:document.getElementById('attention-count'),attentionList:document.getElementById('re-attention-list'),closingList:document.getElementById('re-closing-list'),
    goalClosed:document.getElementById('goal-closed'),goalTarget:document.getElementById('goal-target'),goalWeighted:document.getElementById('goal-weighted'),goalRemaining:document.getElementById('goal-remaining'),goalProgress:document.getElementById('goal-progress'),stageForecast:document.getElementById('re-stage-forecast'),sourceMetrics:document.getElementById('re-source-metrics'),activityMetrics:document.getElementById('re-activity-metrics'),
    clientDialog:document.getElementById('client-dialog'),clientForm:document.getElementById('client-form'),clientTitle:document.getElementById('client-dialog-title'),clientDelete:document.getElementById('client-delete'),formStage:document.getElementById('form-stage'),goalDialog:document.getElementById('goal-dialog'),goalForm:document.getElementById('goal-form'),importFile:document.getElementById('re-import-file')
  };
}
function bind(){
  document.getElementById('re-add-client').addEventListener('click',function(){openClient();});
  document.getElementById('re-settings').addEventListener('click',openGoal);
  document.getElementById('goal-edit-inline').addEventListener('click',openGoal);
  document.getElementById('re-export').addEventListener('click',backup);
  document.getElementById('re-import').addEventListener('click',function(){els.importFile.click();});
  els.importFile.addEventListener('change',function(){restore(els.importFile.files&&els.importFile.files[0]);});
  els.clientForm.addEventListener('submit',saveClient);
  els.clientDelete.addEventListener('click',deleteClient);
  els.goalForm.addEventListener('submit',saveGoal);
  [els.search,els.typeFilter,els.attentionFilter].forEach(function(el){el.addEventListener(el.tagName==='INPUT'?'input':'change',render);});
  document.querySelectorAll('.re-view-tabs button').forEach(function(btn){btn.addEventListener('click',function(){switchView(btn.dataset.view);});});
  document.querySelectorAll('[data-close]').forEach(function(btn){btn.addEventListener('click',function(){var dialog=document.getElementById(btn.dataset.close);if(dialog)dialog.close();});});
  [els.clientDialog,els.goalDialog].forEach(function(dialog){dialog.addEventListener('click',function(e){if(e.target===dialog)dialog.close();});});
}
function init(){cacheEls();populateStageSelect();bind();render();}

var access=window.njptrAccessReady&&typeof window.njptrAccessReady.then==='function'?window.njptrAccessReady:Promise.resolve();
access.then(init).catch(function(){});
})();
