/* Watchdog Pro pricing controller.
   Agent and Professional are sold as a one-time Lifetime purchase. The plan
   buttons in the page open Lifetime checkout; this script also finishes the
   purchase when Stripe sends the buyer back. */
(function(){
  'use strict';
  var path=(window.location.pathname||'').replace(/\/+$/,'');
  if(path!=='/property/pro'&&path!=='/pro')return;

  var LIFETIME={
    agent:{value:'99',amount:9900,label:'Agent'},
    pro_plus:{value:'299',amount:29900,label:'Professional'}
  };
  var busy=false;

  function track(name,params){if(typeof window.gtag==='function')window.gtag('event',name,params||{});}

  function toast(message){
    var n=document.getElementById('wd-lifetime-toast');
    if(!n){n=document.createElement('div');n.id='wd-lifetime-toast';n.setAttribute('role','alert');Object.assign(n.style,{position:'fixed',right:'18px',bottom:'18px',zIndex:'100000',maxWidth:'430px',padding:'14px 17px',borderRadius:'12px',background:'#10294b',color:'#fff',boxShadow:'0 16px 38px rgba(8,25,48,.28)',font:'700 14px/1.45 "Source Sans 3",sans-serif'});document.body.appendChild(n);}
    n.textContent=message;n.hidden=false;clearTimeout(window.__wdLifetimeToast);window.__wdLifetimeToast=setTimeout(function(){n.hidden=true;},8000);
  }

  function cleanCheckoutQuery(){
    try{
      var u=new URL(location.href);u.searchParams.delete('checkout');u.searchParams.delete('session_id');history.replaceState({},'',u.pathname+(u.searchParams.toString()?'?'+u.searchParams.toString():'')+u.hash);
    }catch(_){ }
  }

  async function requireBilling(){
    var billing=window.WatchdogBilling;
    if(!billing||typeof billing.invoke!=='function'||typeof billing.client!=='function')throw new Error('Secure billing is unavailable. Please refresh and try again.');
    var client=billing.client();
    if(!client)throw new Error('Sign in service is unavailable.');
    var sessionResult=await client.auth.getSession();
    var session=sessionResult&&sessionResult.data&&sessionResult.data.session;
    return{billing:billing,session:session};
  }

  async function lifetimeCheckout(plan){
    if(busy||!LIFETIME[plan])return;busy=true;track('pro_lifetime_checkout_start',{plan:plan,amount_cents:LIFETIME[plan].amount});
    try{
      var ctx=await requireBilling();
      if(!ctx.session){
        try{sessionStorage.setItem('watchdog:lifetime:pending',plan);}catch(_){ }
        location.href='/property/dashboard?billing=signin&offer=lifetime';return;
      }
      var result=await ctx.billing.invoke('create-lifetime-checkout',{tier:plan});
      if(!result||!result.url)throw new Error('Secure checkout did not return a destination.');
      location.href=result.url;
    }catch(err){
      busy=false;console.error('Lifetime checkout failed',err);
      var msg=(err&&err.message)||'Lifetime checkout could not be opened.';
      if(err&&err.code==='LIFETIME_ACTIVE_SUBSCRIPTION')msg='This account already has a monthly or yearly plan. Send us a note and we will move you to Lifetime.';
      if(err&&err.code==='LIFETIME_ALREADY_ACTIVE')msg='Lifetime is already active on this account.';
      if(err&&err.code==='WATCHDOG_TEST_NO_REAL_SPEND')msg='This test account cannot create a real charge.';
      toast(msg);track('pro_lifetime_checkout_error',{plan:plan,code:err&&err.code||''});
    }
  }

  async function finalizeLifetimeReturn(){
    var params=new URLSearchParams(location.search||'');var state=params.get('checkout');
    if(state==='lifetime-cancelled'){toast('Checkout cancelled. Nothing was charged.');cleanCheckoutQuery();return;}
    if(state!=='lifetime-success')return;
    var sessionId=params.get('session_id');if(!sessionId){toast('Payment returned without a checkout reference. Contact Watchdog support.');return;}
    try{
      var ctx=await requireBilling();
      if(!ctx.session)throw new Error('Sign in to the Watchdog account used for checkout to activate Lifetime access.');
      var result=await ctx.billing.invoke('complete-lifetime-checkout',{session_id:sessionId});
      if(!result||!result.ok)throw new Error('Lifetime access could not be verified.');
      var plan=result.tier==='pro_plus'?'Professional':String(result.tier||'').replace(/^./,function(c){return c.toUpperCase();});
      toast(plan+' Lifetime is active. You will never be billed again.');track('pro_lifetime_checkout_complete',{plan:result.tier,property_capacity:result.property_capacity});
      try{sessionStorage.removeItem('watchdog:lifetime:pending');}catch(_){ }
      cleanCheckoutQuery();
    }catch(err){console.error('Lifetime activation failed',err);toast((err&&err.message)||'Payment was received but Lifetime access could not be verified. Contact Watchdog support.');track('pro_lifetime_activation_error',{code:err&&err.code||''});}
  }

  function bindCheckout(){
    document.addEventListener('click',function(ev){
      var lifetime=ev.target.closest('[data-lifetime-plan]');if(!lifetime)return;
      ev.preventDefault();ev.stopPropagation();lifetimeCheckout(lifetime.dataset.lifetimePlan);
    },true);
  }

  function init(){bindCheckout();finalizeLifetimeReturn();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(init,0);},{once:true});else setTimeout(init,0);
})();
