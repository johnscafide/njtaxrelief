(function(){
'use strict';
if(window.__WATCHDOG_TRANSACTION_AUTO_PREFLIGHT__)return;window.__WATCHDOG_TRANSACTION_AUTO_PREFLIGHT__=true;

const polish=document.createElement('link');polish.rel='stylesheet';polish.href='/transaction/polish.css?v=20260915b';document.head.appendChild(polish);

const pending=new Set(),seen=new Set();let timer=null,client=null,flushBusy=false,renderTimer=null;
const clean=v=>String(v||'').trim();
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const SOURCE_KEYS=[
  ['ownership_vesting','Ownership','fa-user-shield'],
  ['deed_recording_reference','Deed record','fa-file-signature'],
  ['permit_certificate_lifecycle','Permits & certificates','fa-helmet-safety'],
  ['judgment_lien_search','Judgments & liens','fa-scale-balanced'],
  ['lis_pendens_title_exceptions','Lis pendens / title','fa-gavel'],
  ['property_tax_status','Property taxes','fa-receipt'],
  ['tax_sale_delinquency','Tax sale / delinquency','fa-triangle-exclamation'],
  ['water_sewer','Water / sewer','fa-droplet'],
  ['resale_cco','Resale / CCO','fa-house-circle-check'],
  ['open_violations','Code / violations','fa-building-shield'],
  ['watchdog_closing_review','Closing Review','fa-shield-halved']
];

function toast(message,type){const n=document.querySelector('#tx-toast');if(!n)return;n.textContent=message;n.className='tx-toast show '+(type||'');setTimeout(()=>{if(n.textContent===message)n.className='tx-toast'},3200)}
function getClient(){if(client)return client;try{client=window.NJPTRSupabaseRuntime&&window.NJPTRSupabaseRuntime.createClient?window.NJPTRSupabaseRuntime.createClient():null}catch(e){console.warn('Transaction preflight client unavailable',e)}return client}
function schedule(ids,delay){(ids||[]).map(clean).filter(Boolean).forEach(id=>pending.add(id));clearTimeout(timer);timer=setTimeout(flush,delay==null?900:delay)}

function stateMeta(item){
  const evidence=clean(item&&item.evidence_state),sourceType=clean(item&&item.source_type),payload=item&&item.payload&&typeof item.payload==='object'?item.payload:{};
  if(evidence==='issue_observed')return{label:'Issue observed',cls:'attention'};
  if(item&&item.item_key==='permit_certificate_lifecycle'&&Number(payload.verification_candidates||payload.candidate_records?.length||0)>0)return{label:'Attention',cls:'attention'};
  if(evidence==='clear_observed')return{label:'Checked',cls:'checked'};
  if(sourceType==='official_manual')return{label:'Official source',cls:'review'};
  if(evidence==='verify')return{label:'Review',cls:'review'};
  if(evidence==='provider_missing')return{label:'Not connected',cls:'missing'};
  return{label:'Not checked',cls:'missing'};
}
function sourceDetail(item){
  if(!item)return'No source result recorded yet.';
  const p=item.payload&&typeof item.payload==='object'?item.payload:{};
  if(item.item_key==='permit_certificate_lifecycle'){
    const records=Array.isArray(p.candidate_records)?p.candidate_records:[],count=Number(p.verification_candidates||records.length||0);
    const latest=records.map(r=>clean(r&&r.permit_date).slice(0,10)).filter(Boolean).sort().at(-1);
    if(count)return `${count} permit/certificate verification candidate${count===1?'':'s'}${latest?' · latest '+latest:''}.`;
    if(item.source_checked_at)return'NJ DCA checked; municipal verification may still be required.';
  }
  if(item.item_key==='ownership_vesting'&&p.owner_name)return `Owner on record: ${p.owner_name}`;
  if(item.item_key==='deed_recording_reference'&&(p.deed_book||p.deed_page))return `Book ${p.deed_book||'—'} · Page ${p.deed_page||'—'}`;
  if(item.item_key==='property_tax_status'&&p.prior_year_tax!=null){const n=Number(p.prior_year_tax);if(Number.isFinite(n))return `Prior-year tax baseline: ${n.toLocaleString('en-US',{style:'currency',currency:'USD'})}. Current balance requires collector verification.`}
  if(item.item_key==='resale_cco'&&p.requirement_observed)return'Lindenwold sale C/O inspection requirement identified.';
  if(item.item_key==='watchdog_closing_review'&&p.top_score!=null)return `Priority ${Math.round(Number(p.top_score))} · ${Math.round(Number(p.evidence_coverage||0))}% model evidence coverage.`;
  const d=clean(item.description);return d.length>148?d.slice(0,145)+'…':d||'Source result available.';
}
function sourceName(item){return clean(item&&item.source_label)||clean(item&&item.source_type).replace(/_/g,' ')||'No provider connected'}

async function renderSourceSweep(id){
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
        const item=byKey[key]||{item_key:key,evidence_state:'unknown'},meta=stateMeta(item),url=clean(item.source_url),tag=url?'a':'article';
        const open=url?` href="${esc(url)}" target="_blank" rel="noopener"`:'';
        return `<${tag} class="tx-source-card ${meta.cls}"${open}><div class="tx-source-card-top"><span class="tx-source-card-icon"><i class="fas ${icon}"></i></span><span class="tx-source-status">${esc(meta.label)}</span></div><strong>${esc(label)}</strong><small>${esc(sourceDetail(item))}</small><span class="tx-source-name">${esc(sourceName(item))}${url?' · official link':''}</span>${url?'<span class="tx-source-arrow">Open source <i class="fas fa-arrow-up-right-from-square"></i></span>':''}</${tag}>`;
      }).join('');
      const parcel=[tx.pams_pin?'Parcel '+tx.pams_pin:'Parcel not matched',tx.block&&tx.lot?`Block ${tx.block} · Lot ${tx.lot}`:'Block/lot resolving'].join(' · ');
      box.innerHTML=`<div class="tx-source-sweep-head"><div><span class="tx-eyebrow">ONE-ADDRESS SOURCE SWEEP</span><h3>What Watchdog checked — and where to verify the rest</h3><p>Automated public records and official county/municipal sources are kept separate. A manual official source is not labeled “unavailable.”</p></div><span class="tx-source-sweep-meta">${esc(parcel)}</span></div><div class="tx-source-grid">${cards}</div>`;
    }catch(e){console.warn('Source sweep panel could not render',e)}
  },120);
}

