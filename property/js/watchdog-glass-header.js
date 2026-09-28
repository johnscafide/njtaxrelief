/* Watchdog glass top bar (universal). Finds the page's sticky or fixed top bar,
   whatever its class name, and gives it a frosted glass layer that keeps the
   bar's own color. Styles live in /property/css/watchdog-glass-header.css.
   Loaded by the page server for every clean Watchdog page and self-loaded by
   the shared shells, so it must stay idempotent. */
(function(){
  'use strict';
  if(window.__wdGlassHeader)return;window.__wdGlassHeader=true;
  var CSS='/property/css/watchdog-glass-header.css';
  var SEL='header,nav,[role="banner"],[class*="topbar"],[class*="appbar"],[class*="top-bar"]';
  function ensureCss(){
    if(document.querySelector('link[href^="'+CSS+'"]'))return;
    var l=document.createElement('link');l.rel='stylesheet';l.href=CSS;(document.head||document.documentElement).appendChild(l);
  }
  function rgbOf(cs){
    var m=String(cs.backgroundColor||'').match(/rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:[,/ ]+([\d.]+))?/);
    if(m&&(m[4]===undefined||Number(m[4])>=.3))return[+m[1],+m[2],+m[3]];
    var g=String(cs.backgroundImage||'').match(/rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/);
    if(g)return[+g[1],+g[2],+g[3]];
    var h=String(cs.backgroundImage||'').match(/#([0-9a-f]{6})\b/i);
    if(h){var n=parseInt(h[1],16);return[n>>16&255,n>>8&255,n&255];}
    return null;
  }
  function isTopBar(el,cs){
    if(cs.position!=='sticky'&&cs.position!=='fixed')return false;
    if(el.closest('dialog,[role="dialog"],[aria-modal="true"],[data-wd-glass]'))return false;
    if(el.parentElement&&el.parentElement.closest('[data-wd-glass]'))return false;
    var top=parseFloat(cs.top);if(!(top>=0&&top<=2))return false;
    var r=el.getBoundingClientRect();
    if(r.width<innerWidth*.85||r.height<36||r.height>200)return false;
    /* Stuck at the top now, or (sticky, scrolled past) sitting at the top of the page. */
    return (r.top>=-1&&r.top<=2)||(cs.position==='sticky'&&r.top<0&&r.top+scrollY<=240);
  }
  function tag(el,cs){
    var rgb=rgbOf(cs)||[251,250,247];
    var lum=(.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2])/255;
    el.style.setProperty('--wd-glass-rgb',rgb.join(','));
    el.setAttribute('data-wd-glass',lum<.45?'dark':'light');
    if(cs.position==='static')el.style.position='relative';
    var layer=document.createElement('span');layer.className='wd-glass-layer';layer.setAttribute('aria-hidden','true');
    el.insertBefore(layer,el.firstChild);
  }
  function scan(){
    var list=document.querySelectorAll(SEL);
    for(var i=0;i<list.length;i++){
      var el=list[i];if(el.hasAttribute('data-wd-glass'))continue;
      var cs=getComputedStyle(el);
      if(isTopBar(el,cs))tag(el,cs);
    }
  }
  var t=0;function soon(){clearTimeout(t);t=setTimeout(scan,60)}
  function tagged(){return !!document.querySelector('[data-wd-glass]')}
  function onScroll(){if(tagged()){removeEventListener('scroll',onScroll);return}soon()}
  function start(){
    ensureCss();scan();
    /* Shells build or reveal their top bar after data loads; watch briefly,
       and keep a cheap check on scroll until a bar has been found. */
    var mo=new MutationObserver(soon);mo.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','class']});
    setTimeout(function(){mo.disconnect()},12000);
    addEventListener('load',soon,{once:true});
    addEventListener('scroll',onScroll,{passive:true});
  }
  if(document.body)start();else document.addEventListener('DOMContentLoaded',start,{once:true});
})();
