(function(){
'use strict';

const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rank=p=>({standard:0,agent:1,pro:2,pro_plus:3,teams:4,developer:5}[p]??0);
const planName=p=>String(p||'standard').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
const ACTION_STORAGE='watchdog_intelligence_action_states';
const MODELS=[
  {key:'assessment_anomaly',label:'Assessment Anomaly',plan:'pro',desc:'Assessment, sale and tax context'},
  {key:'closing_review',label:'Closing Review',plan:'pro_plus',desc:'Permit, title and diligence review'},
  {key:'property_change_priority',label:'Change Intelligence',plan:'pro_plus',desc:'Material source-linked changes'}
];

let client=null;
let plan='standard';
let model='assessment_anomaly';
let last=null;
let currentUserId=null;
let scopeMode='rows';
let savedViews=[];
let scopeViewId='';
let filters={evidence:'all',scoreMin:0,confidenceMin:0,geography:'',propertyClass:'',changedDays:0,action:'all'};
let sortMode='score';
let actionStates=loadActionStates();

function pins(){
  const checked=$$('[data-row]:checked').map(x=>x.dataset.row).filter(Boolean);
  const visible=$$('[data-row]').map(x=>x.dataset.row).filter(Boolean);
  return [...new Set(checked.length?checked:visible)].filter(x=>/^\d{4}_.+/.test(x)).slice(0,100);
}

function close(){
  document.getElementById('dwi-backdrop')?.remove();
  document.getElementById('dwi-drawer')?.remove();
}

function toast(msg){
  const t=$('#pl-toast');
  if(!t)return;
  t.textContent=msg;
  t.style.display='block';
  clearTimeout(window.__dwiToast);
  window.__dwiToast=setTimeout(()=>t.style.display='none',4200);
}

function safeUrl(value){
  try{
    const u=new URL(String(value||''),location.origin);
    return /^https?:$/.test(u.protocol)?u.href:'';
  }catch(_){return'';}
}

function dateLabel(value){
  if(!value)return'';
  const d=new Date(value);
  if(!Number.isFinite(d.getTime()))return'';
  return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
}

function loadActionStates(){
  try{
    const parsed=JSON.parse(sessionStorage.getItem(ACTION_STORAGE)||'{}');
    return parsed&&typeof parsed==='object'?parsed:{};
  }catch(_){return{};}
}

function saveActionStates(){
  try{sessionStorage.setItem(ACTION_STORAGE,JSON.stringify(actionStates));}catch(_){}
}

function actionKey(f){
  return String(f?.facts_hash||`${last?.model?.key||model}:${f?.pams_pin||f?.property_address||''}`);
}

function actionsFor(f){
  const value=actionStates[actionKey(f)];
  return Array.isArray(value)?value:[];
}

function rememberAction(f,name){
  const key=actionKey(f);
  const values=new Set(actionsFor(f));
  values.add(name);
  actionStates[key]=[...values];
  saveActionStates();
}

function renderModels(){
  return MODELS.map(m=>`<button class="dwi-model ${model===m.key?'on':''}" data-dwi-model="${m.key}" ${rank(plan)<rank(m.plan)?'disabled':''}><b>${esc(m.label)}</b><small>${m.plan==='pro_plus'?'Pro+':'Pro'} · ${esc(m.desc)}</small></button>`).join('');
}

function scopeSwitch(){
  if(rank(plan)<3)return'';
  return `<div class="dwi-scope-switch" role="group" aria-label="Intelligence scope">
    <button type="button" data-dwi-scope="rows" class="on"><i class="fas fa-table-list"></i><span><b>Current rows</b><small>Selected or visible properties</small></span></button>
    <button type="button" data-dwi-scope="farm"><i class="fas fa-map-location-dot"></i><span><b>My Farm</b><small>Server-resolved farm scan</small></span></button>
    <button type="button" data-dwi-scope="view"><i class="fas fa-bookmark"></i><span><b>Saved view</b><small>Exact saved Workbench population</small></span></button>
  </div>`;
}

function savedViewPicker(){
  if(rank(plan)<3)return'';
  const options=savedViews.map(v=>`<option value="${esc(v.id)}" ${String(v.id)===String(scopeViewId)?'selected':''}>${esc(v.name||'Saved view')} · ${esc(String(v.source_type||'saved').replace(/_/g,' '))}</option>`).join('');
  return `<div class="dwi-view-picker" id="dwi-view-picker" hidden><label for="dwi-view-select">Saved Workbench view</label>${savedViews.length?`<select id="dwi-view-select">${options}</select><small>Watchdog reproduces stable saved filters on the server. Session-dependent filters are refused rather than guessed.</small>`:'<div class="dwi-view-empty">No saved Workbench views yet. Save a workspace in Data Workbench first.</div>'}</div>`;
}

function selectedView(){return savedViews.find(v=>String(v.id)===String(scopeViewId))||null;}

function updateScopeCopy(){
  const count=$('#dwi-scope-count'),note=$('#dwi-scope-note'),picker=$('#dwi-view-picker');
  if(!count||!note)return;
  if(picker)picker.hidden=scopeMode!=='view';
  if(scopeMode==='farm'){
    count.textContent='My Farm';
    note.textContent='Resolved securely on the server · up to 250 properties per preview run';
    return;
  }
  if(scopeMode==='view'){
    const v=selectedView();
    count.textContent=v?.name||'Saved view';
    const viewFilters=v?.filters&&typeof v.filters==='object'?Object.keys(v.filters).filter(k=>v.filters[k]!==null&&v.filters[k]!==undefined&&v.filters[k]!=='').length:0;
    note.textContent=v?`${String(v.source_type||'saved').replace(/_/g,' ')} source · ${viewFilters?`${viewFilters} saved filter${viewFilters===1?'':'s'}`:'no saved filters'} · exact server resolution`:'Choose a saved Workbench view';
    return;
  }
  const ps=pins();
  count.textContent=`${ps.length.toLocaleString()} properties`;
  note.textContent=`${$$('[data-row]:checked').length?'Selected rows':'Visible Workbench rows'} · max 100 per preview run`;
}

function shell(){
  close();
  scopeMode='rows';
  filters={evidence:'all',scoreMin:0,confidenceMin:0,geography:'',propertyClass:'',changedDays:0,action:'all'};
  sortMode='score';
  if(!scopeViewId&&savedViews[0]?.id)scopeViewId=String(savedViews[0].id);
  const ps=pins(),back=document.createElement('div'),drawer=document.createElement('aside');
  back.id='dwi-backdrop';
  back.className='dwi-backdrop';
  drawer.id='dwi-drawer';
  drawer.className='dwi-drawer';
  drawer.setAttribute('aria-label','Watchdog Intelligence');
  drawer.innerHTML=`<header class="dwi-head"><div><span class="dwi-eyebrow">WATCHDOG INTELLIGENCE</span><h2>Turn this Workbench into a review queue</h2><p>Governed findings first. Analyst explanations come later.</p></div><button class="dwi-close" aria-label="Close">×</button></header><div class="dwi-body">${rank(plan)<2?upsell():`<div class="dwi-models">${renderModels()}</div>${scopeSwitch()}${savedViewPicker()}<div class="dwi-scope"><div><b id="dwi-scope-count">${ps.length.toLocaleString()} properties</b><small id="dwi-scope-note">${$$('[data-row]:checked').length?'Selected rows':'Visible Workbench rows'} · max 100 per preview run</small></div><button class="dwi-run" id="dwi-run"><i class="fas fa-wand-magic-sparkles"></i> Analyze</button></div><div class="dwi-trust"><b>Governed analysis:</b> current-row analysis submits property IDs only. Farm and Saved View scans are resolved from your Watchdog data on the server before evidence, normalization and scoring.</div><div id="dwi-results" class="dwi-status">Choose a model and analyze the current properties.</div>`}</div>`;
  document.body.append(back,drawer);
  back.onclick=close;
  $('.dwi-close',drawer).onclick=close;
  $$('[data-dwi-model]',drawer).forEach(b=>b.onclick=()=>{
    model=b.dataset.dwiModel;
    $$('[data-dwi-model]',drawer).forEach(x=>x.classList.toggle('on',x.dataset.dwiModel===model));
  });
  $$('[data-dwi-scope]',drawer).forEach(b=>b.onclick=()=>{
    scopeMode=b.dataset.dwiScope||'rows';
    $$('[data-dwi-scope]',drawer).forEach(x=>x.classList.toggle('on',x.dataset.dwiScope===scopeMode));
    updateScopeCopy();
  });
  $('#dwi-view-select',drawer)?.addEventListener('change',e=>{scopeViewId=e.target.value||'';updateScopeCopy();});
  $('#dwi-run',drawer)?.addEventListener('click',run);
}

function upsell(){
  return `<div class="dwi-upsell"><span class="dwi-eyebrow">PRO INTELLIGENCE</span><h3>Intelligence starts with Pro</h3><p>Pro turns governed property facts into ranked, evidence-backed findings. Pro+ adds Closing Review, population scans and Change Intelligence.</p><a href="/property/pro#plans">See Pro plans</a></div>`;
}

async function loadPropertyContexts(data){
  const findings=Array.isArray(data?.findings)?data.findings:[];
  const unresolved=findings.filter(f=>f?.pams_pin&&!(f.property_context?.municipality||f.property_context?.county||f.property_context?.property_class));
  if(!unresolved.length)return data;
  const pams_pins=[...new Set(unresolved.map(f=>f.pams_pin))].slice(0,250);
  try{
    const r=await client.functions.invoke('intelligence-property-context',{body:{pams_pins}});
    if(r.error||!r.data?.contexts)return data;
    findings.forEach(f=>{if(f?.pams_pin&&r.data.contexts[f.pams_pin])f.property_context={...(f.property_context||{}),...r.data.contexts[f.pams_pin]};});
  }catch(_){}
  return data;
}

async function run(){
  const button=$('#dwi-run'),host=$('#dwi-results'),ps=pins(),def=MODELS.find(x=>x.key===model);
  if(!def||rank(plan)<rank(def.plan)){toast(`${planName(def?.plan)} required`);return;}
  if((scopeMode==='farm'||scopeMode==='view')&&rank(plan)<3){toast('Pro+ required for population Intelligence.');return;}
  if(scopeMode==='rows'&&!ps.length){host.className='dwi-status';host.textContent='Select or load properties with a PAMS PIN first.';return;}
  if(scopeMode==='view'&&!scopeViewId){host.className='dwi-status';host.textContent='Save a Workbench view before running Saved View Intelligence.';return;}
  button.disabled=true;
  button.innerHTML='<i class="fas fa-circle-notch fa-spin"></i> Analyzing';
  host.className='dwi-status';
  host.textContent=scopeMode==='farm'?'Resolving your farm, governed evidence and deterministic scores…':scopeMode==='view'?'Resolving the exact saved Workbench population and governed evidence…':'Resolving governed evidence, cohort context and deterministic scores…';
  try{
    let functionName,body;
    if(scopeMode==='view'){
      functionName='intelligence-workbench-view-preview';
      body={model_key:model,scope_id:scopeViewId,limit:50};
    }else{
      body=scopeMode==='farm'
        ?{model_key:model,scope_type:'farm',scope_value:{source:'data_workbench',selection:'my_farm'},limit:50}
        :{model_key:model,scope_type:ps.length===1?'property':'custom',scope_value:{source:'data_workbench',selection:$$('[data-row]:checked').length?'selected':'visible'},pams_pins:ps,limit:Math.min(ps.length,50)};
      functionName=model==='property_change_priority'?'intelligence-change-run-preview':model==='closing_review'?'intelligence-closing-run-preview':model==='assessment_anomaly'?'intelligence-assessment-run-preview':'intelligence-run-preview';
    }
    const r=await client.functions.invoke(functionName,{body});
    if(r.error)throw r.error;
    last=await loadPropertyContexts(r.data);
    paint(last);
  }catch(e){
    host.className='dwi-status';
    host.innerHTML=`Watchdog Intelligence is not available for this scope yet.<br><small>${esc(e?.message||'The governed engine could not complete the run.')}</small>`;
  }finally{
    button.disabled=false;
    button.innerHTML='<i class="fas fa-wand-magic-sparkles"></i> Analyze';
  }
}

function contextFor(f){return f?.property_context&&typeof f.property_context==='object'?f.property_context:{};}

function latestEvidenceAt(f){
  if(f?.latest_evidence_at){const t=new Date(f.latest_evidence_at).getTime();if(Number.isFinite(t))return t;}
  let latest=0;
  (Array.isArray(f?.evidence)?f.evidence:[]).forEach(e=>{const t=new Date(e?.observed_at||0).getTime();if(Number.isFinite(t)&&t>latest)latest=t;});
  return latest;
}

function geographyOptions(findings){
  const values=new Map();
  findings.forEach(f=>{
    const c=contextFor(f);
    if(c.municipality)values.set(`m:${c.municipality}`,`${c.municipality} · municipality`);
    if(c.county)values.set(`c:${c.county}`,`${c.county} County`);
  });
  return [...values.entries()].sort((a,b)=>a[1].localeCompare(b[1]));
}

function classOptions(findings){
  return [...new Set(findings.map(f=>String(contextFor(f).property_class||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
}

function selectOptions(items,placeholder){return `<option value="">${esc(placeholder)}</option>${items.map(([value,label])=>`<option value="${esc(value)}">${esc(label)}</option>`).join('')}`;}

function paint(data){
  const host=$('#dwi-results'),findings=Array.isArray(data?.findings)?data.findings:[];
  if(!findings.length){host.className='dwi-status';host.textContent='No evidence-backed findings were produced for this set.';return;}
  const full=findings.filter(x=>!x.limited_evidence).length;
  const median=findings.map(x=>Number(x.evidence_coverage||0)).sort((a,b)=>a-b)[Math.floor(findings.length/2)]||0;
  const resolvedType=data?.resolved_scope?.type||data?.scope?.type;
  const scopeLabel=resolvedType==='farm'?'Farm scan':resolvedType==='workbench_view'?'Saved view':'Current rows';
  const geos=geographyOptions(findings),classes=classOptions(findings).map(x=>[x,`Class ${x}`]);
  host.className='';
  host.innerHTML=`
    <div class="dwi-summary">
      <div class="dwi-metric"><b>${findings.length}</b><span>findings</span></div>
      <div class="dwi-metric"><b>${full}</b><span>adequate evidence</span></div>
      <div class="dwi-metric"><b>${Math.round(median)}%</b><span>median coverage</span></div>
      <div class="dwi-metric"><b>${esc(scopeLabel)}</b><span>analysis scope</span></div>
    </div>
    <div class="dwi-queue-tools dwi-queue-tools-full">
      <div class="dwi-filter-group" role="group" aria-label="Evidence filter">
        <button data-dwi-filter="all" class="on">All</button><button data-dwi-filter="adequate">Adequate</button><button data-dwi-filter="limited">Limited</button>
      </div>
      <label>Score<select id="dwi-score-min"><option value="0">Any</option><option value="40">40+</option><option value="60">60+</option><option value="80">80+</option></select></label>
      <label>Confidence<select id="dwi-confidence-min"><option value="0">Any</option><option value="50">50%+</option><option value="70">70%+</option><option value="90">90%+</option></select></label>
      <label>Geography<select id="dwi-geography">${selectOptions(geos,'Any')}</select></label>
      <label>Property class<select id="dwi-property-class">${selectOptions(classes,'Any')}</select></label>
      <label>Evidence since<select id="dwi-changed-days"><option value="0">Any time</option><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="365">12 months</option></select></label>
      <label>Action state<select id="dwi-action-state"><option value="all">Any</option><option value="unacted">Unacted</option><option value="case">Case created</option><option value="watch">Watching</option><option value="report">Report created</option><option value="marketing">Sent to Marketing</option></select></label>
      <label>Sort<select id="dwi-sort"><option value="score">Score</option><option value="confidence">Confidence</option><option value="evidence">Evidence</option><option value="latest">Newest evidence</option><option value="address">Address</option></select></label>
    </div>
    <div class="dwi-queue-count" id="dwi-filter-count"></div>
    <div id="dwi-list"></div><div id="dwi-detail"></div>
    <div class="dwi-preview">${esc(data?.warning||'Preview analysis. Model calibration is not complete.')}</div>`;
  $$('[data-dwi-filter]',host).forEach(b=>b.onclick=()=>{
    filters.evidence=b.dataset.dwiFilter;
    $$('[data-dwi-filter]',host).forEach(x=>x.classList.toggle('on',x.dataset.dwiFilter===filters.evidence));
    renderQueue();
  });
  $('#dwi-score-min',host).onchange=e=>{filters.scoreMin=Number(e.target.value||0);renderQueue();};
  $('#dwi-confidence-min',host).onchange=e=>{filters.confidenceMin=Number(e.target.value||0);renderQueue();};
  $('#dwi-geography',host).onchange=e=>{filters.geography=e.target.value||'';renderQueue();};
  $('#dwi-property-class',host).onchange=e=>{filters.propertyClass=e.target.value||'';renderQueue();};
  $('#dwi-changed-days',host).onchange=e=>{filters.changedDays=Number(e.target.value||0);renderQueue();};
  $('#dwi-action-state',host).onchange=e=>{filters.action=e.target.value||'all';renderQueue();};
  $('#dwi-sort',host).onchange=e=>{sortMode=e.target.value;renderQueue();};
  renderQueue();
}

function geographyMatches(f,value){
  if(!value)return true;
  const c=contextFor(f),prefix=value.slice(0,2),wanted=value.slice(2);
  if(prefix==='m:')return String(c.municipality||'')===wanted;
  if(prefix==='c:')return String(c.county||'')===wanted;
  return true;
}

function actionMatches(f,value){
  if(value==='all')return true;
  const actions=actionsFor(f);
  if(value==='unacted')return actions.length===0;
  return actions.includes(value);
}

function renderQueue(){
  const host=$('#dwi-list');
  if(!host||!last)return;
  const all=Array.isArray(last.findings)?last.findings:[];
  let findings=[...all];
  if(filters.evidence==='adequate')findings=findings.filter(x=>!x.limited_evidence);
  if(filters.evidence==='limited')findings=findings.filter(x=>x.limited_evidence);
  findings=findings.filter(f=>Number(f.score||0)>=filters.scoreMin&&Number(f.confidence||0)>=filters.confidenceMin);
  findings=findings.filter(f=>geographyMatches(f,filters.geography));
  if(filters.propertyClass)findings=findings.filter(f=>String(contextFor(f).property_class||'')===String(filters.propertyClass));
  if(filters.changedDays){
    const cutoff=Date.now()-filters.changedDays*86400000;
    findings=findings.filter(f=>latestEvidenceAt(f)>=cutoff);
  }
  findings=findings.filter(f=>actionMatches(f,filters.action));
  findings.sort((a,b)=>{
    if(sortMode==='confidence')return Number(b.confidence||0)-Number(a.confidence||0)||Number(b.score||0)-Number(a.score||0);
    if(sortMode==='evidence')return Number(b.evidence_coverage||0)-Number(a.evidence_coverage||0)||Number(b.score||0)-Number(a.score||0);
    if(sortMode==='latest')return latestEvidenceAt(b)-latestEvidenceAt(a)||Number(b.score||0)-Number(a.score||0);
    if(sortMode==='address')return String(a.property_address||a.pams_pin||'').localeCompare(String(b.property_address||b.pams_pin||''));
    return Number(a.limited_evidence)-Number(b.limited_evidence)||Number(b.score||0)-Number(a.score||0);
  });
  const count=$('#dwi-filter-count');
  if(count)count.textContent=`Showing ${findings.length} of ${all.length} findings`;
  host.innerHTML=findings.length?findings.map((f,i)=>card(f,i)).join(''):'<div class="dwi-status">No findings match the current queue filters.</div>';
  $$('[data-dwi-finding]',host).forEach((b,i)=>b.onclick=()=>detail(findings[i]));
  const detailHost=$('#dwi-detail');
  if(detailHost)detailHost.innerHTML='';
}

function contextTags(f){
  const c=contextFor(f),tags=[];
  if(c.municipality)tags.push(c.municipality);
  if(c.county)tags.push(`${c.county} County`);
  if(c.property_class)tags.push(`Class ${c.property_class}`);
  return tags;
}

function card(f,i){
  const why=(f.why_now||[])[0],limited=!!f.limited_evidence,actionTags=actionsFor(f),tags=contextTags(f);
  return `<article class="dwi-finding"><div class="dwi-score ${limited?'limited':''}">${Math.round(Number(f.score||0))}</div><div><h3>${esc(f.property_address||f.pams_pin||'Property')}</h3><p>${why?`${esc(why.signal_id)} · normalized ${Math.round(Number(why.score||0))}/100`:'Evidence-backed review finding'}</p><div class="dwi-tags"><span class="dwi-tag">Confidence ${Math.round(Number(f.confidence||0))}%</span><span class="dwi-tag">Evidence ${Math.round(Number(f.evidence_coverage||0))}%</span>${limited?'<span class="dwi-tag">Limited evidence</span>':''}${tags.map(t=>`<span class="dwi-tag dwi-context-tag">${esc(t)}</span>`).join('')}${actionTags.map(t=>`<span class="dwi-tag dwi-action-tag">${esc(t.replace(/_/g,' '))}</span>`).join('')}</div></div><button class="dwi-evidence-btn" data-dwi-finding="${i}">Why now?</button></article>`;
}

function markerIds(f){return [...new Set((Array.isArray(f?.evidence)?f.evidence:[]).map(x=>String(x?.signal_id||'').trim()).filter(Boolean))];}
function scopeLineage(){const s=last?.resolved_scope||last?.scope||null;return {scope_type:s?.type||null,scope_value:s?.value||s||null};}
function findingLineage(f){return {kind:'watchdog_intelligence',run_id:last?.run_id||null,evidence_batch_id:last?.evidence_batch_id||null,...scopeLineage(),model_key:last?.model?.key||model,model_version:last?.model?.version||null,model_status:last?.model?.status||null,calibration_state:last?.model?.calibration_state||null,engine_version:last?.engine_version||null,pipeline_engine:last?.pipeline_engine||null,derived_engine:last?.derived?.engine_version||null,normalization_engine:last?.normalization?.engine_version||null,facts_hash:f?.facts_hash||null,score:Number(f?.score||0),confidence:Number(f?.confidence||0),evidence_coverage:Number(f?.evidence_coverage||0),limited_evidence:!!f?.limited_evidence,property_context:contextFor(f)};}
function evidenceSnapshot(f){return {...findingLineage(f),why_now:Array.isArray(f?.why_now)?f.why_now:[],evidence:Array.isArray(f?.evidence)?f.evidence:[],missing_evidence:Array.isArray(f?.missing_evidence)?f.missing_evidence:[],recommended_actions:Array.isArray(f?.recommended_actions)?f.recommended_actions:[],captured_at:new Date().toISOString()};}

async function userId(){
  if(currentUserId)return currentUserId;
  const {data,error}=await client.auth.getUser();
  if(error||!data?.user)throw new Error('Your session could not be verified.');
  currentUserId=data.user.id;
  return currentUserId;
}

async function addToCase(f){
  if(!f?.pams_pin)throw new Error('This finding does not have a PAMS PIN.');
  const title=`Intelligence Review · ${f.property_address||f.pams_pin}`.slice(0,240),markers=markerIds(f),snapshot=evidenceSnapshot(f);
  const {data,error}=await client.from('professional_cases').insert({pams_pin:f.pams_pin,title,property_address:f.property_address||null,pinned_marker_ids:markers,evidence_snapshot:snapshot,notes:'Created from a Watchdog Intelligence finding. Review the attached evidence before making a professional conclusion.'}).select('id').single();
  if(error)throw error;
  const activity=await client.from('professional_case_activity').insert({case_id:data.id,activity_type:'intelligence_finding_added',details:{run_id:last?.run_id||null,model_key:last?.model?.key||model,model_version:last?.model?.version||null,facts_hash:f.facts_hash||null,score:Number(f.score||0),confidence:Number(f.confidence||0),evidence_coverage:Number(f.evidence_coverage||0)}});
  if(activity.error)console.warn('Watchdog Intelligence case activity',activity.error);
  return data;
}

async function watchProperty(f){
  if(!f?.pams_pin)throw new Error('This finding does not have a PAMS PIN.');
  const uid=await userId(),address=String(f.property_address||f.pams_pin).slice(0,300);
  const {data,error}=await client.from('saved_properties').upsert({user_id:uid,pams_pin:f.pams_pin,address,kind:'watch',source_ref:`watchdog_intelligence:${last?.run_id||'finding'}`},{onConflict:'user_id,pams_pin,kind'}).select('id').single();
  if(error)throw error;
  return data;
}

async function createReport(f){
  const markers=markerIds(f),lineage=findingLineage(f),title=`Watchdog Intelligence · ${f.property_address||f.pams_pin||'Review'}`.slice(0,240);
  const {data,error}=await client.from('professional_reports').insert({pams_pin:f.pams_pin||null,title,preset:'custom',selected_marker_ids:markers,source_manifest:[{...lineage,source_kind:'watchdog_intelligence_finding',evidence_signals:markers,missing_signals:(Array.isArray(f?.missing_evidence)?f.missing_evidence:[]).map(x=>x?.signal_id).filter(Boolean)}]}).select('id').single();
  if(error)throw error;
  return data;
}

function sendToMarketing(f){
  if(!f?.pams_pin)throw new Error('This finding does not have a PAMS PIN.');
  const label=last?.model?.label||MODELS.find(x=>x.key===model)?.label||'Intelligence';
  const why=(Array.isArray(f?.why_now)?f.why_now:[]).map(x=>x?.signal_id).filter(Boolean).slice(0,3);
  rememberAction(f,'marketing');
  sessionStorage.setItem('watchdog_marketing_handoff',JSON.stringify({source:'watchdog_intelligence',property_keys:[f.pams_pin],qualification_summary:`${label} review finding. Score ${Number(f.score||0).toFixed(1)}, confidence ${Number(f.confidence||0).toFixed(1)}%, evidence ${Number(f.evidence_coverage||0).toFixed(1)}%. Review source evidence before outreach.`,intelligence:{...findingLineage(f),why_now_signals:why},created_at:Date.now()}));
  location.href='/property/marketing-studio?source=watchdog_intelligence';
}

async function act(name,f,button){
  if(!button||button.disabled)return;
  if(name==='marketing'){
    try{sendToMarketing(f);}catch(e){toast(e?.message||'Watchdog could not prepare Marketing Studio.');}
    return;
  }
  const original=button.innerHTML;
  button.disabled=true;
  button.innerHTML='<i class="fas fa-circle-notch fa-spin"></i> Saving';
  try{
    if(name==='case'){
      await addToCase(f);rememberAction(f,'case');button.innerHTML='<i class="fas fa-check"></i> Added to case';toast('Added to Professional Case.');
    }else if(name==='watch'){
      await watchProperty(f);rememberAction(f,'watch');button.innerHTML='<i class="fas fa-check"></i> Watching';toast('Property added to your Watchlist.');
    }else if(name==='report'){
      await createReport(f);rememberAction(f,'report');button.innerHTML='<i class="fas fa-check"></i> Report created';toast('Draft professional report created.');
    }else throw new Error('Unknown Intelligence action.');
  }catch(e){
    button.disabled=false;
    button.innerHTML=original;
    toast(e?.message||'Watchdog could not complete that action.');
  }
}

function isDerivedEvidence(e){
  const kind=String(e?.lineage?.provider_kind||'').toLowerCase();
  return !!e?.lineage?.formula||kind.includes('derived')||kind.includes('formula');
}

function evidenceCard(e,kind){
  const url=safeUrl(e?.source_url),line=e?.lineage||{},norm=e?.normalization||{},parts=[];
  if(e?.source_key)parts.push(`Source ${esc(e.source_key)}`);
  if(e?.observed_at)parts.push(`Observed ${esc(dateLabel(e.observed_at))}`);
  if(norm?.feature_version!=null)parts.push(`Feature v${esc(norm.feature_version)}`);
  if(norm?.transform_type)parts.push(esc(norm.transform_type));
  if(e?.cohort?.sample_size)parts.push(`${esc(e.cohort.sample_size)} peer records`);
  if(line?.provider_kind)parts.push(esc(line.provider_kind));
  if(line?.engine_version)parts.push(esc(line.engine_version));
  const dependencies=Array.isArray(line?.dependencies)?line.dependencies:[];
  return `<article class="dwi-evidence ${kind==='derived'?'dwi-derived':''}"><div class="dwi-evidence-head"><b>${esc(e.signal_id)}</b><span>${kind==='derived'?'Watchdog-derived':'Source fact'}</span></div><strong>Normalized ${esc(e.score)} / 100${e.value!=null?` · source value ${esc(e.value)}`:''}</strong>${parts.length?`<small>${parts.join(' · ')}</small>`:''}${e?.explanation?`<p>${esc(e.explanation)}</p>`:''}${line?.formula?`<code>${esc(line.formula)}</code>`:''}${dependencies.length?`<small>Depends on ${dependencies.map(esc).join(', ')}</small>`:''}${url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Inspect source <i class="fas fa-arrow-up-right-from-square"></i></a>`:''}</article>`;
}

function detail(f){
  const host=$('#dwi-detail');
  if(!host)return;
  const evidence=Array.isArray(f.evidence)?f.evidence:[],missing=Array.isArray(f.missing_evidence)?f.missing_evidence:[],facts=evidence.filter(e=>!isDerivedEvidence(e)),derived=evidence.filter(isDerivedEvidence),why=Array.isArray(f.why_now)?f.why_now:[],lineage=findingLineage(f),ctx=contextFor(f),modelLabel=last?.model?.label||MODELS.find(x=>x.key===model)?.label||model;
  host.innerHTML=`<section class="dwi-detail">
    <div class="dwi-detail-title"><div><span class="dwi-eyebrow">WHY WATCHDOG FLAGGED THIS</span><h3>${esc(f.property_address||f.pams_pin||'Property')}</h3><p>${[ctx.municipality,ctx.county?`${ctx.county} County`:null,ctx.property_class?`Class ${ctx.property_class}`:null].filter(Boolean).map(esc).join(' · ')}</p></div><div class="dwi-model-state"><b>${esc(modelLabel)} v${esc(last?.model?.version||'?')}</b><span>${esc(last?.model?.status||'preview')} · ${esc(last?.model?.calibration_state||'uncalibrated')}</span></div></div>
    <div class="dwi-conclusion"><b>Review finding</b><p>Score ${Number(f.score||0).toFixed(1)} · confidence ${Number(f.confidence||0).toFixed(1)}% · evidence ${Number(f.evidence_coverage||0).toFixed(1)}%. This is a review queue item, not a determination.</p>${why.length?`<ul>${why.map(w=>`<li><b>${esc(w.signal_id)}</b> contributed ${Number(w.contribution||0).toFixed(1)} points${w.explanation?` · ${esc(w.explanation)}`:''}</li>`).join('')}</ul>`:''}</div>
    ${facts.length?`<section class="dwi-detail-section"><h4>Factual evidence</h4><div class="dwi-detail-grid">${facts.map(e=>evidenceCard(e,'fact')).join('')}</div></section>`:''}
    ${derived.length?`<section class="dwi-detail-section"><h4>Watchdog-derived intelligence</h4><p>Calculated from governed source facts. Derived signals are not source records themselves.</p><div class="dwi-detail-grid">${derived.map(e=>evidenceCard(e,'derived')).join('')}</div></section>`:''}
    <section class="dwi-detail-section"><h4>Missing evidence</h4>${missing.length?`<div class="dwi-detail-grid">${missing.map(e=>`<article class="dwi-evidence dwi-missing"><b>${esc(e.signal_id)}</b><strong>${esc(e.reason||'Evidence unavailable')}</strong>${e?.source_key?`<small>Expected source ${esc(e.source_key)}</small>`:''}${e?.normalization?.detail?.reason?`<p>${esc(e.normalization.detail.reason)}</p>`:''}</article>`).join('')}</div>`:'<p class="dwi-complete-evidence"><i class="fas fa-circle-check"></i> No required model evidence is missing for this finding.</p>'}</section>
    <section class="dwi-detail-section dwi-lineage"><h4>Source and model lineage</h4><dl><div><dt>Model</dt><dd>${esc(lineage.model_key)} v${esc(lineage.model_version)}</dd></div><div><dt>Model state</dt><dd>${esc(lineage.model_status||'preview')} · ${esc(lineage.calibration_state||'uncalibrated')}</dd></div><div><dt>Scoring engine</dt><dd>${esc(lineage.engine_version||'not reported')}</dd></div><div><dt>Pipeline</dt><dd>${esc(lineage.pipeline_engine||'not reported')}</dd></div><div><dt>Derived runtime</dt><dd>${esc(lineage.derived_engine||'not used')}</dd></div><div><dt>Normalization</dt><dd>${esc(lineage.normalization_engine||'not reported')}</dd></div><div><dt>Facts hash</dt><dd><code>${esc(String(lineage.facts_hash||'not reported').slice(0,24))}${lineage.facts_hash?'…':''}</code></dd></div></dl></section>
    <section class="dwi-detail-section"><h4>Next actions</h4><div class="dwi-actions"><button type="button" data-dwi-action="case"><i class="fas fa-briefcase"></i> Add to case</button><button type="button" data-dwi-action="watch"><i class="fas fa-eye"></i> Watch property</button><button type="button" data-dwi-action="report"><i class="fas fa-file-lines"></i> Create report</button><button type="button" data-dwi-action="marketing"><i class="fas fa-bullhorn"></i> Marketing Studio</button></div><div class="dwi-preview">Actions use existing Watchdog workflows. Case and Report retain Intelligence lineage. Marketing Studio receives only the property and a review-safe qualification summary.</div></section>
  </section>`;
  $$('[data-dwi-action]',host).forEach(b=>b.onclick=()=>act(b.dataset.dwiAction,f,b));
  host.scrollIntoView({behavior:'smooth',block:'nearest'});
}

async function loadSavedViews(){
  if(rank(plan)<3)return;
  const {data,error}=await client.from('data_workbench_views').select('id,name,source_type,filters,sort_config,page_size,updated_at').order('updated_at',{ascending:false}).limit(50);
  if(!error&&Array.isArray(data)){
    savedViews=data;
    if(!scopeViewId&&data[0]?.id)scopeViewId=String(data[0].id);
  }
}

async function install(){
  try{
    await Promise.resolve(window.njptrAccessReady);
    client=window.NJPTRAccess?.client?.();
    if(!client)return;
    const usage=await client.rpc('get_agent_usage');
    plan=usage.data?.plan||'standard';
    await loadSavedViews();
    const timer=setInterval(()=>{
      const bar=$('.dw-toolbar');
      if(!bar)return;
      clearInterval(timer);
      if($('#dw-intelligence'))return;
      const b=document.createElement('button');
      b.id='dw-intelligence';
      b.className='dwi-trigger '+(rank(plan)<2?'locked':'');
      b.innerHTML=`<i class="fas fa-wand-magic-sparkles"></i> Intelligence${rank(plan)<2?' · Pro':''}`;
      b.onclick=shell;
      const refresh=$('#dw-refresh');
      refresh?bar.insertBefore(b,refresh):bar.appendChild(b);
    },120);
  }catch(_){}
}

window.WatchdogIntelligenceWorkbench={open:shell,getLastRun:()=>last};
install();
})();
