(function(){'use strict';
  const mq=window.matchMedia('(max-width: 700px)');
  let activeModal=null;
  let restoreFocus=null;

  function isCustomize(){return document.body?.dataset?.msWizard==='customize'}
  function focusables(root){return Array.from(root.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter(el=>!el.hidden&&el.getClientRects().length)}
  function closeModal(modal){
    const close=modal.querySelector('[data-close]');
    if(close){close.click();return}
    modal.hidden=true;
    sync();
  }
  function trap(e){
    if(!activeModal||!mq.matches||activeModal.hidden)return;
    if(e.key==='Escape'){
      e.preventDefault();
      closeModal(activeModal);
      return;
    }
    if(e.key!=='Tab')return;
    const items=focusables(activeModal);
    if(!items.length){e.preventDefault();return}
    const first=items[0],last=items[items.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
  }
  function openModal(modal){
    if(activeModal===modal)return;
    restoreFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
    activeModal=modal;
    document.body.classList.add('wd-mobile-modal-open');
    modal.setAttribute('role','dialog');
    modal.setAttribute('aria-modal','true');
    const title=modal.querySelector('h1,h2,h3');
    if(title){
      if(!title.id)title.id='wd-mobile-modal-title';
      modal.setAttribute('aria-labelledby',title.id);
    }
    const close=modal.querySelector('[data-close]');
    if(close){
      if(!close.getAttribute('aria-label'))close.setAttribute('aria-label','Close dialog');
      requestAnimationFrame(()=>close.focus({preventScroll:true}));
    }else{
      const card=modal.querySelector('.ms-modal-card');
      if(card){card.tabIndex=-1;requestAnimationFrame(()=>card.focus({preventScroll:true}))}
    }
  }
  function clearModal(){
    if(!activeModal)return;
    activeModal=null;
    document.body.classList.remove('wd-mobile-modal-open');
    if(restoreFocus&&document.contains(restoreFocus))restoreFocus.focus({preventScroll:true});
    restoreFocus=null;
  }
  function sync(){
    if(!isCustomize()||!mq.matches){clearModal();return}
    const modal=document.querySelector('.ms-modal:not([hidden])');
    if(modal)openModal(modal);else clearModal();
  }
  function init(){
    if(!isCustomize())return;
    document.addEventListener('keydown',trap,true);
    const observer=new MutationObserver(sync);
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden']});
    if(mq.addEventListener)mq.addEventListener('change',sync);else mq.addListener(sync);
    sync();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
