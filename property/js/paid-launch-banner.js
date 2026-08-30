(function(){
  'use strict';

  var DISMISS_KEY='watchdog:paid-launch-banner:dismissed:2026-09-16';
  var PARTIAL_URL='/property/partials/paid-launch.html';
  var CSS_URL='/property/css/paid-launch.css';
  var templateHost=null;
  var templatePromise=null;

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
    link.dataset.wdPaidLaunchStyles='1';
    document.head.appendChild(link);
  }

  function loadTemplates(){
    if(templateHost)return Promise.resolve(templateHost);
    if(templatePromise)return templatePromise;
    templatePromise=fetch(PARTIAL_URL,{credentials:'same-origin'})
      .then(function(response){if(!response.ok)throw new Error('paid launch partial '+response.status);return response.text();})
      .then(function(html){
        var host=document.createElement('div');
        host.hidden=true;
        host.setAttribute('aria-hidden','true');
        host.innerHTML=html;
        templateHost=host;
        return host;
      })
      .catch(function(error){
        console.warn('[watchdog] Paid launch partial unavailable.',error);
        return null;
      });
    return templatePromise;
  }

  function cloneTemplate(id){
    var template=templateHost&&templateHost.querySelector('#'+id);
    return template&&template.content&&template.content.firstElementChild?template.content.firstElementChild.cloneNode(true):null;
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
    track('paid_launch_banner_dismiss',{launch_date:'2026-09-16'});
  }

  function bindNode(node,surface){
    if(!node)return null;
    var close=node.querySelector('.wdpl-close');
    if(close)close.addEventListener('click',dismiss);
    var cta=node.querySelector('[data-paid-launch-cta]');
    if(cta)cta.addEventListener('click',function(){
      track('paid_launch_banner_click',{launch_date:'2026-09-16',destination:'launch-list',surface:surface});
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
    var node=bindNode(cloneTemplate('wd-paid-launch-hero-template'),'hero_facts');
    if(!node)return false;
    var stale=document.getElementById('wd-paid-launch-banner');
    if(stale&&hero.contains(stale))stale.remove();
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
    var node=bindNode(cloneTemplate('wd-paid-launch-banner-template'),'global_banner');
    if(!node)return false;
    nav.insertAdjacentElement('afterend',node);
    requestAnimationFrame(syncNavOffset);
    return true;
  }

  function ensureLaunchSurface(){
    ensureStylesheet();
    loadTemplates().then(function(host){
      if(!host)return;
      if(placeBanner())return;
      var attempts=0;
      var timer=setInterval(function(){
        attempts+=1;
        if(placeBanner()||attempts>40)clearInterval(timer);
      },100);
    });
  }

  function bindProLaunchAnalytics(){
    var path=(location.pathname||'').replace(/\/+$/,'');
    if(path!=='/property/pro'&&path!=='/pro')return;
    var form=document.getElementById('pro-demo-form');
    if(form){
      form.addEventListener('submit',function(){
        track('paid_launch_interest_submit',{plan:(form.querySelector('[name="plan"]')||{}).value||'unsure'});
      },{capture:true});
    }
    if(location.hash==='#launch-list')setTimeout(function(){
      var anchor=document.getElementById('launch-list');
      if(anchor)anchor.scrollIntoView({behavior:'smooth',block:'start'});
    },120);
  }

  function init(){
    ensureLaunchSurface();
    bindProLaunchAnalytics();
    window.addEventListener('resize',syncNavOffset,{passive:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
