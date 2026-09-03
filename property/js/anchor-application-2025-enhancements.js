(function(){
'use strict';
var form=document.getElementById('wd-anchor-form');
if(!form||!window.WatchdogAnchorPdf2025)return;
function q(s,r){return(r||document).querySelector(s)}
function qa(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))}
function copyText(id){var el=q('#'+id);return el?String(el.textContent||'').trim():''}
function setPath(root,path,value){var keys=String(path||'').split('.').filter(Boolean),cursor=root;if(!keys.length)return;keys.slice(0,-1).forEach(function(key){if(!cursor[key]||typeof cursor[key]!=='object'||Array.isArray(cursor[key]))cursor[key]={};cursor=cursor[key];});cursor[keys[keys.length-1]]=value;}
function choiceValue(raw){if(raw==='yes')return true;if(raw==='no')return false;return raw;}
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
    // content-architecture: dynamic — the selected official form changes with the user's route.
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
async function init(){try{loadStyles();await loadPartial();installWelcome();installPreview();loadEstimateBridge();}catch(_){loadEstimateBridge();}}
init();
})();
