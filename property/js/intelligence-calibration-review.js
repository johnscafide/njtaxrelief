(function(){
'use strict';

const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

let client=null;
let sets=[];
let activeSet=null;
let cases=[];
let cursor=0;
let selectedClass='';
const factCache=new Map();

const markerIds=[
  'property.assessed_value','property.land_assessment','property.improvement_assessment',
  'property.annual_tax','property.sale_price','property.sale_date','property.municipality','property.county'
];

const reasonOptions=[
  ['','No reason selected'],
  ['evidence_supports_priority','Evidence supports a real follow-up'],
  ['useful_transaction_follow_up','Useful transaction follow-up'],
  ['closing_not_material','Not material to closing'],
  ['not_actionable','Context is not actionable'],
  ['needs_direct_source','Needs a more direct source'],
  ['normal_or_explained_change','Normal / explained condition'],
  ['stale_information','Evidence appears stale'],
  ['weak_signal','Signal is too weak'],
  ['missing_evidence','Important evidence is missing'],
  ['wrong_comparison','Comparison / cohort does not fit'],
  ['permit_context','Permit context changes the interpretation'],
  ['other','Other']
];

function toast(msg){
  const t=$('#pl-toast');
  if(!t)return;
  t.textContent=msg;
  t.style.display='block';
  clearTimeout(window.__crToast);
  window.__crToast=setTimeout(()=>t.style.display='none',4200);
}

async function call(action,extra={}){
  const r=await client.functions.invoke('intelligence-calibration-admin',{body:{action,...extra}});
  if(r.error)throw r.error;
  if(r.data?.error)throw new Error(r.data.error);
  return r.data||{};
}

function num(v,d=2){
  const n=Number(v);
  return Number.isFinite(n)?n.toLocaleString('en-US',{maximumFractionDigits:d}):'—';
}
function money(v){
  const n=Number(v);
  return Number.isFinite(n)?n.toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}):'—';
}
function scorePct(v){
  const n=Number(v);
  return Number.isFinite(n)?`${Math.round(n)}%`:'—';
}
function labelName(v){
  return v==='review_priority'?'Priority':v==='not_priority'?'Not priority':v==='uncertain'?'Uncertain':'Unreviewed';
}
function predictedName(v){
  return v==='review_priority'?'Priority':v==='not_priority'?'Not priority':v==='insufficient_evidence'?'Insufficient evidence':'—';
}
function activeSetObject(){return sets.find(s=>s.id===activeSet)||null;}
function isDevelopmentSanity(set=activeSetObject()){
  return set?.source_manifest?.purpose==='development_sanity_not_promotion_proof'||set?.source_manifest?.development_sanity===true;
}
function reviewedCount(){return cases.filter(c=>c.expected_class&&c.expected_class!=='unreviewed').length;}
function queueSets(){
  return sets.filter(s=>Number(s.case_count||0)>0&&['draft','reviewing'].includes(String(s.status||'')));
}

function renderOverall(){
  const qs=queueSets();
  const total=qs.reduce((n,s)=>n+Number(s.case_count||0),0);
  const open=qs.reduce((n,s)=>n+Number(s.unreviewed_count||0),0);
  $('#cr-overall').innerHTML=`<b>${total-open} / ${total}</b><span>active reviews complete</span>`;
}

function renderSetOptions(){
  const select=$('#cr-set');
  const qs=queueSets();
  select.innerHTML=qs.map(s=>`<option value="${esc(s.id)}" ${activeSet===s.id?'selected':''}>${esc(s.name)} · ${Number(s.unreviewed_count||0)} left</option>`).join('');
  select.onchange=()=>loadSet(select.value);
}

function renderProgress(){
  const total=cases.length,done=reviewedCount(),percent=total?Math.round(done/total*100):0;
  $('#cr-progress').innerHTML=`<span>${done}/${total} reviewed</span><span class="cr-progress-bar" aria-hidden="true"><i style="width:${percent}%"></i></span><span>${percent}%</span>`;
}

function currentCase(){
  if(!cases.length)return null;
  cursor=Math.max(0,Math.min(cursor,cases.length-1));
  return cases[cursor];
}
function firstOpenIndex(){
  const i=cases.findIndex(c=>(c.expected_class||'unreviewed')==='unreviewed');
  return i<0?cases.length:i;
}

