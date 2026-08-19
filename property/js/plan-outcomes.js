/* Watchdog plan outcomes
   One product-language contract for what each plan helps the user accomplish.
   This is presentation guidance only. Server entitlements remain authoritative. */
(function(){
'use strict';
if(window.__WATCHDOG_PLAN_OUTCOMES__)return;
window.__WATCHDOG_PLAN_OUTCOMES__=true;

var ORDER={standard:0,agent:1,pro:2,pro_plus:3,teams:4,developer:5};
var CATALOG={
  standard:{
    name:'Free',eyebrow:'UNDERSTAND & WATCH',
    promise:'Know the baseline and notice when the property story changes.',
    bestFor:'Homeowners and early research before a professional workflow is needed.',
    outcomes:[
      'Establish the current tax, assessment and property-record baseline',
      'Save properties and return when meaningful monitored facts change',
      'See enough evidence to know which question deserves deeper research'
    ]
  },
  agent:{
    name:'Agent',eyebrow:'TURN CHANGES INTO CONVERSATIONS',
    promise:'Use sourced property changes to decide who is worth a thoughtful client conversation.',
    bestFor:'Real estate professionals working a sphere, farm, buyers, sellers or prospecting workflow.',
    outcomes:[
      'Prioritize properties in an agent workflow instead of working a flat list',
      'Turn property signals into evidence-backed reasons to follow up',
      'Move from research into reports, outreach and agent-specific next actions'
    ]
  },
  pro:{
    name:'Pro',eyebrow:'MAKE PROFESSIONAL DECISIONS',
    promise:'Turn one property’s governed evidence into a deeper professional decision file.',
    bestFor:'Professionals who need explainable property-level Intelligence repeatedly.',
    outcomes:[
      'Use Watchdog Analyst with profession and confirmed research intent attached',
      'Review calibrated property-level Intelligence with evidence, confidence and missing-data context',
      'Move findings into diligence, case, reporting or professional research workflows'
    ]
  },
  pro_plus:{
    name:'Pro+',eyebrow:'FIND PATTERNS AT SCALE',
    promise:'Find, rank and revisit important patterns across many properties before manual research would surface them.',
    bestFor:'Power users whose job is a portfolio, farm, population, data grid or recurring Intelligence queue.',
    outcomes:[
      'Run governed population and scheduled Intelligence instead of opening properties one by one',
      'Work a persistent Daily Intelligence inbox as findings strengthen, weaken or change',
      'Use the deepest data and bulk research surfaces for high-volume decisions'
    ]
  },
  teams:{
    name:'Teams',eyebrow:'OPERATE AS AN ORGANIZATION',
    promise:'Make governed Watchdog research and Intelligence repeatable across a team.',
    bestFor:'Organizations that need shared controls, administration and auditable professional workflows.',
    outcomes:[
      'Coordinate organization-level Intelligence with server-authoritative member controls',
      'Keep shared work governed by team permissions and audit boundaries',
      'Standardize high-volume research operations across multiple professionals'
    ]
  },
  developer:{
    name:'Developer',eyebrow:'OPERATE & VERIFY',
    promise:'Inspect, test and govern every Watchdog boundary without changing customer billing.',
    bestFor:'Internal product, engineering, security and release operations.',
    outcomes:['Verify customer-plan behavior','Inspect governed evidence and release controls','Operate developer-only diagnostics and audits']
  }
};
var OUTCOMES={
  property_baseline:{minimum:'standard',label:'Understand and monitor a property'},
  agent_opportunity:{minimum:'agent',label:'Turn property changes into agent opportunities'},
  property_decision:{minimum:'pro',label:'Run evidence-backed property-level professional Intelligence'},
  population_triage:{minimum:'pro_plus',label:'Find and prioritize patterns across many properties'},
  team_operations:{minimum:'teams',label:'Coordinate governed Intelligence across an organization'}
};
function normalize(v){v=String(v||'standard').toLowerCase().replace(/\+/g,'_plus').replace(/[^a-z_]/g,'');return ORDER[v]==null?'standard':v}
function plan(v){return CATALOG[normalize(v)]||CATALOG.standard}
function minimum(outcome){var x=OUTCOMES[outcome];return x?x.minimum:'standard'}
function can(current,outcome){return ORDER[normalize(current)]>=ORDER[minimum(outcome)]}
function next(current){var p=normalize(current);if(p==='standard')return'agent';if(p==='agent')return'pro';if(p==='pro')return'pro_plus';if(p==='pro_plus')return'teams';return p}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function ensureCss(){var href='/property/css/plan-outcomes.css';if(document.querySelector('link[href="'+href+'"]'))return;var link=document.createElement('link');link.rel='stylesheet';link.href=href;document.head.appendChild(link)}
function cardBody(p){return '<div class="wd-plan-outcome"><span>'+esc(p.eyebrow)+'</span><b>'+esc(p.promise)+'</b><small>'+esc(p.bestFor)+'</small></div>'}
function replaceList(card,p){var list=card.querySelector('ul');if(!list)return;list.innerHTML=p.outcomes.map(function(x){return'<li><i class="fas fa-check"></i>'+esc(x)+'</li>'}).join('')}
function accountPlanKey(card){var h=card.querySelector('h3');var t=String(h&&h.textContent||'').trim().toLowerCase();if(t==='free')return'standard';if(t==='agent')return'agent';if(t==='pro')return'pro';if(t==='pro+')return'pro_plus';if(t==='teams')return'teams';return''}
function enhanceAccount(){var root=document.querySelector('.ac-pricing');if(!root)return;var head=root.querySelector('.ac-pricing-header>div');if(head){var h=head.querySelector('h2'),p=head.querySelector('p');if(h)h.textContent='Choose the outcome you need';if(p)p.textContent='Plans separate by the work Watchdog can take off your plate. Billing cadence changes price, not the outcome boundary.'}
  root.querySelectorAll('.ac-price-card').forEach(function(card){var key=accountPlanKey(card);if(!key)return;var p=plan(key);var desc=card.querySelector('.ac-price-head~.ac-price + small + p')||card.querySelector('.ac-price-head~p');if(desc)desc.textContent=p.promise;replaceList(card,p);var existing=card.querySelector('.wd-plan-outcome');if(existing)existing.remove();var price=card.querySelector('.ac-price');if(price)price.insertAdjacentHTML('beforebegin',cardBody(p));card.dataset.outcomePlan=key});
}
function dashboardUpgrade(){var card=document.querySelector('[data-card-id="upgrade-pro"]');if(!card)return;card.dataset.outcomeEnhanced='1';var link=card.querySelector('a')||card;link.setAttribute('href','/property/pro#pricing');var copy=card.querySelector('.wdv2-up-copy');if(copy)copy.innerHTML='<span class="wdv2-up-eyebrow"><i class="fas fa-route" aria-hidden="true"></i> Professional outcomes</span><h3>Go from seeing the property to knowing what to do next.</h3><p><b>Agent</b> turns changes into conversations. <b>Pro</b> turns evidence into professional decisions. <b>Pro+</b> finds patterns across many properties.</p><span class="wdv2-up-cta">Compare the outcomes <i class="fas fa-arrow-right" aria-hidden="true"></i></span>';var price=card.querySelector('.wdv2-up-price');if(price)price.innerHTML='<b>From $59</b><span>Agent · monthly</span><em>Pro $129 · Pro+ $399</em>'}
function proPricing(){
  var map={agent:'agent',pro:'pro',pro_plus:'pro_plus'};
  Object.keys(map).forEach(function(key){var band=document.querySelector('[data-price-band="'+key+'"]');if(!band)return;var p=plan(map[key]),who=band.querySelector('.pro-price-who');if(!who)return;var para=who.querySelector('p');if(para)para.textContent=p.promise;var pills=who.querySelector('div');if(pills)pills.innerHTML=p.outcomes.map(function(x){return'<b>'+esc(x)+'</b>'}).join('');if(!who.querySelector('.wd-pro-outcome-label')){var h=who.querySelector('h3');if(h)h.insertAdjacentHTML('afterend','<span class="wd-pro-outcome-label">'+esc(p.eyebrow)+'</span>')}});
  var compare=document.querySelector('#compare-plans .pro-section-head');if(compare){var h=compare.querySelector('h2'),p=compare.querySelector('p');if(h)h.textContent='What can you accomplish at each level?';if(p)p.textContent='The capability table stays explicit, but the plan decision starts with the job you need Watchdog to do.'}
  document.querySelectorAll('.pro-faq-card').forEach(function(card){var h=card.querySelector('h3');if(!h)return;if(String(h.textContent||'').trim()==='Is Watchdog AI live now?'){var p=card.querySelector('p');h.textContent='Is Watchdog Intelligence live now?';if(p)p.textContent='Yes. Watchdog Intelligence and Watchdog Analyst are live inside entitled workflows. Pro focuses on evidence-backed property-level professional Intelligence; Pro+ adds population-scale and scheduled Intelligence. Models that still need independent calibration remain clearly labeled Preview rather than being presented as fully validated.'}})
}
function enhance(){ensureCss();enhanceAccount();dashboardUpgrade();proPricing()}
function observe(){var timer=0;var observer=new MutationObserver(function(){clearTimeout(timer);timer=setTimeout(enhance,80)});observer.observe(document.documentElement,{childList:true,subtree:true});setTimeout(function(){observer.disconnect()},15000)}
window.WatchdogPlanOutcomes={catalog:CATALOG,outcomes:OUTCOMES,normalize:normalize,plan:plan,minimum:minimum,can:can,next:next,enhance:enhance};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){enhance();observe()},{once:true});else{enhance();observe()}
})();
