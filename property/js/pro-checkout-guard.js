/* Watchdog Pro soft-launch pricing controller.
   Public Agent / Pro / Pro+ checkout is open. Teams remains request-only. */
(function(){
  'use strict';
  var path=(window.location.pathname||'').replace(/\/+$/,'');
  if(path!=='/property/pro'&&path!=='/pro')return;

  var LIFETIME={
    agent:{value:'1,499',amount:149900,label:'Agent'},
    pro:{value:'3,499',amount:349900,label:'Pro'},
    pro_plus:{value:'9,999',amount:999900,label:'Pro+'}
  };
  var normalCadence='yearly';
  var busy=false;

  function ensureCss(){
    if(document.querySelector('link[href="/property/css/pro-soft-launch.css"]'))return;
    var link=document.createElement('link');
    link.rel='stylesheet';link.href='/property/css/pro-soft-launch.css';
    document.head.appendChild(link);
  }

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

  function rewriteLaunchCopy(){
    var head=document.querySelector('.pro-price-head');
    if(head){
      var kicker=head.querySelector('.pro-kicker');if(kicker)kicker.textContent='Soft launch · enrollment open';
      var title=head.querySelector('h2');if(title)title.textContent='Choose how you want to pay.';
      var copy=head.querySelector('p');if(copy)copy.textContent='Monthly, annual, or a limited Founding Lifetime option. Same plan limits.';
    }
    var note=document.querySelector('.pro-checkout-note');
    if(note)note.innerHTML='<i class="fas fa-circle-check"></i> Paid enrollment is open for Agent, Pro and Pro+. Teams stays request-only.';

    var demo=document.getElementById('demo');
    if(demo){
      demo.classList.add('is-soft-launch');
      var copyBox=demo.querySelector('.pro-demo-copy');
      if(copyBox){
        var dk=copyBox.querySelector('.pro-kicker');if(dk)dk.textContent='Need help choosing?';
        var dh=copyBox.querySelector('h2');if(dh)dh.textContent='Ask a plan question.';
        var dp=copyBox.querySelector('p');if(dp)dp.textContent='Tell us what you do and roughly how many properties you work with. We will point you to the closest fit.';
        var proof=copyBox.querySelector('.pro-demo-proof');if(proof)proof.innerHTML='<span><i class="fas fa-circle-info"></i> Straight answer</span><span><i class="fas fa-layer-group"></i> Agent · Pro · Pro+</span><span><i class="fas fa-envelope"></i> Reply by email</span>';
      }
      var source=demo.querySelector('input[name="source"]');if(source)source.value='paid-soft-launch-plan-help';
      var submit=demo.querySelector('button[type="submit"]');if(submit)submit.innerHTML='Ask about plans <i class="fas fa-arrow-right"></i>';
      var privacy=demo.querySelector('.pro-form-privacy');if(privacy)privacy.textContent='We use this only to reply about Watchdog plans. No payment information is collected here.';
    }

    document.querySelectorAll('.pro-faq-card').forEach(function(card){
      var h=card.querySelector('h3'),p=card.querySelector('p');if(!h||!p)return;
      if(/launch list|which plan/i.test(h.textContent||'')){h.textContent='Not sure which plan fits?';p.textContent='Start with your expected property volume, or send us a plan question below.';}
      if(/free trial/i.test(h.textContent||'')){p.textContent='Property lookup is free. Paid professional plans start when you check out.';}
    });
  }

  function addLaunchBar(){
    var pricing=document.getElementById('pricing');var wrap=pricing&&pricing.querySelector('.pro-wrap');if(!wrap||wrap.querySelector('.pro-soft-launch-bar'))return;
    var bar=document.createElement('div');bar.className='pro-soft-launch-bar pro-reveal is-visible';
    bar.innerHTML='<span class="pro-soft-launch-stamp"><i></i> Soft launch live</span><strong>Paid plans are open now.</strong><small>Founding Lifetime is limited and may be retired as Watchdog grows.</small>';
    wrap.insertBefore(bar,wrap.firstChild);
  }

  function addLifetimeButton(){
    var group=document.querySelector('.pro-cadence');if(!group||group.querySelector('[data-cadence="lifetime"]'))return;
    var b=document.createElement('button');b.type='button';b.dataset.cadence='lifetime';b.setAttribute('aria-pressed','false');b.innerHTML='Lifetime <span>Founding</span>';group.appendChild(b);
    b.addEventListener('click',function(){setLifetime(true);});
  }

  function setCtas(cadence){
    normalCadence=cadence==='monthly'?'monthly':'yearly';
    ['agent','pro','pro_plus'].forEach(function(plan){
      var band=document.querySelector('[data-price-band="'+plan+'"]');var cta=band&&band.querySelector('.pro-price-cta');if(!cta)return;
      cta.removeAttribute('data-lifetime-plan');
      cta.dataset.billingPlan=plan;cta.dataset.billingCadence=normalCadence;cta.href='#';
      cta.innerHTML='Choose '+(plan==='pro_plus'?'Pro+':plan.charAt(0).toUpperCase()+plan.slice(1))+' <i class="fas fa-arrow-right"></i>';
    });
    var pricing=document.getElementById('pricing');if(pricing)pricing.classList.remove('is-lifetime-mode');
  }

  function setLifetime(shouldTrack){
    var group=document.querySelector('.pro-cadence');if(group){group.querySelectorAll('[data-cadence]').forEach(function(b){var on=b.dataset.cadence==='lifetime';b.classList.toggle('active',on);b.setAttribute('aria-pressed',on?'true':'false');});}
    ['agent','pro','pro_plus'].forEach(function(plan){
      var d=LIFETIME[plan];var v=document.querySelector('[data-price-value="'+plan+'"]'),u=document.querySelector('[data-price-unit="'+plan+'"]'),e=document.querySelector('[data-price-eyebrow="'+plan+'"]'),n=document.querySelector('[data-price-note="'+plan+'"]'),band=document.querySelector('[data-price-band="'+plan+'"]'),cta=band&&band.querySelector('.pro-price-cta');
      if(v)v.textContent=d.value;if(u)u.textContent=' once';if(e)e.textContent='Founding Lifetime';if(n)n.textContent='One payment. No renewal.';
      if(band)band.classList.add('is-founding-lifetime');
      if(cta){cta.removeAttribute('data-billing-plan');cta.removeAttribute('data-billing-cadence');cta.dataset.lifetimePlan=plan;cta.href='#';cta.innerHTML='Get '+d.label+' Lifetime <i class="fas fa-arrow-right"></i>';}
    });
    var pricing=document.getElementById('pricing');if(pricing)pricing.classList.add('is-lifetime-mode');
    var terms=document.querySelector('.pro-lifetime-terms');if(!terms&&pricing){terms=document.createElement('div');terms.className='pro-lifetime-terms';terms.innerHTML='<b>Founding Lifetime</b><span>Non-transferable. Same property limits. Usage-based services, direct mail, third-party data and overages are separate.</span>';var note=pricing.querySelector('.pro-checkout-note');if(note)note.insertAdjacentElement('beforebegin',terms);}
    if(shouldTrack)track('pro_billing_toggle',{cadence:'lifetime'});
  }

  async function lifetimeCheckout(plan){
    if(busy||!LIFETIME[plan])return;busy=true;track('pro_lifetime_checkout_start',{plan:plan,amount_cents:LIFETIME[plan].amount});
    try{
      var billing=window.WatchdogBilling;var client=billing&&billing.client&&billing.client();if(!client)throw new Error('Sign in service is unavailable.');
      var sessionResult=await client.auth.getSession();var session=sessionResult&&sessionResult.data&&sessionResult.data.session;
      if(!session){
        try{sessionStorage.setItem('watchdog:lifetime:pending',plan);}catch(_){ }
        location.href='/property/dashboard?billing=signin&offer=lifetime';return;
      }
      var result=await client.functions.invoke('create-lifetime-checkout',{body:{tier:plan}});
      if(result.error)throw result.error;
      if(!result.data||!result.data.url)throw new Error('Secure checkout did not return a destination.');
      location.href=result.data.url;
    }catch(err){
      busy=false;console.error('Lifetime checkout failed',err);toast((err&&err.message)||'Lifetime checkout could not be opened.');track('pro_lifetime_checkout_error',{plan:plan});
    }
  }

  async function finalizeLifetimeReturn(){
    var params=new URLSearchParams(location.search||'');var state=params.get('checkout');
    if(state==='lifetime-cancelled'){toast('Checkout cancelled. Nothing was charged.');cleanCheckoutQuery();return;}
    if(state!=='lifetime-success')return;
    var sessionId=params.get('session_id');if(!sessionId){toast('Payment returned without a checkout reference. Contact Watchdog support.');return;}
    try{
      var billing=window.WatchdogBilling;var client=billing&&billing.client&&billing.client();if(!client)throw new Error('Sign in service is unavailable.');
      var sessionResult=await client.auth.getSession();var session=sessionResult&&sessionResult.data&&sessionResult.data.session;
      if(!session)throw new Error('Sign in to the Watchdog account used for checkout to activate Lifetime access.');
      var result=await client.functions.invoke('complete-lifetime-checkout',{body:{session_id:sessionId}});
      if(result.error)throw result.error;
      if(!result.data||!result.data.ok)throw new Error('Lifetime access could not be verified.');
      var plan=result.data.tier==='pro_plus'?'Pro+':String(result.data.tier||'').replace(/^./,function(c){return c.toUpperCase();});
      toast(plan+' Founding Lifetime is active. No renewal.');track('pro_lifetime_checkout_complete',{plan:result.data.tier,property_capacity:result.data.property_capacity});
      try{sessionStorage.removeItem('watchdog:lifetime:pending');}catch(_){ }
      cleanCheckoutQuery();
    }catch(err){console.error('Lifetime activation failed',err);toast((err&&err.message)||'Payment was received but Lifetime access could not be verified. Contact Watchdog support.');track('pro_lifetime_activation_error',{});}
  }

  function addPointerMotion(){
    if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    document.querySelectorAll('.pro-price-band').forEach(function(band){
      if(band.dataset.softMotion==='1')return;band.dataset.softMotion='1';
      band.addEventListener('pointermove',function(ev){if(!document.getElementById('pricing')?.classList.contains('is-lifetime-mode'))return;var r=band.getBoundingClientRect(),x=(ev.clientX-r.left)/r.width-.5,y=(ev.clientY-r.top)/r.height-.5;band.style.setProperty('--wd-rotate-y',(x*1.8)+'deg');band.style.setProperty('--wd-rotate-x',(-y*1.5)+'deg');});
      band.addEventListener('pointerleave',function(){band.style.removeProperty('--wd-rotate-x');band.style.removeProperty('--wd-rotate-y');});
    });
  }

  function bindCadence(){
    document.addEventListener('click',function(ev){
      var lifetime=ev.target.closest('[data-lifetime-plan]');if(lifetime){ev.preventDefault();ev.stopPropagation();lifetimeCheckout(lifetime.dataset.lifetimePlan);return;}
      var cadence=ev.target.closest('[data-cadence]');if(!cadence||cadence.dataset.cadence==='lifetime')return;
      setTimeout(function(){document.querySelectorAll('.pro-price-band').forEach(function(b){b.classList.remove('is-founding-lifetime');});setCtas(cadence.dataset.cadence);},0);
    },true);
  }

  function init(){ensureCss();rewriteLaunchCopy();addLaunchBar();addLifetimeButton();setCtas('yearly');addPointerMotion();bindCadence();finalizeLifetimeReturn();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(init,0);},{once:true});else setTimeout(init,0);
})();
