(function(){
  'use strict';

  var LAUNCH_DATE='2026-09-16';
  var DISMISS_KEY='watchdog:paid-launch-banner:dismissed:'+LAUNCH_DATE;
  var PARTIAL_URL='/property/partials/paid-launch-banner.html';
  var CSS_URL='/property/css/paid-launch-banner.css';
  var templatesReady=null;

  function track(name,params){
    try{if(typeof window.gtag==='function')window.gtag('event',name,params||{});}catch(_){}
  }

  function isLanding(){
    var path=(location.pathname||'').replace(/\/+$/,'');
    var host=String(location.hostname||'').toLowerCase();
    var root=(host==='watchdogindex.com'||host==='www.watchdogindex.com')&&path==='';
    return path==='/property'||path==='/property/index.html'||root;
  }

  function ensureStylesheet(){
    if(document.querySelector('link[href="'+CSS_URL+'"]'))return;
    var link=document.createElement('link');
    link.rel='stylesheet';
    link.href=CSS_URL;
    document.head.appendChild(link);
  }

  function ensureTemplates(){
    if(templatesReady)return templatesReady;
    templatesReady=fetch(PARTIAL_URL,{credentials:'same-origin'})
      .then(function(response){
        if(!response.ok)throw new Error('Paid launch partial unavailable: '+response.status);
        return response.text();
      })
      .then(function(html){
        if(document.getElementById('wd-paid-launch-templates'))return;
        var host=document.createElement('div');
        host.id='wd-paid-launch-templates';
        host.hidden=true;
        host.innerHTML=html;
        (document.body||document.documentElement).appendChild(host);
      })
      .catch(function(error){
        if(window.console&&console.warn)console.warn('[watchdog] Paid launch templates failed to load.',error);
        throw error;
      });
    return templatesReady;
  }

  function cloneTemplate(id){
    var template=document.getElementById(id);
    if(!template||!template.content)return null;
    return template.content.firstElementChild?template.content.firstElementChild.cloneNode(true):null;
  }

  function dismissed(){
    try{return sessionStorage.getItem(DISMISS_KEY)==='1';}catch(_){return false;}
  }

  function clearNavOffset(){
    if(!document.body)return;
    document.body.classList.remove('wd-paid-launch-visible');
    document.body.style.removeProperty('--wd-paid-launch-height');
  }

  function syncNavOffset(){
    var banner=document.getElementById('wd-paid-launch-banner');
    if(!banner||!document.body){clearNavOffset();return;}
    document.body.classList.add('wd-paid-launch-visible');
    document.body.style.setProperty('--wd-paid-launch-height',Math.ceil(banner.getBoundingClientRect().height)+'px');
  }

  function dismiss(){
    try{sessionStorage.setItem(DISMISS_KEY,'1');}catch(_){}
    var banner=document.getElementById('wd-paid-launch-banner');
    if(banner)banner.remove();
    clearNavOffset();
    track('paid_launch_banner_dismiss',{launch_date:LAUNCH_DATE});
  }

  function bindLaunchActions(node,surface){
    if(!node)return node;
    var close=node.querySelector('.wdpl-close');
    if(close)close.addEventListener('click',dismiss);
    var cta=node.querySelector('[data-paid-launch-cta]');
    if(cta)cta.addEventListener('click',function(){
      var params={launch_date:LAUNCH_DATE,destination:'launch-list'};
      if(surface)params.surface=surface;
      track('paid_launch_banner_click',params);
    });
    return node;
  }

  function placeHeroRail(){
    var existing=document.getElementById('wd-paid-launch-hero');
    if(existing){clearNavOffset();return true;}
    var hero=document.querySelector('.pl-hero');
    var inner=hero&&hero.querySelector('.pl-hero-inner');
    var search=inner&&inner.querySelector('.pl-search-card');
    if(!hero||!inner||!search)return false;
    var stale=document.getElementById('wd-paid-launch-banner');
    if(stale&&hero.contains(stale))stale.remove();
    var node=bindLaunchActions(cloneTemplate('wd-paid-launch-hero-template'),'hero_facts');
    if(!node)return false;
    search.insertAdjacentElement('afterend',node);
    clearNavOffset();
    return true;
  }

  function placeBanner(){
    if(isLanding())return placeHeroRail();
    if(dismissed()){clearNavOffset();return true;}
    var existing=document.getElementById('wd-paid-launch-banner');
    if(existing){syncNavOffset();return true;}
    var nav=document.getElementById('wd-property-nav')||document.getElementById('wd-nav');
    if(!nav||!nav.parentNode)return false;
    var node=bindLaunchActions(cloneTemplate('wd-paid-launch-banner-template'));
    if(!node)return false;
    nav.insertAdjacentElement('afterend',node);
    requestAnimationFrame(syncNavOffset);
    return true;
  }

  function ensureLaunchSurface(){
    if(placeBanner())return;
    var attempts=0;
    var timer=setInterval(function(){
      attempts+=1;
      if(placeBanner()||attempts>40)clearInterval(timer);
    },100);
  }

  function replaceWithTemplate(target,templateId){
    var replacement=cloneTemplate(templateId);
    if(target&&replacement){target.replaceWith(replacement);return replacement;}
    return target||null;
  }

  function replaceChildrenFromTemplate(target,templateId){
    var source=cloneTemplate(templateId);
    if(!target||!source)return;
    while(target.firstChild)target.removeChild(target.firstChild);
    while(source.firstChild)target.appendChild(source.firstChild);
  }

  function adaptProPage(){
    var path=(location.pathname||'').replace(/\/+$/,'');
    if(path!=='/property/pro'&&path!=='/pro')return;

    var demo=document.querySelector('.pro-demo');
    if(demo&&!document.getElementById('launch-list')){
      var anchor=document.createElement('span');
      anchor.id='launch-list';
      demo.insertAdjacentElement('beforebegin',anchor);
    }

    if(demo){
      replaceWithTemplate(demo.querySelector('.pro-demo-copy'),'wd-pro-launch-copy-template');
    }

    var form=document.getElementById('pro-demo-form');
    if(form){
      var source=form.querySelector('input[name="source"]');
      if(source)source.value='paid-launch-list';
      replaceWithTemplate(form.querySelector('button[type="submit"]'),'wd-pro-launch-submit-template');
      replaceWithTemplate(form.querySelector('.pro-form-privacy'),'wd-pro-launch-privacy-template');
      form.addEventListener('submit',function(){
        track('paid_launch_interest_submit',{plan:(form.querySelector('[name="plan"]')||{}).value||'unsure'});
      },{capture:true});
    }

    var ctaTemplates={agent:'wd-pro-launch-agent-cta-template',pro:'wd-pro-launch-pro-cta-template',pro_plus:'wd-pro-launch-pro-plus-cta-template'};
    document.querySelectorAll('[data-demo-plan]').forEach(function(cta){
      var templateId=ctaTemplates[cta.dataset.demoPlan||''];
      cta.setAttribute('href','#launch-list');
      if(templateId)replaceChildrenFromTemplate(cta,templateId);
    });

    replaceWithTemplate(document.querySelector('.pro-checkout-note'),'wd-pro-launch-note-template');

    var unsure=Array.prototype.find.call(document.querySelectorAll('.pro-faq-card'),function(card){
      return /Not sure which plan fits\?/i.test(card.textContent||'');
    });
    if(unsure)replaceWithTemplate(unsure.querySelector('p'),'wd-pro-launch-faq-template');

    if(location.hash==='#launch-list')setTimeout(function(){
      var anchor=document.getElementById('launch-list');
      if(anchor)anchor.scrollIntoView({behavior:'smooth',block:'start'});
    },120);
  }

  function init(){
    ensureStylesheet();
    ensureTemplates().then(function(){
      ensureLaunchSurface();
      adaptProPage();
      window.addEventListener('resize',syncNavOffset,{passive:true});
    }).catch(function(){});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
