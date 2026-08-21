(function(){'use strict';
const MOBILE='(max-width: 720px)';
if(!window.matchMedia(MOBILE).matches||document.body?.dataset.msWizard!=='design')return;
const $=(s,r=document)=>r.querySelector(s);
const live=()=>$('#pl-toast')||$('#ms-toast');
function announce(message){const node=live();if(!node)return;node.textContent=message;node.style.display='block';}
function markBusy(button){
  if(!button||button.dataset.mobileDesignBusy==='true')return;
  button.dataset.mobileDesignBusy='true';
  button.dataset.mobileDesignLabel=button.textContent||'';
  button.setAttribute('aria-busy','true');
  button.disabled=true;
  button.textContent='Selecting…';
  announce('Selecting design…');
  window.setTimeout(()=>{
    if(!document.contains(button))return;
    button.disabled=false;
    button.removeAttribute('aria-busy');
    button.dataset.mobileDesignBusy='false';
    button.textContent=button.dataset.mobileDesignLabel||'Use design';
  },8000);
}
function bindSelectionBusy(){
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-pcm-use],[data-pcmplus-use]');
    if(button)window.setTimeout(()=>markBusy(button),0);
  },true);
}
function showRecovery(){
  const app=$('#ms-app');
  const loading=app?.querySelector('.ms-loading');
  if(!app||!loading||app.querySelector('.ms-design-mobile-recovery'))return;
  app.innerHTML='<section class="ms-design-mobile-recovery" role="alert"><h2>Design is taking longer than expected</h2><p>Reload this step to reconnect to your campaign and template library. Your saved campaign data is not changed by retrying.</p><button type="button" class="ms-primary" data-mobile-design-retry>Retry Design</button></section>';
  $('[data-mobile-design-retry]',app)?.addEventListener('click',event=>{
    const button=event.currentTarget;
    button.disabled=true;
    button.setAttribute('aria-busy','true');
    button.textContent='Retrying…';
    announce('Retrying Design…');
    location.reload();
  });
}
function watchInitialLoad(){window.setTimeout(showRecovery,10000)}
function init(){bindSelectionBusy();watchInitialLoad()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();