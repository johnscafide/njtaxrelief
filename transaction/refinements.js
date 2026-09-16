(function(){
'use strict';
if(window.__WATCHDOG_TRANSACTION_REFINEMENTS__)return;
window.__WATCHDOG_TRANSACTION_REFINEMENTS__=true;

const SOURCE_PACK=[
  {icon:'fa-water',title:'NJ flood disclosure',scope:'Every NJ sale',copy:'Open the NJDEP flood disclosure guidance and property risk notification tool.',url:'https://dep.nj.gov/flooddisclosure/'},
  {icon:'fa-droplet',title:'Private well testing',scope:'If drinking water uses a private well',copy:'Review Private Well Testing Act requirements, certified testing and pre-closing result review.',url:'https://dep.nj.gov/privatewells/pwta/'},
  {icon:'fa-house-chimney',title:'Lead disclosure',scope:'Most pre-1978 housing',copy:'Use the federal lead disclosure rule, records and required buyer information before contract completion.',url:'https://www.epa.gov/lead/lead-based-paint-disclosure-rule-section-1018-title-x'},
  {icon:'fa-file-signature',title:'NJ UCC search',scope:'Identity and lien follow-up',copy:'Access New Jersey financing statement searches, status reports and certified UCC search products.',url:'https://www.nj.gov/treasury/revenue/dcr/geninfo/uccsrch.shtml'},
  {icon:'fa-stamp',title:'Deed recording forms',scope:'Every NJ deed recording workflow',copy:'Check current Realty Transfer Fee and GIT/REP requirements used with New Jersey deed recording.',url:'https://www.nj.gov/treasury/taxation/realty.shtml'}
];

function addStyles(){
  if(document.querySelector('link[data-transaction-refinements]'))return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href='/transaction/refinements.css?v=20260916a';
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

function sourcePackHtml(){
  return `<section class="tx-closing-source-pack" id="tx-closing-source-pack" aria-label="Closing source pack">
    <div class="tx-closing-source-head">
      <div><span class="tx-eyebrow">OFFICIAL CLOSING SOURCES</span><h3>Fast checks the closing team should not miss</h3><p>These links route to authoritative government sources. They are not title, legal, lender or municipal clearances, and applicability still depends on the property and transaction.</p></div>
      <span class="tx-closing-source-badge">Source routes</span>
    </div>
    <div class="tx-closing-source-grid">${SOURCE_PACK.map(s=>`<a class="tx-closing-source-card" href="${s.url}" target="_blank" rel="noopener"><i class="fas ${s.icon}"></i><strong>${s.title}</strong><span>${s.copy}</span><small>${s.scope} <i class="fas fa-arrow-up-right-from-square"></i></small></a>`).join('')}</div>
  </section>`;
}

function injectSourcePack(){
  if(document.getElementById('tx-closing-source-pack'))return;
  const detail=document.getElementById('tx-detail');
  if(!detail||detail.hidden)return;
  const sweep=detail.querySelector('.tx-source-sweep');
  const panels=detail.querySelector('.tx-tabs');
  const anchor=sweep||panels;
  if(!anchor)return;
  anchor.insertAdjacentHTML('afterend',sourcePackHtml());
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
    injectSourcePack();
    repairRenderedDeedDate();
    replaceEmDashes(document.querySelector('.tx-page')||document.body);
  },20);
}

addStyles();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refresh,{once:true});else refresh();
const observer=new MutationObserver(refresh);
observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
})();
