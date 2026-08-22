(function(){
  'use strict';

  var path=(window.location.pathname||'').replace(/\/+$/,'');
  if(path!=='/property/pro'&&path!=='/pro')return;

  var DEMO_ENDPOINT='https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/pro-demo-request';
  var SUPABASE_PUBLISHABLE_KEY='sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';

  function trackEvent(name,params){
    if(typeof window.gtag==='function')window.gtag('event',name,params||{});
  }

  function loadFragment(id,url){
    return fetch(url).then(function(r){if(!r.ok)throw new Error(url+' '+r.status);return r.text();}).then(function(html){
      var host=document.getElementById(id);if(!host)return;host.innerHTML=html;
      host.querySelectorAll('script').forEach(function(old){var s=document.createElement('script');Array.from(old.attributes).forEach(function(a){s.setAttribute(a.name,a.value);});s.textContent=old.textContent;old.replaceWith(s);});
    }).catch(function(e){console.error('Fragment load failed',e);});
  }

  function sourceProof(){
    var origin=document.getElementById('pro-origin');
    if(!origin||document.getElementById('pro-source-proof'))return;
    var section=document.createElement('section');
    section.className='pro-section pro-source-proof pro-reveal';
    section.id='pro-source-proof';
    section.setAttribute('aria-labelledby','pro-source-proof-title');
    section.innerHTML='<div class="pro-wrap">'+
      '<div class="pro-section-head"><h2 id="pro-source-proof-title">Source transparency before the sale.</h2><p>Watchdog shows the public-record basis behind professional signals and says when the evidence is too thin to support a reliable read.</p></div>'+
      '<div class="pro-mini-proof"><span><b>564</b> New Jersey municipalities</span><span><b>131,244</b> SR1A verified sales on file</span><span><b>55.2%</b> statewide median assessment-to-market ratio</span></div>'+
      '<div class="pro-origin-grid">'+
        '<div class="pro-origin-stamp"><span>Verified sourcing</span><strong>Evidence beside the answer.</strong><small>Watchdog uses New Jersey Division of Taxation SR1A verified sales and equalization context from the Table of Equalized Valuations where the governed model calls for it.</small></div>'+
        '<div class="pro-origin-copy"><h2>Know what supports the result.</h2><p>Watchdog distinguishes source facts, normalized fields, derived markers and screening signals. When the evidence is too thin, the product should decline to manufacture a number.</p><div class="pro-origin-points"><span><i class="fas fa-file-signature"></i> SR1A verified sales</span><span><i class="fas fa-scale-balanced"></i> Equalization context</span><span><i class="fas fa-circle-check"></i> Confidence + missingness</span><span><i class="fas fa-link"></i> Source lineage</span></div><p>Public-record screening is decision support. It is not a formal appraisal, legal opinion, title determination or tax-appeal conclusion.</p><a class="pro-btn pro-btn-quiet" href="/property/data-methodology">Read the data methodology <i class="fas fa-arrow-right"></i></a></div>'+
      '</div>'+
    '</div>';
    origin.insertAdjacentElement('afterend',section);
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

  function init(){loadFragment('main-nav','/property/partials/nav.html');loadFragment('main-footer','/property/partials/footer.html');sourceProof();reveal();story();roleTabs();pricing();heroMotion();demoPrefill();demoForm();sampleTracking();loadOutcomeGuidance();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();