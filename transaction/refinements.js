(function(){
'use strict';
if(window.__WATCHDOG_TRANSACTION_REFINEMENTS__)return;
window.__WATCHDOG_TRANSACTION_REFINEMENTS__=true;

function addStyles(){
  if(document.querySelector('link[data-transaction-refinements]'))return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href='/transaction/refinements.css?v=20260916b';
  link.dataset.transactionRefinements='true';
  document.head.appendChild(link);
}

function replaceEmDashes(root){
  root=root||document.querySelector('.tx-page')||document.body;
  if(!root)return;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode(node){
    const p=node.parentElement;
    if(!p||/^(SCRIPT|STYLE|TEXTAREA|INPUT)$/.test(p.tagName))return NodeFilter.FILTER_REJECT;
    return node.nodeValue&&node.nodeValue.includes('\u2014')?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT;
  }});
  const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
  nodes.forEach(n=>{n.nodeValue=n.nodeValue.replace(/\u2014/g,' - ')});
}

function enhanceEmptyVisual(){
  const v=document.querySelector('.tx-empty-visual');
  if(!v||v.querySelector('.tx-visual-label'))return;
  const label=document.createElement('span');
  label.className='tx-visual-label';
  label.textContent='Closing path';
  v.appendChild(label);
}

function repairRenderedDeedDate(){
  document.querySelectorAll('.tx-evidence-row').forEach(row=>{
    const label=row.querySelector('span'),value=row.querySelector('b');
    if(!label||!value||label.textContent.trim().toLowerCase()!=='deed date')return;
    const text=value.textContent.trim();
    const yearMatch=text.match(/\b(\d{4,6})\b/);
    const year=yearMatch?Number(yearMatch[1]):0;
    if(year>new Date().getFullYear()+1||year>9999||(/^\d{6}$/.test(text)&&Number(text.slice(0,2))>12)){
      value.textContent='Verify source date';
      value.classList.add('tx-deed-date-warning');
      value.title='The source date could not be safely normalized. Verify against the county recording record.';
    }
  });
}

let timer=0;
function refresh(){
  clearTimeout(timer);
  timer=setTimeout(()=>{
    enhanceEmptyVisual();
    repairRenderedDeedDate();
    replaceEmDashes(document.querySelector('.tx-page')||document.body);
  },20);
}

addStyles();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refresh,{once:true});else refresh();
const observer=new MutationObserver(refresh);
observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
})();
