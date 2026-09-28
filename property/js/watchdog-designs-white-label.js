/* Watchdog Designs white label for Marketing Studio pages.
   The print vendor behind Watchdog Designs is never named to agents. Any vendor
   name that reaches the page (older studio copy, server messages, provider
   labels) is shown as "Watchdog Designs". Code, styles and preformatted blocks
   are left alone. Mirrors whiteText() in marketing-studio-providers.js. */
(()=>{'use strict';
if(window.__wdDesignsWhiteLabel)return;window.__wdDesignsWhiteLabel=true;
const NAME='Watchdog Designs';
const SKIP=new Set(['SCRIPT','STYLE','NOSCRIPT','CODE','PRE','TEXTAREA']);
const ATTRS=['title','aria-label','placeholder','alt'];
const white=v=>String(v??'').replace(/PCM\s*\/\s*Post\s?card\s?Mania/gi,NAME).replace(/Post\s?card\s?Mania/gi,NAME).replace(/\bPCM\b/g,NAME);
function fixText(t){if(SKIP.has(t.parentElement?.tagName))return;const next=white(t.nodeValue);if(next!==t.nodeValue)t.nodeValue=next}
function fixNode(node){
  if(!node)return;
  if(node.nodeType===3){fixText(node);return}
  if(node.nodeType!==1||SKIP.has(node.tagName))return;
  const els=[node,...node.querySelectorAll('[title],[aria-label],[placeholder],[alt]')];
  for(const el of els)for(const a of ATTRS){if(!el.hasAttribute(a))continue;const old=el.getAttribute(a),next=white(old);if(next!==old)el.setAttribute(a,next)}
  const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let t;while((t=walker.nextNode()))fixText(t);
}
function start(){
  fixNode(document.body);
  new MutationObserver(muts=>{for(const m of muts){if(m.type==='characterData')fixText(m.target);else if(m.type==='attributes')fixNode(m.target);else m.addedNodes.forEach(fixNode)}})
    .observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:ATTRS});
  const t=document.title,nt=white(t);if(nt!==t)document.title=nt;
}
window.WatchdogDesignsWhiteLabel={text:white};
if(document.body)start();else document.addEventListener('DOMContentLoaded',start,{once:true});
})();
