(function(){
'use strict';
if(window.__WATCHDOG_MUNICIPAL_CLEARANCE_WORKFLOW__)return;window.__WATCHDOG_MUNICIPAL_CLEARANCE_WORKFLOW__=true;

const RULE_URL='https://www.nj.gov/dca/dlgs/resources/rules_docs/5_33/533_1.pdf';
const STEPS=[
  ['not_requested','Not requested'],
  ['prepared','Prepared'],
  ['submitted','Submitted'],
  ['awaiting_municipality','Awaiting municipality'],
  ['received','Received'],
  ['exceptions_follow_up','Exceptions / follow-up'],
  ['completed','Completed']
];
const clean=v=>String(v==null?'':v).trim();
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let db=null,user=null,busy=false,timer=null;

function client(){
  if(db)return db;
  try{db=window.NJPTRSupabaseRuntime&&window.NJPTRSupabaseRuntime.createClient?window.NJPTRSupabaseRuntime.createClient():null}catch(e){console.warn('Municipal clearance client unavailable',e)}
  return db;
}
function activeTransactionId(){return clean(document.querySelector('.tx-list-card.active')?.dataset?.txId)}
function workflowOf(item){
  const p=item&&item.payload&&typeof item.payload==='object'?item.payload:{};
  const w=p.certified_municipal_lien_search&&typeof p.certified_municipal_lien_search==='object'?p.certified_municipal_lien_search:{};
  let state=clean(w.state);
  if(!STEPS.some(x=>x[0]===state)){
    if(['verified','resolved'].includes(item?.state))state='completed';
    else if(item?.state==='received')state='received';
    else if(item?.state==='requested')state='submitted';
    else state='not_requested';
  }
  return {...w,state};
}
function findCard(){
  return Array.from(document.querySelectorAll('#tx-source-sweep .tx-source-card')).find(card=>/municipal lien/i.test(clean(card.querySelector('strong')?.textContent)));
}
function toast(message,type){
  const n=document.querySelector('#tx-toast');if(!n)return;
  n.textContent=message;n.className='tx-toast show '+(type||'');
  setTimeout(()=>{if(n.textContent===message)n.className='tx-toast'},3200);
}
function labelFor(state){return (STEPS.find(x=>x[0]===state)||STEPS[0])[1]}
function stepIndex(state){const i=STEPS.findIndex(x=>x[0]===state);return i<0?0:i}
function nextState(state){
  const map={not_requested:'prepared',prepared:'submitted',submitted:'awaiting_municipality',awaiting_municipality:'received',received:'completed',exceptions_follow_up:'completed'};
  return map[state]||'';
}
function buttonLabel(state){
  return ({not_requested:'Prepare request',prepared:'Mark submitted',submitted:'Mark awaiting',awaiting_municipality:'Mark received',received:'Mark completed',exceptions_follow_up:'Mark completed'}[state]||'');
}
function injectStyle(){
  if(document.querySelector('#tx-municipal-clearance-style'))return;
  const s=document.createElement('style');s.id='tx-municipal-clearance-style';s.textContent=`
  .tx-clearance-workflow{margin:14px 0 2px;padding:14px;border:1px solid rgba(16,42,67,.12);border-radius:16px;background:rgba(248,250,252,.94)}
  .tx-clearance-kicker{font-size:.7rem;font-weight:800;letter-spacing:.08em;color:#486581;text-transform:uppercase;margin-bottom:8px}
  .tx-clearance-copy{font-size:.78rem;line-height:1.45;color:#52606d;margin:8px 0 12px}
  .tx-clearance-steps{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px;margin:10px 0 12px}
  .tx-clearance-step{min-width:0;text-align:center;font-size:.62rem;font-weight:700;line-height:1.2;color:#7b8794;padding:7px 4px;border-radius:9px;background:#eef2f6}
  .tx-clearance-step.done{background:#e8f5ee;color:#147d4f}.tx-clearance-step.current{background:#eaf2ff;color:#174ea6;box-shadow:inset 0 0 0 1px rgba(23,78,166,.12)}
  .tx-clearance-actions{display:flex;flex-wrap:wrap;gap:7px;align-items:center}
  .tx-clearance-actions button,.tx-clearance-actions a{border:0;border-radius:10px;padding:8px 10px;font:inherit;font-size:.72rem;font-weight:750;cursor:pointer;text-decoration:none}
  .tx-clearance-actions button{background:#123b5d;color:#fff}.tx-clearance-actions button.secondary{background:#fff;color:#334e68;border:1px solid #cbd5e1}.tx-clearance-actions button.warn{background:#fff6e5;color:#8a4b08;border:1px solid #f1c27d}
  .tx-clearance-actions a{background:#fff;color:#334e68;border:1px solid #cbd5e1}
  .tx-clearance-note{display:flex;gap:8px;align-items:flex-start;margin-top:10px;font-size:.69rem;line-height:1.35;color:#6b7280}
  @media(max-width:760px){.tx-clearance-steps{grid-template-columns:repeat(2,minmax(0,1fr))}.tx-clearance-step:last-child{grid-column:1/-1}.tx-clearance-actions>*{flex:1 1 auto;text-align:center}}
  `;document.head.appendChild(s);
}
function markup(item,w){
  const idx=stepIndex(w.state),next=nextState(w.state),source=item.source_url?`<a href="${esc(item.source_url)}" target="_blank" rel="noopener">Official source <i class="fas fa-arrow-up-right-from-square"></i></a>`:'';
  const steps=STEPS.map(([key,label],i)=>`<span class="tx-clearance-step ${i<idx?'done':i===idx?'current':''}">${esc(label)}</span>`).join('');
  const exceptionButton=['received','completed'].includes(w.state)?`<button type="button" class="warn" data-clearance-action="exceptions">Record exceptions</button>`:'';
  const reset=w.state!=='not_requested'?`<button type="button" class="secondary" data-clearance-action="reset">Reset workflow</button>`:'';
  return `<div class="tx-clearance-workflow" data-clearance-item-id="${esc(item.id)}"><div class="tx-clearance-kicker">Certified municipal lien search · ${esc(labelFor(w.state))}</div><div class="tx-clearance-steps">${steps}</div><p class="tx-clearance-copy">Track the formal municipal search separately from live tax, utility, CIT-E, HLS or WIPP account evidence. Workflow completion does not by itself convert the evidence result to “clear.”</p><div class="tx-clearance-actions">${next?`<button type="button" data-clearance-action="advance" data-clearance-next="${esc(next)}">${esc(buttonLabel(w.state))}</button>`:''}${exceptionButton}${reset}${source}<a href="${RULE_URL}" target="_blank" rel="noopener">NJ municipal lien forms <i class="fas fa-arrow-up-right-from-square"></i></a></div><div class="tx-clearance-note"><i class="fas fa-circle-info"></i><span>Use the checklist due date for the municipal follow-up deadline. A returned certificate or authorized closing-party result should be preserved before treating the evidence as cleared.</span></div></div>`;
}
async function loadItem(txId){
  const c=client();if(!c||!txId)return null;
  if(!user){const a=await c.auth.getUser();user=a?.data?.user||null}
  if(!user)return null;
  const r=await c.from('transaction_items').select('id,transaction_id,user_id,item_key,state,evidence_state,severity,source_type,source_label,source_url,description,payload').eq('transaction_id',txId).eq('user_id',user.id).eq('item_key','municipal_lien_clearance').maybeSingle();
  if(r.error){console.warn('Municipal clearance item could not load',r.error);return null}
  return r.data||null;
}
async function render(){
  if(busy)return;const txId=activeTransactionId(),card=findCard();if(!txId||!card)return;
  busy=true;try{
    const item=await loadItem(txId);if(!item)return;
    const old=card.querySelector('.tx-clearance-workflow');if(old)old.remove();
    const host=card.querySelector('.tx-source-provenance')||card.querySelector('.tx-source-actions');
    const wrap=document.createElement('div');wrap.innerHTML=markup(item,workflowOf(item));const node=wrap.firstElementChild;
    if(host)card.insertBefore(node,host);else card.appendChild(node);
  }finally{busy=false}
}
async function updateWorkflow(itemId,state){
  const c=client();if(!c||!user)return;
  const txId=activeTransactionId();const item=await loadItem(txId);if(!item||item.id!==itemId)return;
  const now=new Date().toISOString(),w=workflowOf(item),payload={...(item.payload&&typeof item.payload==='object'?item.payload:{}),certified_municipal_lien_search:{...w,state,updated_at:now}};
  const patch={payload,updated_at:now};
  if(state==='submitted'||state==='awaiting_municipality')patch.state='requested';
  else if(state==='received'||state==='exceptions_follow_up')patch.state='received';
  else if(state==='completed')patch.state='verified';
  else patch.state='open';
  if(state==='exceptions_follow_up'){
    patch.evidence_state='issue_observed';patch.severity='attention';
    payload.certified_municipal_lien_search.exception_recorded_at=now;
  }
  const r=await c.from('transaction_items').update(patch).eq('id',item.id).eq('user_id',user.id).select('id,state,evidence_state,severity,payload').single();
  if(r.error){toast('Could not update municipal lien workflow.','error');return}
  await c.from('transaction_activity').insert({transaction_id:txId,user_id:user.id,action:'municipal_lien_workflow',message:`Municipal lien search workflow: ${labelFor(state)}`,detail:{item_id:item.id,workflow_state:state,evidence_state:r.data.evidence_state}});
  toast(`Municipal lien search: ${labelFor(state)}.`,'success');
  setTimeout(()=>{const active=document.querySelector('.tx-list-card.active');if(active)active.click();setTimeout(render,450)},80);
}
async function handleClick(e){
  const btn=e.target.closest('[data-clearance-action]');if(!btn)return;
  const root=btn.closest('.tx-clearance-workflow');if(!root)return;
  const action=btn.dataset.clearanceAction,itemId=root.dataset.clearanceItemId;
  if(action==='reset'){
    if(!window.confirm('Reset only the municipal lien request workflow? Existing source evidence will be preserved.'))return;
    await updateWorkflow(itemId,'not_requested');return;
  }
  if(action==='exceptions'){await updateWorkflow(itemId,'exceptions_follow_up');return}
  if(action==='advance'){
    const next=clean(btn.dataset.clearanceNext);if(next==='completed'&&!window.confirm('Mark the request workflow completed? This will not mark municipal lien evidence clear.'))return;
    if(STEPS.some(x=>x[0]===next))await updateWorkflow(itemId,next);
  }
}
function schedule(delay){clearTimeout(timer);timer=setTimeout(render,delay==null?180:delay)}

injectStyle();
document.addEventListener('click',e=>{handleClick(e);if(e.target.closest('.tx-list-card'))schedule(600)});
document.addEventListener('watchdog:transaction-preflight-complete',()=>schedule(500));
const observer=new MutationObserver(muts=>{if(busy)return;for(const m of muts){if(Array.from(m.addedNodes).some(n=>n.nodeType===1&&(n.matches?.('#tx-source-sweep,.tx-source-grid,.tx-source-card')||n.querySelector?.('#tx-source-sweep,.tx-source-grid,.tx-source-card')))){schedule(160);break}}});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{observer.observe(document.body,{childList:true,subtree:true});schedule(1000)},{once:true});else{observer.observe(document.body,{childList:true,subtree:true});schedule(1000)}
})();
