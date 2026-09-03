(function(){
'use strict';
var form=document.getElementById('wd-anchor-form');
if(!form||!window.WatchdogAnchorPdf2025)return;
function q(s,r){return(r||document).querySelector(s)}
function qa(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))}
function copyText(id){var el=q('#'+id);return el?String(el.textContent||'').trim():''}
function setPath(root,path,value){var keys=String(path||'').split('.').filter(Boolean),cursor=root;if(!keys.length)return;keys.slice(0,-1).forEach(function(key){if(!cursor[key]||typeof cursor[key]!=='object'||Array.isArray(cursor[key]))cursor[key]={};cursor=cursor[key];});cursor[keys[keys.length-1]]=value;}
function choiceValue(raw){if(raw==='yes')return true;if(raw==='no')return false;return raw;}
function amount(value){var n=Number(String(value==null?'':value).replace(/[$,\s]/g,''));return Number.isFinite(n)&&n>=0?n:0;}
function money(value){return '$'+Math.round(amount(value)).toLocaleString();}
function emit(el){if(!el)return;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}
function cloneTemplate(id){var t=q('#'+id);return t&&t.content?t.content.firstElementChild.cloneNode(true):null;}
function collectState(){
  var state={mailing:{state:'NJ'},property:{facility_type:'none'},applicant:{},spouse:{},oct1:{},anc:{},pas:{schedule1:{home1:{},home2:{}}},income_2024:{},income_2025:{},preparer:{},preparer_role:'self'};
  qa('input[name],select[name],textarea[name]',form).forEach(function(el){
    var value=el.type==='checkbox'?!!el.checked:String(el.value||'').trim();
    setPath(state,el.name,value);
  });
  qa('[data-choice]',form).forEach(function(group){
    var selected=q('.is-selected[data-value]',group);
    if(selected)setPath(state,group.dataset.choice,choiceValue(selected.dataset.value));
  });
  var filing=String(state.filing_status||''),ay=Number(state.applicant&&state.applicant.birth_year||9999),sy=Number(state.spouse&&state.spouse.birth_year||9999);
  if(!state.pas)state.pas={};
  state.pas.born_1960_or_earlier=ay<=1960||((filing==='D'||filing==='F')&&sy<=1960);
  return state;
}
function routeFromUi(){
  var badge=q('#wd-route-badge');
  if(!badge||!String(badge.textContent||'').trim())return '';
  return String(badge.textContent).toLowerCase().indexOf('pas-1')>=0?'pas-1':'anc-1';
}
function installWelcome(){
  var welcome=q('.wd-step[data-step="welcome"]');if(!welcome)return;
  var copy=q('.wd-step-copy',welcome),welcomeCopy=copyText('wd-welcome-copy');if(copy&&welcomeCopy)copy.textContent=welcomeCopy;
  var callout=q('.wd-callout.neutral',welcome),readiness=q('#wd-readiness-copy');
  if(callout&&readiness){callout.classList.add('wd-readiness-callout');callout.replaceChildren.apply(callout,Array.from(readiness.childNodes).map(function(node){return node.cloneNode(true);}));}
  var start=q('[data-next]',welcome);
  function syncStart(){if(!start)return;var boxes=qa('[data-readiness]',welcome);start.disabled=!boxes.length||boxes.some(function(box){return!box.checked;});}
  welcome.addEventListener('change',function(ev){if(ev.target.matches('[data-readiness]'))syncStart();});
  syncStart();
  var trust=qa('.wd-app-rail-trust > div');
  if(trust[2]){var strong=q('strong',trust[2]),small=q('small',trust[2]);if(strong)strong.textContent=copyText('wd-relief-profile-title');if(small)small.textContent=copyText('wd-relief-profile-subtitle');}
}
function installIncomeGuidance(){
  var ancInput=q('input[name="nj_gross_income_2025"]',form);
  if(ancInput){var ancStep=ancInput.closest('.wd-step'),ancCard=cloneTemplate('wd-anc-income-help-template');if(ancStep&&ancCard&&!q('.wd-anc-income-help',ancStep)){var anchor=ancInput.closest('label')||ancInput.parentElement;anchor.parentNode.insertBefore(ancCard,anchor);}}
  var pasStep=q('.wd-step[data-step="pas-income"]',form);if(!pasStep)return;
  var list=q('.wd-income-list',pasStep);if(!list)return;
  [2024,2025].forEach(function(year){
    var calc=cloneTemplate('wd-pas-income-calculator-template');if(!calc)return;calc.dataset.year=String(year);var yearLabel=q('[data-calc-year]',calc);if(yearLabel)yearLabel.textContent=String(year);list.parentNode.insertBefore(calc,list);
    var total=cloneTemplate('wd-pas-total-template');if(total){var y=q('[data-pas-total-year]',total);if(y)y.textContent=String(year)+' PAS-1 total annual income';total.dataset.year=String(year);list.insertAdjacentElement('afterend',total);}
    var target=q('input[name="income_'+year+'.a"]',pasStep),workTotal=q('[data-work-total]',calc),use=q('[data-use-work-total]',calc);
    function worksheetTotal(){var sum=qa('[data-work-line]',calc).reduce(function(n,el){return n+amount(el.value);},0);if(workTotal)workTotal.textContent=money(sum);return sum;}
    calc.addEventListener('input',worksheetTotal);
    if(use)use.addEventListener('click',function(){var sum=worksheetTotal();if(target){target.value=sum.toFixed(2);emit(target);}syncPasTotals();});
  });
  function syncPasTotals(){[2024,2025].forEach(function(year){var total=['a','b','c','d','e'].reduce(function(sum,key){var el=q('input[name="income_'+year+'.'+key+'"]',pasStep);return sum+amount(el&&el.value);},0),card=q('.wd-pas-total-card[data-year="'+year+'"]',pasStep),out=card&&q('[data-pas-total-value]',card);if(out)out.textContent=money(total);});}
  pasStep.addEventListener('input',syncPasTotals,true);pasStep.addEventListener('change',syncPasTotals,true);syncPasTotals();
}
function splitParcel(value){var raw=String(value==null?'':value).trim();if(!raw)return{main:'',suffix:''};var match=raw.match(/^([^\.\s]+)(?:\.([^\s]+))?$/);return match?{main:match[1]||'',suffix:match[2]||''}:{main:raw,suffix:''};}
function parcelValues(source){source=source||{};var b=splitParcel(source.block),l=splitParcel(source.lot);return{block:b.main,block_suffix:b.suffix,lot:l.main,lot_suffix:l.suffix,qualifier:String(source.qualifier||'').trim()};}
function applyParcel(values,card){var fields={block:'property.block',block_suffix:'property.block_suffix',lot:'property.lot',lot_suffix:'property.lot_suffix',qualifier:'property.qualifier'},changed=false;Object.keys(fields).forEach(function(key){var el=q('input[name="'+fields[key]+'"]',form),value=String(values[key]||'').trim();if(el&&value&&!String(el.value||'').trim()){el.value=value;emit(el);changed=true;}});var box=q('#wd-watchdog-parcel-prefill',card),text=q('#wd-watchdog-parcel-values',card);if(box&&(values.block||values.lot)){box.hidden=false;if(text)text.textContent=['Block '+(values.block+(values.block_suffix?'.'+values.block_suffix:'')),'Lot '+(values.lot+(values.lot_suffix?'.'+values.lot_suffix:'')),values.qualifier?'Qualifier '+values.qualifier:''].filter(Boolean).join(' | ');}return changed;}
function sessionParcel(){try{var row=JSON.parse(sessionStorage.getItem('wd_anchor_2025_prefill')||'null');return row&&row.property?parcelValues(row.property):null;}catch(_){return null;}}
function ensureParcelRuntime(){if(typeof window.enrichLead==='function')return Promise.resolve();return new Promise(function(resolve,reject){var existing=q('script[src="/nj-parcel-enrich.js"]');if(existing){existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',reject,{once:true});setTimeout(function(){typeof window.enrichLead==='function'?resolve():reject(new Error('parcel runtime'));},1800);return;}var script=document.createElement('script');script.src='/nj-parcel-enrich.js';script.async=true;script.onload=resolve;script.onerror=reject;document.head.appendChild(script);});}
function installParcelGuidance(){
  var block=q('input[name="property.block"]',form);if(!block)return;var step=block.closest('.wd-step'),card=cloneTemplate('wd-parcel-help-template');if(!step||!card||q('.wd-parcel-help',step))return;var grid=block.closest('.wd-field-grid')||block.parentElement;grid.parentNode.insertBefore(card,grid);
  var session=sessionParcel();if(session)applyParcel(session,card);
  var button=q('#wd-watchdog-parcel-lookup',card),status=q('#wd-watchdog-parcel-lookup-status',card);
  if(button)button.addEventListener('click',async function(){var street=q('input[name="mailing.address"]',form),city=q('input[name="mailing.city"]',form),state=q('input[name="mailing.state"]',form),zip=q('input[name="mailing.zip"]',form),address=[street&&street.value,city&&city.value,state&&state.value,zip&&zip.value].filter(Boolean).join(', ');if(!street||!String(street.value||'').trim()||!city||!String(city.value||'').trim()){if(status)status.textContent=copyText('wd-parcel-missing-address');return;}button.disabled=true;if(status)status.textContent=copyText('wd-parcel-looking-up');try{await ensureParcelRuntime();if(typeof window.enrichLead!=='function')throw new Error('parcel');var subject=await window.enrichLead(address);if(!subject||subject.status!=='ok'||(!subject.block&&!subject.lot)){if(status)status.textContent=copyText('wd-parcel-not-found');return;}applyParcel(parcelValues(subject),card);if(status)status.textContent=copyText('wd-parcel-found');}catch(_){if(status)status.textContent=copyText('wd-parcel-not-found');}finally{button.disabled=false;}});
}
var preview={open:false,url:'',timer:null,busy:false,queued:false,lastRoute:''};
function installPreview(){
  var source=q('#wd-pdf-preview-static'),bar=source&&q('.wd-pdf-preview-bar',source),shade=source&&q('.wd-pdf-preview-shade',source),drawer=source&&q('.wd-pdf-preview-drawer',source);if(!bar||!shade||!drawer)return;
  document.body.appendChild(bar);document.body.appendChild(shade);document.body.appendChild(drawer);
  var openButton=q('#wd-open-pdf-preview'),closeButton=q('#wd-close-pdf-preview'),title=q('#wd-pdf-bar-title'),copy=q('#wd-pdf-bar-copy');
  function syncRoute(){
    var route=routeFromUi();
    preview.lastRoute=route;
    if(route){
      openButton.disabled=false;
      title.textContent=(route==='pas-1'?'PAS-1':'ANC-1')+' live preview';
      copy.textContent=copyText('wd-pdf-ready-copy');
    }else{
      openButton.disabled=true;
      title.textContent=copyText('wd-pdf-title-copy');
      copy.textContent=copyText('wd-pdf-waiting-copy');
    }
    return route;
  }
  function close(){preview.open=false;drawer.classList.remove('is-open');shade.classList.remove('is-open');drawer.setAttribute('aria-hidden','true');document.body.classList.remove('wd-pdf-preview-open');}
  function open(){if(!syncRoute())return;preview.open=true;drawer.classList.add('is-open');shade.classList.add('is-open');drawer.setAttribute('aria-hidden','false');document.body.classList.add('wd-pdf-preview-open');renderPreview(true);}
  openButton.addEventListener('click',open);closeButton.addEventListener('click',close);shade.addEventListener('click',close);document.addEventListener('keydown',function(ev){if(ev.key==='Escape'&&preview.open)close();});
  async function renderPreview(force){
    if(!preview.open&&!force)return;
    if(preview.busy){preview.queued=true;return;}
    var route=syncRoute();if(!route)return;
    preview.busy=true;preview.queued=false;
    var loading=q('#wd-pdf-preview-loading'),frame=q('#wd-pdf-preview-frame'),meta=q('#wd-pdf-preview-meta'),heading=q('#wd-pdf-preview-title');
    loading.classList.add('is-visible');
    heading.textContent='2025 '+(route==='pas-1'?'PAS-1':'ANC-1')+' preview';
    meta.textContent=copyText('wd-pdf-updating-copy');
    try{
      var result=await window.WatchdogAnchorPdf2025.generate(collectState());
      var blob=new Blob([result.pdfBytes],{type:'application/pdf'}),url=URL.createObjectURL(blob);
      if(preview.url)URL.revokeObjectURL(preview.url);preview.url=url;frame.src=url;
      meta.textContent=copyText('wd-pdf-updated-copy');
    }catch(_){meta.textContent=copyText('wd-pdf-error-copy');}
    finally{loading.classList.remove('is-visible');preview.busy=false;if(preview.queued)setTimeout(function(){renderPreview(false);},80);}
  }
  function schedule(){syncRoute();if(!preview.open)return;clearTimeout(preview.timer);preview.timer=setTimeout(function(){renderPreview(false);},650);}
  form.addEventListener('input',schedule,true);form.addEventListener('change',schedule,true);form.addEventListener('click',function(ev){if(ev.target.closest('[data-value]'))setTimeout(schedule,0);},true);
  new MutationObserver(function(){syncRoute();}).observe(q('#wd-route-badge')||form,{subtree:true,childList:true,characterData:true});
  syncRoute();
}
function loadStyles(){if(q('link[data-anchor-enhancements]'))return;var link=document.createElement('link');link.rel='stylesheet';link.href='/property/css/anchor-application-2025-enhancements.css';link.dataset.anchorEnhancements='1';document.head.appendChild(link);}
async function loadPartial(){var response=await fetch('/property/partials/anchor-application-2025-enhancements.html',{credentials:'same-origin'});if(!response.ok)throw new Error('Anchor application enhancement partial unavailable.');var host=document.createElement('div');host.hidden=true;host.dataset.anchorEnhancementHost='1';host.innerHTML=await response.text();document.body.appendChild(host);}
function loadEstimateBridge(){if(q('script[data-anchor-estimate-bridge]'))return;var script=document.createElement('script');script.src='/property/js/anchor-application-estimate-bridge.js';script.async=false;script.dataset.anchorEstimateBridge='1';document.body.appendChild(script);}
async function init(){try{loadStyles();await loadPartial();installWelcome();installIncomeGuidance();installParcelGuidance();installPreview();loadEstimateBridge();}catch(_){loadEstimateBridge();}}
init();
})();
