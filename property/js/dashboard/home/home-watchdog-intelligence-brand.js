/* Property Home Watchdog Intelligence branding bridge.
   Customer-facing Intelligence copy uses the canonical product name, gradient wordmark,
   and the rotating Intelligence border on Intelligence-specific surfaces. */
(function(){
'use strict';
if(window.__WATCHDOG_HOME_INTELLIGENCE_BRAND__)return;
window.__WATCHDOG_HOME_INTELLIGENCE_BRAND__=true;

var replacements=[
  [/WATCHDOG ANALYST INTEL/g,'WATCHDOG INTELLIGENCE'],
  [/Watchdog Analyst Intel/g,'Watchdog Intelligence'],
  [/Profession-aware Intel/g,'Watchdog Intelligence'],
  [/profession-aware Intel/g,'Watchdog Intelligence'],
  [/generalized Intel/g,'generalized Watchdog Intelligence'],
  [/Generalized Intel/g,'Generalized Watchdog Intelligence'],
  [/PERSONALIZATION REQUIRED FOR EXACT INTEL/g,'PERSONALIZE WATCHDOG INTELLIGENCE'],
  [/EXACT INTEL/g,'WATCHDOG INTELLIGENCE'],
  [/exact Intel/g,'Watchdog Intelligence'],
  [/Personalize my Intel/g,'Personalize Watchdog Intelligence'],
  [/Use generalized Intelligence for now/g,'Use generalized Watchdog Intelligence for now']
];
var brandPhrase=/Watchdog Intelligence/i;

function ensureBrandStyle(){
  if(document.querySelector('link[data-watchdog-intelligence-brand-signature]'))return;
  var link=document.createElement('link');
  link.rel='stylesheet';
  link.href='/property/css/home/home-watchdog-intelligence-brand.css';
  link.setAttribute('data-watchdog-intelligence-brand-signature','1');
  document.head.appendChild(link);
}
function relevant(node){
  var el=node && (node.nodeType===1?node:node.parentElement);
  if(!el)return false;
  if(el.closest('[data-watchdog-analyst-intel],.wdai,[class*="wdai"],[id*="wdai"],.wd-home-voice-entry,.wd-intelligence-gate'))return true;
  var dialog=el.closest('[role="dialog"],.modal,[class*="modal"]');
  if(!dialog)return false;
  return /ANALYST INTEL|Profession-aware Intel|generalized Intel|EXACT INTEL|Watchdog Intelligence/i.test(dialog.textContent||'');
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
function skipBrandNode(node){
  var parent=node && node.parentElement;
  if(!parent)return true;
  if(parent.closest('.wd-intelligence-brand-text,[data-no-intelligence-brand]'))return true;
  return !!parent.closest('script,style,noscript,textarea,select,option');
}
function brandText(node){
  if(!node || node.nodeType!==3 || skipBrandNode(node))return;
  var value=node.nodeValue||'';
  if(!brandPhrase.test(value))return;
  var parts=value.split(/(Watchdog Intelligence)/gi);
  if(parts.length<2)return;
  var frag=document.createDocumentFragment();
  parts.forEach(function(part){
    if(!part)return;
    if(part.toLowerCase()==='watchdog intelligence'){
      var span=document.createElement('span');
      span.className='wd-intelligence-brand-text';
      span.textContent=part;
      frag.appendChild(span);
    }else frag.appendChild(document.createTextNode(part));
  });
  node.parentNode.replaceChild(frag,node);
}
function decorateSurfaces(root){
  var surfaces=[];
  if(root && root.nodeType===1)surfaces.push(root);
  if(root && root.querySelectorAll){
    surfaces=surfaces.concat(Array.prototype.slice.call(root.querySelectorAll('[role="dialog"],.modal,[class*="modal"],.wdai-role-prompt,.wd-intelligence-gate-card')));
  }
  surfaces.forEach(function(surface){
    if(!surface || !brandPhrase.test(surface.textContent||''))return;
    surface.classList.add('wd-intelligence-frame','wd-intelligence-modal-frame');
  });
}
function brandVisiblePhrases(root){
  root=root||document.body;
  if(!root)return;
  if(root.nodeType===3){brandText(root);return;}
  var walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  var nodes=[],node;
  while((node=walker.nextNode()))nodes.push(node);
  nodes.forEach(brandText);
}
function sweep(root){
  root=root||document.body;
  if(!root)return;
  if(root.nodeType===3){
    replaceText(root);
    brandText(root);
    return;
  }
  var walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  var nodes=[],node;
  while((node=walker.nextNode()))nodes.push(node);
  nodes.forEach(replaceText);
  replaceAttrs(root);
  decorateSurfaces(root);
  brandVisiblePhrases(root);
}
function boot(){
  ensureBrandStyle();
  sweep(document.body);
  new MutationObserver(function(mutations){
    mutations.forEach(function(mutation){
      Array.prototype.forEach.call(mutation.addedNodes||[],function(node){sweep(node)});
    });
  }).observe(document.body,{childList:true,subtree:true});
}

ensureBrandStyle();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
