/* Property Home legacy copy bridge.
   Product-facing "Analyst Intel" copy is now branded Watchdog Intelligence. */
(function(){
'use strict';
if(window.__WATCHDOG_HOME_INTELLIGENCE_BRAND__)return;
window.__WATCHDOG_HOME_INTELLIGENCE_BRAND__=true;

var replacements=[
  [/WATCHDOG ANALYST INTEL/g,'WATCHDOG INTELLIGENCE'],
  [/Watchdog Analyst Intel/g,'Watchdog Intelligence'],
  [/Profession-aware Intel/g,'Profession-aware Intelligence'],
  [/generalized Intel/g,'generalized Intelligence'],
  [/Generalized Intel/g,'Generalized Intelligence'],
  [/EXACT INTEL/g,'WATCHDOG INTELLIGENCE']
];

function relevant(node){
  var el=node && (node.nodeType===1?node:node.parentElement);
  if(!el)return false;
  if(el.closest('[data-watchdog-analyst-intel],.wdai,[class*="wdai"],[id*="wdai"]'))return true;
  var dialog=el.closest('[role="dialog"],.modal,[class*="modal"]');
  if(!dialog)return false;
  return /ANALYST INTEL|Profession-aware Intel|generalized Intel|EXACT INTEL/i.test(dialog.textContent||'');
}
function replaceText(node){
  if(!node || node.nodeType!==3 || !relevant(node))return;
  var value=node.nodeValue||'';
  var next=value;
  replacements.forEach(function(pair){next=next.replace(pair[0],pair[1])});
  if(next!==value)node.nodeValue=next;
}
function replaceAttrs(root){
  var elements=[];
  if(root && root.nodeType===1)elements.push(root);
  if(root && root.querySelectorAll)elements=elements.concat(Array.prototype.slice.call(root.querySelectorAll('[aria-label],[title]')));
  elements.forEach(function(el){
    if(!relevant(el))return;
    ['aria-label','title'].forEach(function(attr){
      if(!el.hasAttribute(attr))return;
      var value=el.getAttribute(attr)||'',next=value;
      replacements.forEach(function(pair){next=next.replace(pair[0],pair[1])});
      if(next!==value)el.setAttribute(attr,next);
    });
  });
}
function sweep(root){
  root=root||document.body;
  if(!root)return;
  if(root.nodeType===3){replaceText(root);return;}
  var walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  var node;
  while((node=walker.nextNode()))replaceText(node);
  replaceAttrs(root);
}
function boot(){
  sweep(document.body);
  new MutationObserver(function(mutations){
    mutations.forEach(function(mutation){
      Array.prototype.forEach.call(mutation.addedNodes||[],function(node){sweep(node)});
    });
  }).observe(document.body,{childList:true,subtree:true});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
