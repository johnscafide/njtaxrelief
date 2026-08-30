(function(){
  'use strict';

  var path=(window.location.pathname||'').replace(/\/+$/,'');
  if(path!=='/property/pro'&&path!=='/pro')return;

  var DEMO_ENDPOINT='https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/pro-demo-request';
  var INTELLIGENCE_CATALOG_ENDPOINT='https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/billing-price-catalog';
  var SUPABASE_PUBLISHABLE_KEY='sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
  var INTELLIGENCE_STYLES='/property/css/pro-intelligence-offer.css';

  function trackEvent(name,params){
    if(typeof window.gtag==='function')window.gtag('event',name,params||{});
  }

  function loadFragment(id,url){
    return fetch(url).then(function(r){if(!r.ok)throw new Error(url+' '+r.status);return r.text();}).then(function(html){
      var host=document.getElementById(id);if(!host)return;host.innerHTML=html;
      host.querySelectorAll('script').forEach(function(old){var s=document.createElement('script');Array.from(old.attributes).forEach(function(a){s.setAttribute(a.name,a.value);});s.textContent=old.textContent;old.replaceWith(s);});
    }).catch(function(e){console.error('Fragment load failed',e);});
  }

  function ensureStylesheet(href){
    if(document.querySelector('link[href="'+href+'"]'))return;
    var link=document.createElement('link');link.rel='stylesheet';link.href=href;document.head.appendChild(link);
  }

  function reveal(){
    var nodes=Array.prototype.slice.call(document.querySelectorAll('.pro-reveal'));
    if(!nodes.length)return;
    if(!('IntersectionObserver' in window)||(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)){
      nodes.forEach(function(n){n.classList.add('is-visible');});return;
    }
    var io=new IntersectionObserver(function(entries){entries.forEach(function(entry){if(!entry.isIntersecting)return;entry.target.classList.add('is-visible');io.unobserve(entry.target);});},{threshold:.12,rootMargin:'0px 0px -7% 0px'});
    nodes.forEach(function(n){io.observe(n);});
  }

  function story(){
    var section=document.querySelector('.pro-story');
    var steps=Array.prototype.slice.call(document.querySelectorAll('[data-pro-screen]'));
    var panels=Array.prototype.slice.call(document.querySelectorAll('[data-pro-panel]'));
    var tabs=Array.prototype.slice.call(document.querySelectorAll('.pro-app-tabs span'));
    var pathLabel=document.getElementById('pro-app-path');
    if(!section||!steps.length||!panels.length)return;
    var labels=['watchdog / property intelligence','watchdog / score + evidence','watchdog / watchlist','watchdog / professional research','watchdog / action'];
    var active=-1,ticking=false;
    function set(index){index=Math.max(0,Math.min(panels.length-1,index));if(index===active)return;active=index;steps.forEach(function(n,i){n.classList.toggle('active',i===index);});panels.forEach(function(n,i){n.classList.toggle('active',i===index);});tabs.forEach(function(n,i){n.classList.toggle('active',i===index);});if(pathLabel)pathLabel.textContent=labels[index]||labels[0];}
    function nearest(){if(window.innerWidth<=1100)return active<0?0:active;var r=section.getBoundingClientRect();if(r.bottom<0||r.top>window.innerHeight)return -1;var target=Math.min(window.innerHeight-130,Math.max(150,window.innerHeight*.47));var best=0,dist=Infinity;steps.forEach(function(step,i){var x=step.getBoundingClientRect(),c=x.top+x.height/2,d=Math.abs(c-target);if(d<dist){dist=d;best=i;}});return best;}
    function onScroll(){if(ticking)return;ticking=true;requestAnimationFrame(function(){ticking=false;var i=nearest();if(i>=0)set(i);});}
    window.addEventListener('scroll',onScroll,{passive:true});window.addEventListener('resize',onScroll);set(0);onScroll();
  }

  function roleTabs(){
    var tabs=Array.prototype.slice.call(document.querySelectorAll('[data-role-tab]'));
    var panels=Array.prototype.slice.call(document.querySelectorAll('[data-role-panel]'));
    if(!tabs.length)return;
    function set(key){tabs.forEach(function(t){var on=t.dataset.roleTab===key;t.classList.toggle('active',on);t.setAttribute('aria-selected',on?'true':'false');});panels.forEach(function(p){p.classList.toggle('active',p.dataset.rolePanel===key);});}
    tabs.forEach(function(t){t.addEventListener('click',function(){set(t.dataset.roleTab);});});set('agent');
  }

  var priceData={
    yearly:{
      agent:{value:'590',unit:'/ year',eyebrow:'Annual',note:'Two months free. Save $118 vs 12 monthly payments.'},
      pro:{value:'1,290',unit:'/ year',eyebrow:'Annual',note:'Two months free. Save $258 vs 12 monthly payments.'},
      pro_plus:{value:'3,990',unit:'/ year',eyebrow:'Annual',note:'Two months free. Save $798 vs 12 monthly payments.'}
    },
    monthly:{
      agent:{value:'59',unit:'/ month',eyebrow:'Monthly',note:'Pay month to month.'},
      pro:{value:'129',unit:'/ month',eyebrow:'Monthly',note:'Pay month to month.'},
      pro_plus:{value:'399',unit:'/ month',eyebrow:'Monthly',note:'Pay month to month.'}
    }
  };

  function pricing(){
    var buttons=Array.prototype.slice.call(document.querySelectorAll('[data-cadence]'));
    var demoCadence=document.getElementById('demo-cadence');
    if(!buttons.length)return;
    function set(cad,shouldTrack){
      if(!priceData[cad])cad='yearly';
      buttons.forEach(function(b){var on=b.dataset.cadence===cad;b.classList.toggle('active',on);b.setAttribute('aria-pressed',on?'true':'false');});
      ['agent','pro','pro_plus'].forEach(function(plan){var d=priceData[cad][plan];var v=document.querySelector('[data-price-value="'+plan+'"]'),u=document.querySelector('[data-price-unit="'+plan+'"]'),e=document.querySelector('[data-price-eyebrow="'+plan+'"]'),n=document.querySelector('[data-price-note="'+plan+'"]'),cta=document.querySelector('[data-demo-plan="'+plan+'"]');if(v)v.textContent=d.value;if(u)u.textContent=d.unit;if(e)e.textContent=d.eyebrow;if(n)n.textContent=d.note;if(cta)cta.dataset.demoCadence=cad;});
      if(demoCadence)demoCadence.value=cad;
      if(shouldTrack)trackEvent('pro_billing_toggle',{cadence:cad});
    }
    buttons.forEach(function(b){b.addEventListener('click',function(){set(b.dataset.cadence,true);});});set('yearly',false);
  }

  /* content-architecture: dynamic — this wording reflects the live billing catalog/promotion state. */
  function renderIntelligenceOffer(catalog){
    var intelligence=catalog&&catalog.intelligence||{};
    var promo=intelligence.promotion||{};
    var regular=Number(intelligence.regular_add_on_monthly||12);
    if(!Number.isFinite(regular)||regular<=0)regular=12;
    var eligible=Array.isArray(promo.eligible_plans)?promo.eligible_plans:['agent','pro'];
    var included=Array.isArray(intelligence.included_plans)?intelligence.included_plans:['pro_plus','teams'];
    var promoActive=promo.active===true;
    var promoLabel=String(promo.label||'Limited time');
    ensureStylesheet(INTELLIGENCE_STYLES);

    var priceHead=document.querySelector('.pro-price-head');
    if(priceHead){
      var promoBox=document.getElementById('pro-intelligence-promo');
      if(!promoBox){
        promoBox=document.createElement('div');
        promoBox.className='pro-intelligence-promo pro-reveal';
        promoBox.id='pro-intelligence-promo';
        var cadence=priceHead.querySelector('.pro-cadence');
        if(cadence)cadence.insertAdjacentElement('afterend',promoBox);else priceHead.appendChild(promoBox);
      }
      promoBox.innerHTML='<div class="pro-intelligence-promo-inner"><div class="pro-intelligence-promo-label">Watchdog Intelligence · '+(promoActive?promoLabel:'Add-on')+'</div><div><strong>'+(promoActive?'Included with paid memberships at no additional charge.':'An optional intelligence layer for Agent and Pro.')+'</strong><p>'+(promoActive?'Agent and Pro normally add Watchdog Intelligence for $'+regular+'/month. During the current promotion, it is included at no additional charge. Pro+ includes Watchdog Intelligence as a base-plan benefit.':'Agent and Pro can add Watchdog Intelligence for $'+regular+'/month. Pro+ includes it at no additional charge.')+'</p></div><div class="pro-intelligence-promo-price"><b>'+(promoActive?'$0 during promotion':'$'+regular+'/month')+'</b><small>'+(promoActive?'Agent + Pro · limited time':'Agent + Pro add-on')+'</small></div></div>';
    }

    ['agent','pro','pro_plus'].forEach(function(plan){
      var band=document.querySelector('[data-price-band="'+plan+'"]');
      if(!band)return;
      var who=band.querySelector('.pro-price-who');
      if(!who)return;
      var note=who.querySelector('.pro-intel-plan');
      if(!note){note=document.createElement('div');note.className='pro-intel-plan';var featureList=who.querySelector('div');if(featureList)featureList.insertAdjacentElement('beforebegin',note);else who.appendChild(note);}
      if(included.indexOf(plan)>=0){
        note.innerHTML='<b>Watchdog Intelligence</b>Included with '+(plan==='pro_plus'?'Pro+':'this plan')+' at no additional charge.';
      }else if(eligible.indexOf(plan)>=0&&promoActive){
        note.innerHTML='<b>Watchdog Intelligence · '+promoLabel+'</b>Normally +$'+regular+'/month. Included at no additional charge during the current promotion.';
      }else if(eligible.indexOf(plan)>=0){
        note.innerHTML='<b>Watchdog Intelligence</b>Optional +$'+regular+'/month add-on.';
      }else{
        note.remove();
      }
    });

    var compare=document.querySelector('.pro-compare-shell');
    if(compare){
      var row=compare.querySelector('.pro-intelligence-row');
      if(!row){row=document.createElement('div');row.className='pro-compare-row pro-intelligence-row';var groups=compare.querySelectorAll('.pro-compare-group');var target=groups.length>1?groups[1]:null;if(target)target.insertAdjacentElement('beforebegin',row);else compare.appendChild(row);}
      row.innerHTML='<div>Watchdog Intelligence</div><div class="dim">—</div><div class="yes">'+(promoActive?'Limited time: included':'$'+regular+'/mo add-on')+'</div><div class="yes">'+(promoActive?'Limited time: included':'$'+regular+'/mo add-on')+'</div><div class="yes">Included</div>';
    }

    var badge=document.querySelector('.pro-platform-side.watchdog .pro-coming-badge');
    if(badge){badge.classList.add('pro-intelligence-live-badge');badge.innerHTML='<i class="fas fa-wand-magic-sparkles"></i> Watchdog Intelligence · available on paid plans';}
    var platform=document.querySelector('.pro-platform-side.watchdog');
    if(platform){var list=platform.querySelector('ul');var last=list&&list.querySelector('li:last-child');if(last)last.innerHTML='<i class="fas fa-check"></i> Watchdog Intelligence for assisted analysis, change monitoring and priority context';}
    var platformNote=document.querySelector('.pro-platform-note');
    if(platformNote){platformNote.classList.add('pro-intelligence-live');platformNote.textContent=promoActive?'Watchdog Intelligence is available on paid memberships. Agent and Pro normally add it for $'+regular+'/month, but it is included at no additional charge during the current limited-time promotion. Pro+ includes it as a base-plan benefit.':'Watchdog Intelligence is available on paid memberships. Agent and Pro can add it for $'+regular+'/month; Pro+ includes it as a base-plan benefit.';}

    var faqCard=document.querySelector('.pro-faq-card[data-intelligence-faq]');
    if(!faqCard){
      Array.prototype.slice.call(document.querySelectorAll('.pro-faq-card')).some(function(card){var heading=card.querySelector('h3');if(heading&&heading.textContent.trim()==='Is Watchdog AI live now?'){faqCard=card;card.setAttribute('data-intelligence-faq','pricing');return true;}return false;});
    }
    if(faqCard){
      var heading=faqCard.querySelector('h3');if(heading)heading.textContent='How is Watchdog Intelligence priced?';
      var icon=faqCard.querySelector('i');if(icon)icon.className='fas fa-wand-magic-sparkles';
      var copy=faqCard.querySelector('p');if(copy)copy.textContent=promoActive?'Agent and Pro normally add Watchdog Intelligence for $'+regular+'/month. For a limited time, it is included with paid memberships at no additional charge. Pro+ includes it as a base-plan benefit.':'Agent and Pro can add Watchdog Intelligence for $'+regular+'/month. Pro+ includes it at no additional charge.';
    }
  }

  function intelligencePricing(){
    var fallback={intelligence:{regular_add_on_monthly:12,included_plans:['pro_plus','teams'],promotion:{active:true,label:'Limited time',eligible_plans:['agent','pro']}}};
    renderIntelligenceOffer(fallback);
    fetch(INTELLIGENCE_CATALOG_ENDPOINT,{method:'GET',headers:{Accept:'application/json'},cache:'no-store'})
      .then(function(r){if(!r.ok)throw new Error('Billing catalog '+r.status);return r.json();})
      .then(function(catalog){if(catalog&&catalog.provider==='stripe')renderIntelligenceOffer(catalog);})
      .catch(function(err){console.warn('Watchdog Intelligence pricing catalog unavailable; using verified fallback.',err);});
  }

  function heroMotion(){
    var orbit=document.querySelector('.pro-orbit');
    if(!orbit||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    orbit.addEventListener('pointermove',function(e){var r=orbit.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;orbit.style.transform='perspective(1000px) rotateY('+(x*2.2)+'deg) rotateX('+(-y*2)+'deg)';});
    orbit.addEventListener('pointerleave',function(){orbit.style.transform='';});
  }

  function demoPrefill(){
    var planSelect=document.getElementById('demo-plan');
    var cadence=document.getElementById('demo-cadence');
    document.querySelectorAll('[data-demo-plan]').forEach(function(link){
      link.addEventListener('click',function(){
        if(planSelect)planSelect.value=link.dataset.demoPlan||'unsure';
        if(cadence)cadence.value=link.dataset.demoCadence||'yearly';
        trackEvent('pro_plan_explore',{plan:link.dataset.demoPlan||'unsure',cadence:link.dataset.demoCadence||'yearly'});
      });
    });
    document.querySelectorAll('[data-demo-trigger]').forEach(function(link){
      link.addEventListener('click',function(){trackEvent('pro_demo_start',{location:link.dataset.demoTrigger||'page'});});
    });
  }

  function demoForm(){
    var form=document.getElementById('pro-demo-form');
    var status=document.getElementById('demo-status');
    if(!form)return;
    var submit=form.querySelector('button[type="submit"]');
    function setStatus(message,type){if(!status)return;status.textContent=message||'';status.classList.remove('success','error');if(type)status.classList.add(type);}
    form.addEventListener('submit',function(e){
      e.preventDefault();
      setStatus('','');
      if(!form.reportValidity())return;
      var data=new FormData(form);
      var payload={
        full_name:String(data.get('full_name')||'').trim(),
        email:String(data.get('email')||'').trim(),
        company:String(data.get('company')||'').trim(),
        role:String(data.get('role')||'').trim(),
        volume:String(data.get('volume')||'').trim(),
        plan:String(data.get('plan')||'unsure').trim()||'unsure',
        cadence:String(data.get('cadence')||'yearly').trim()||'yearly',
        message:String(data.get('message')||'').trim(),
        source:String(data.get('source')||'pro-page').trim(),
        website:String(data.get('website')||'').trim(),
        page_url:window.location.href
      };
      if(submit)submit.disabled=true;
      setStatus('Sending your request…','');
      trackEvent('pro_demo_submit',{plan:payload.plan,cadence:payload.cadence,role:payload.role});
      fetch(DEMO_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','apikey':SUPABASE_PUBLISHABLE_KEY},body:JSON.stringify(payload)})
        .then(function(r){return r.json().catch(function(){return{};}).then(function(body){if(!r.ok)throw new Error(body.error||'Request could not be sent.');return body;});})
        .then(function(){
          setStatus('Request received. Watchdog has your walkthrough details.','success');
          trackEvent('pro_demo_success',{plan:payload.plan,cadence:payload.cadence,role:payload.role});
          form.reset();
          var c=document.getElementById('demo-cadence');if(c)c.value=payload.cadence;
        })
        .catch(function(err){console.error('Pro demo request failed',err);setStatus('We could not send that request right now. Please try again in a moment.','error');trackEvent('pro_demo_error',{message:(err&&err.message)||'unknown'});})
        .finally(function(){if(submit)submit.disabled=false;});
    });
  }

  function sampleTracking(){
    document.querySelectorAll('a[href="/property/"],a[href="/"]').forEach(function(link){link.addEventListener('click',function(){trackEvent('pro_sample_click',{location:link.closest('.pro-hero')?'hero':link.closest('.pro-demo')?'demo':'page'});});});
  }

  function loadOutcomeGuidance(){
    var src='/property/js/plan-outcomes.js';
    if(window.WatchdogPlanOutcomes){window.WatchdogPlanOutcomes.enhance();return;}
    if(document.querySelector('script[src="'+src+'"]'))return;
    var script=document.createElement('script');script.src=src;script.defer=true;document.body.appendChild(script);
  }

  function init(){loadFragment('main-nav','/property/partials/nav.html');loadFragment('main-footer','/property/partials/footer.html');reveal();story();roleTabs();pricing();intelligencePricing();heroMotion();demoPrefill();demoForm();sampleTracking();loadOutcomeGuidance();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();