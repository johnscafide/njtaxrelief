(function(){
'use strict';
if(!window.NJPTRSupabaseRuntime)return;
var db=window.NJPTRSupabaseRuntime.createClient(),user=null,saved=[],packs=[],shortlists=[],shortlistItems=[],openHouses=[],leads=[],transactions=[],activePack='',activeShortlist='',activeOpenHouse='';
var $=function(s,r){return(r||document).querySelector(s)},$$=function(s,r){return Array.from((r||document).querySelectorAll(s))};
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function clean(v){return String(v==null?'':v).trim()}
function money(v){var n=Number(v);return Number.isFinite(n)?n.toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}):'—'}
function number(v){var n=Number(v);return Number.isFinite(n)?Math.round(n).toLocaleString():'—'}
function date(v){if(!v)return'Not scheduled';var d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}):'Not scheduled'}
function toast(m){var n=$('#awf-toast');n.textContent=m;n.hidden=false;clearTimeout(n._t);n._t=setTimeout(function(){n.hidden=true},2800)}
function modal(template){var t=$(template),body=$('#awf-modal-body');body.innerHTML='';body.appendChild(t.content.cloneNode(true));fillSaved(body);$('#awf-modal').hidden=false}
function closeModal(){$('#awf-modal').hidden=true}
function fillSaved(root){$$('[data-saved-select]',root||document).forEach(function(sel){saved.forEach(function(p){var o=document.createElement('option');o.value=p.id;o.textContent=p.address+(p.town?' · '+p.town:'');sel.appendChild(o)})})}
function chosen(fd){var id=clean(fd.get('saved_property_id')),p=saved.find(function(x){return x.id===id});var address=clean(fd.get('address'));return p||{address:address}}
function snapshot(p){return{saved_property_id:p.id||null,pams_pin:p.pams_pin||null,address:p.address||'',city:p.city||null,town:p.town||null,municipality:p.town||null,county:p.county||null,postal_code:p.zip||null,assessed:p.assessed==null?null:Number(p.assessed),last_year_tax:p.last_year_tax==null?null:Number(p.last_year_tax),watchdog_value:p.watchdog_value==null?null:Number(p.watchdog_value),captured_at:new Date().toISOString()}}
async function entitlement(){var r=await db.rpc('get_my_entitlement'),raw=r.data,ent=Array.isArray(raw)?raw[0]:raw;if(r.error)throw r.error;return ent||{}}
async function loadAll(){
  var results=await Promise.all([
    db.from('saved_properties').select('id,pams_pin,address,city,town,county,zip,assessed,last_year_tax,watchdog_value').eq('user_id',user.id).order('updated_at',{ascending:false}).limit(500),
    db.from('agent_listing_packs').select('*').eq('user_id',user.id).order('updated_at',{ascending:false}),
    db.from('agent_buyer_shortlists').select('*').eq('user_id',user.id).order('updated_at',{ascending:false}),
    db.from('agent_buyer_shortlist_properties').select('*').eq('user_id',user.id).order('sort_order').order('created_at'),
    db.from('agent_open_houses').select('*').eq('user_id',user.id).order('created_at',{ascending:false}),
    db.from('agent_portal_leads').select('id,open_house_id,full_name,email,phone,source,created_at').eq('agent_user_id',user.id).eq('source','open_house').order('created_at',{ascending:false}).limit(300),
    db.from('transaction_workspaces').select('id,address,city,status,side,closing_date,client_label,updated_at').eq('user_id',user.id).order('updated_at',{ascending:false}).limit(100)
  ]);
  results.forEach(function(r){if(r.error)throw r.error});
  saved=results[0].data||[];packs=results[1].data||[];shortlists=results[2].data||[];shortlistItems=results[3].data||[];openHouses=results[4].data||[];leads=results[5].data||[];transactions=results[6].data||[];
  renderAll();
}
function renderAll(){renderPacks();renderShortlists();renderOpenHouses();renderClients()}
function selectList(host,rows,active,cb,label,sub){
  host.innerHTML=rows.length?rows.map(function(r){return'<button type="button" class="'+(active===r.id?'active':'')+'" data-id="'+esc(r.id)+'"><b>'+esc(label(r))+'</b><span>'+esc(sub(r))+'</span></button>'}).join(''):'<div class="awf-empty" style="min-height:180px"><span>Nothing here yet.</span></div>';
  $$('button[data-id]',host).forEach(function(b){b.addEventListener('click',function(){cb(b.dataset.id)})});
}
function renderPacks(){
  $('#awf-pack-count').textContent=packs.length;
  selectList($('#awf-pack-list'),packs,activePack,function(id){activePack=id;renderPacks()},function(r){return r.address},function(r){return(r.client_label? r.client_label+' · ':'')+(r.status==='ready'?'Ready':'In progress')});
  var host=$('#awf-pack-detail'),p=packs.find(function(x){return x.id===activePack});if(!p){host.className='awf-detail awf-empty';host.innerHTML='<i class="fa-solid fa-sign-hanging"></i><b>Select a listing pack</b><span>Or create one from a saved property.</span>';return}
  host.className='awf-detail';var s=p.property_snapshot||{},checks=p.checklist||{},qs=encodeURIComponent(p.address),report='/property/report-builder/?pams_pin='+encodeURIComponent(p.pams_pin||'')+'&preset=real_estate_agent&title='+encodeURIComponent('Listing Prep · '+p.address),tx='/transaction/?prefill_address='+qs+'&prefill_side=seller&prefill_client='+encodeURIComponent(p.client_label||'');
  var definitions=[
    ['property_record','Property record reviewed','Assessment, taxes, parcel identity and recorded property context.','/?address='+qs],
    ['permits','Permit / construction history reviewed','Confirm open or recent permit records before the appointment.','/?address='+qs],
    ['resale','CO / CCO / resale requirements reviewed','Municipality-specific resale rules can affect timing and seller preparation.','/transaction/?prefill_address='+qs+'&prefill_side=seller'],
    ['fire','Smoke / fire certificate requirements reviewed','Confirm local smoke, CO and fire certification responsibilities.','/transaction/?prefill_address='+qs+'&prefill_side=seller'],
    ['utilities','Water / sewer / solar questions reviewed','Flag payoff, final-reading, solar lease or municipal utility follow-up.','/transaction/?prefill_address='+qs+'&prefill_side=seller'],
    ['history','Sale / assessment history reviewed','Prepare a factual property history conversation; do not substitute this for an MLS CMA.','/?address='+qs],
    ['client_brief','Client-ready brief prepared','Use Watchdog Report Builder for a sourced handout. ',report]
  ];
  host.innerHTML='<div class="awf-detail-head"><div><span>LISTING PREP PACK</span><h2>'+esc(p.address)+'</h2><p>'+esc([s.town||p.municipality,p.county&&p.county+' County',p.client_label].filter(Boolean).join(' · '))+'</p></div><div class="awf-actions"><button data-copy-pack>Copy appointment brief</button><a href="'+esc(report)+'">Build report</a><a class="primary" href="'+esc(tx)+'">Start seller transaction</a></div></div>'
    +'<div class="awf-metrics"><div class="awf-metric"><span>ASSESSED VALUE</span><b>'+money(s.assessed)+'</b></div><div class="awf-metric"><span>ANNUAL TAX</span><b>'+money(s.last_year_tax)+'</b></div><div class="awf-metric"><span>WATCHDOG VALUE</span><b>'+money(s.watchdog_value)+'</b></div></div>'
    +'<div class="awf-checks">'+definitions.map(function(d){return'<label class="awf-check"><input type="checkbox" data-pack-check="'+d[0]+'" '+(checks[d[0]]?'checked':'')+'><span><b>'+d[1]+'</b><small>'+d[2]+'</small></span><a href="'+esc(d[3])+'">Open</a></label>'}).join('')+'</div>';
  $$('[data-pack-check]',host).forEach(function(input){input.addEventListener('change',async function(){var next=Object.assign({},p.checklist||{});next[input.dataset.packCheck]=input.checked;var ready=definitions.every(function(d){return!!next[d[0]]});var r=await db.from('agent_listing_packs').update({checklist:next,status:ready?'ready':'draft',updated_at:new Date().toISOString()}).eq('id',p.id).eq('user_id',user.id).select().single();if(!r.error){Object.assign(p,r.data);renderPacks()}})});
  $('[data-copy-pack]',host).addEventListener('click',function(){var t='Listing prep · '+p.address+'\nAssessment: '+money(s.assessed)+'\nAnnual tax: '+money(s.last_year_tax)+'\nWatchdog value: '+money(s.watchdog_value)+'\n\nWatchdog public-record context supplements, but does not replace, an MLS CMA or municipal/title verification.';navigator.clipboard&&navigator.clipboard.writeText(t).then(function(){toast('Listing brief copied.')})});
}
function renderShortlists(){
  $('#awf-shortlist-count').textContent=shortlists.length;
  selectList($('#awf-shortlist-list'),shortlists,activeShortlist,function(id){activeShortlist=id;renderShortlists()},function(r){return r.name},function(r){var c=shortlistItems.filter(function(x){return x.shortlist_id===r.id}).length;return c+' '+(c===1?'property':'properties')+(r.client_label?' · '+r.client_label:'')});
  var host=$('#awf-shortlist-detail'),s=shortlists.find(function(x){return x.id===activeShortlist});if(!s){host.className='awf-detail awf-empty';host.innerHTML='<i class="fa-solid fa-house-circle-check"></i><b>Select a buyer shortlist</b><span>Add up to 10 saved properties.</span>';return}
  var items=shortlistItems.filter(function(x){return x.shortlist_id===s.id}),used=new Set(items.map(function(x){return x.saved_property_id}).filter(Boolean)),available=saved.filter(function(x){return !used.has(x.id)});
  host.className='awf-detail';
  host.innerHTML='<div class="awf-detail-head"><div><span>BUYER SHORTLIST</span><h2>'+esc(s.name)+'</h2><p>'+esc(s.client_label||'Private buyer workspace')+'</p></div><div class="awf-actions"><button data-copy-shortlist>Copy client summary</button></div></div>'
    +(items.length?'<div class="awf-compare"><table><thead><tr><th>Property</th><th>Tax</th><th>Assessment</th><th>Watchdog value</th><th></th></tr></thead><tbody>'+items.map(function(p){var tx='/transaction/?prefill_address='+encodeURIComponent(p.address)+'&prefill_side=buyer&prefill_client='+encodeURIComponent(s.client_label||s.name);return'<tr><td><b>'+esc(p.address)+'</b><br><span>'+esc([p.town,p.county].filter(Boolean).join(' · '))+'</span></td><td>'+money(p.last_year_tax)+'</td><td>'+money(p.assessed)+'</td><td>'+money(p.watchdog_value)+'</td><td><a href="'+esc(tx)+'">Start transaction</a> · <button type="button" data-remove-shortlist="'+esc(p.id)+'">Remove</button></td></tr>'}).join('')+'</tbody></table></div>':'<div class="awf-empty" style="min-height:210px"><b>Add the homes your buyer is choosing between.</b></div>')
    +'<div class="awf-add-property"><select id="awf-shortlist-add"><option value="">Add a saved property</option>'+available.map(function(p){return'<option value="'+esc(p.id)+'">'+esc(p.address+(p.town?' · '+p.town:''))+'</option>'}).join('')+'</select></div>';
  $('#awf-shortlist-add').addEventListener('change',async function(){if(!this.value)return;if(items.length>=10){toast('A shortlist can contain up to 10 properties.');this.value='';return}var p=saved.find(x=>x.id===this.value);if(!p)return;var r=await db.from('agent_buyer_shortlist_properties').insert({shortlist_id:s.id,user_id:user.id,saved_property_id:p.id,pams_pin:p.pams_pin,address:p.address,town:p.town||p.city,county:p.county,assessed:p.assessed,last_year_tax:p.last_year_tax,watchdog_value:p.watchdog_value,sort_order:items.length}).select().single();if(r.error){toast('Could not add that property.');return}shortlistItems.push(r.data);await touchShortlist(s.id);renderShortlists()});
  $$('[data-remove-shortlist]',host).forEach(function(b){b.addEventListener('click',async function(){var id=b.dataset.removeShortlist,r=await db.from('agent_buyer_shortlist_properties').delete().eq('id',id).eq('user_id',user.id);if(!r.error){shortlistItems=shortlistItems.filter(x=>x.id!==id);await touchShortlist(s.id);renderShortlists()}})});
  $('[data-copy-shortlist]',host).addEventListener('click',function(){var lines=[s.name+(s.client_label?' · '+s.client_label:''),''];items.forEach(function(p,i){lines.push((i+1)+'. '+p.address+' | Tax '+money(p.last_year_tax)+' | Assessment '+money(p.assessed)+' | Watchdog value '+money(p.watchdog_value))});lines.push('','Public-record comparison only. Verify current listing details, financing and inspection/title matters independently.');navigator.clipboard&&navigator.clipboard.writeText(lines.join('\n')).then(function(){toast('Buyer summary copied.')})});
}
async function touchShortlist(id){await db.from('agent_buyer_shortlists').update({updated_at:new Date().toISOString()}).eq('id',id).eq('user_id',user.id)}
function renderOpenHouses(){
  $('#awf-open-house-count').textContent=openHouses.length;
  selectList($('#awf-open-house-list'),openHouses,activeOpenHouse,function(id){activeOpenHouse=id;renderOpenHouses()},function(r){return r.address},function(r){return date(r.event_at)+' · '+r.status});
  var host=$('#awf-open-house-detail'),o=openHouses.find(x=>x.id===activeOpenHouse);if(!o){host.className='awf-detail awf-empty';host.innerHTML='<i class="fa-solid fa-qrcode"></i><b>Select an open house</b><span>The QR is generated locally from its event link.</span>';return}
  var url=location.origin+'/open-house/?event='+encodeURIComponent(o.event_code),eventLeads=leads.filter(x=>x.open_house_id===o.id);
  host.className='awf-detail';host.innerHTML='<div class="awf-detail-head"><div><span>OPEN HOUSE QR</span><h2>'+esc(o.title||o.address)+'</h2><p>'+esc(o.address)+' · '+esc(date(o.event_at))+'</p></div><div class="awf-actions"><button data-copy-open>Copy link</button><a href="'+esc(url)+'" target="_blank" rel="noopener">Open visitor page</a><button class="primary" data-end-open>'+(o.status==='ended'?'Reopen event':'End event')+'</button></div></div><div class="awf-open-grid"><div class="awf-qr" id="awf-qr"></div><div><div class="awf-public-link">'+esc(url)+'</div><div class="awf-leads"><b>'+eventLeads.length+' consented visitor'+(eventLeads.length===1?'':'s')+'</b>'+eventLeads.slice(0,12).map(function(l){return'<div class="awf-lead"><div><b>'+esc(l.full_name)+'</b><span>'+esc([l.email,l.phone].filter(Boolean).join(' · '))+'</span></div><span>'+esc(date(l.created_at))+'</span></div>'}).join('')+'</div></div></div>';
  var qr=$('#awf-qr');if(window.QRCode)new QRCode(qr,{text:url,width:190,height:190,correctLevel:QRCode.CorrectLevel.M});
  $('[data-copy-open]',host).addEventListener('click',function(){navigator.clipboard&&navigator.clipboard.writeText(url).then(function(){toast('Open-house link copied.')})});
  $('[data-end-open]',host).addEventListener('click',async function(){var next=o.status==='ended'?'open':'ended',r=await db.from('agent_open_houses').update({status:next,updated_at:new Date().toISOString()}).eq('id',o.id).eq('user_id',user.id).select().single();if(!r.error){Object.assign(o,r.data);renderOpenHouses()}});
}
function renderClients(){
  var rows=transactions.filter(function(t){return!['closed','canceled'].includes(t.status)}),host=$('#awf-client-list');
  host.innerHTML=rows.length?rows.map(function(t){var href='/transaction/?select='+encodeURIComponent(t.id)+'&client_room=1';return'<article class="awf-client-card"><h3>'+esc(t.address)+'</h3><p>'+esc([t.client_label,t.side&&t.side.toUpperCase(),t.closing_date&&('Close '+t.closing_date)].filter(Boolean).join(' · '))+'</p><a href="'+esc(href)+'"><i class="fa-solid fa-people-roof"></i>&nbsp; Manage Client Room</a></article>'}).join(''):'<div class="awf-detail awf-empty"><b>No active transactions yet.</b><span>Create a transaction first, then share selected milestones and files.</span></div>';
}
async function createPack(e){e.preventDefault();var fd=new FormData(e.currentTarget),p=chosen(fd),address=clean(p.address||fd.get('address'));if(!address){toast('Choose a saved property or enter an address.');return}var s=snapshot(p),r=await db.from('agent_listing_packs').insert({user_id:user.id,address:address,city:s.city,municipality:s.town||s.municipality,county:s.county,postal_code:s.postal_code,pams_pin:s.pams_pin,client_label:clean(fd.get('client_label'))||null,notes:clean(fd.get('notes'))||null,property_snapshot:s,checklist:{}}).select().single();if(r.error){toast('Could not create listing pack.');return}packs.unshift(r.data);activePack=r.data.id;closeModal();renderPacks();toast('Listing prep pack created.')}
async function createShortlist(e){e.preventDefault();var fd=new FormData(e.currentTarget),name=clean(fd.get('name'));if(!name)return;var r=await db.from('agent_buyer_shortlists').insert({user_id:user.id,name:name,client_label:clean(fd.get('client_label'))||null,notes:clean(fd.get('notes'))||null}).select().single();if(r.error){toast('Could not create shortlist.');return}shortlists.unshift(r.data);activeShortlist=r.data.id;closeModal();renderShortlists();toast('Buyer shortlist created.')}
async function createOpenHouse(e){e.preventDefault();var fd=new FormData(e.currentTarget),p=chosen(fd),address=clean(p.address||fd.get('address'));if(!address){toast('Choose a property or enter an address.');return}var s=snapshot(p),event=clean(fd.get('event_at')),r=await db.from('agent_open_houses').insert({user_id:user.id,address:address,city:s.city,municipality:s.town||s.municipality,county:s.county,postal_code:s.postal_code,pams_pin:s.pams_pin,title:clean(fd.get('title'))||null,event_at:event?new Date(event).toISOString():null}).select().single();if(r.error){toast('Could not create open house.');return}openHouses.unshift(r.data);activeOpenHouse=r.data.id;closeModal();renderOpenHouses();toast('Open-house QR created.')}
function bind(){
  $$('.awf-tabs button').forEach(function(b){b.addEventListener('click',function(){$$('.awf-tabs button').forEach(x=>x.classList.toggle('active',x===b));$$('.awf-panel').forEach(function(p){p.hidden=p.dataset.panel!==b.dataset.view;p.classList.toggle('active',!p.hidden)})})});
  $('#awf-new-pack').onclick=function(){modal('#awf-pack-form-template');$('#awf-pack-form').addEventListener('submit',createPack)};
  $('#awf-new-shortlist').onclick=function(){modal('#awf-shortlist-form-template');$('#awf-shortlist-form').addEventListener('submit',createShortlist)};
  $('#awf-new-open-house').onclick=function(){modal('#awf-open-house-form-template');$('#awf-open-house-form').addEventListener('submit',createOpenHouse)};
  document.addEventListener('click',function(e){if(e.target.closest('[data-close-modal]'))closeModal()});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')closeModal()});
}
async function boot(){
  try{var a=await db.auth.getUser();user=a.data&&a.data.user;if(!user)return;var ent=await entitlement(),eligible=ent.account_role==='developer'||(['active','trialing','past_due','cancel_scheduled'].includes(ent.subscription_status)&&['agent','pro','pro_plus','teams'].includes(String(ent.plan_tier||'').replace('pro+','pro_plus')));if(!eligible)return;$('#awf-gate').hidden=true;$('#awf-app').hidden=false;bind();await loadAll()}catch(e){console.error('Agent workflows',e);toast('Agent workflows could not load.')}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();