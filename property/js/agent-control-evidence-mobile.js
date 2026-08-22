/* Watchdog Agent Control evidence drawer accessibility — mobile/tablet only. */
(function(){
  'use strict';
  if(!window.matchMedia||!window.matchMedia('(max-width: 760px)').matches)return;

  var drawer=document.getElementById('ad-drawer');
  var close=document.getElementById('ad-drawer-close');
  if(!drawer||!close)return;

  var priorFocus=null;
  var active=false;
  var focusableSelector='a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

  function focusables(){
    return Array.prototype.slice.call(drawer.querySelectorAll(focusableSelector)).filter(function(el){
      return !el.hidden&&el.getClientRects().length>0;
    });
  }

  function onKeydown(event){
    if(!active)return;
    if(event.key==='Escape'){
      event.preventDefault();
      close.click();
      return;
    }
    if(event.key!=='Tab')return;
    var items=focusables();
    if(!items.length){
      event.preventDefault();
      close.focus();
      return;
    }
    var first=items[0],last=items[items.length-1];
    if(event.shiftKey&&document.activeElement===first){
      event.preventDefault();
      last.focus();
    }else if(!event.shiftKey&&document.activeElement===last){
      event.preventDefault();
      first.focus();
    }
  }

  function opened(){
    if(active)return;
    active=true;
    priorFocus=document.activeElement&&document.activeElement!==document.body?document.activeElement:null;
    close.setAttribute('aria-label','Close evidence details');
    document.addEventListener('keydown',onKeydown,true);
    window.requestAnimationFrame(function(){close.focus({preventScroll:true});});
  }

  function closed(){
    if(!active)return;
    active=false;
    document.removeEventListener('keydown',onKeydown,true);
    if(priorFocus&&document.contains(priorFocus)&&typeof priorFocus.focus==='function'){
      priorFocus.focus({preventScroll:true});
    }
    priorFocus=null;
  }

  var observer=new MutationObserver(function(){
    if(drawer.hidden)closed();else opened();
  });
  observer.observe(drawer,{attributes:true,attributeFilter:['hidden']});
  if(!drawer.hidden)opened();
})();
