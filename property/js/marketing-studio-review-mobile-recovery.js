(function(){'use strict';
const mobile=window.matchMedia('(max-width: 720px)');
if(!mobile.matches||document.body.dataset.msWizard!=='review')return;
const qs=(s,r=document)=>r.querySelector(s);
const buttonHtml=(label)=>`<button type="button" class="ms-primary ms-review-mobile-retry" data-ms-review-mobile-retry>${label}</button>`;
function enhanceError(){
  const error=qs('.msfr-error');
  if(!error||error.dataset.mobileRecovery==='true')return false;
  error.dataset.mobileRecovery='true';
  error.setAttribute('role','alert');
  error.insertAdjacentHTML('beforeend',buttonHtml('Retry Review'));
  qs('[data-ms-review-mobile-retry]',error)?.addEventListener('click',()=>location.reload());
  return true;
}
function replaceStaleLoader(){
  const app=qs('#ms-app');
  const loader=app?.querySelector(':scope > .ms-loading');
  if(!app||!loader||qs('#mw-content'))return;
  const card=document.createElement('section');
  card.className='ms-review-mobile-recovery';
  card.setAttribute('role','status');
  card.setAttribute('aria-live','polite');
  card.innerHTML='<i class="fas fa-rotate" aria-hidden="true"></i><div><b>Review is taking longer than expected.</b><span>Your campaign was not changed. Retry the Review screen to reconnect to the current campaign state.</span></div>'+buttonHtml('Retry Review');
  loader.replaceWith(card);
  qs('[data-ms-review-mobile-retry]',card)?.addEventListener('click',()=>location.reload());
}
const observer=new MutationObserver(()=>enhanceError());
observer.observe(document.documentElement,{childList:true,subtree:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(replaceStaleLoader,10000),{once:true});
else setTimeout(replaceStaleLoader,10000);
enhanceError();
})();
