(function(){
  'use strict';
  var busy=false, approved=false, observer=null, syncTimer=null;

  function campaignId(){ return new URLSearchParams(location.search).get('campaign')||''; }
  function toast(message,bad){
    var t=document.querySelector('#pl-toast,#ms-toast'); if(!t)return;
    t.textContent=String(message||''); t.style.display='block'; t.classList.toggle('bad',!!bad);
    clearTimeout(window.__wddApprovalToast); window.__wddApprovalToast=setTimeout(function(){t.style.display='none';t.classList.remove('bad');},5000);
  }
  function buttonMarkup(){ return approved?'<i class="fas fa-circle-check"></i> Approved':busy?'<i class="fas fa-circle-notch fa-spin"></i> Approving…':'Approve creative'; }
  function paint(){
    document.querySelectorAll('#msc-approve,[data-pv-approve]').forEach(function(btn){
      btn.disabled=busy||approved;
      btn.innerHTML=buttonMarkup();
      btn.setAttribute('aria-disabled',btn.disabled?'true':'false');
      btn.dataset.wddApprovalState=approved?'approved':busy?'busy':'draft';
      if(approved)btn.title='This Studio creative is approved.';
    });
  }
  async function readApproved(){
    if(!window.NJPTRAccess||typeof window.NJPTRAccess.client!=='function')return false;
    var id=campaignId(); if(!id)return false;
    var client=window.NJPTRAccess.client();
    var result=await client.rpc('marketing_creative_studio_bootstrap',{p_campaign_id:id});
    if(result.error)throw result.error;
    var data=result.data||{}, dm=(data.campaign&&data.campaign.settings&&data.campaign.settings.direct_mail)||{};
    var activeId=String(dm.active_creative_id||''), list=Array.isArray(data.creatives)?data.creatives:[];
    var active=list.find(function(x){return String(x.id)===activeId;});
    approved=!!(active&&active.status==='approved');
    paint();
    return approved;
  }
  async function approve(){
    if(busy||approved)return;
    var id=campaignId();
    if(!id)return toast('Campaign ID is missing.',true);
    if(!window.NJPTRAccess||typeof window.NJPTRAccess.client!=='function')return toast('Watchdog session is not ready.',true);
    busy=true; paint();
    try{
      var client=window.NJPTRAccess.client();
      var sessionResult=await client.auth.getSession();
      var accessToken=sessionResult&&sessionResult.data&&sessionResult.data.session&&sessionResult.data.session.access_token;
      if(!accessToken)throw new Error('Sign in required.');
      var response=await fetch('/api/watchdog-designs-creative',{method:'POST',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},body:JSON.stringify({action:'approve_active',campaign_id:id})});
      var data=await response.json().catch(function(){return{};});
      if(!response.ok||!data||data.ok!==true)throw new Error((data&&data.error)||'Approval failed.');
      approved=true; busy=false; paint();
      toast('Studio creative approved. Watchdog Designs handoff is now available.');
      document.dispatchEvent(new CustomEvent('watchdog-designs:creative-approved',{detail:{campaign_id:id}}));
      setTimeout(function(){location.reload();},550);
    }catch(error){
      console.error('[WDD approval] failed',error); busy=false; paint();
      toast(error&&error.message?error.message:'Could not approve Studio creative.',true);
    }
  }
  function schedulePaint(){ clearTimeout(syncTimer); syncTimer=setTimeout(paint,20); }

  document.addEventListener('click',function(event){
    var target=event.target&&event.target.closest?event.target.closest('#msc-approve,[data-pv-approve]'):null;
    if(!target||!document.body.classList.contains('wd-studio-visual-active'))return;
    event.preventDefault(); event.stopPropagation(); if(typeof event.stopImmediatePropagation==='function')event.stopImmediatePropagation();
    approve();
  },true);

  async function init(){
    try{ await window.njptrAccessReady; await readApproved(); }catch(error){ console.warn('[WDD approval] state unavailable',error); }
    observer=new MutationObserver(schedulePaint); observer.observe(document.body,{childList:true,subtree:true});
    paint();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();
