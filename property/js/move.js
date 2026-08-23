(function(){
  'use strict';

  var STATUS=document.getElementById('mv-status');
  var BUY=document.getElementById('mv-buy');
  var SB_URL='https://uvkvaxljhhngydvlrzom.supabase.co';
  var KEY='sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';

  function loadFragment(id,url){
    return fetch(url).then(function(r){if(!r.ok)throw new Error(url+' '+r.status);return r.text();}).then(function(html){
      var host=document.getElementById(id);if(!host)return;host.innerHTML=html;
      host.querySelectorAll('script').forEach(function(old){var s=document.createElement('script');Array.from(old.attributes).forEach(function(a){s.setAttribute(a.name,a.value);});s.textContent=old.textContent;old.replaceWith(s);});
    }).catch(function(e){console.error('Move fragment load failed',e);});
  }

  function client(){
    if(window.WatchdogBilling&&window.WatchdogBilling.client)return window.WatchdogBilling.client();
    if(!window.supabase)return null;
    return window.supabase.createClient(SB_URL,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce',storageKey:'sb-uvkvaxljhhngydvlrzom-auth-token'}});
  }

  function setStatus(message,kind){
    if(!STATUS)return;
    STATUS.textContent=message;
    STATUS.classList.remove('is-active','is-error');
    if(kind)STATUS.classList.add(kind);
  }

  function formatDate(value){
    if(!value)return'';
    var d=new Date(value);
    return isNaN(d.getTime())?'':d.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
  }

  function readFunctionError(error){
    if(!error)return{message:'Watchdog Move is unavailable right now.',code:''};
    var code=error.code||'';
    var message=error.message||'Watchdog Move is unavailable right now.';
    var context=error.context;
    if(context&&typeof context.json==='function'){
      return context.json().then(function(body){return{message:body&&body.error||message,code:body&&body.code||code};}).catch(function(){return{message:message,code:code};});
    }
    return Promise.resolve({message:message,code:code});
  }

  function getSession(c){return c.auth.getSession().then(function(r){return r.data&&r.data.session||null;});}

  function claimSponsored(c){
    return c.rpc('claim_my_watchdog_move_sponsorship').then(function(r){
      if(r.error){console.warn('Move sponsorship claim skipped',r.error);return null;}
      return Array.isArray(r.data)&&r.data.length?r.data[0]:null;
    });
  }

  function access(c){
    return c.rpc('get_my_watchdog_move_access').then(function(r){
      if(r.error)throw r.error;
      return Array.isArray(r.data)&&r.data.length?r.data[0]:null;
    });
  }

  function refreshAccess(){
    var c=client();
    if(!c){setStatus('Watchdog sign-in is unavailable on this page right now.','is-error');return Promise.resolve(null);}
    return getSession(c).then(function(session){
      if(!session){
        setStatus('Sign in to purchase Move or automatically claim a sponsored seat tied to your email.');
        if(BUY)BUY.textContent='Sign in to start 90 days';
        return null;
      }
      return claimSponsored(c).then(function(claim){
        return access(c).then(function(current){
          if(current&&current.active){
            var expiry=formatDate(current.expires_at);
            var source=current.source==='sponsored'?'Sponsored Move':'Watchdog Move';
            setStatus(source+' is active'+(expiry?' through '+expiry:'')+'. You can save up to '+(current.property_capacity||10)+' properties.','is-active');
            if(BUY)BUY.textContent='Add another 90 days · $29';
            return current;
          }
          if(claim)setStatus('Your sponsored Move seat was claimed. Refreshing access…','is-active');
          else setStatus('Signed in. Move is a one-time $29 purchase for 90 days with no automatic renewal.');
          if(BUY)BUY.textContent='Start 90 days · $29';
          return current;
        });
      });
    }).catch(function(error){console.error('Move access check failed',error);setStatus('We could not confirm Move access right now. No charge was attempted.','is-error');return null;});
  }

  function purchase(){
    var c=client();
    if(!c)return setStatus('Watchdog sign-in is unavailable right now.','is-error');
    if(BUY)BUY.disabled=true;
    getSession(c).then(function(session){
      if(!session){
        try{sessionStorage.setItem('watchdog:move:return','/move/');}catch(_){}
        location.href='/property/dashboard?billing=signin';
        return null;
      }
      setStatus('Opening secure one-time checkout…');
      return c.functions.invoke('create-checkout-session',{body:{product:'watchdog_move'}}).then(function(r){
        if(r.error)throw r.error;
        if(!r.data||!r.data.url)throw new Error('Stripe did not return a checkout URL.');
        location.href=r.data.url;
      });
    }).catch(function(error){
      return Promise.resolve(readFunctionError(error)).then(function(info){
        if(info.code==='MOVE_ENROLLMENT_CLOSED'||info.code==='MOVE_GATE_NOT_PASSED')setStatus('Watchdog Move is staged but paid enrollment is not open yet. You were not charged.','is-error');
        else if(info.code==='MOVE_CONTROLLED_ONLY')setStatus('Watchdog Move is currently limited to controlled launch accounts. You were not charged.','is-error');
        else if(info.code==='WATCHDOG_TEST_NO_REAL_SPEND')setStatus('Test accounts cannot make live purchases. No charge was created.','is-error');
        else setStatus(info.message+' No charge was created.','is-error');
      });
    }).finally(function(){if(BUY)BUY.disabled=false;});
  }

  function checkoutReturn(){
    var params=new URLSearchParams(location.search);
    var state=params.get('checkout');
    if(state==='cancelled')setStatus('Checkout was cancelled. Nothing was charged.');
    if(state==='success'){
      setStatus('Payment completed. Confirming your 90-day access…');
      var attempts=0;
      var timer=setInterval(function(){
        attempts++;
        refreshAccess().then(function(current){
          if((current&&current.active)||attempts>=8)clearInterval(timer);
        });
      },1500);
    }
  }

  function init(){
    loadFragment('main-nav','/property/partials/nav.html');
    loadFragment('main-footer','/property/partials/footer.html');
    if(BUY)BUY.addEventListener('click',purchase);
    refreshAccess().then(checkoutReturn);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
