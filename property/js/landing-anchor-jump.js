(function(){
  'use strict';
  var host=String(location.hostname||'').toLowerCase();
  var path=(location.pathname||'').replace(/\/+$/,'');
  if((host!=='watchdogindex.com'&&host!=='www.watchdogindex.com')||path!=='')return;

  var PARTIAL='/property/partials/landing-anchor-jump.html';
  var observer=null;

  function place(node){
    var recents=document.getElementById('wd-consumer-recents');
    if(recents&&recents.parentNode){
      if(recents.previousElementSibling!==node)recents.parentNode.insertBefore(node,recents);
      return true;
    }
    var hero=document.querySelector('.pl-hero');
    if(hero&&hero.parentNode){
      if(hero.nextElementSibling!==node)hero.insertAdjacentElement('afterend',node);
      return true;
    }
    return false;
  }

  function bindScroll(link){
    if(!link)return;
    link.addEventListener('click',function(event){
      event.preventDefault();
      var attempts=0;
      function go(){
        attempts+=1;
        var target=document.getElementById('wd-anchor-quick');
        if(target){
          target.scrollIntoView({behavior:'smooth',block:'start'});
          try{history.replaceState(null,document.title,location.pathname+location.search+'#wd-anchor-quick');}catch(_error){}
          return;
        }
        if(attempts<40){setTimeout(go,100);return;}
        location.hash='wd-anchor-quick';
      }
      go();
    });
  }

  function mount(html){
    if(document.getElementById('wd-anchor-jump'))return;
    var holder=document.createElement('div');
    holder.innerHTML=html;
    var node=holder.firstElementChild;
    if(!node)return;
    bindScroll(node.querySelector('[data-wd-anchor-jump]'));
    place(node);
    observer=new MutationObserver(function(){if(node.isConnected)place(node);});
    observer.observe(document.body,{childList:true,subtree:true});
  }

  function loadSetupNudge(){
    if(document.querySelector('script[data-profile-setup-nudge]'))return;
    var script=document.createElement('script');
    script.src='/property/js/profile-setup-nudge.js';
    script.defer=true;
    script.dataset.profileSetupNudge='1';
    document.head.appendChild(script);
  }

  function init(){
    loadSetupNudge();
    fetch(PARTIAL,{cache:'default'})
      .then(function(response){if(!response.ok)throw new Error('partial');return response.text();})
      .then(mount)
      .catch(function(){});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
