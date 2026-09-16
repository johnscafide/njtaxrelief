(function(){
'use strict';
if(window.__WATCHDOG_TRANSACTION_AUTO_PREFLIGHT__)return;window.__WATCHDOG_TRANSACTION_AUTO_PREFLIGHT__=true;

const polish=document.createElement('link');polish.rel='stylesheet';polish.href='/transaction/polish.css?v=20260915c';document.head.appendChild(polish);

const canUseEvidence=()=>window.WatchdogTransactionAccess?.evidence===true;
const pending=new Set(),seen=new Set();let timer=null,client=null,flushBusy=false,renderTimer=null;
const clean=v=>String(v||'').trim();
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const SOURCE_KEYS=[
  ['ownership_vesting','Ownership','fa-user-shield'],
  ['deed_recording_reference','Deed record','fa-file-signature'],
  ['permit_certificate_lifecycle','Permits & certificates','fa-helmet-safety'],
  ['judgment_lien_search','Judgments & recorded liens','fa-scale-balanced'],
  ['lis_pendens_title_exceptions','Lis pendens / title filings','fa-gavel'],
  ['property_tax_status','Property taxes','fa-receipt'],
  ['tax_sale_delinquency','Tax sale / delinquency','fa-triangle-exclamation'],
  ['water_sewer','Water / sewer','fa-droplet'],
  ['municipal_lien_clearance','Municipal lien / clearance','fa-landmark'],
  ['resale_cco','Certificate of Occupancy (CO)','fa-house-circle-check'],
  ['smoke_fire_cert','Smoke / CO / fire','fa-fire-extinguisher'],
  ['open_violations','Code / violations','fa-building-shield'],
  ['watchdog_closing_review','Closing Review','fa-shield-halved']
];

function toast(message,type){const n=document.querySelector('#tx-toast');if(!n)return;n.textContent=message;n.className='tx-toast show '+(type||'');setTimeout(()=>{if(n.textContent===message)n.className='tx-toast'},3200)}
function getClient(){if(client)return client;try{client=window.NJPTRSupabaseRuntime&&window.NJPTRSupabaseRuntime.createClient?window.NJPTRSupabaseRuntime.createClient():null}catch(e){console.warn('Transaction preflight client unavailable',e)}return client}
function schedule(ids,delay){if(!canUseEvidence())return;(ids||[]).map(clean).filter(Boolean).forEach(id=>pending.add(id));clearTimeout(timer);timer=setTimeout(flush,delay==null?900:delay)}
function payloadOf(item){return item&&item.payload&&typeof item.payload==='object'?item.payload:{}}
function fmtDate(v){if(!v)return'';const d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):String(v).slice(0,10)}
function fmtMoney(v){if(v==null||String(v).trim()==='')return'';const n=Number(v);return Number.isFinite(n)?n.toLocaleString('en-US',{style:'currency',currency:'USD'}):''}

function stateMeta(item){
  const evidence=clean(item&&item.evidence_state),sourceType=clean(item&&item.source_type),p=payloadOf(item),records=Array.isArray(p.records)?p.records:[];
  if(p.search_state==='completed')return records.length||Number(p.record_count||0)>0?{label:'Records found',cls:'attention'}:{label:'None found',cls:'checked'};
  if(evidence==='issue_observed')return{label:'Issue observed',cls:'attention'};
  if(item&&item.item_key==='permit_certificate_lifecycle'&&Number(p.verification_candidates||p.candidate_records?.length||0)>0)return{label:'Attention',cls:'attention'};
  if(evidence==='clear_observed')return{label:'Checked',cls:'checked'};
  if(sourceType==='official_search_required')return{label:'Search required',cls:'search'};
  if(sourceType==='official_requirement')return{label:'Requirements',cls:'checked'};
  if(sourceType==='official_manual')return{label:'Official source',cls:'review'};
  if(evidence==='verify')return{label:'Review',cls:'review'};
  if(evidence==='provider_missing')return{label:'Not connected',cls:'missing'};
  return{label:'Not checked',cls:'missing'};
}
function sourceName(item){return clean(item&&item.source_label)||clean(item&&item.source_type).replace(/_/g,' ')||'No provider connected'}
function row(label,value){return value?`<div class="tx-evidence-row"><span>${esc(label)}</span><b>${esc(value)}</b></div>`:''}
function listRows(values,limit){const a=Array.isArray(values)?values.slice(0,limit||99):[];return a.length?`<ul class="tx-evidence-list">${a.map(v=>`<li>${esc(v)}</li>`).join('')}</ul>`:''}
function linkHtml(url,label){return url?`<a class="tx-source-link" href="${esc(url)}" target="_blank" rel="noopener">${esc(label||'Open official source')} <i class="fas fa-arrow-up-right-from-square"></i></a>`:''}

function evidenceBody(item){
  if(!item)return'<p class="tx-source-copy">No evidence result recorded yet.</p>';
  const p=payloadOf(item),key=item.item_key;
  if(key==='deed_recording_reference'){
    const e=p.evidence&&typeof p.evidence==='object'?p.evidence:p;
    const has=e.book||e.page||p.deed_book||p.deed_page;
    if(has)return `<div class="tx-evidence-box"><div class="tx-evidence-kicker">Retrieved deed reference</div>${row('Book',e.book||p.deed_book)}${row('Page',e.page||p.deed_page)}${row('Deed date',fmtDate(e.deed_date||p.deed_date))}${row('Block / Lot',[e.block,e.lot].filter(Boolean).join(' / '))}<p>Watchdog retrieved this recording reference from the state parcel/MOD-IV baseline. The county recorder remains authoritative for the document image and recording detail.</p></div>`;
  }
  if(key==='permit_certificate_lifecycle'){
    const records=Array.isArray(p.candidate_records)?p.candidate_records:[];
    if(records.length)return `<div class="tx-evidence-box"><div class="tx-evidence-kicker">Permit/certificate verification candidates</div><div class="tx-record-stack">${records.slice(0,6).map(r=>`<div class="tx-record"><b>${esc(r.permit_number||'Permit')}</b><span>${esc(fmtDate(r.permit_date)||'Date unavailable')}</span>${r.description?`<small>${esc(r.description)}</small>`:''}</div>`).join('')}</div><p>These are DCA lifecycle verification candidates, not a legal determination that the permits remain open. Confirm final closure with the municipality.</p></div>`;
    if(item.source_checked_at)return'<p class="tx-source-copy">NJ DCA was checked. No permit/certificate candidate detail is currently attached; municipal verification may still be required.</p>';
  }
  if(key==='judgment_lien_search'||key==='lis_pendens_title_exceptions'){
    const records=Array.isArray(p.records)?p.records:[];
    if(p.search_state==='completed'){
      if(!records.length)return '<div class="tx-evidence-empty good"><i class="fas fa-circle-check"></i><div><b>No records found in the checked official source</b><span>This statement is limited to the source, search scope and check time shown below.</span></div></div>';
      return `<div class="tx-record-stack">${records.slice(0,8).map(r=>`<div class="tx-record"><b>${esc(r.document_type||r.type||'Recorded filing')}</b><span>${esc(r.recorded_date||r.date||'Date unavailable')}</span>${r.reference?`<small>${esc(r.reference)}</small>`:''}${r.url?linkHtml(r.url,'View evidence'):''}</div>`).join('')}</div>`;
    }
    return `<div class="tx-evidence-empty search"><i class="fas fa-magnifying-glass"></i><div><b>Official search not yet run</b><span>${esc(p.reason||item.description||'Watchdog has identified the authoritative source, but has not completed the search.')}</span></div></div>`;
  }
  if(key==='resale_cco'||key==='smoke_fire_cert'){
    const req=Array.isArray(p.requirements)?p.requirements:[],fees=Array.isArray(p.fees)?p.fees:[];
    if(req.length)return `<div class="tx-evidence-box"><div class="tx-evidence-kicker">Official requirements retrieved</div>${listRows(req,5)}${req.length>5?`<details class="tx-evidence-details"><summary>Show all ${req.length} requirements</summary>${listRows(req,99)}</details>`:''}${fees.length?`<div class="tx-fee-grid">${fees.map(f=>`<span><b>${esc(f.label)}</b><em>${esc(f.amount)}</em></span>`).join('')}</div>`:''}</div>`;
  }
  if(key==='ownership_vesting'&&p.owner_name)return `<div class="tx-evidence-box">${row('Owner name on record',p.owner_name)}${row('Block / Lot',[p.block,p.lot].filter(Boolean).join(' / '))}<p>Compare this public-record name with the contract and title commitment. It is not a vesting determination.</p></div>`;
  if(key==='property_tax_status'){
    const current=fmtMoney(p.current_year_tax),last=fmtMoney(p.last_year_tax!=null?p.last_year_tax:p.prior_year_tax),hasState=p.source_state==='annual_modiv_checked'||p.release_id||p.tax_account_number||p.delinquent_flag!==undefined;
    if(hasState)return `<div class="tx-evidence-box"><div class="tx-evidence-kicker">2026 state tax-list evidence</div>${row('Tax account',p.tax_account_number)}${current?row('Current-year tax',current):''}${last?row('Prior-year tax',last):''}${row('Annual delinquency flag',p.delinquent_flag===true?'YES — MOD-IV code S':p.delinquent_flag===false?'No flag observed':'Not determined')}${p.bill_status_flag?row('Source bill-status flag',p.bill_status_flag):''}<p>${esc(p.result_semantics||item.description||'This annual tax-list source does not replace a live municipal balance or title/municipal lien search.')}</p></div>`;
    if(p.prior_year_tax!=null&&last)return `<div class="tx-evidence-box">${row('Prior-year tax baseline',last)}<p>Current payment/balance status still requires the collector or title/municipal search.</p></div>`;
  }
  if(key==='tax_sale_delinquency'&&p.annual_delinquency_source_checked){
    return `<div class="tx-evidence-box"><div class="tx-evidence-kicker">Annual delinquency evidence checked</div>${row('MOD-IV delinquency',p.delinquent_flag===true?'FLAGGED — code S':p.delinquent_flag===false?'No annual flag observed':'Not determined')}${p.delinquent_code?row('Source code',p.delinquent_code):''}${row('Tax-sale certificate',p.tax_sale_state==='not_determined'?'Not determined by this source':p.tax_sale_state)}<p>${esc(item.description||'The annual MOD-IV delinquency field is useful evidence, but tax-sale certificate status and current payoff remain separate municipal/title checks.')}</p></div>`;
  }
  if(key==='watchdog_closing_review'&&p.top_score!=null)return `<div class="tx-evidence-box">${row('Priority score',String(Math.round(Number(p.top_score))))}${row('Model evidence coverage',`${Math.round(Number(p.evidence_coverage||0))}%`)}<p>This prioritizes follow-up; it is not title, code, tax or municipal clearance.</p></div>`;
  const d=clean(item.description);return `<p class="tx-source-copy">${esc(d||'Source result available.')}</p>`;
}

function sourceLinks(item){
  const p=payloadOf(item),links=[];
  if(Array.isArray(p.official_sources))p.official_sources.forEach(s=>{if(s&&s.url)links.push([s.url,s.label||'Official source'])});
  if(p.official_record_source&&p.official_record_source.url)links.push([p.official_record_source.url,p.official_record_source.label||'County record']);
  if(p.application_url)links.push([p.application_url,'Open application']);
  if(p.department_url)links.push([p.department_url,'Department page']);
  if(item&&item.source_url)links.push([item.source_url,'Open source']);
  const seenUrls=new Set();return links.filter(([u])=>u&&!seenUrls.has(u)&&seenUrls.add(u)).slice(0,4).map(([u,l])=>linkHtml(u,l)).join('');
}

async function renderSourceSweep(id){if(!canUseEvidence())return;
  id=clean(id);if(!id)return;const c=getClient();if(!c)return;
  clearTimeout(renderTimer);renderTimer=setTimeout(async()=>{
    try{
      const [ir,tr]=await Promise.all([
        c.from('transaction_items').select('item_key,title,evidence_state,severity,source_type,source_label,source_url,source_checked_at,description,payload').eq('transaction_id',id).order('sort_order'),
        c.from('transaction_workspaces').select('id,address,block,lot,pams_pin,last_watch_at').eq('id',id).maybeSingle()
      ]);
      if(ir.error)return;const byKey=Object.fromEntries((ir.data||[]).map(x=>[x.item_key,x])),tx=tr.data||{};
      const tabs=document.querySelector('.tx-tabs');if(!tabs)return;
      let box=document.querySelector('#tx-source-sweep');if(!box){box=document.createElement('section');box.id='tx-source-sweep';box.className='tx-source-sweep';tabs.parentNode.insertBefore(box,tabs)}
      const cards=SOURCE_KEYS.map(([key,label,icon])=>{
        const item=byKey[key]||{item_key:key,evidence_state:'unknown'},meta=stateMeta(item),checked=item.source_checked_at?fmtDate(item.source_checked_at):'';
        return `<article class="tx-source-card ${meta.cls}"><div class="tx-source-card-top"><span class="tx-source-card-icon"><i class="fas ${icon}"></i></span><span class="tx-source-status">${esc(meta.label)}</span></div><strong>${esc(item.title||label)}</strong>${evidenceBody(item)}<div class="tx-source-provenance"><span>${esc(sourceName(item))}</span>${checked?`<small>Checked ${esc(checked)}</small>`:''}</div><div class="tx-source-actions">${sourceLinks(item)}</div></article>`;
      }).join('');
      const parcel=[tx.pams_pin?'Parcel '+tx.pams_pin:'Parcel not matched',tx.block&&tx.lot?`Block ${tx.block} · Lot ${tx.lot}`:'Block/lot resolving'].join(' · ');
      box.innerHTML=`<div class="tx-source-sweep-head"><div><span class="tx-eyebrow">ONE-ADDRESS EVIDENCE SWEEP</span><h3>What Watchdog actually found — and what still needs an official search</h3><p>Evidence is shown directly in each card. “None found” appears only after the authoritative source was actually searched successfully.</p></div><span class="tx-source-sweep-meta">${esc(parcel)}</span></div><div class="tx-source-grid">${cards}</div>`;
    }catch(e){console.warn('Evidence sweep panel could not render',e)}
  },120);
}

async function flush(){
  if(!canUseEvidence()||flushBusy||!pending.size)return;const c=getClient();if(!c)return;flushBusy=true;const ids=[...pending].slice(0,50);ids.forEach(id=>pending.delete(id));
  try{
    const r=await c.functions.invoke('transaction-evidence-sweep',{body:{transaction_ids:ids}});if(r.error)throw r.error;ids.forEach(id=>seen.add(id));
    const active=document.querySelector('.tx-list-card.active');if(active&&ids.includes(active.dataset.txId)){setTimeout(()=>active.click(),50);setTimeout(()=>renderSourceSweep(active.dataset.txId),500)}
    document.dispatchEvent(new CustomEvent('watchdog:transaction-preflight-complete',{detail:r.data||{}}));
  }catch(e){console.error('Automatic transaction evidence sweep failed',e);toast('Transaction saved, but the evidence sweep needs a retry.','error')}
  finally{flushBusy=false;if(pending.size)schedule([],250)}
}

const nativeFetch=window.fetch.bind(window);
window.fetch=async function(input,init){
  const response=await nativeFetch(input,init);try{
    const url=typeof input==='string'?input:(input&&input.url)||'';
    const method=String((init&&init.method)||(input&&input.method)||'GET').toUpperCase();
    if(/\/rest\/v1\/transaction_workspaces(?:\?|$)/.test(url)&&['POST','PATCH'].includes(method)&&response.ok){
      let shouldQueue=method==='POST';
      if(method==='PATCH'){
        let raw='';try{raw=typeof init?.body==='string'?init.body:''}catch{}
        if(raw){try{const body=JSON.parse(raw);shouldQueue=Object.prototype.hasOwnProperty.call(body,'address')||Object.prototype.hasOwnProperty.call(body,'pams_pin')}catch{}}
      }
      if(shouldQueue){const data=await response.clone().json().catch(()=>null),rows=Array.isArray(data)?data:data?[data]:[];const ids=rows.map(r=>r&&r.id).filter(Boolean);if(ids.length)schedule(ids,900)}
    }
  }catch(e){console.warn('Transaction evidence sweep hook skipped',e)}return response
};

document.addEventListener('click',function(e){
  if(!canUseEvidence())return;
  const button=e.target&&e.target.closest&&e.target.closest('#tx-run-review');
  if(button){
    const active=document.querySelector('.tx-list-card.active'),id=active&&active.dataset.txId;if(!id)return;
    e.preventDefault();e.stopPropagation();if(e.stopImmediatePropagation)e.stopImmediatePropagation();
    button.disabled=true;button.innerHTML='<i class="fas fa-circle-notch fa-spin"></i> Checking evidence';
    const done=()=>{button.disabled=false;button.innerHTML='<i class="fas fa-rotate"></i> Refresh evidence sweep'};
    const handler=()=>{document.removeEventListener('watchdog:transaction-preflight-complete',handler);done();toast('Watchdog evidence sweep refreshed.','success')};
    document.addEventListener('watchdog:transaction-preflight-complete',handler,{once:true});schedule([id],0);setTimeout(done,24000);return;
  }
  const card=e.target&&e.target.closest&&e.target.closest('[data-tx-id]');if(card){const id=clean(card.dataset.txId);setTimeout(()=>renderSourceSweep(id),450);if(id&&!seen.has(id)){seen.add(id);schedule([id],900)}}
},true);

async function checkExisting(){
  if(!canUseEvidence())return;
  const c=getClient();if(!c)return;try{
    const auth=await c.auth.getUser();if(!auth?.data?.user)return;
    const r=await c.from('transaction_workspaces').select('id,last_watch_at').eq('user_id',auth.data.user.id).order('created_at',{ascending:false}).limit(50);
    if(!r.error){const fresh=(r.data||[]).filter(x=>!x.last_watch_at).map(x=>x.id);if(fresh.length)schedule(fresh,500)}
    setTimeout(()=>{const active=document.querySelector('.tx-list-card.active');if(active){const id=clean(active.dataset.txId);renderSourceSweep(id);if(id&&!seen.has(id)){seen.add(id);schedule([id],600)}}},1500);
  }catch(e){console.warn('Existing transaction evidence sweep scan skipped',e)}
}
document.addEventListener('watchdog:transaction-access-ready',checkExisting);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',checkExisting,{once:true});else checkExisting();
})();