(function(){'use strict';
const mq=window.matchMedia('(max-width: 720px)');
if(!mq.matches)return;
let filterTrigger=null,detailTrigger=null,bound=false;
const $=(s,r=document)=>r.querySelector(s);
function focusLater(el){if(!el)return;requestAnimationFrame(()=>requestAnimationFrame(()=>{try{el.focus({preventScroll:true});el.scrollIntoView({block:'nearest',behavior:'smooth'});}catch(_){el.focus();}}));}
function labelSection(section,heading,prefix){if(!section||!heading)return;heading.id=heading.id||`${prefix}-${Math.random().toString(36).slice(2,8)}`;section.setAttribute('aria-labelledby',heading.id);}
function setupFilter(panel){
 if(!panel||panel.dataset.mobileA11y==='1')return;
 panel.dataset.mobileA11y='1';
 panel.setAttribute('role','region');
 const heading=$('.msar-filter-head h3',panel),close=$('#msar-filter-close',panel);
 labelSection(panel,heading,'msar-filter-title');
 if(close)close.setAttribute('aria-label','Close property filters');
 const observer=new MutationObserver(()=>{
   if(!panel.hidden){focusLater(close||heading||panel);}
   else if(document.activeElement&&panel.contains(document.activeElement)&&filterTrigger){focusLater(filterTrigger);}
 });
 observer.observe(panel,{attributes:true,attributeFilter:['hidden']});
}
function setupDetail(detail){
 if(!detail)return;
 detail.setAttribute('role','region');
 detail.setAttribute('tabindex','-1');
 const heading=$('.msar-detail-head h3',detail),close=$('.msar-detail-head button',detail);
 labelSection(detail,heading,'msar-detail-title');
 if(close)close.setAttribute('aria-label','Close property details');
 if(!detail.hidden&&detail.dataset.mobileA11yOpen!=='1'){
   detail.dataset.mobileA11yOpen='1';
   focusLater(detail);
 }
 if(detail.hidden)detail.dataset.mobileA11yOpen='0';
}
function bind(){
 const shell=$('#ms-audience-review');if(!shell||bound)return false;bound=true;
 const filter=$('#msar-filter-panel',shell),detail=$('#msar-detail',shell);
 setupFilter(filter);setupDetail(detail);
 shell.addEventListener('click',e=>{
   const inspect=e.target.closest('.msar-inspect');if(inspect)detailTrigger=inspect;
   const open=e.target.closest('#msar-filter-open');if(open)filterTrigger=open;
   const detailClose=e.target.closest('.msar-detail-head button');
   if(detailClose&&detailTrigger)setTimeout(()=>focusLater(detailTrigger),0);
   const filterClose=e.target.closest('#msar-filter-close');
   if(filterClose&&filterTrigger)setTimeout(()=>focusLater(filterTrigger),0);
 });
 shell.addEventListener('keydown',e=>{
   if(e.key!=='Escape')return;
   const openFilter=$('#msar-filter-panel',shell);
   if(openFilter&&!openFilter.hidden){e.preventDefault();$('#msar-filter-close',openFilter)?.click();return;}
   const openDetail=$('#msar-detail',shell);
   if(openDetail&&!openDetail.hidden){e.preventDefault();$('.msar-detail-head button',openDetail)?.click();}
 });
 if(detail){new MutationObserver(()=>setupDetail(detail)).observe(detail,{attributes:true,attributeFilter:['hidden'],childList:true,subtree:true});}
 return true;
}
if(!bind()){
 const root=$('#ms-app')||document.body;
 const observer=new MutationObserver(()=>{if(bind())observer.disconnect();});
 observer.observe(root,{childList:true,subtree:true});
}
})();
