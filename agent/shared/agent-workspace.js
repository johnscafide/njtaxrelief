(function(){
'use strict';
if(window.__WATCHDOG_AGENT_WORKSPACE__)return;
window.__WATCHDOG_AGENT_WORKSPACE__=true;
function keepFinalStylesLast(){
  var final=document.querySelector('link[data-agent-workspace-final]');
  if(!final||!document.head)return;
  function settle(){if(document.head.lastElementChild!==final)document.head.appendChild(final)}
  settle();
  new MutationObserver(function(){settle()}).observe(document.head,{childList:true});
}
function ensureToast(){
  var el=document.querySelector('#awx-mobile-toast');
  if(el)return el;
  el=document.createElement('div');el.id='awx-mobile-toast';el.className='awx-mobile-toast';el.hidden=true;el.setAttribute('role','status');el.setAttribute('aria-live','polite');document.body.appendChild(el);return el;
}
function announce(message){
  var el=ensureToast();el.textContent=message;el.hidden=false;clearTimeout(el._awxTimer);el._awxTimer=setTimeout(function(){el.hidden=true},2200);
}
document.addEventListener('click',function(event){
  var soon=event.target.closest('[data-agent-soon]');
  if(!soon)return;
  event.preventDefault();event.stopPropagation();announce(soon.getAttribute('data-agent-soon')||'Coming soon for Agents');
});
keepFinalStylesLast();
document.addEventListener('keydown',function(event){
  if(event.key!=='Enter'&&event.key!==' ')return;
  var soon=event.target.closest&&event.target.closest('[data-agent-soon]');
  if(!soon)return;
  event.preventDefault();announce(soon.getAttribute('data-agent-soon')||'Coming soon for Agents');
});
})();