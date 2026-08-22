/* Property Home Watchdog Intelligence branding bridge.
   Customer-facing Intelligence copy uses the canonical product name, the Intelligence
   spectrum on the word "Intelligence", and the rotating border only on dedicated
   Intelligence surfaces. */
(function(){
'use strict';
if(window.__WATCHDOG_HOME_INTELLIGENCE_BRAND_V2__)return;
window.__WATCHDOG_HOME_INTELLIGENCE_BRAND_V2__=true;

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
var intelligenceWord=/\bIntelligence\b/i;
var intelligenceSurfaceCopy=/Watchdog Intelligence|WATCHDOG INTELLIGENCE|PERSONALIZE WATCHDOG INTELLIGENCE/i;
var explicitSurfaceSelector='.wdai-role-prompt,.wd-intelligence-gate-card,[data-watchdog-intelligence-modal]';
var primaryFrameSelector='.wd-home-voice-entry,.wdai-main,.wd-intelligence-gate-card,.wdai-role-prompt,[data-watchdog-intelligence-modal]';

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
  return !!el.closest('[data-watchdog-analyst-intel],.wdai,[class*="wdai"],[id*="wdai"],.wd-home-voice-entry,.wd-intelligence-gate,[data-watchdog-intelligence-modal]');
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
  if(parent.closest('.wd-intelligence-brand-word,[data-no-intelligence-brand]'))return true;
  return !!parent.closest('script,style,noscript,textarea,select,option');
}
function brandWord(node){
  if(!node || node.nodeType!==3 || skipBrandNode(node) || !relevant(node))return;
  var value=node.nodeValue||'';
  if(!intelligenceWord.test(value))return;
  var parts=value.split(/(Intelligence)/gi);
  if(parts.length<2)return;
  var frag=document.createDocumentFragment();
  parts.forEach(function(part){
    if(!part)return;
    if(part.toLowerCase()==='intelligence'){
      var span=document.createElement('span');
      span.className='wd-intelligence-brand-word';
      span.textContent=part;
      frag.appendChild(span);
    }else frag.appendChild(document.createTextNode(part));
  });
  node.parentNode.replaceChild(frag,node);
}
function isGenericDialog(el){
  return !!(el && el.matches && el.matches('[role="dialog"],.modal,[class*="modal"]'));
}
function approvedSurface(el){
  if(!el || !el.matches)return false;
  if(el.matches(explicitSurfaceSelector))return true;
  return isGenericDialog(el) && intelligenceSurfaceCopy.test(el.textContent||'');
}
function collectSurfaces(root){
  var surfaces=[];
  if(root && root.nodeType===1 && approvedSurface(root))surfaces.push(root);
  if(root && root.querySelectorAll){
    surfaces=surfaces.concat(Array.prototype.slice.call(root.querySelectorAll(explicitSurfaceSelector)));
    Array.prototype.forEach.call(root.querySelectorAll('[role="dialog"],.modal,[class*="modal"]'),function(el){
      if(approvedSurface(el))surfaces.push(el);
    });
  }
  return surfaces.filter(function(el,index,list){return list.indexOf(el)===index;});
}
function decorateSurfaces(root){
  collectSurfaces(root).forEach(function(surface){
    surface.classList.add('wd-intelligence-frame','wd-intelligence-modal-frame');
  });
}
function cleanupLegacyOverreach(){
  var body=document.body;
  if(!body)return;
  body.classList.remove('wd-intelligence-frame','wd-intelligence-modal-frame');
  Array.prototype.forEach.call(document.querySelectorAll('.wd-intelligence-modal-frame'),function(el){
    if(approvedSurface(el))return;
    el.classList.remove('wd-intelligence-modal-frame');
    if(!el.matches(primaryFrameSelector))el.classList.remove('wd-intelligence-frame');
  });
  Array.prototype.forEach.call(document.querySelectorAll('.wd-intelligence-brand-text'),function(el){
    el.classList.remove('wd-intelligence-brand-text');
  });
}
function brandVisibleWords(root){
  root=root||document.body;
  if(!root)return;
  if(root.nodeType===3){brandWord(root);return;}
  var walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  var nodes=[],node;
  while((node=walker.nextNode()))nodes.push(node);
  nodes.forEach(brandWord);
}
function sweep(root){
  root=root||document.body;
  if(!root)return;
  if(root.nodeType===3){
    replaceText(root);
    brandWord(root);
    return;
  }
  var walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  var nodes=[],node;
  while((node=walker.nextNode()))nodes.push(node);
  nodes.forEach(replaceText);
  replaceAttrs(root);
  decorateSurfaces(root);
  brandVisibleWords(root);
}
function boot(){
  ensureBrandStyle();
  cleanupLegacyOverreach();
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
