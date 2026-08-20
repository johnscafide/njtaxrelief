(function(){
  'use strict';
  var timer=null;
  function scrollToApproval(){
    var btn=document.querySelector('[data-pv-approve],#msc-approve');
    if(!btn)return;
    btn.scrollIntoView({behavior:'smooth',block:'center'});
    setTimeout(function(){try{btn.focus({preventScroll:true});}catch(_error){btn.focus();}},350);
  }
  function apply(){
    document.querySelectorAll('[data-wd-handoff-approve]').forEach(function(btn){
      btn.removeAttribute('data-wd-handoff-approve');
      btn.setAttribute('data-wdd-review-approve','true');
      btn.disabled=false;
      btn.innerHTML='<i class="fas fa-arrow-down"></i> Review & approve below';
      btn.onclick=function(event){event.preventDefault();event.stopPropagation();scrollToApproval();};
      var note=btn.parentElement&&btn.parentElement.querySelector('small');
      if(note)note.textContent='Approve the actual mail piece in the Creative inspector below. Once approved, this step advances to the Watchdog Designs handoff.';
    });
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(apply,20);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
})();
