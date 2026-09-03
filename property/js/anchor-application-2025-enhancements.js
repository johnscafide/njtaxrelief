(function(){
'use strict';
var form=document.getElementById('wd-anchor-form');
if(!form||!window.WatchdogAnchorPdf2025)return;
function q(s,r){return(r||document).querySelector(s)}
function qa(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))}
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
  var copy=q('.wd-step-copy',welcome);if(copy)copy.textContent='Watchdog will determine whether the 2025 ANC-1 or PAS-1 applies, fill the official state PDF, and prepare it for you to review, print and sign.';
  var callout=q('.wd-callout.neutral',welcome);
  if(callout){
    callout.classList.add('wd-readiness-callout');
    callout.innerHTML='<strong>Have these nearby</strong><div class="wd-readiness-list">'+
      '<label><input type="checkbox" data-readiness><span><b>2025 NJ-1040 information</b><small>Your filing status and income information.</small></span></label>'+
      '<label><input type="checkbox" data-readiness><span><b>Social Security number(s)</b><small>For you and, if applicable, your spouse or CU partner.</small></span></label>'+
      '<label><input type="checkbox" data-readiness><span><b>2025 property tax or rent information</b><small>For the New Jersey home you are applying for.</small></span></label>'+
      '<label><input type="checkbox" data-readiness><span><b>2024 and 2025 income information</b><small>Have this available in case PAS-1 applies.</small></span></label>'+
      '</div><p class="wd-readiness-note">Your answers are saved to your encrypted Watchdog Property Relief Profile so a future application can start with what you already entered. You will still review and update year-specific amounts.</p>';
  }
  var start=q('[data-next]',welcome);
  function syncStart(){if(!start)return;var boxes=qa('[data-readiness]',welcome);start.disabled=!boxes.length||boxes.some(function(box){return!box.checked;});}
  welcome.addEventListener('change',function(ev){if(ev.target.matches('[data-readiness]'))syncStart();});
  syncStart();
  var trust=qa('.wd-app-rail-trust > div');
  if(trust[2]){var strong=q('strong',trust[2]),small=q('small',trust[2]);if(strong)strong.textContent='Reusable Relief Profile';if(small)small.textContent='Encrypted answers can be reused next year';}
}
var preview={open:false,url:'',timer:null,busy:false,queued:false,lastRoute:''};
function installPreview(){
  var bar=document.createElement('div');bar.className='wd-pdf-preview-bar';bar.innerHTML='<div class="wd-pdf-preview-status"><span class="wd-pdf-dot"></span><span><strong id="wd-pdf-bar-title">Official PDF preview</strong><small id="wd-pdf-bar-copy">Available after Watchdog selects the correct 2025 form.</small></span></div><button type="button" id="wd-open-pdf-preview" class="wd-pdf-preview-button" disabled>Preview form</button>';
  document.body.appendChild(bar);
  var drawer=document.createElement('aside');drawer.className='wd-pdf-preview-drawer';drawer.setAttribute('aria-hidden','true');drawer.innerHTML='<div class="wd-pdf-preview-head"><div><span>LIVE OFFICIAL PDF</span><h2 id="wd-pdf-preview-title">2025 application preview</h2><p id="wd-pdf-preview-meta">Filled locally in your browser.</p></div><button type="button" id="wd-close-pdf-preview" aria-label="Close PDF preview">×</button></div><div class="wd-pdf-preview-body"><div id="wd-pdf-preview-loading" class="wd-pdf-preview-loading"><span></span><p>Building your preview…</p></div><iframe id="wd-pdf-preview-frame" title="Live preview of your official New Jersey application"></iframe></div>';
  var shade=document.createElement('button');shade.type='button';shade.className='wd-pdf-preview-shade';shade.setAttribute('aria-label','Close PDF preview');
  document.body.appendChild(shade);document.body.appendChild(drawer);
  var openButton=q('#wd-open-pdf-preview'),closeButton=q('#wd-close-pdf-preview'),title=q('#wd-pdf-bar-title'),copy=q('#wd-pdf-bar-copy');
  function syncRoute(){var route=routeFromUi();preview.lastRoute=route;if(route){openButton.disabled=false;title.textContent=(route==='pas-1'?'PAS-1':'ANC-1')+' live preview';copy.textContent='Open the official form to see your answers fill in as you go.';}else{openButton.disabled=true;title.textContent='Official PDF preview';copy.textContent='Available after Watchdog selects the correct 2025 form.';}return route;}
  function close(){preview.open=false;drawer.classList.remove('is-open');shade.classList.remove('is-open');drawer.setAttribute('aria-hidden','true');document.body.classList.remove('wd-pdf-preview-open');}
  function open(){if(!syncRoute())return;preview.open=true;drawer.classList.add('is-open');shade.classList.add('is-open');drawer.setAttribute('aria-hidden','false');document.body.classList.add('wd-pdf-preview-open');renderPreview(true);}
  openButton.addEventListener('click',open);closeButton.addEventListener('click',close);shade.addEventListener('click',close);document.addEventListener('keydown',function(ev){if(ev.key==='Escape'&&preview.open)close();});
  async function renderPreview(force){
    if(!preview.open&&!force)return;
    if(preview.busy){preview.queued=true;return;}
    var route=syncRoute();if(!route)return;
    preview.busy=true;preview.queued=false;
    var loading=q('#wd-pdf-preview-loading'),frame=q('#wd-pdf-preview-frame'),meta=q('#wd-pdf-preview-meta'),heading=q('#wd-pdf-preview-title');
    loading.classList.add('is-visible');heading.textContent='2025 '+(route==='pas-1'?'PAS-1':'ANC-1')+' preview';meta.textContent='Updating from your current answers…';
    try{
      var result=await window.WatchdogAnchorPdf2025.generate(collectState());
      var blob=new Blob([result.pdfBytes],{type:'application/pdf'}),url=URL.createObjectURL(blob);
      if(preview.url)URL.revokeObjectURL(preview.url);preview.url=url;frame.src=url;
      meta.textContent='Updated just now · preview created locally in your browser';
    }catch(_){meta.textContent='Preview could not be refreshed. Your saved application is unchanged.';}
    finally{loading.classList.remove('is-visible');preview.busy=false;if(preview.queued)setTimeout(function(){renderPreview(false);},80);}
  }
  function schedule(){syncRoute();if(!preview.open)return;clearTimeout(preview.timer);preview.timer=setTimeout(function(){renderPreview(false);},650);}
  form.addEventListener('input',schedule,true);form.addEventListener('change',schedule,true);form.addEventListener('click',function(ev){if(ev.target.closest('[data-value]'))setTimeout(schedule,0);},true);
  new MutationObserver(function(){syncRoute();}).observe(q('#wd-route-badge')||form,{subtree:true,childList:true,characterData:true});
  syncRoute();
}
function loadStyles(){if(q('link[data-anchor-enhancements]'))return;var link=document.createElement('link');link.rel='stylesheet';link.href='/property/css/anchor-application-2025-enhancements.css';link.dataset.anchorEnhancements='1';document.head.appendChild(link);}
loadStyles();installWelcome();installPreview();
})();
