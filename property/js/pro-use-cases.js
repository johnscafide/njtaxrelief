(function(){
  'use strict';

  var path=(window.location.pathname||'').replace(/\/+$/,'');
  if(path!=='/property/pro')return;

  function qs(sel,root){return (root||document).querySelector(sel);}
  function qsa(sel,root){return Array.prototype.slice.call((root||document).querySelectorAll(sel));}
  function el(tag,className,html){var n=document.createElement(tag);if(className)n.className=className;if(html!=null)n.innerHTML=html;return n;}

  function addStyles(){
    if(document.getElementById('pro-feedback-revision-styles'))return;
    var style=document.createElement('style');
    style.id='pro-feedback-revision-styles';
    style.textContent=`
      .pro-fast-price{margin-top:28px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;max-width:690px}
      .pro-fast-price a{display:flex;align-items:center;justify-content:space-between;gap:14px;min-height:72px;padding:14px 16px;border:1px solid rgba(16,41,75,.09);border-radius:18px;background:rgba(255,255,255,.72);backdrop-filter:blur(14px);text-decoration:none;color:var(--pro-ink);transition:transform .22s ease,box-shadow .22s ease,border-color .22s ease}
      .pro-fast-price a:hover{transform:translateY(-2px);box-shadow:0 14px 34px rgba(26,43,64,.09);border-color:rgba(7,132,134,.22)}
      .pro-fast-price span{display:block;color:#79838d;font:800 8px/1 "Plus Jakarta Sans",sans-serif;letter-spacing:.1em;text-transform:uppercase}.pro-fast-price b{display:block;margin-top:7px;font:800 16px/1 "Plus Jakarta Sans",sans-serif}.pro-fast-price strong{font:800 27px/1 "Plus Jakarta Sans",sans-serif;letter-spacing:-.05em;white-space:nowrap}.pro-fast-price strong small{font-size:10px;color:#77818c;letter-spacing:0}
      .pro-fast-price-note{max-width:690px;margin:9px 0 0;color:#77818b;font-size:11px}.pro-price-jump{display:inline-flex;align-items:center;gap:8px;margin-top:16px;color:#475464;text-decoration:none;font:800 10px "Plus Jakarta Sans",sans-serif}.pro-price-jump i{color:var(--pro-teal)}
      .pro-price-float{position:fixed;right:22px;bottom:22px;z-index:9000;display:flex;align-items:center;gap:9px;padding:12px 15px;border-radius:999px;background:#10294b;color:#fff;text-decoration:none;font:800 10px "Plus Jakarta Sans",sans-serif;box-shadow:0 18px 44px rgba(16,41,75,.24);opacity:0;transform:translateY(12px);pointer-events:none;transition:opacity .24s ease,transform .24s ease}.pro-price-float.show{opacity:1;transform:none;pointer-events:auto}.pro-price-float b{color:#80ddd1}.pro-price-float i{font-size:9px}
      .pro-origin{padding:86px 0;background:linear-gradient(135deg,#f8faf8,#eef6f4);border-bottom:1px solid rgba(16,19,24,.05)}.pro-origin-grid{display:grid;grid-template-columns:minmax(0,.72fr) minmax(0,1.28fr);gap:72px;align-items:center}.pro-origin-stamp{min-height:290px;border-radius:28px;background:linear-gradient(145deg,#10294b,#0f5863);color:#fff;padding:34px;display:flex;flex-direction:column;justify-content:space-between;box-shadow:0 24px 70px rgba(19,45,66,.16);position:relative;overflow:hidden}.pro-origin-stamp:after{content:"NJ";position:absolute;right:-10px;bottom:-38px;font:800 150px/1 "Plus Jakarta Sans",sans-serif;color:rgba(255,255,255,.055);letter-spacing:-.08em}.pro-origin-stamp span{color:#8ee2d8;font:800 9px "Plus Jakarta Sans",sans-serif;letter-spacing:.12em;text-transform:uppercase}.pro-origin-stamp strong{font:700 34px/1.03 "Plus Jakarta Sans",sans-serif;letter-spacing:-.045em;max-width:330px}.pro-origin-stamp small{color:#bdd0d9;font-size:11px;max-width:330px;line-height:1.45}.pro-origin-copy h2{margin:0;font:650 clamp(42px,4.2vw,67px)/.96 "Plus Jakarta Sans",sans-serif;letter-spacing:-.06em}.pro-origin-copy p{margin:22px 0 0;max-width:760px;color:#68737d;font-size:18px;line-height:1.58}.pro-origin-points{display:flex;flex-wrap:wrap;gap:8px;margin-top:26px}.pro-origin-points span{display:flex;align-items:center;gap:7px;padding:9px 11px;border-radius:999px;background:#fff;color:#56636d;font-size:10px;font-weight:800}.pro-origin-points i{color:var(--pro-teal)}
      .pro-role-outcome{margin-top:22px!important;padding:14px 16px;border-radius:14px;background:#10294b;color:#fff!important;font-size:13px!important;line-height:1.42!important;font-weight:700}.pro-role-outcome i{color:#80ddd1;margin-right:8px}
      .pro-capability-surface{padding-top:92px!important;padding-bottom:92px!important}.pro-capability-surface .pro-section-head{max-width:880px;margin-bottom:34px}.pro-capability-surface .pro-feature-columns{grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.pro-capability-surface .pro-feature-col{transform:none!important;min-height:0;padding:22px;border-radius:18px}.pro-capability-surface .pro-feature-col span:nth-of-type(n+7){display:none}.pro-capability-surface .pro-feature-col span{padding:8px 0;font-size:11px}.pro-capability-more{margin:26px auto 0;max-width:830px;text-align:center;color:#7b858e;font-size:12px;line-height:1.5}.pro-capability-more b{color:#3e4b57}.pro-capability-surface .pro-feature-river{margin-top:32px}
      .pro-price-secondary{display:block;margin-top:10px;text-align:center;color:#73808c;font:800 9px "Plus Jakarta Sans",sans-serif;text-decoration:none}.plus .pro-price-secondary{color:#a9b5c1}.pro-price-secondary:hover{text-decoration:underline}.pro-price-band .pro-price-cta[data-billing-plan]{text-decoration:none}.pro-price-band .pro-price-cta[data-billing-plan]:after{content:"Self-serve";position:absolute;right:18px;top:16px;padding:5px 7px;border-radius:999px;background:rgba(7,132,134,.08);color:#078486;font:800 7px "Plus Jakarta Sans",sans-serif;letter-spacing:.08em;text-transform:uppercase}.pro-price-band{overflow:visible!important}
      .pro-after-buy{background:#fff;padding:100px 0}.pro-after-buy-head{max-width:820px}.pro-after-buy-head h2{margin:0;font:650 clamp(44px,4.6vw,70px)/.96 "Plus Jakarta Sans",sans-serif;letter-spacing:-.06em}.pro-after-buy-head p{margin:18px 0 0;color:#6f7882;font-size:17px;line-height:1.5}.pro-after-buy-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:42px}.pro-after-buy-card{position:relative;min-height:260px;padding:28px;border-radius:24px;background:#f5f6f5;overflow:hidden}.pro-after-buy-card:nth-child(2){background:#eef7f5}.pro-after-buy-card:nth-child(3){background:#10294b;color:#fff}.pro-after-buy-card>span{display:inline-flex;width:34px;height:34px;border-radius:50%;align-items:center;justify-content:center;background:#fff;color:var(--pro-teal);font:800 9px "Plus Jakarta Sans",sans-serif}.pro-after-buy-card h3{margin:52px 0 0;font:800 23px/1.05 "Plus Jakarta Sans",sans-serif;letter-spacing:-.04em}.pro-after-buy-card p{margin:12px 0 0;color:#707b84;font-size:13px;line-height:1.5}.pro-after-buy-card:nth-child(3) p{color:#b7c5d1}.pro-after-buy-card i{position:absolute;right:24px;top:26px;color:#8bded4;font-size:20px}.pro-after-buy-foot{margin-top:18px;color:#7b858e;font-size:11px}.pro-after-buy-foot b{color:#3f4b55}
      .pro-faq-card.new-buyer-question{background:linear-gradient(145deg,#f8fbfa,#eef7f5)}
      .pro-story .pro-app-top>b{white-space:nowrap}
      @media(max-width:1100px){.pro-origin-grid{grid-template-columns:1fr}.pro-origin-stamp{min-height:230px}.pro-capability-surface .pro-feature-columns{grid-template-columns:1fr 1fr}.pro-after-buy-grid{grid-template-columns:1fr}.pro-after-buy-card{min-height:210px}}
      @media(max-width:720px){.pro-fast-price{grid-template-columns:1fr;max-width:none}.pro-fast-price a{min-height:62px}.pro-fast-price strong{font-size:24px}.pro-origin{padding:66px 0}.pro-origin-grid{gap:28px}.pro-origin-copy h2{font-size:42px}.pro-capability-surface .pro-feature-columns{grid-template-columns:1fr}.pro-price-float{right:12px;left:12px;bottom:12px;justify-content:center}.pro-after-buy{padding:76px 0}.pro-after-buy-head h2{font-size:42px}.pro-price-band .pro-price-cta[data-billing-plan]:after{display:none}}
      @media(prefers-reduced-motion:reduce){.pro-price-float,.pro-fast-price a{transition:none!important}}
    `;
    document.head.appendChild(style);
  }

  function refreshMeta(){
    var og=qs('meta[property="og:description"]');
    if(og)og.setAttribute('content','Watchdog professional property intelligence for New Jersey. Agent $59/mo, Pro $129/mo and Pro+ $399/mo.');
  }

  function buildHeroFastPath(){
    var copy=qs('.pro-hero-copy');
    if(!copy||qs('#pro-fast-price'))return;
    var intro=copy.querySelector('p');
    var actions=copy.querySelector('.pro-hero-actions');
    if(!intro||!actions)return;

    var rail=el('div','pro-fast-price');
    rail.id='pro-fast-price';
    rail.innerHTML=`
      <a href="#pricing" data-fast-plan="agent"><span><b>Agent</b>Real estate</span><strong>$59<small>/mo</small></strong></a>
      <a href="#pricing" data-fast-plan="pro"><span><b>Pro</b>Professional research</span><strong>$129<small>/mo</small></strong></a>
      <a href="#pricing" data-fast-plan="pro_plus"><span><b>Pro+</b>High-volume data</span><strong>$399<small>/mo</small></strong></a>`;
    intro.insertAdjacentElement('afterend',rail);
    var note=el('p','pro-fast-price-note','Annual plans are available at the equivalent of ten monthly payments.');
    rail.insertAdjacentElement('afterend',note);

    var primary=actions.querySelector('a:first-child');
    if(primary){
      primary.href='#pro-story';
      primary.removeAttribute('data-demo-trigger');
      primary.innerHTML='Explore Watchdog <i class="fas fa-arrow-down"></i>';
    }
    var jump=el('a','pro-price-jump','Just want the price? <span>See the plans</span> <i class="fas fa-arrow-down"></i>');
    jump.href='#pricing';
    jump.setAttribute('data-price-jump','hero');
    actions.insertAdjacentElement('afterend',jump);
  }

  function buildOrigin(){
    if(qs('#pro-origin'))return;
    var trust=qs('.pro-trust-strip');
    if(!trust)return;
    var section=el('section','pro-origin');
    section.id='pro-origin';
    section.innerHTML=`<div class="pro-wrap pro-origin-grid">
      <div class="pro-origin-stamp"><span>New Jersey first</span><strong>Not a national parcel database with a New Jersey filter.</strong><small>Watchdog is shaped around the property-tax and municipal context that actually changes decisions here.</small></div>
      <div class="pro-origin-copy"><h2>Built around New Jersey property decisions.</h2><p>Assessments, equalization, Chapter 123 context, municipal records, appeal timing and property changes are first-class concepts in Watchdog. The product starts with the questions New Jersey professionals ask, then keeps the evidence attached.</p><div class="pro-origin-points"><span><i class="fas fa-scale-balanced"></i> Appeal context</span><span><i class="fas fa-location-dot"></i> Municipal context</span><span><i class="fas fa-clock-rotate-left"></i> Change history</span><span><i class="fas fa-file-lines"></i> Source-aware evidence</span></div></div>
    </div>`;
    trust.insertAdjacentElement('afterend',section);
  }

  function makeStoryHonest(){
    var label=qs('.pro-app-top>b');
    if(label)label.innerHTML='<i></i> Product workflow';
  }

  function addRoleOutcomes(){
    var outcomes={
      agent:'Surface the homes in your farm or sphere whose story changed, with the reason to follow up already attached.',
      attorney:'Screen the intake list toward matters with stronger Chapter 123 and comparable support before deep review begins.',
      finance:'Catch the tax or assessment context that can change the housing-cost picture before the model goes out.',
      appraiser:'Keep assessment history, equalization and recent local sales around the subject in one working view.',
      investor:'See tax burden, assessment direction and property signals before they become a surprise in the carry cost.'
    };
    Object.keys(outcomes).forEach(function(key){
      var panel=qs('[data-role-panel="'+key+'"]');
      var copy=panel&&qs('.pro-role-copy',panel);
      if(!copy||qs('.pro-role-outcome',copy))return;
      var p=el('p','pro-role-outcome','<i class="fas fa-bolt"></i>'+outcomes[key]);
      var pills=qs('.pro-role-pills',copy);
      if(pills)pills.insertAdjacentElement('beforebegin',p);else copy.appendChild(p);
    });
  }

  function breakHeadlineFormula(){
    var replacements=[
      ['.pro-roles .pro-section-head h2','The reason changes with the profession.'],
      ['.pro-before-after .pro-section-head h2','Stop rebuilding the same property story.'],
      ['.pro-evidence .pro-section-head h2','Fast answers only matter when the evidence stays attached.'],
      ['.pro-compare .pro-section-head h2','Everything that changes between plans.'],
      ['.pro-billing-faq .pro-section-head h2','Questions buyers ask before they subscribe.']
    ];
    replacements.forEach(function(pair){var h=qs(pair[0]);if(h)h.textContent=pair[1];});
  }

  function tightenCapabilitySurface(){
    var deadline=qs('.pro-deadline');
    if(deadline)deadline.remove();
    var wall=qs('.pro-feature-wall');
    if(!wall)return;
    wall.classList.add('pro-capability-surface');
    var head=qs('.pro-section-head',wall);
    if(head)head.innerHTML='<h2>The working surface gets deeper as the job does.</h2><p>Four layers cover the record, the changes, the professional review and the action that follows.</p>';
    if(!qs('.pro-capability-more',wall)){
      var river=qs('.pro-feature-river',wall);
      var more=el('p','pro-capability-more','The page is intentionally not pretending every allowance is unlimited. <b>Plan-specific usage limits will be published when they are finalized.</b>');
      if(river)river.insertAdjacentElement('beforebegin',more);
    }
  }

  function cleanAIAndEmptyRows(){
    qsa('.pro-price-who b').forEach(function(chip){if(/watchdog ai/i.test(chip.textContent||''))chip.remove();});
    qsa('.pro-compare-row').forEach(function(row){
      var first=row.firstElementChild;
      var text=first?(first.textContent||'').trim().toLowerCase():'';
      if(text==='watchdog ai'||text==='customer api')row.remove();
    });
  }

  function currentCadence(){
    var active=qs('[data-cadence].active');
    return active&&active.dataset.cadence==='monthly'?'monthly':'yearly';
  }

  function configureBuyingButtons(){
    var cadence=currentCadence();
    ['agent','pro'].forEach(function(plan){
      var band=qs('[data-price-band="'+plan+'"]');
      var cta=band&&qs('.pro-price-cta',band);
      if(!cta)return;
      cta.href='#';
      cta.dataset.billingPlan=plan;
      cta.dataset.billingCadence=cadence;
      cta.removeAttribute('data-demo-plan');
      cta.removeAttribute('data-demo-cadence');
      cta.innerHTML=(plan==='agent'?'Choose Agent':'Choose Pro')+' <i class="fas fa-arrow-right"></i>';
      if(plan==='pro'&&!qs('.pro-price-secondary',band)){
        var secondary=el('a','pro-price-secondary','Prefer a walkthrough first?');
        secondary.href='#demo';
        secondary.dataset.demoPlan='pro';
        secondary.dataset.demoCadence=cadence;
        cta.insertAdjacentElement('afterend',secondary);
      }
    });
    var plusBand=qs('[data-price-band="pro_plus"]');
    var plus=plusBand&&qs('.pro-price-cta',plusBand);
    if(plus){plus.innerHTML='Request Pro+ walkthrough <i class="fas fa-arrow-right"></i>';plus.href='#demo';}
  }

  function bindCadenceToCheckout(){
    qsa('[data-cadence]').forEach(function(button){
      button.addEventListener('click',function(){window.setTimeout(function(){
        configureBuyingButtons();
        qsa('[data-billing-plan]').forEach(function(cta){cta.dataset.billingCadence=button.dataset.cadence==='monthly'?'monthly':'yearly';});
        qsa('.pro-price-secondary').forEach(function(link){link.dataset.demoCadence=button.dataset.cadence==='monthly'?'monthly':'yearly';});
      },0);});
    });
  }

  function addAfterPurchase(){
    if(qs('#pro-after-buy'))return;
    var pricing=qs('#pricing');
    if(!pricing)return;
    var section=el('section','pro-after-buy');
    section.id='pro-after-buy';
    section.innerHTML=`<div class="pro-wrap">
      <div class="pro-after-buy-head"><h2>What changes after you subscribe?</h2><p>The subscription is not another dashboard to remember. It becomes the place a property comes back to you when the story changes.</p></div>
      <div class="pro-after-buy-grid">
        <article class="pro-after-buy-card"><span>01</span><i class="fas fa-house-circle-check"></i><h3>Day one</h3><p>Build the working set: the properties, towns or professional workflow that matters to you.</p></article>
        <article class="pro-after-buy-card"><span>02</span><i class="fas fa-bell"></i><h3>The first change</h3><p>A saved property moves back into view with the reason it deserves another look.</p></article>
        <article class="pro-after-buy-card"><span>03</span><i class="fas fa-bolt"></i><h3>When you need to act</h3><p>Open the evidence, compare the context, produce the report or move the property into the next workflow.</p></article>
      </div>
      <p class="pro-after-buy-foot"><b>No fake countdown.</b> The urgency comes from real assessment changes, municipal updates, property events and filing windows.</p>
    </div>`;
    pricing.insertAdjacentElement('afterend',section);
  }

  function expandBuyerQuestions(){
    var grid=qs('.pro-faq-grid');
    if(!grid||qs('[data-faq-added="trial"]'))return;
    var trial=el('article','pro-faq-card new-buyer-question','<i class="fas fa-hourglass-half"></i><h3>Is there a free trial?</h3><p>Not yet. We will not advertise a trial until the trial entitlement and expiration flow is actually ready. The homeowner property lookup remains free.</p>');
    trial.dataset.faqAdded='trial';
    var plus=el('article','pro-faq-card new-buyer-question','<i class="fas fa-layer-group"></i><h3>Why is Pro+ walkthrough-first?</h3><p>Pro+ is built for high-volume, data-heavy work. We would rather confirm the workflow fit than sell a $399/month plan blindly.</p>');
    plus.dataset.faqAdded='proplus';
    grid.appendChild(trial);grid.appendChild(plus);
  }

  function stickyPriceShortcut(){
    if(qs('#pro-price-float'))return;
    var link=el('a','pro-price-float','Plans from <b>$59/mo</b> <span>View pricing</span> <i class="fas fa-arrow-down"></i>');
    link.id='pro-price-float';link.href='#pricing';document.body.appendChild(link);
    var hero=qs('.pro-hero');var pricing=qs('#pricing');var ticking=false;
    function update(){ticking=false;if(!hero||!pricing)return;var heroBottom=hero.getBoundingClientRect().bottom;var priceTop=pricing.getBoundingClientRect().top;var show=heroBottom<80&&priceTop>window.innerHeight*.55;link.classList.toggle('show',show);}
    function onScroll(){if(ticking)return;ticking=true;requestAnimationFrame(update);}
    window.addEventListener('scroll',onScroll,{passive:true});window.addEventListener('resize',onScroll);update();
  }

  function trackFastPath(){
    document.addEventListener('click',function(e){
      var jump=e.target.closest('[data-price-jump],[data-fast-plan]');
      if(!jump)return;
      if(typeof window.gtag==='function')window.gtag('event','pro_price_fast_path',{location:jump.dataset.priceJump||'hero_strip',plan:jump.dataset.fastPlan||''});
    });
  }

  function build(){
    if(qs('#pro-feedback-revision'))return;
    var guard=document.createElement('div');guard.id='pro-feedback-revision';guard.hidden=true;document.body.appendChild(guard);
    addStyles();refreshMeta();buildHeroFastPath();buildOrigin();makeStoryHonest();addRoleOutcomes();breakHeadlineFormula();tightenCapabilitySurface();cleanAIAndEmptyRows();configureBuyingButtons();bindCadenceToCheckout();addAfterPurchase();expandBuyerQuestions();stickyPriceShortcut();trackFastPath();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',build,{once:true});else build();
})();
