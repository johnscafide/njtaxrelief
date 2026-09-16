(function(){
'use strict';
if(window.__WATCHDOG_TRANSACTION_EVIDENCE_FIRST__)return;
window.__WATCHDOG_TRANSACTION_EVIDENCE_FIRST__=true;

const REFERENCE_LINKS=[
  ['NJ flood disclosure','https://dep.nj.gov/flooddisclosure/'],
  ['Private Well Testing Act','https://dep.nj.gov/privatewells/pwta/'],
  ['Federal lead disclosure','https://www.epa.gov/lead/lead-based-paint-disclosure-rule-section-1018-title-x'],
  ['NJ UCC search','https://www.nj.gov/treasury/revenue/dcr/geninfo/uccsrch.shtml'],
  ['NJ deed recording / RTF','https://www.nj.gov/treasury/taxation/realty.shtml'],
  ['NJDEP Recycle Coach','https://dep.nj.gov/dshw/rhwm/recycle-coach/']
];
const invoked=new Map();let client=null,timer=0,busy=false;
const clean=v=>String(v==null?'':v).trim();
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function payload(item){return item&&item.payload&&typeof item.payload==='object'?item.payload:{}}
function getClient(){if(client)return client;try{client=window.NJPTRSupabaseRuntime&&window.NJPTRSupabaseRuntime.createClient?window.NJPTRSupabaseRuntime.createClient():null}catch(e){console.warn('Evidence-first client unavailable',e)}return client}
function activeId(){return clean(document.querySelector('.tx-list-card.active')?.dataset?.txId)}
function fmtDate(v){if(!v)return'';const d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):clean(v)}
function link(url,label){return url?`<a class="tx-source-link" href="${esc(url)}" target="_blank" rel="noopener">${esc(label)} <i class="fas fa-arrow-up-right-from-square"></i></a>`:''}
function fact(label,value){return value?`<div class="tx-inline-fact"><span>${esc(label)}</span><b>${esc(value)}</b></div>`:''}
function list(values){const a=(Array.isArray(values)?values:[]).filter(Boolean);return a.length?`<ul class="tx-inline-list">${a.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}

function addStyle(){
  if(document.querySelector('link[data-transaction-evidence-first]'))return;
  const l=document.createElement('link');l.rel='stylesheet';l.href='/transaction/evidence-first.css?v=20260916b';l.dataset.transactionEvidenceFirst='true';document.head.appendChild(l);
}
function cardByTitle(re){return Array.from(document.querySelectorAll('#tx-source-sweep .tx-source-card')).find(c=>re.test(clean(c.querySelector('strong')?.textContent)))}
function bodyHost(card){return card?.querySelector('.tx-source-provenance')||card?.querySelector('.tx-source-actions')||null}
function replaceCardBody(card,html){
  if(!card)return;const strong=card.querySelector(':scope>strong'),stop=bodyHost(card);if(!strong)return;
  let n=strong.nextElementSibling;while(n&&n!==stop){const next=n.nextElementSibling;if(!n.classList.contains('tx-clearance-workflow'))n.remove();n=next}
  strong.insertAdjacentHTML('afterend',html);
}
function setStatus(card,label,cls){
  if(!card)return;card.classList.remove('checked','review','search','attention','missing');card.classList.add(cls||'review');
  const s=card.querySelector('.tx-source-status');if(s)s.textContent=label;
}
function demoteLinks(card){
  if(!card||card.querySelector('.tx-evidence-secondary-links'))return;
  const actions=card.querySelector(':scope>.tx-source-actions');if(!actions||!clean(actions.textContent))return;
  const details=document.createElement('details');details.className='tx-evidence-secondary-links';details.innerHTML='<summary>Official source links</summary><div></div>';details.querySelector('div').append(...Array.from(actions.childNodes));actions.replaceWith(details);
}

function violationHtml(item){
  const p=payload(item),records=Array.isArray(p.records)?p.records:[],searched=p.search_state==='completed'||p.search_completed===true,route=Boolean(p.official_code_source_discovered||p.official_code_enforcement_route||item.source_type==='official_manual');
  if(searched){
    return `<div class="tx-evidence-box tx-evidence-first-card"><div class="tx-evidence-kicker">Parcel violation search completed</div><div class="tx-inline-fact-grid">${fact('Block / Lot',[p.block,p.lot].filter(Boolean).join(' / '))}${fact('Records found',String(records.length||Number(p.record_count||0)))}</div>${records.length?`<div class="tx-record-stack">${records.slice(0,8).map(r=>`<div class="tx-record"><b>${esc(r.type||r.violation_type||r.status||'Violation record')}</b><span>${esc(r.date||r.opened_date||'')}</span>${r.description?`<small>${esc(r.description)}</small>`:''}</div>`).join('')}</div>`:'<div class="tx-evidence-empty good"><i class="fas fa-circle-check"></i><div><b>No records returned by the completed official search</b><span>This statement is limited to the source and search time shown on this card.</span></div></div>'}<p class="tx-inline-note">${esc(p.result_semantics||item.description||'Official parcel search result.')}</p></div>`;
  }
  if(route){
    return `<div class="tx-evidence-box tx-evidence-first-card"><div class="tx-evidence-kicker">Official municipal code route connected</div><div class="tx-inline-fact-grid">${fact('Municipality',p.municipality||'Municipal code office')}${fact('Block / Lot',[p.block,p.lot].filter(Boolean).join(' / '))}${fact('Provider',item.source_label||p.provider_label||'Official code office')}${fact('Parcel search','Manual verification required')}</div><p class="tx-inline-note">Watchdog has the authoritative department route for this property. This municipality does not currently expose a governed parcel-level violation search that Watchdog can safely complete automatically, so the status remains Review instead of incorrectly saying Not connected or None found.</p></div>`;
  }
  return `<p class="tx-source-copy">${esc(item.description||'A governed parcel-level code-violation source has not been connected yet.')}</p>`;
}
function patchViolation(item){
  const card=cardByTitle(/code\s*\/\s*violations|open violations/i);if(!card||!item)return;const p=payload(item),searched=p.search_state==='completed'||p.search_completed===true,records=Array.isArray(p.records)?p.records:[],route=Boolean(p.official_code_source_discovered||p.official_code_enforcement_route||item.source_type==='official_manual');
  if(searched)setStatus(card,records.length||Number(p.record_count||0)>0?'Records found':'Search complete',records.length||Number(p.record_count||0)>0?'attention':'checked');else if(route)setStatus(card,'Official route','review');
  replaceCardBody(card,violationHtml(item));demoteLinks(card);
}

function serviceHtml(item){
  const p=payload(item),resolved=p.address_schedule_resolved===true,co=p.recycling_coordinator&&typeof p.recycling_coordinator==='object'?p.recycling_coordinator:{};
  const specials=Array.isArray(p.special_collections)?p.special_collections:[];
  return `<div class="tx-evidence-box tx-evidence-first-card"><div class="tx-evidence-kicker">Municipal services retrieved</div><div class="tx-inline-fact-grid">${fact('Municipality',p.municipality)}${fact('Service provider',p.service_provider)}${fact('Regular trash',resolved?p.trash_day:'Route-based; address day not safely resolved')}${fact('Public works',p.phone||co.phone)}</div>${p.recycling?`<p class="tx-inline-note"><b>Recycling:</b> ${esc(p.recycling)}</p>`:''}${p.bulk_trash?`<p class="tx-inline-note"><b>Bulk pickup:</b> ${esc(p.bulk_trash)}</p>`:''}${p.yard_waste?`<p class="tx-inline-note"><b>Yard waste:</b> ${esc(p.yard_waste)}</p>`:''}${specials.length?`<p class="tx-inline-note"><b>Special collections</b></p>${list(specials)}`:''}<p class="tx-inline-note">${esc(p.result_semantics||item.description||'Municipal service information is limited to the authoritative source data retrieved.')}</p></div>`;
}
function environmentalHtml(item){
  const p=payload(item),nj=p.njdep||{},fe=p.fema||{},records=Array.isArray(nj.records)?nj.records:[];
  const details=[];records.forEach(r=>{if(r.deed_notice)details.push(`Deed notice: ${r.deed_notice}`);if(r.cea)details.push(`Classification Exception Area: ${r.cea}`);if(r.regulated_ust)details.push(`Regulated UST: ${r.regulated_ust}`);if(r.case_status||r.preferred_id)details.push(`NJDEP case: ${[r.preferred_id,r.case_status].filter(Boolean).join(' · ')}`)});
  return `<div class="tx-evidence-box tx-evidence-first-card"><div class="tx-evidence-kicker">Exact parcel + mapped flood evidence</div><div class="tx-inline-fact-grid">${fact('NJDEP exact parcel records',String(records.length))}${fact('FEMA flood zone',fe.flood_zone||'No zone returned')}${fact('Special Flood Hazard Area',fe.sfha||'Not stated')}${fact('Address match',fe.geocode?.matched_address||'Not available')}</div>${details.length?list(details.slice(0,10)):'<div class="tx-evidence-empty good"><i class="fas fa-circle-check"></i><div><b>No exact NJDEP SRP parcel record returned</b><span>This is limited to the exact parcel source checked and is not an environmental clearance.</span></div></div>'}<p class="tx-inline-note">${esc(p.result_semantics||item.description||'Official environmental evidence retrieved.')}</p></div>`;
}
function appendEvidenceCard(item,title,icon,html,status,cls,key){
  const grid=document.querySelector('#tx-source-sweep .tx-source-grid');if(!grid||!item)return;
  let card=grid.querySelector(`[data-evidence-first-key="${key}"]`);if(!card){card=document.createElement('article');card.className=`tx-source-card ${cls||'review'} tx-evidence-first-card`;card.dataset.evidenceFirstKey=key;grid.appendChild(card)}
  const checked=item.source_checked_at?fmtDate(item.source_checked_at):'';
  card.innerHTML=`<div class="tx-source-card-top"><span class="tx-source-card-icon"><i class="fas ${icon}"></i></span><span class="tx-source-status">${esc(status)}</span></div><strong>${esc(title)}</strong>${html}<div class="tx-source-provenance"><span>${esc(item.source_label||item.source_type||'Official source')}</span>${checked?`<small>Checked ${esc(checked)}</small>`:''}</div><div class="tx-source-actions">${link(item.source_url,'Official source')}</div>`;demoteLinks(card);
}
function patchServices(item){if(!item)return;const p=payload(item);appendEvidenceCard(item,item.title||'Municipal services / move-in','fa-trash-can',serviceHtml(item),p.address_schedule_resolved?'Address schedule':'Municipal rules','checked','municipal_services')}
function patchEnvironment(item){if(!item)return;const p=payload(item),nj=p.njdep||{},attention=nj.control_or_ust_observed||nj.case_record_observed||item.evidence_state==='issue_observed';appendEvidenceCard(item,item.title||'Environmental / deed controls','fa-shield-halved',environmentalHtml(item),attention?'Attention':'Sources checked',attention?'attention':'checked','environmental_controls')}

function referenceLibrary(){
  const detail=document.getElementById('tx-detail'),sweep=document.getElementById('tx-source-sweep');if(!detail||detail.hidden||!sweep)return;
  const old=document.getElementById('tx-closing-source-pack');if(old)old.setAttribute('hidden','');
  let box=document.getElementById('tx-reference-library');if(!box){box=document.createElement('details');box.id='tx-reference-library';box.className='tx-reference-library';sweep.insertAdjacentElement('afterend',box)}
  box.innerHTML=`<summary>Official reference library <span aria-hidden="true">·</span> forms and rules</summary><p>Watchdog keeps evidence in the cards above. These links are secondary references for forms, legal requirements and government tools when a closing professional needs the underlying source.</p><div class="tx-reference-links">${REFERENCE_LINKS.map(([l,u])=>link(u,l)).join('')}</div>`;
}
async function invokeEvidence(txId){
  const c=getClient();if(!c||!txId)return;const last=invoked.get(txId)||0;if(Date.now()-last<60000)return;invoked.set(txId,Date.now());
  const calls=['transaction-municipal-services','transaction-environmental-evidence'].map(name=>c.functions.invoke(name,{body:{transaction_ids:[txId]}}).catch(e=>({error:e})));
  const results=await Promise.all(calls);results.forEach((r,i)=>{if(r?.error)console.warn('Transaction evidence augmenter failed',i,r.error)});
}
async function loadItems(txId){const c=getClient();if(!c)return{};const r=await c.from('transaction_items').select('item_key,title,evidence_state,severity,source_type,source_label,source_url,source_checked_at,description,payload').eq('transaction_id',txId).in('item_key',['open_violations','municipal_services','environmental_controls']);if(r.error)return{};return Object.fromEntries((r.data||[]).map(x=>[x.item_key,x]))}
async function refresh(){
  if(busy)return;const txId=activeId(),sweep=document.getElementById('tx-source-sweep');if(!txId||!sweep)return;busy=true;
  try{
    await invokeEvidence(txId);
    const items=await loadItems(txId);
    patchViolation(items.open_violations);patchServices(items.municipal_services);patchEnvironment(items.environmental_controls);
    document.querySelectorAll('#tx-source-sweep .tx-source-card').forEach(demoteLinks);
    const head=sweep.querySelector('.tx-source-sweep-head h3'),copy=sweep.querySelector('.tx-source-sweep-head p');if(head)head.textContent='Evidence retrieved for this property';if(copy)copy.textContent='Watchdog brings the evidence into this workspace first. A source link is secondary and does not substitute for a completed authoritative search.';
    referenceLibrary();
  }catch(e){console.warn('Evidence-first render failed',e)}finally{busy=false}
}
function schedule(delay){clearTimeout(timer);timer=setTimeout(refresh,delay==null?220:delay)}

addStyle();
document.addEventListener('click',e=>{if(e.target.closest('.tx-list-card'))schedule(700)});
document.addEventListener('watchdog:transaction-preflight-complete',()=>schedule(600));
const observer=new MutationObserver(muts=>{if(busy)return;for(const m of muts){if(Array.from(m.addedNodes).some(n=>n.nodeType===1&&(n.matches?.('#tx-source-sweep,.tx-source-grid,.tx-source-card')||n.querySelector?.('#tx-source-sweep,.tx-source-grid,.tx-source-card')))){schedule(180);break}}});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{observer.observe(document.body,{childList:true,subtree:true});schedule(1200)},{once:true});else{observer.observe(document.body,{childList:true,subtree:true});schedule(1200)}
})();
