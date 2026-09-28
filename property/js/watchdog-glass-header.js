/* Watchdog glass top bar (universal). Finds the page's sticky or fixed top bar,
   whatever its class name, and gives it a frosted glass layer that keeps the
   bar's own color. Styles live in /property/css/watchdog-glass-header.css.
   Loaded by the page server for every clean Watchdog page and self-loaded by
   the shared shells, so it must stay idempotent.

   The frost follows the bar's state. A bar that sits clear over a hero at the
   top of the page (Home's header) stays clear there, frosts once it turns
   solid or content scrolls under it, and clears again back at the top. */
(function(){
  'use strict';
  if(window.__wdGlassHeader)return;window.__wdGlassHeader=true;
  var CSS='/property/css/watchdog-glass-header.css';
  var SEL='header,nav,[role="banner"],[class*="topbar"],[class*="appbar"],[class*="top-bar"]';
  var DEFAULT_RGB=[251,250,247];
  var bars=[];
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
    if(el.closest('dialog,[role="dialog"],[aria-modal="true"],[data-wd-glass-bar]'))return false;
    if(el.parentElement&&el.parentElement.closest('[data-wd-glass-bar]'))return false;
    var top=parseFloat(cs.top);if(!(top>=0&&top<=2))return false;
    var r=el.getBoundingClientRect();
    if(r.width<innerWidth*.85||r.height<36||r.height>200)return false;
    /* Stuck at the top now, or (sticky, scrolled past) sitting at the top of the page. */
    return (r.top>=-1&&r.top<=2)||(cs.position==='sticky'&&r.top<0&&r.top+scrollY<=240);
  }
  function stuck(cs){
    var top=parseFloat(cs.top);
    return (cs.position==='sticky'||cs.position==='fixed')&&top>=0&&top<=2;
  }
  /* Everything the bar's look can depend on that a scroll can change. */
  function sig(el,cs){
    return el.className+'|'+document.body.className+'|'+document.documentElement.className+'|'+cs.position+'|'+(scrollY>8);
  }
  function frost(el,rgb){
    var lum=(.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2])/255;
    el.style.setProperty('--wd-glass-rgb',rgb.join(','));
    el.setAttribute('data-wd-glass',lum<.45?'dark':'light');
    if(!el.querySelector(':scope>.wd-glass-layer')){
      var layer=document.createElement('span');layer.className='wd-glass-layer';layer.setAttribute('aria-hidden','true');
      el.insertBefore(layer,el.firstChild);
    }
  }
  function clear(el){
    el.removeAttribute('data-wd-glass');
    el.style.removeProperty('--wd-glass-rgb');
    var layer=el.querySelector(':scope>.wd-glass-layer');if(layer)layer.remove();
  }
  /* Read the bar's own background with the glass off (the glass stylesheet
     makes it transparent), then frost it only when it is stuck at the top and
     either has a background of its own or has content scrolling under it.
     Transitions are paused while reading so the bar never fades between the
     two states. */
  function evaluate(el){
    var transition=el.style.transition;
    el.style.transition='none';
    el.removeAttribute('data-wd-glass');
    var cs=getComputedStyle(el),own=rgbOf(cs);
    if(stuck(cs)&&(own||scrollY>8))frost(el,own||DEFAULT_RGB);else clear(el);
    el.__wdGlassSig=sig(el,cs);
    void cs.backgroundColor;
    el.style.transition=transition;
  }
  function refresh(){
    for(var i=bars.length-1;i>=0;i--){
      var el=bars[i];
      if(!el.isConnected){bars.splice(i,1);continue}
      if(sig(el,getComputedStyle(el))!==el.__wdGlassSig)evaluate(el);
    }
  }
  var classWatch=new MutationObserver(refresh);
  function track(el){
    el.setAttribute('data-wd-glass-bar','');
    bars.push(el);
    classWatch.observe(el,{attributes:true,attributeFilter:['class']});
    evaluate(el);
  }
  function scan(){
    var list=document.querySelectorAll(SEL);
    for(var i=0;i<list.length;i++){
      var el=list[i];if(el.hasAttribute('data-wd-glass-bar'))continue;
      var cs=getComputedStyle(el);
      if(isTopBar(el,cs))track(el);
    }
  }
  var t=0;function soon(){clearTimeout(t);t=setTimeout(scan,60)}
  var frame=0;
  function onScroll(){
    if(!bars.length){soon();return}
    if(!frame)frame=requestAnimationFrame(function(){frame=0;refresh()});
  }
  function start(){
    ensureCss();scan();
    /* Shells build or reveal their top bar after data loads; watch briefly.
       Scrolling keeps looking until a bar is found (Home's header only
       becomes a top bar once the hero is behind you), then keeps each bar's
       frost in step with its state. */
    var mo=new MutationObserver(soon);mo.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','class']});
    setTimeout(function(){mo.disconnect()},12000);
    classWatch.observe(document.documentElement,{attributes:true,attributeFilter:['class']});
    classWatch.observe(document.body,{attributes:true,attributeFilter:['class']});
    addEventListener('load',soon,{once:true});
    addEventListener('scroll',onScroll,{passive:true});
    addEventListener('resize',onScroll,{passive:true});
  }
  if(document.body)start();else document.addEventListener('DOMContentLoaded',start,{once:true});
})();
