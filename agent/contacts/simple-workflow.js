(function(){
  'use strict';
  if(window.__WATCHDOG_AGENT_CONTACTS_SIMPLE_WORKFLOW__)return;
  window.__WATCHDOG_AGENT_CONTACTS_SIMPLE_WORKFLOW__=true;

  function q(s,r){return (r||document).querySelector(s);}
  function qa(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));}
  function ensureCss(){if(q('link[data-agent-contacts-simple-css]'))return;var l=document.createElement('link');l.rel='stylesheet';l.href='/agent/contacts/simple-workflow.css?v=20260916a';l.setAttribute('data-agent-contacts-simple-css','1');document.head.appendChild(l);}
  function setText(el,value){if(el&&el.textContent!==value)el.textContent=value;}
  function setHtml(el,value){if(el&&el.innerHTML!==value)el.innerHTML=value;}

  function simplifyCore(){
    var current=q('#acx-current'),hasFile=!!(current&&!current.hidden);
    document.body.classList.toggle('acx-simple-has-file',hasFile);

    var hero=q('#acx-greeting');if(hero)setText(hero,'Upload. Clean. Analyze. Export.');
    var help=q('#acx-open-guide');if(help)setHtml(help,'<i class="fa-regular fa-circle-question" aria-hidden="true"></i> Help');

    var map=q('#acx-section-map');
    if(map){
      setText(q('.acx-panel-head h3',map),'Check your columns.');
      setText(q('.acx-panel-head p',map),'Fix anything Watchdog guessed wrong.');
      setText(q('.acx-map-score small',map),'mapped');
      setHtml(q('#acx-review-next',map),'Review <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>');
      setText(q('.acx-name-copy h4',map),'Names');
      setHtml(q('.acx-name-change',map),'<i class="fa-solid fa-sliders"></i> Change');
    }

    var review=q('#acx-section-review');
    if(review){
      setText(q('.acx-panel-head h3',review),'Review contacts.');
      setText(q('.acx-panel-head p',review),'Edit anything that needs attention.');
      setHtml(q('#acx-back-map',review),'<i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Map');
      setHtml(q('#acx-export-next',review),'Export <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>');
    }

    var exp=q('#acx-section-export');
    if(exp){
      setText(q('.acx-panel-head h3',exp),'Choose export.');
      setText(q('.acx-panel-head p',exp),'Pick the format you need.');
    }
  }

  function intelligenceHasResults(shell){
    var body=q('#aci-body',shell);
    if(!body)return false;
    return !!q('.aci-score-card,.aci-two-col,.aci-property-list,.aci-opportunity-list,.aci-builder',body);
  }

  function simpleSteps(){return '<div class="aci-simple-steps" aria-label="Contact workflow"><span><b>1</b>Upload</span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i><span class="active"><b>2</b>Analyze</span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i><span><b>3</b>Review</span></div>';}

  function simplifyIntelligence(){
    var shell=q('#aci-shell');if(!shell)return;
    var currentHead=q('.acx-current-head');
    if(currentHead&&shell.previousElementSibling!==currentHead)currentHead.insertAdjacentElement('afterend',shell);

    var ready=!intelligenceHasResults(shell);
    shell.classList.toggle('aci-simple-ready',ready);
    shell.classList.toggle('aci-simple-results',!ready);

    setText(q('.aci-head>div:first-child>span',shell),'WATCHDOG ANALYZE');
    setText(q('.aci-head h2',shell),ready?'Analyze this file.':'Watchdog analysis');
    setText(q('.aci-head p',shell),ready?'Get health, matches, and next actions.':'Your contact intelligence is ready.');

    var analyze=q('#aci-analyze',shell);
    if(analyze&&!/Analyzing/i.test(analyze.textContent||''))setHtml(analyze,'<i class="fa-solid fa-shield-dog"></i> Analyze file');

    var tabs=q('.aci-tabs',shell);
    if(tabs){
      var labels={health:'Health',segments:'Segments',property:'Matches',opportunities:'Opportunities',reengage:'Re-engage'};
      qa('[data-aci-tab]',tabs).forEach(function(btn){var key=btn.getAttribute('data-aci-tab'),icon=q('i',btn);btn.innerHTML=(icon?icon.outerHTML:'')+labels[key];});
    }

    var progress=q('#aci-progress-label',shell);
    if(progress&&/Matching contacts to Watchdog property intelligence/i.test(progress.textContent||''))progress.textContent=(progress.textContent||'').replace(/Matching contacts to Watchdog property intelligence…?/i,'Analyzing contacts…');

    var empty=q('.aci-empty',shell);
    if(ready&&empty&&!q('.aci-simple-steps',empty))empty.insertAdjacentHTML('afterbegin',simpleSteps());
  }

  function run(){ensureCss();simplifyCore();simplifyIntelligence();}
  function observe(){
    var queued=false;
    new MutationObserver(function(){if(queued)return;queued=true;requestAnimationFrame(function(){queued=false;run();});}).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','class']});
  }

  function init(){run();observe();setTimeout(run,250);setTimeout(run,900);setTimeout(run,1800);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