async function semanticFacts(c){
  const pin=String(c.pams_pin||'').trim();
  if(!pin)return null;
  if(factCache.has(pin))return factCache.get(pin);
  const r=await client.functions.invoke('intelligence-semantic-context',{body:{pams_pins:[pin],packs:[],marker_ids:markerIds}});
  if(r.error)throw r.error;
  factCache.set(pin,r.data||null);
  return r.data||null;
}

function markerValue(m){
  if(!m||m.state!=='available')return'Not available';
  if(/tax|price|assess/i.test(String(m.id||''))&&Number.isFinite(Number(m.value)))return money(m.value);
  return typeof m.value==='number'?num(m.value,4):String(m.value??'—');
}

function factsMarkup(data){
  const snap=Array.isArray(data?.snapshots)?data.snapshots[0]:null;
  const items=Array.isArray(snap?.markers)?snap.markers:[];
  const unresolved=Array.isArray(data?.marker_request?.unresolved)?data.marker_request.unresolved:[];
  if(!snap)return'<div class="cr-note">No governed semantic property snapshot resolved. Review only the evidence that is actually available; do not fill gaps from memory.</div>';
  return `<div class="cr-fact-grid">${items.map(m=>`<article class="cr-fact ${m.state==='available'?'':'missing'}"><span>${esc(m.label||m.id)}</span><b>${esc(markerValue(m))}</b><small>${esc(m.source||m.source_id||m.state||'No source value')} · ${esc(m.truth_class||'missing')} · authority ${Number(m.authority_rank||0)}/100</small>${m.conflict_state==='conflict'?'<em>Conflicting governed observations exist; canonical authority shown.</em>':''}</article>`).join('')}</div>${unresolved.length?`<div class="cr-unresolved"><b>Unresolved requested markers</b><ul>${unresolved.map(x=>`<li>${esc(x.id)} · ${esc(x.reason)}</li>`).join('')}</ul></div>`:''}<div class="cr-hash">Facts hash: <code>${esc(snap.facts_hash||snap.snapshot_hash||'not recorded')}</code></div>`;
}

function evidenceMarkup(c){
  const snapshot=c.evidence_snapshot||{};
  const evidence=Array.isArray(snapshot.evidence)?snapshot.evidence:[];
  const missing=Array.isArray(snapshot.missing_evidence)?snapshot.missing_evidence:[];
  const direct=isDevelopmentSanity();
  const cards=evidence.map(e=>{
    const value=Number(e.score??e.value);
    const valueText=Number.isFinite(value)?`${Math.round(value)}%`:num(e.value,6);
    const valueLabel=direct&&e.role==='direct_exception'?'Exception severity':'Governed source value';
    return `<article class="cr-evidence"><div><b>${esc(e.signal_id||'Signal')}</b><span>${esc(e.role||'evidence')}</span></div><p>${esc(valueLabel)}: <strong>${esc(valueText)}</strong>${e.cohort?.sample_size?` · peer sample ${Number(e.cohort.sample_size)}`:''}</p><small>${esc(e.explanation||e.source_key||'Governed deterministic evidence')}${e.observed_at?` · observed ${esc(new Date(e.observed_at).toLocaleDateString())}`:''}</small></article>`;
  }).join('');
  return `<div class="cr-evidence-list">${cards||'<div class="cr-note">No scored model evidence is present for this case.</div>'}</div>${missing.length?`<div class="cr-missing"><b>Missing / rejected evidence</b>${missing.map(e=>`<article><strong>${esc(e.signal_id||'Signal')}</strong><span>${esc(e.reason||'missing')}</span></article>`).join('')}</div>`:''}`;
}

function reasonMarkup(){return reasonOptions.map(([v,l])=>`<option value="${esc(v)}">${esc(l)}</option>`).join('');}

