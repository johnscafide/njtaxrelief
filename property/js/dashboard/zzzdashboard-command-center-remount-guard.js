/* Paid dashboard remount guard.
   Keeps the canonical colored Watchdog Score as the single score surface even when
   the legacy paid-command renderer remounts after core dashboard mutations. */
(function(){
  'use strict';
  if(window.__WATCHDOG_COMMAND_CENTER_REMOUNT_GUARD__) return;
  window.__WATCHDOG_COMMAND_CENTER_REMOUNT_GUARD__=true;

  var pending=false;

  function q(sel,root){return (root||document).querySelector(sel)}
  function qa(sel,root){return Array.prototype.slice.call((root||document).querySelectorAll(sel))}

  function installCss(){
    if(q('#wd-command-center-remount-guard-css')) return;
    var style=document.createElement('style');
    style.id='wd-command-center-remount-guard-css';
    style.textContent=[
      /* The old paid renderer still emits this as its first KPI. Hide it before
         the first paint so there is no flash/revert while the DOM reconciles. */
      '#wd-paid-v2 .wdp-kpis>.wdp-kpi:first-child{display:none!important}',
      '#wd-paid-v2 .wdp-kpis{grid-template-columns:repeat(3,minmax(0,1fr))!important}',
      '#wdp-score-stage{display:block!important;margin:0 0 14px!important}',
      '#wdp-score-stage .wd4-card[data-card-id="score"]{display:block!important;width:100%!important;min-height:190px!important;height:auto!important;max-height:none!important;margin:0!important;grid-column:auto!important}',
      '#wdp-score-stage .wd4-card[data-card-id="score"].wdp-hide{display:block!important}',
      '.wdq-score-label{display:flex;align-items:center;justify-content:space-between;margin:0 2px 8px;color:#6f7e91;font:800 10px/1.2 Inter,sans-serif;letter-spacing:.085em;text-transform:uppercase}',
      '.wdq-score-label span:last-child{font-weight:600;letter-spacing:0;text-transform:none;color:#8793a3}',
      '@media(max-width:900px){#wd-paid-v2 .wdp-kpis{grid-template-columns:1fr!important}}'
    ].join('');
    document.head.appendChild(style);
  }

  function sourceScore(){
    return q('.wd4-canvas .wd4-card[data-card-id="score"]') || q('.wd4-grid .wd4-card[data-card-id="score"]');
  }

  function cloneScore(source){
    if(!source) return null;
    var clone=source.cloneNode(true);
    clone.dataset.wdqScoreClone='1';
    clone.classList.remove('wdp-hide');
    clone.removeAttribute('id');
    qa('[id]',clone).forEach(function(node){node.removeAttribute('id')});
    return clone;
  }

  function ensureScoreStage(host){
    var head=q('.wdp-head',host);
    if(!head) return;
    var stage=q('#wdp-score-stage',host);
    if(!stage){
      stage=document.createElement('div');
      stage.id='wdp-score-stage';
      stage.className='wdq-score-stage';
      stage.innerHTML='<div class="wdq-score-label"><span>Portfolio health</span><span>Canonical ROBUST Watchdog Score</span></div>';
      head.insertAdjacentElement('afterend',stage);
    }

    var existing=q('.wd4-card[data-card-id="score"]',stage);
    if(existing){
      existing.classList.remove('wdp-hide');
      existing.dataset.wdqAction='score';
      return;
    }

    /* Clone rather than move the core card. The paid renderer replaces its own
       innerHTML during remounts; moving the original into that subtree caused it
       to be destroyed and is the reason the dashboard appeared to revert. */
    var source=sourceScore();
    if(!source) return;
    source.classList.add('wdp-hide');
    var clone=cloneScore(source);
    if(!clone) return;
    clone.dataset.wdqAction='score';
    var cta=q('.wd-score-spotlight-cta',clone);
    if(cta) cta.innerHTML='Open portfolio score review <i class="fas fa-arrow-right" aria-hidden="true"></i>';
    stage.appendChild(clone);
  }

  function cleanKpis(host){
    var kpis=q('.wdp-kpis',host);
    if(!kpis) return;
    qa('.wdp-kpi',kpis).forEach(function(card){
      var label=(q('.wdp-kpi-top span',card)||{}).textContent||'';
      if(/average watchdog score/i.test(label)){
        card.remove();
        return;
      }
      var action='';
      if(/properties monitored/i.test(label)) action='watchlist';
      else if(/material changes/i.test(label)) action='changes';
      else if(/top review priority/i.test(label)) action='priority';
      if(action){
        card.dataset.wdqAction=action;
        card.setAttribute('role','button');
        card.tabIndex=0;
      }
    });
  }

  function reconcile(){
    pending=false;
    var host=q('#wd-paid-v2');
    if(!host) return;
    cleanKpis(host);
    ensureScoreStage(host);
  }

  function schedule(){
    if(pending) return;
    pending=true;
    requestAnimationFrame(reconcile);
  }

  function boot(){
    installCss();
    reconcile();
    if(!document.body || !window.MutationObserver) return;
    new MutationObserver(function(mutations){
      for(var i=0;i<mutations.length;i++){
        if(mutations[i].type==='childList'){
          schedule();
          return;
        }
      }
    }).observe(document.body,{childList:true,subtree:true});
  }

  /* Run immediately. The paid renderer boots later on a timer, so the anti-flash
     CSS is already present before its first command-center paint. */
  if(document.readyState==='loading'){
    installCss();
    document.addEventListener('DOMContentLoaded',boot,{once:true});
  }else boot();
})();
