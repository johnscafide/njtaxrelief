(function(){
'use strict';
if(window.__WD_BROADCAST_WIZARD_FIXES_V7__)return;
window.__WD_BROADCAST_WIZARD_FIXES_V7__=true;
var $=id=>document.getElementById(id);
function mirrorSave(){var src=$('nl-save-status'),dst=$('wd-wizard-save');if(!src||!dst)return;var sync=()=>{var t=(src.textContent||'').trim();dst.textContent=t||'Autosave on'};sync();new MutationObserver(sync).observe(src,{subtree:true,childList:true,characterData:true,attributes:true});}
function hardenFrame(){var f=$('nl-email-preview-frame');if(!f)return;var had=f.getAttribute('sandbox')||'';if(had!=='allow-same-origin'){
  f.setAttribute('sandbox','allow-same-origin');
  var src=f.srcdoc||'';
  if(src)requestAnimationFrame(()=>{if(f.srcdoc===src)f.srcdoc=src;});
}}
function boot(){var tries=0,t=setInterval(()=>{tries++;if($('wd-bcast-wizard')){clearInterval(t);mirrorSave();hardenFrame();var f=$('nl-email-preview-frame');if(f)f.addEventListener('load',hardenFrame);return}if(tries>40)clearInterval(t)},150)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