function verdictMarkup(){
  if(isDevelopmentSanity()){
    return `<div class="cr-verdicts"><button class="cr-verdict" type="button" data-class="review_priority"><i class="fas fa-flag"></i><span><b>Surface this</b><span>This is a useful transaction follow-up.</span></span></button><button class="cr-verdict" type="button" data-class="not_priority"><i class="fas fa-minus"></i><span><b>Do not surface</b><span>This would add noise or is not actionable.</span></span></button><button class="cr-verdict" type="button" data-class="uncertain"><i class="fas fa-question"></i><span><b>Unsure</b><span>The evidence needs more context.</span></span></button></div>`;
  }
  return `<div class="cr-verdicts"><button class="cr-verdict" type="button" data-class="review_priority"><i class="fas fa-flag"></i><span><b>Priority</b><span>Evidence supports review.</span></span></button><button class="cr-verdict" type="button" data-class="not_priority"><i class="fas fa-minus"></i><span><b>Not priority</b><span>Evidence does not justify review.</span></span></button><button class="cr-verdict" type="button" data-class="uncertain"><i class="fas fa-question"></i><span><b>Uncertain</b><span>Evidence is insufficient or ambiguous.</span></span></button></div>`;
}

function comparisonMarkup(c){
  const r=c.review||{},outcome=r.review_outcome||'needs_review',good=outcome==='pass';
  const human=labelName(c.expected_class),pred=predictedName(r.predicted_class);
  if(isDevelopmentSanity()){
    return `<div class="cr-after ${outcome==='fail'?'bad':good?'good':''}"><b>${c.expected_class==='uncertain'?'Product judgment saved as Unsure':good?'Your product judgment matches the draft trigger':'Your product judgment disagrees with the draft trigger'}</b><span>Your choice: ${esc(c.expected_class==='review_priority'?'Surface this':c.expected_class==='not_priority'?'Do not surface':'Unsure')} · Draft trigger: ${esc(pred)}${r.actual_score==null?'':` · exception score ${esc(Number(r.actual_score).toFixed(1))}`}${r.evidence_coverage==null?'':` · evidence coverage ${esc(scorePct(r.evidence_coverage))}`}</span></div>`;
  }
  return `<div class="cr-after ${outcome==='fail'?'bad':good?'good':''}"><b>${c.expected_class==='uncertain'?'Human review saved as Uncertain':good?'Human label agrees with the model':'Human label disagrees with the model'}</b><span>Human: ${esc(human)} · Watchdog predicted: ${esc(pred)}${r.actual_score==null?'':` · model score ${esc(Number(r.actual_score).toFixed(1))}`}${r.evidence_coverage==null?'':` · evidence coverage ${esc(scorePct(r.evidence_coverage))}`}</span></div>`;
}

