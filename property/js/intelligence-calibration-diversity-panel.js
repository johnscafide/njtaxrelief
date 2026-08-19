(function(){
'use strict';
if(window.__WATCHDOG_CALIBRATION_DIVERSITY_PANEL__)return;
window.__WATCHDOG_CALIBRATION_DIVERSITY_PANEL__=true;

var host=null,select=null,client=null,lastId='',timer=0;
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function labelWarning(v){var s=String(v||'');if(s.indexOf('prediction_collapse:')===0)return'Predictions collapsed into one class';if(s.indexOf('score_collapse:')===0)return'Model scores have almost no variation';if(s.indexOf('feature_vector_collapse:')===0)return'Governed feature vectors are too repetitive';if(s.indexOf('all_observed_signals_collapsed')===0)return'Every observed signal is structurally collapsed';if(s.indexOf('positive_class_insufficient:')===0)return'Too few independently labeled Priority cases for stable evaluation';if(s.indexOf('negative_class_insufficient:')===0)return'Too few independently labeled Not priority cases for stable evaluation';return s.replace(/_/g,' ')}
function ensure(){
  select=document.getElementById('cr-set');if(!select)return null;
  host=document.getElementById('cr-diversity');if(host)return host;
  host=document.createElement('section');host.id='cr-diversity';host.className='cr-diversity';host.setAttribute('aria-live','polite');
  var controls=document.querySelector('.cr-controls');if(controls)controls.insertAdjacentElement('beforebegin',host);else document.querySelector('.cr-shell')?.appendChild(host);
  return host
}
function loading(){if(host)host.innerHTML='<div class="crd-loading"><i class="fas fa-circle-notch fa-spin"></i><span>Checking holdout diversity…</span></div>'}
function render(r){
  if(!host)return;var warnings=Array.isArray(r.warnings)?r.warnings:[],ready=Boolean(r.representative_ready),score=r.score_stats||{},pred=r.prediction_counts||{};
  host.className='cr-diversity '+(ready?'ready':'blocked');
  host.innerHTML='<header><div><span>HOLDOUT QUALITY · STRUCTURAL CHECK</span><h2>'+(ready?'Structurally diverse enough to evaluate.':'Do not use this set as promotion proof.')+'</h2><p>'+esc(r.interpretation||'Model quality thresholds remain a separate gate.')+'</p></div><div class="crd-state"><i class="fas '+(ready?'fa-circle-check':'fa-triangle-exclamation')+'"></i><b>'+(ready?'DIVERSITY OK':'DIVERSITY BLOCK')+'</b></div></header><div class="crd-metrics"><article><b>'+Number(r.reviewed_cases||0)+'</b><span>reviewed</span></article><article><b>'+Number(r.positive_cases||0)+' / '+Number(r.negative_cases||0)+'</b><span>priority / not priority</span></article><article><b>'+Number(score.distinct||0)+'</b><span>distinct model scores</span></article><article><b>'+Number(r.unique_feature_vectors||0)+'</b><span>unique feature vectors</span></article><article><b>'+Number(pred.review_priority||0)+' / '+Number(pred.not_priority||0)+'</b><span>predicted priority / not</span></article></div>'+(warnings.length?'<div class="crd-warnings">'+warnings.map(function(w){return'<span><i class="fas fa-circle-exclamation"></i>'+esc(labelWarning(w))+'</span>'}).join('')+'</div>':'<div class="crd-clear"><i class="fas fa-shield-halved"></i> Structural diversity passed. Precision, recall, false-positive rate and fresh independent-label requirements still apply.</div>')
}
function fail(message){if(!host)return;host.className='cr-diversity unavailable';host.innerHTML='<div class="crd-loading"><i class="fas fa-triangle-exclamation"></i><span><b>Holdout diversity unavailable.</b> '+esc(message||'Do not assume the set is representative.')+'</span></div>'}
async function refresh(force){
  if(!ensure())return;var id=String(select.value||'');if(!id)return;if(!force&&id===lastId)return;lastId=id;loading();
  try{client=client||(window.NJPTRAccess&&window.NJPTRAccess.client&&window.NJPTRAccess.client());if(!client)throw new Error('Developer Supabase client unavailable');var result=await client.functions.invoke('intelligence-calibration-diversity',{body:{calibration_set_id:id}});if(result.error)throw result.error;var row=result.data&&Array.isArray(result.data.results)?result.data.results[0]:null;if(!row)throw new Error('No diversity result returned');render(row)}catch(error){fail(error&&error.message||'Diagnostic request failed')}
}
function boot(){if(!ensure()){setTimeout(boot,250);return}select.addEventListener('change',function(){lastId='';setTimeout(function(){refresh(true)},20)});new MutationObserver(function(){clearTimeout(timer);timer=setTimeout(function(){if(String(select.value||'')!==lastId)refresh(true)},80)}).observe(select,{childList:true,subtree:true});setTimeout(function(){refresh(true)},350)}
window.WatchdogCalibrationDiversityPanel={refresh:refresh,contract:'watchdog-calibration-diversity-panel-v1'};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
