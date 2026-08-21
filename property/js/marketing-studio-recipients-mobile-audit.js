(function(){
  'use strict';
  const mobile=()=>window.matchMedia('(max-width: 720px)').matches;
  const qs=(s,r=document)=>r.querySelector(s);

  function restoreBusy(btn){
    if(!btn||btn.disabled||btn.getAttribute('aria-busy')!=='true')return;
    const original=btn.dataset.mobileOriginalLabel;
    if(original)btn.textContent=original;
    delete btn.dataset.mobileOriginalLabel;
    btn.removeAttribute('aria-busy');
  }

  function setBusy(btn){
    if(!btn||btn.disabled||btn.getAttribute('aria-busy')==='true')return;
    const excluded=btn.dataset.excluded==='1';
    btn.dataset.mobileOriginalLabel=btn.textContent.trim();
    btn.setAttribute('aria-busy','true');
    btn.setAttribute('aria-live','polite');
    btn.textContent=excluded?'Including…':'Excluding…';
  }

  function triggerRecipientReload(){
    const active=qs('[data-ms3-filter].on')||qs('[data-ms3-filter="all"]');
    if(active){active.click();return true;}
    return false;
  }

  function resetRecipientView(){
    const all=qs('[data-ms3-filter="all"]');
    const search=qs('[data-ms3-recipient-search]');
    if(all&&!all.classList.contains('on'))all.click();
    if(search){
      search.value='';
      search.dispatchEvent(new Event('input',{bubbles:true}));
      search.focus({preventScroll:true});
    }else{
      triggerRecipientReload();
    }
  }

  function recoveryMarkup(kind){
    if(kind==='error'){
      return '<div class="ms-mobile-recovery"><p>The recipient service did not return this view. Retry without leaving your campaign.</p><button type="button" data-ms-mobile-recipient-retry>Retry recipients</button></div>';
    }
    return '<div class="ms-mobile-recovery"><p>Your current search or filter has no matching recipients.</p><button type="button" data-ms-mobile-recipient-reset>Clear search & filters</button></div>';
  }

  function enhanceRecipientState(){
    if(!mobile())return;
    const body=qs('[data-ms3-recipient-body]');
    if(!body)return;
    body.setAttribute('aria-live','polite');
    body.setAttribute('aria-busy',/Loading recipients/i.test(body.textContent||'')?'true':'false');
    const cell=body.querySelector('td[colspan]');
    if(!cell)return;
    const text=(cell.textContent||'').trim();
    if(/^Recipient review unavailable:/i.test(text)&&!cell.querySelector('[data-ms-mobile-recipient-retry]')){
      cell.insertAdjacentHTML('beforeend',recoveryMarkup('error'));
    }else if(/^No recipients match this view\./i.test(text)&&!cell.querySelector('[data-ms-mobile-recipient-reset]')){
      cell.insertAdjacentHTML('beforeend',recoveryMarkup('empty'));
    }
  }

  document.addEventListener('click',event=>{
    if(!mobile())return;
    const toggle=event.target.closest('[data-ms3-toggle]');
    if(toggle)setBusy(toggle);
    if(event.target.closest('[data-ms-mobile-recipient-retry]')){
      event.preventDefault();
      triggerRecipientReload();
    }
    if(event.target.closest('[data-ms-mobile-recipient-reset]')){
      event.preventDefault();
      resetRecipientView();
    }
  },true);

  const observer=new MutationObserver(mutations=>{
    if(!mobile())return;
    for(const mutation of mutations){
      if(mutation.type==='attributes'&&mutation.target.matches?.('[data-ms3-toggle]'))restoreBusy(mutation.target);
    }
    enhanceRecipientState();
  });

  function boot(){
    if(!mobile())return;
    observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled']});
    enhanceRecipientState();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
