(function(){
  'use strict';

  var path=(window.location.pathname||'').replace(/\/+$/,'');
  if(path!=='/property/pro'&&path!=='/pro')return;

  document.documentElement.classList.add('p26-js');

  var DEMO_ENDPOINT='https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/pro-demo-request';
  var INTELLIGENCE_CATALOG_ENDPOINT='https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/billing-price-catalog';
  var SUPABASE_PUBLISHABLE_KEY='sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
  var reduceMotion=!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function trackEvent(name,params){if(typeof window.gtag==='function')window.gtag('event',name,params||{});}
  function all(sel,root){return Array.prototype.slice.call((root||document).querySelectorAll(sel));}

  function loadFragment(id,url){
    return fetch(url).then(function(r){if(!r.ok)throw new Error(url+' '+r.status);return r.text();}).then(function(html){
      var host=document.getElementById(id);if(!host)return;host.innerHTML=html;
      host.querySelectorAll('script').forEach(function(old){var s=document.createElement('script');Array.from(old.attributes).forEach(function(a){s.setAttribute(a.name,a.value);});s.textContent=old.textContent;old.replaceWith(s);});
    }).catch(function(e){console.error('Fragment load failed',e);});
  }

  /* Fade sections in as they scroll into view. */
  function reveal(){
    var nodes=all('.p26-reveal');
    if(!nodes.length)return;
    if(reduceMotion||!('IntersectionObserver' in window)){nodes.forEach(function(n){n.classList.add('is-in');});return;}
    var io=new IntersectionObserver(function(entries){entries.forEach(function(entry){if(!entry.isIntersecting)return;entry.target.classList.add('is-in');io.unobserve(entry.target);});},{threshold:.15,rootMargin:'0px 0px -6% 0px'});
    nodes.forEach(function(n){io.observe(n);});
  }

  /* Count the stat numbers up once they are on screen. */
  function countUp(){
    var nodes=all('[data-count]');
    if(!nodes.length||reduceMotion||!('IntersectionObserver' in window))return;
    function run(el){
      var target=Number(el.dataset.count)||0,start=null,duration=1100;
      function step(ts){if(start===null)start=ts;var t=Math.min(1,(ts-start)/duration),eased=1-Math.pow(1-t,3);el.textContent=String(Math.round(target*eased));if(t<1)requestAnimationFrame(step);}
      el.textContent='0';requestAnimationFrame(step);
    }
    var io=new IntersectionObserver(function(entries){entries.forEach(function(entry){if(!entry.isIntersecting)return;run(entry.target);io.unobserve(entry.target);});},{threshold:.6});
    nodes.forEach(function(n){io.observe(n);});
  }

  /* The hero screenshot settles into place as the page scrolls. */
  function heroScroll(){
    var shot=document.getElementById('p26-hero-shot');
    if(!shot)return;
    if(reduceMotion){shot.style.setProperty('--p26-hero-p','1');return;}
    var ticking=false;
    function update(){ticking=false;var r=shot.getBoundingClientRect(),vh=window.innerHeight||1;var p=Math.max(0,Math.min(1,(vh-r.top)/(vh*0.9)));shot.style.setProperty('--p26-hero-p',p.toFixed(3));}
    function onScroll(){if(ticking)return;ticking=true;requestAnimationFrame(update);}
    window.addEventListener('scroll',onScroll,{passive:true});window.addEventListener('resize',onScroll);update();
  }

  /* Type out the sample Watchdog Intelligence answer once it is visible. */
  function chat(){
    var answer=document.querySelector('#p26-chat-answer .p26-chat-text');
    if(!answer||reduceMotion||!('IntersectionObserver' in window))return;
    var full=answer.textContent,started=false;
    answer.style.minHeight=answer.offsetHeight+'px';
    var io=new IntersectionObserver(function(entries){
      if(started||!entries.some(function(e){return e.isIntersecting;}))return;
      started=true;io.disconnect();
      var i=0;answer.textContent='';
      var timer=setInterval(function(){i+=2;answer.textContent=full.slice(0,i);if(i>=full.length){clearInterval(timer);answer.textContent=full;}},22);
    },{threshold:.5});
    io.observe(answer);
  }

  /* Floating "try free" button: shows after the hero, hides over pricing,
     the final call to action and the cookie banner. */
  function dock(){
    var btn=document.getElementById('p26-dock'),hero=document.querySelector('.p26-hero'),pricing=document.getElementById('pricing'),final=document.querySelector('.p26-final');
    if(!btn||!hero||!pricing)return;
    var ticking=false;
    function onScreen(el){if(!el)return false;var r=el.getBoundingClientRect();return r.top<window.innerHeight&&r.bottom>0;}
    function bannerOpen(){var b=document.getElementById('wd-cookie-banner');return !!(b&&!b.hidden&&b.offsetParent!==null);}
    function update(){
      ticking=false;
      var show=hero.getBoundingClientRect().bottom<80&&!onScreen(pricing)&&!onScreen(final)&&!bannerOpen();
      btn.classList.toggle('is-on',show);btn.setAttribute('aria-hidden',show?'false':'true');btn.tabIndex=show?0:-1;
    }
    function onScroll(){if(ticking)return;ticking=true;requestAnimationFrame(update);}
    window.addEventListener('scroll',onScroll,{passive:true});window.addEventListener('resize',onScroll);update();
  }

  var priceData={
    yearly:{agent:{value:'119',unit:'/ year',eyebrow:'Annual',note:'Save $60 a year.'},pro_plus:{value:'479',unit:'/ year',eyebrow:'Annual',note:'Save $120 a year.'}},
    monthly:{agent:{value:'14.99',unit:'/ month',eyebrow:'Monthly',note:'Cancel anytime.'},pro_plus:{value:'49.99',unit:'/ month',eyebrow:'Monthly',note:'Cancel anytime.'}}
  };

  function pricing(){
    var buttons=all('.pro-cadence [data-cadence]');
    var demoCadence=document.getElementById('demo-cadence');
    if(!buttons.length)return;
    function set(cad,shouldTrack){
      if(!priceData[cad])cad='yearly';
      buttons.forEach(function(b){var on=b.dataset.cadence===cad;b.classList.toggle('active',on);b.setAttribute('aria-pressed',on?'true':'false');});
      ['agent','pro_plus'].forEach(function(plan){var d=priceData[cad][plan];var v=document.querySelector('[data-price-value="'+plan+'"]'),u=document.querySelector('[data-price-unit="'+plan+'"]'),e=document.querySelector('[data-price-eyebrow="'+plan+'"]'),n=document.querySelector('[data-price-note="'+plan+'"]'),cta=document.querySelector('[data-demo-plan="'+plan+'"]');if(v)v.textContent=d.value;if(u)u.textContent=d.unit;if(e)e.textContent=d.eyebrow;if(n)n.textContent=d.note;if(cta)cta.dataset.demoCadence=cad;});
      if(demoCadence)demoCadence.value=cad;
      if(shouldTrack)trackEvent('pro_billing_toggle',{cadence:cad});
    }
    buttons.forEach(function(b){b.addEventListener('click',function(){if(b.dataset.cadence==='lifetime')return;set(b.dataset.cadence,true);});});set('yearly',false);
  }

  function renderIntelligenceOffer(catalog){
    var intelligence=catalog&&catalog.intelligence||{};
    var promo=intelligence.promotion||{};
    var regular=Number(intelligence.regular_add_on_monthly||12);
    if(!Number.isFinite(regular)||regular<=0)regular=12;
    var eligible=Array.isArray(promo.eligible_plans)?promo.eligible_plans:['agent'];
    var promoActive=promo.active===true;
    var brand='Watchdog <span class="wd-intelligence-brand-word">Intelligence</span>';
    // content-architecture: dynamic. This wording follows the live billing catalog and promotion state.
    var offer=promoActive?'Free for a limited time on Agent. Professional always includes it.':'Add it to Agent for $'+regular+'/month. Professional includes it.';
    var promoNode=document.querySelector('[data-intel-promo]');if(promoNode)promoNode.textContent=offer;
    all('[data-intel-line]').forEach(function(li){
      if(eligible.indexOf(li.dataset.intelLine)<0)return;
      li.innerHTML=brand+(promoActive?', free for now':', +$'+regular+'/month');
    });
    all('[data-intel-cell]').forEach(function(td){td.textContent=promoActive?'Free for now':'$'+regular+'/mo add-on';});
    // content-architecture: dynamic. FAQ answer follows the live billing catalog and promotion state.
    var faq=document.querySelector('[data-intel-faq]');if(faq)faq.textContent=promoActive?'Agent normally adds it for $'+regular+'/month. It is free for a limited time. Professional includes it.':'Agent can add it for $'+regular+'/month. Professional includes it.';
  }

  function intelligencePricing(){
    fetch(INTELLIGENCE_CATALOG_ENDPOINT,{method:'GET',headers:{Accept:'application/json'},cache:'no-store'})
      .then(function(r){if(!r.ok)throw new Error('Billing catalog '+r.status);return r.json();})
      .then(function(catalog){if(catalog&&catalog.provider==='stripe')renderIntelligenceOffer(catalog);})
      .catch(function(err){console.warn('Watchdog Intelligence pricing catalog unavailable; keeping the published wording.',err);});
  }

  function demoPrefill(){
    var planInput=document.getElementById('demo-plan');
    var cadence=document.getElementById('demo-cadence');
    all('[data-demo-plan]').forEach(function(link){link.addEventListener('click',function(){if(planInput)planInput.value=link.dataset.demoPlan||'unsure';if(cadence)cadence.value=link.dataset.demoCadence||'yearly';trackEvent('pro_plan_explore',{plan:link.dataset.demoPlan||'unsure',cadence:link.dataset.demoCadence||'yearly'});});});
    all('[data-price-jump]').forEach(function(link){link.addEventListener('click',function(){trackEvent('pro_price_jump',{location:link.dataset.priceJump||'page'});});});
  }

  function demoForm(){
    var form=document.getElementById('pro-demo-form');
    var status=document.getElementById('demo-status');
    if(!form)return;
    var submit=form.querySelector('button[type="submit"]');
    function setStatus(message,type){if(!status)return;status.textContent=message||'';status.classList.remove('success','error');if(type)status.classList.add(type);}
    form.addEventListener('submit',function(e){
      e.preventDefault();setStatus('','');if(!form.reportValidity())return;
      var data=new FormData(form);
      var payload={full_name:String(data.get('full_name')||'').trim(),email:String(data.get('email')||'').trim(),company:String(data.get('company')||'').trim(),role:String(data.get('role')||'').trim(),volume:String(data.get('volume')||'').trim(),plan:String(data.get('plan')||'unsure').trim()||'unsure',cadence:String(data.get('cadence')||'yearly').trim()||'yearly',message:String(data.get('message')||'').trim(),source:String(data.get('source')||'pro-page').trim(),website:String(data.get('website')||'').trim(),page_url:window.location.href};
      if(submit)submit.disabled=true;
      setStatus('Sending...','');
      trackEvent('pro_demo_submit',{plan:payload.plan,cadence:payload.cadence,role:payload.role});
      fetch(DEMO_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','apikey':SUPABASE_PUBLISHABLE_KEY},body:JSON.stringify(payload)})
        .then(function(r){return r.json().catch(function(){return{};}).then(function(body){if(!r.ok)throw new Error(body.error||'Request could not be sent.');return body;});})
        .then(function(){setStatus('Thanks. We will reply about the best-fit plan.','success');trackEvent('pro_demo_success',{plan:payload.plan,cadence:payload.cadence,role:payload.role});form.reset();var c=document.getElementById('demo-cadence');if(c)c.value=payload.cadence;var p=document.getElementById('demo-plan');if(p)p.value='unsure';})
        .catch(function(err){console.error('Pro demo request failed',err);setStatus('Could not send your request. Please try again.','error');trackEvent('pro_demo_error',{message:(err&&err.message)||'unknown'});})
        .finally(function(){if(submit)submit.disabled=false;});
    });
  }

  function sampleTracking(){all('a[href="/property/"],a[href="/"]').forEach(function(link){link.addEventListener('click',function(){trackEvent('pro_sample_click',{location:link.closest('.p26-hero')?'hero':link.closest('.p26-pricing')?'pricing':'page'});});});}

  function loadOutcomeGuidance(){
    var src='/property/js/plan-outcomes.js';
    if(window.WatchdogPlanOutcomes){window.WatchdogPlanOutcomes.enhance();return;}
    if(document.querySelector('script[src="'+src+'"]'))return;
    var script=document.createElement('script');script.src=src;script.defer=true;document.body.appendChild(script);
  }

  function init(){loadFragment('main-footer','/property/partials/footer.html');reveal();countUp();heroScroll();chat();dock();pricing();intelligencePricing();demoPrefill();demoForm();sampleTracking();loadOutcomeGuidance();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