function renderCase(c,facts){
  selectedClass='';
  const done=(c.expected_class||'unreviewed')!=='unreviewed';
  const sanity=isDevelopmentSanity();
  const set=activeSetObject();
  const eyebrow=sanity?'DEVELOPMENT SANITY · NOT CALIBRATION':`${esc(set?.model_key||'MODEL')} · VERSION ${esc(set?.model_version||'—')}`;
  const intro=sanity
    ? 'Would you want Watchdog to surface this as a real transaction follow-up? Judge usefulness and actionability, not whether the property is generally risky. These 10 answers can improve the draft but cannot validate or promote it.'
    : "Would this evidence independently justify putting the property in this model's review queue? Do not infer seller intent, value, profit, legal outcome, urgency, or facts that are not shown.";
  const step3=sanity?'YOUR PRODUCT JUDGMENT':'HUMAN LABEL';
  const title=sanity?'Should Watchdog surface this?':'Your independent judgment';
  const saveLabel=sanity?'Save product judgment':'Save independent label';

  $('#cr-stage').innerHTML=`<article class="cr-case"><header class="cr-case-head"><div><span>${eyebrow}</span><h2>${esc(c.property_address||c.pams_pin||c.case_key||'Review case')}</h2><p>${esc(c.pams_pin||c.case_key||'')} ${done?`· previously labeled ${esc(labelName(c.expected_class))}`:sanity?'· development product check pending':'· independent review pending'}</p></div><div class="cr-case-count">Case ${cursor+1} of ${cases.length}</div></header>${sanity?'<div class="cr-note"><b>Why this batch is different</b><br>Only direct permit/certificate and recording-reference exceptions drive this draft. Flood, wetlands, tidelands and environmental proximity cannot independently make a property a Closing Priority.</div>':''}<div class="cr-grid"><div><section class="cr-panel"><div class="cr-panel-head"><div><span>STEP 1 · GOVERNED SOURCE FACTS</span><h3>What the property record supports</h3></div><small>Observed/source facts are evidence. Missing values remain missing.</small></div>${factsMarkup(facts)}${c.source_notes?`<div class="cr-note"><b>Case provenance</b><br>${esc(c.source_notes)}</div>`:''}</section><section class="cr-panel"><div class="cr-panel-head"><div><span>STEP 2 · DIRECT TRANSACTION EVIDENCE</span><h3>${sanity?'What Watchdog would ask someone to verify':'Signals available to the model'}</h3></div><small>Draft score and trigger remain hidden until you save your choice.</small></div>${evidenceMarkup(c)}</section></div><aside class="cr-panel cr-review"><div class="cr-panel-head"><div><span>STEP 3 · ${step3}</span><h3>${title}</h3></div></div><div class="cr-review-intro">${esc(intro)}</div>${verdictMarkup()}<div class="cr-form"><label>Optional reason<select id="cr-reason">${reasonMarkup()}</select></label><label>Optional note<textarea id="cr-notes" maxlength="3500" placeholder="What made this useful, noisy, or incomplete?"></textarea></label></div><div class="cr-actions"><button class="cr-skip" type="button" id="cr-skip">Skip for now</button><button class="cr-save" type="button" id="cr-save" disabled>${saveLabel}</button></div>${done?comparisonMarkup(c):'<div id="cr-after"></div>'}</aside></div></article>`;

  $$('.cr-verdict').forEach(b=>b.onclick=()=>{
    selectedClass=b.dataset.class;
    $$('.cr-verdict').forEach(x=>x.classList.toggle('on',x===b));
    $('#cr-save').disabled=false;
  });
  $('#cr-skip').onclick=()=>nextCase(false);
  $('#cr-save').onclick=()=>saveReview(c);
}

function structuredNotes(reason,note){
  const lines=[];
  if(reason)lines.push(`Reason: ${reason}`);
  if(note)lines.push(`Reviewer note: ${note}`);
  return lines.join('\n');
}

async function saveReview(c){
  if(!selectedClass)return;
  const save=$('#cr-save'),reason=$('#cr-reason')?.value||'',note=$('#cr-notes')?.value?.trim()||'';
  save.disabled=true;
  save.innerHTML='<i class="fas fa-circle-notch fa-spin"></i> Saving';
  try{
    const result=await call('review_case',{calibration_case_id:c.id,expected_class:selectedClass,review_notes:structuredNotes(reason,note)});
    const r=c.review||(c.review={});
    c.expected_class=selectedClass;
    r.review_outcome=result.review_outcome||'needs_review';
    r.error_kind=result.error_kind||null;
    r.review_notes=structuredNotes(reason,note);
    r.reviewed_at=new Date().toISOString();
    const predicted=r.predicted_class||'',human=selectedClass,negative=predicted==='not_priority'||predicted==='insufficient_evidence';
    if(!r.review_outcome||r.review_outcome==='needs_review'){
      r.review_outcome=human==='uncertain'?'needs_review':human==='review_priority'?(predicted==='review_priority'?'pass':'fail'):(negative?'pass':'fail');
    }
    $('#cr-after').outerHTML=comparisonMarkup(c)+`<button class="cr-next" id="cr-next" type="button">Save & next case <i class="fas fa-arrow-right"></i></button>`;
    $('#cr-next').onclick=()=>refreshAfterSave();
    save.textContent='Saved';
    renderProgress();
    toast(isDevelopmentSanity()?`Saved product judgment. Draft trigger comparison is now visible.`:`Saved ${labelName(selectedClass)}. Model comparison is now visible.`);
  }catch(e){
    save.disabled=false;
    save.textContent=isDevelopmentSanity()?'Save product judgment':'Save independent label';
    toast(e?.message||'Could not save this review.');
  }
}

