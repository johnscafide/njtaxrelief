(function(){
  'use strict';
  var statusEl=document.getElementById('wcx-status'),approve=document.getElementById('wcx-approve');
  var params=new URLSearchParams(location.search),deviceId=String(params.get('device_id')||''),challenge=String(params.get('challenge')||'').toLowerCase(),version=String(params.get('version')||'0.1.0').slice(0,30);
  function validUuid(v){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)}
  function paint(kind,title,copy){statusEl.className='wcx-status '+(kind||'');statusEl.innerHTML='';var dot=document.createElement('span');dot.className='wcx-spinner';if(kind==='success'){dot.style.animation='none';dot.style.border='0';dot.style.background='#16a34a';dot.style.boxShadow='inset 0 0 0 6px #dcfce7'}if(kind==='error'){dot.style.animation='none';dot.style.border='0';dot.style.background='#dc2626';dot.style.boxShadow='inset 0 0 0 6px #fee2e2'}var div=document.createElement('div'),b=document.createElement('b'),s=document.createElement('small');b.textContent=title;s.textContent=copy||'';div.append(b,s);statusEl.append(dot,div)}
  if(!validUuid(deviceId)||!/^[0-9a-f]{64}$/.test(challenge)){paint('error','This connection request is invalid.','Return to the CRM Companion extension and start a new connection.');approve.disabled=true;return;}
  Promise.resolve(window.njptrAccessReady).then(function(access){
    if(!access||!access.user)throw new Error('sign_in_required');
    paint('','Ready to connect this browser.',('Signed in with Watchdog '+String(access.plan||'paid').replace('pro_plus','Pro+').replace(/^pro$/,'Pro')+'.'));
    approve.disabled=false;
  }).catch(function(){paint('error','Watchdog sign-in is required.','Sign in with an active paid plan, then reopen this connection from the extension.');approve.disabled=true;});
  approve.addEventListener('click',async function(){
    approve.disabled=true;approve.textContent='Connecting…';paint('','Creating a private extension session…','Your Watchdog web session is not copied into the extension.');
    try{
      var client=window.NJPTRAccess&&window.NJPTRAccess.client?window.NJPTRAccess.client():null;if(!client)throw new Error('auth_unavailable');
      var result=await client.functions.invoke('watchdog-crm-companion',{body:{action:'pair.approve',device_id:deviceId,challenge:challenge,extension_version:version}});
      if(result.error)throw result.error;var data=result.data||{};if(!data.ok)throw new Error(data.error||'pairing_failed');
      paint('success','CRM Companion is approved.','Return to BoldTrail and click “Check connection” in the extension.');approve.textContent='Connected to Watchdog';approve.disabled=true;
    }catch(error){
      var msg=String(error&&error.message||'');paint('error',msg.indexOf('paid_plan_required')!==-1?'A paid Watchdog plan is required.':'Could not approve this browser.','Return to the extension and start a new connection if this request expired.');approve.textContent='Try again';approve.disabled=false;
    }
  });
})();