async function flush(){
  if(flushBusy||!pending.size)return;const c=getClient();if(!c)return;flushBusy=true;const ids=[...pending].slice(0,50);ids.forEach(id=>pending.delete(id));
  try{
    const r=await c.functions.invoke('transaction-source-sweep',{body:{transaction_ids:ids}});if(r.error)throw r.error;ids.forEach(id=>seen.add(id));
    const active=document.querySelector('.tx-list-card.active');if(active&&ids.includes(active.dataset.txId)){setTimeout(()=>active.click(),50);setTimeout(()=>renderSourceSweep(active.dataset.txId),400)}
    document.dispatchEvent(new CustomEvent('watchdog:transaction-preflight-complete',{detail:r.data||{}}));
  }catch(e){console.error('Automatic transaction source sweep failed',e);toast('Transaction saved, but the full source sweep needs a retry.','error')}
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
  }catch(e){console.warn('Transaction source sweep hook skipped',e)}return response
};

document.addEventListener('click',function(e){
  const button=e.target&&e.target.closest&&e.target.closest('#tx-run-review');
  if(button){
    const active=document.querySelector('.tx-list-card.active'),id=active&&active.dataset.txId;if(!id)return;
    e.preventDefault();e.stopPropagation();if(e.stopImmediatePropagation)e.stopImmediatePropagation();
    button.disabled=true;button.innerHTML='<i class="fas fa-circle-notch fa-spin"></i> Checking all sources';
    const done=()=>{button.disabled=false;button.innerHTML='<i class="fas fa-rotate"></i> Refresh source sweep'};
    const handler=()=>{document.removeEventListener('watchdog:transaction-preflight-complete',handler);done();toast('Watchdog source sweep refreshed.','success')};
    document.addEventListener('watchdog:transaction-preflight-complete',handler,{once:true});schedule([id],0);setTimeout(done,20000);return;
  }
  const card=e.target&&e.target.closest&&e.target.closest('[data-tx-id]');if(card){const id=clean(card.dataset.txId);setTimeout(()=>renderSourceSweep(id),450);if(id&&!seen.has(id)){seen.add(id);schedule([id],900)}}
},true);

async function checkExisting(){
  const c=getClient();if(!c)return;try{
    const auth=await c.auth.getUser();if(!auth?.data?.user)return;
    const r=await c.from('transaction_workspaces').select('id,last_watch_at').eq('user_id',auth.data.user.id).order('created_at',{ascending:false}).limit(50);
    if(!r.error){const fresh=(r.data||[]).filter(x=>!x.last_watch_at).map(x=>x.id);if(fresh.length)schedule(fresh,500)}
    setTimeout(()=>{const active=document.querySelector('.tx-list-card.active');if(active){const id=clean(active.dataset.txId);renderSourceSweep(id);if(id&&!seen.has(id)){seen.add(id);schedule([id],600)}}},1500);
  }catch(e){console.warn('Existing transaction source sweep scan skipped',e)}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',checkExisting,{once:true});else checkExisting();
})();