async function refreshAfterSave(){
  try{await loadSet(activeSet,true)}catch(e){toast(e?.message||'Could not load the next case.');}
}
function nextCase(allowReviewed=true){
  if(!cases.length)return;
  let i=cursor+1;
  for(;i<cases.length;i++){
    if(allowReviewed||(cases[i].expected_class||'unreviewed')==='unreviewed'){
      cursor=i;
      return loadCurrent();
    }
  }
  toast('No later unreviewed cases in this queue.');
}
async function loadCurrent(){
  const c=currentCase();
  if(!c)return renderComplete();
  $('#cr-stage').innerHTML='<div class="cr-loading"><i class="fas fa-circle-notch fa-spin"></i><span>Loading governed source facts…</span></div>';
  try{renderCase(c,await semanticFacts(c));}
  catch(e){
    $('#cr-stage').innerHTML=`<div class="cr-empty"><i class="fas fa-triangle-exclamation"></i><h2>Source facts unavailable</h2><p>${esc(e?.message||'Semantic Context could not resolve this case.')} Do not guess.</p></div>`;
  }
}
function renderComplete(){
  const set=activeSetObject(),sm=set?.summary||{};
  if(isDevelopmentSanity(set)){
    $('#cr-stage').innerHTML=`<div class="cr-complete"><i class="fas fa-circle-check"></i><h2>${esc(set?.name||'Development sanity')} is complete.</h2><p>All ${cases.length} product judgments are saved. This batch is development feedback only; it cannot validate or promote Closing Review v7.</p></div>`;
    return;
  }
  $('#cr-stage').innerHTML=`<div class="cr-complete"><i class="fas fa-circle-check"></i><h2>${esc(set?.name||'Queue')} is fully reviewed.</h2><p>All ${cases.length} cases have independent human labels. The calibration gate is computed separately from those labels${sm.passes_gate?' and currently passes.':'. Open the full calibration control to inspect precision, recall, false-positive rate, and any failed thresholds.'}</p></div>`;
}

async function loadSet(id,afterSave=false){
  activeSet=id;
  $('#cr-stage').innerHTML='<div class="cr-loading"><i class="fas fa-circle-notch fa-spin"></i><span>Loading review queue…</span></div>';
  const d=await call('get_set',{calibration_set_id:id});
  cases=Array.isArray(d.cases)?d.cases:[];
  const setIndex=sets.findIndex(s=>s.id===id);
  if(setIndex>=0){
    sets[setIndex]={...sets[setIndex],summary:d.summary||sets[setIndex].summary,unreviewed_count:cases.filter(c=>(c.expected_class||'unreviewed')==='unreviewed').length,case_count:cases.length};
  }
  renderOverall();renderSetOptions();renderProgress();
  cursor=firstOpenIndex();
  if(cursor>=cases.length)return renderComplete();
  await loadCurrent();
  if(afterSave)window.scrollTo({top:document.querySelector('.cr-controls')?.offsetTop||0,behavior:'smooth'});
}

async function boot(){
  try{
    await Promise.resolve(window.njptrAccessReady);
    client=window.NJPTRAccess?.client?.();
    if(!client)throw new Error('Supabase client unavailable.');
    const d=await call('list');
    sets=Array.isArray(d.sets)?d.sets:[];
    renderOverall();
    const qs=queueSets();
    if(!qs.length){
      renderSetOptions();
      $('#cr-stage').innerHTML='<div class="cr-empty"><i class="fas fa-flask"></i><h2>No active review queues</h2><p>Rejected, accepted, and retired sets are kept for audit history but are not shown here.</p></div>';
      return;
    }
    const withOpen=qs.find(s=>Number(s.unreviewed_count||0)>0)||qs[0];
    activeSet=withOpen.id;
    renderSetOptions();
    await loadSet(activeSet);
  }catch(e){
    $('#cr-overall').textContent='Calibration unavailable';
    $('#cr-stage').innerHTML=`<div class="cr-empty"><i class="fas fa-triangle-exclamation"></i><h2>Reviewer could not start</h2><p>${esc(e?.message||'Developer calibration service is unavailable.')}</p></div>`;
  }
}

boot();
})();
