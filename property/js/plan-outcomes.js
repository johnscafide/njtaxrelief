/* Watchdog plan outcomes
   One product-language contract for what each plan helps the user accomplish.
   This is presentation guidance only. Server entitlements remain authoritative. */
(function(){
'use strict';
if(window.__WATCHDOG_PLAN_OUTCOMES__)return;
window.__WATCHDOG_PLAN_OUTCOMES__=true;

var ORDER={standard:0,agent:1,pro:2,pro_plus:3,teams:4,developer:5};
var CATALOG={
  standard:{name:'Free',eyebrow:'UNDERSTAND & WATCH',promise:'Know the baseline and notice when the property story changes.',bestFor:'Homeowners and early research before a professional workflow is needed.',outcomes:['Establish the current tax, assessment and property-record baseline','Save properties and return when meaningful monitored facts change','See enough evidence to know which question deserves deeper research']},
  agent:{name:'Agent',eyebrow:'TURN CHANGES INTO CONVERSATIONS',promise:'Use sourced property changes to decide who is worth a thoughtful client conversation.',bestFor:'Real estate professionals working a sphere, farm, buyers, sellers or prospecting workflow.',outcomes:['Prioritize properties in an agent workflow instead of working a flat list','Turn property signals into evidence-backed reasons to follow up','Move from research into reports, outreach and agent-specific next actions']},
  pro:{name:'Pro',eyebrow:'MAKE PROFESSIONAL DECISIONS',promise:'Turn one property’s governed evidence into a deeper professional decision file.',bestFor:'Professionals who need explainable property-level Intelligence repeatedly.',outcomes:['Use Watchdog Analyst with profession and confirmed research intent attached','Review calibrated property-level Intelligence with evidence, confidence and missing-data context','Move findings into diligence, case, reporting or professional research workflows']},
  pro_plus:{name:'Pro+',eyebrow:'FIND PATTERNS AT SCALE',promise:'Find, rank and revisit important patterns across many properties before manual research would surface them.',bestFor:'Power users whose job is a portfolio, farm, population, data grid or recurring Intelligence queue.',outcomes:['Run governed population and scheduled Intelligence instead of opening properties one by one','Work a persistent Daily Intelligence inbox as findings strengthen, weaken or change','Use the deepest data and bulk research surfaces for high-volume decisions']},
  teams:{name:'Teams',eyebrow:'OPERATE AS AN ORGANIZATION',promise:'Make governed Watchdog research and Intelligence repeatable across a team.',bestFor:'Organizations that need shared controls, administration and auditable professional workflows.',outcomes:['Coordinate organization-level Intelligence with server-authoritative member controls','Keep shared work governed by team permissions and audit boundaries','Standardize high-volume research operations across multiple professionals']},
  developer:{name:'Developer',eyebrow:'OPERATE & VERIFY',promise:'Inspect, test and govern every Watchdog boundary without changing customer billing.',bestFor:'Internal product, engineering, security and release operations.',outcomes:['Verify customer-plan behavior','Inspect governed evidence and release controls','Operate developer-only diagnostics and audits']}
};
var OUTCOMES={property_baseline:{minimum:'standard',label:'Understand and monitor a property'},agent_opportunity:{minimum:'agent',label:'Turn property changes into agent opportunities'},property_decision:{minimum:'pro',label:'Run evidence-backed property-level professional Intelligence'},population_triage:{minimum:'pro_plus',label:'Find and prioritize patterns across many properties'},team_operations:{minimum:'teams',label:'Coordinate governed Intelligence across an organization'}};
var ROBUST=[
  {letter:'R',name:'Recourse',weight:'10%',fill:'68%'},
  {letter:'O',name:'Overassessment Position',weight:'20%',fill:'82%'},
  {letter:'B',name:'Burden',weight:'30%',fill:'74%'},
  {letter:'U',name:'Uniformity',weight:'15%',fill:'79%'},
  {letter:'S',name:'Stability',weight:'15%',fill:'88%'},
  {letter:'T',name:'Trajectory',weight:'10%',fill:'71%'}
];

function normalize(v){v=String(v||'standard').toLowerCase().replace(/\+/g,'_plus').replace(/[^a-z_]/g,'');return ORDER[v]==null?'standard':v}
function plan(v){return CATALOG[normalize(v)]||CATALOG.standard}
function minimum(outcome){var x=OUTCOMES[outcome];return x?x.minimum:'standard'}
function can(current,outcome){return ORDER[normalize(current)]>=ORDER[minimum(outcome)]}
function next(current){var p=normalize(current);if(p==='standard')return'agent';if(p==='agent')return'pro';if(p==='pro')return'pro_plus';if(p==='pro_plus')return'teams';return p}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}

function ensureCss(){var href='/property/css/plan-outcomes.css';if(document.querySelector('link[href="'+href+'"]'))return;var link=document.createElement('link');link.rel='stylesheet';link.href=href;document.head.appendChild(link)}
function ensureProBrandCss(){var href='/property/css/watchdog-intelligence-brand.css';if(document.querySelector('link[href="'+href+'"]'))return;var link=document.createElement('link');link.rel='stylesheet';link.href=href;document.head.appendChild(link)}
function cardBody(p){return '<div class="wd-plan-outcome"><span>'+esc(p.eyebrow)+'</span><b>'+esc(p.promise)+'</b><small>'+esc(p.bestFor)+'</small></div>'}
function replaceList(card,p){var list=card.querySelector('ul');if(!list)return;list.innerHTML=p.outcomes.map(function(x){return'<li><i class="fas fa-check"></i>'+esc(x)+'</li>'}).join('')}
function accountPlanKey(card){var h=card.querySelector('h3'),t=String(h&&h.textContent||'').trim().toLowerCase();if(t==='free')return'standard';if(t==='agent')return'agent';if(t==='pro')return'pro';if(t==='pro+')return'pro_plus';if(t==='teams')return'teams';return''}

function enhanceAccount(){
  var root=document.querySelector('.ac-pricing');if(!root)return;
  if(root.dataset.outcomeHeader!=='1'){
    var head=root.querySelector('.ac-pricing-header>div');
    if(head){var h=head.querySelector('h2'),p=head.querySelector('p');if(h)h.textContent='Choose the outcome you need';if(p)p.textContent='Plans separate by the work Watchdog can take off your plate. Billing cadence changes price, not the outcome boundary.'}
    root.dataset.outcomeHeader='1';
  }
  root.querySelectorAll('.ac-price-card').forEach(function(card){
    var key=accountPlanKey(card);if(!key||card.dataset.outcomePlan===key)return;
    var p=plan(key),desc=card.querySelector('.ac-price-head~.ac-price + small + p')||card.querySelector('.ac-price-head~p');
    if(desc)desc.textContent=p.promise;
    replaceList(card,p);
    var existing=card.querySelector('.wd-plan-outcome');if(existing)existing.remove();
    var price=card.querySelector('.ac-price');if(price)price.insertAdjacentHTML('beforebegin',cardBody(p));
    card.dataset.outcomePlan=key;
  });
}

function dashboardUpgrade(){
  var card=document.querySelector('[data-card-id="upgrade-pro"]');if(!card||card.dataset.outcomeEnhanced==='1')return;
  card.dataset.outcomeEnhanced='1';
  var link=card.querySelector('a')||card;link.setAttribute('href','/property/pro#pricing');
  var copy=card.querySelector('.wdv2-up-copy');
  if(copy)copy.innerHTML='<span class="wdv2-up-eyebrow"><i class="fas fa-route" aria-hidden="true"></i> Professional outcomes</span><h3>Go from seeing the property to knowing what to do next.</h3><p><b>Agent</b> turns changes into conversations. <b>Pro</b> turns evidence into professional decisions. <b>Pro+</b> finds patterns across many properties.</p><span class="wdv2-up-cta">Compare the outcomes <i class="fas fa-arrow-right" aria-hidden="true"></i></span>';
  var price=card.querySelector('.wdv2-up-price');if(price)price.innerHTML='<b>From $59</b><span>Agent · monthly</span><em>Pro $129 · Pro+ $399</em>';
}

function proPricing(){
  var map={agent:'agent',pro:'pro',pro_plus:'pro_plus'};
  Object.keys(map).forEach(function(key){
    var band=document.querySelector('[data-price-band="'+key+'"]');if(!band||band.dataset.outcomePlan===key)return;
    var p=plan(map[key]),who=band.querySelector('.pro-price-who');if(!who)return;
    var para=who.querySelector('p');if(para)para.textContent=p.promise;
    var pills=Array.prototype.slice.call(who.children).find(function(node){return node.tagName==='DIV'&&!node.classList.contains('pro-intel-plan')});
    if(pills)pills.innerHTML=p.outcomes.map(function(x){return'<b>'+esc(x)+'</b>'}).join('');
    if(!who.querySelector('.wd-pro-outcome-label')){var h=who.querySelector('h3');if(h)h.insertAdjacentHTML('afterend','<span class="wd-pro-outcome-label">'+esc(p.eyebrow)+'</span>')}
    band.dataset.outcomePlan=key;
  });
  var compare=document.querySelector('#compare-plans .pro-section-head');
  if(compare&&compare.dataset.outcomeEnhanced!=='1'){
    var h=compare.querySelector('h2'),p=compare.querySelector('p');
    if(h)h.textContent='What can you accomplish at each level?';
    if(p)p.textContent='The capability table stays explicit, but the plan decision starts with the job you need Watchdog to do.';
    compare.dataset.outcomeEnhanced='1';
  }
  document.querySelectorAll('.pro-faq-card').forEach(function(card){
    if(card.dataset.outcomeLive==='1')return;
    var h=card.querySelector('h3');if(!h)return;
    if(String(h.textContent||'').trim()==='Is Watchdog AI live now?'||String(h.textContent||'').trim()==='Is Watchdog Intelligence live now?'){
      var p=card.querySelector('p');
      h.textContent='Is Watchdog Intelligence live now?';
      if(p)p.textContent='Yes. Watchdog Intelligence and Watchdog Analyst are live inside entitled workflows. Pro focuses on evidence-backed property-level professional Intelligence; Pro+ adds population-scale and scheduled Intelligence. Models that still need independent calibration remain clearly labeled Preview rather than being presented as fully validated.';
      card.dataset.outcomeLive='1';
    }
  });
  var platform=document.querySelector('.pro-platform-side.watchdog');
  if(platform&&platform.dataset.intelligenceLive!=='1'){
    var badge=platform.querySelector('.pro-coming-badge');if(badge)badge.innerHTML='<i class="fas fa-wand-magic-sparkles"></i> Watchdog Intelligence · live';
    Array.prototype.slice.call(platform.querySelectorAll('li')).forEach(function(li){if(/Planned AI-assisted change monitoring/i.test(li.textContent||''))li.innerHTML='<i class="fas fa-check"></i> Live governed Intelligence with property-change monitoring and evidence-backed findings'});
    platform.dataset.intelligenceLive='1';
  }
  var note=document.querySelector('.pro-platform-note');
  if(note&&note.dataset.intelligenceLive!=='1'){
    note.textContent='Watchdog Intelligence is live in entitled workflows. Model-level calibration status remains visible, and Preview models are not presented as fully validated.';
    note.dataset.intelligenceLive='1';
  }
}

function proShotSide(active){
  var links=[
    ['properties','fa-table-columns','Properties'],
    ['watchlist','fa-heart','Watchlist'],
    ['change','fa-wave-square','Change intelligence'],
    ['agent','fa-bullseye','Agent Control'],
    ['analyst','fa-dog','Watchdog Analyst']
  ];
  return '<aside class="wd-shot-side">'+
    '<div class="wd-shot-brand"><i class="fas fa-dog"></i><span><b>Watchdog</b><small>Property Intelligence</small></span></div>'+
    '<div class="wd-shot-search"><i class="fas fa-magnifying-glass"></i><span>Find a tool</span></div>'+
    '<span class="wd-shot-nav-label">Overview</span>'+
    links.map(function(item){return '<div class="wd-shot-link '+(active===item[0]?'on':'')+'"><i class="fas '+item[1]+'"></i><span>'+item[2]+'</span></div>'}).join('')+
    '<span class="wd-shot-nav-label">Professional work</span>'+
    '<div class="wd-shot-link '+(active==='workbench'?'on':'')+'"><i class="fas fa-table-list"></i><span>Data Workbench</span></div>'+
    '<div class="wd-shot-link"><i class="fas fa-bullhorn"></i><span>Marketing Studio</span></div>'+
    '<div class="wd-shot-plan"><b>Professional workspace</b><span>Representative product view</span></div>'+
  '</aside>';
}

function proShotTop(kicker,title,primary){
  return '<div class="wd-shot-top"><div class="wd-shot-title"><small>'+kicker+'</small><strong>'+title+'</strong></div><div class="wd-shot-actions"><span class="wd-shot-btn"><i class="fas fa-arrow-up-from-bracket"></i> Export</span><span class="wd-shot-btn primary"><i class="fas fa-'+(primary||'bookmark')+'"></i> Save</span></div></div>';
}

function robustRows(){
  return ROBUST.map(function(d){return '<div class="wd-robust-row"><i>'+d.letter+'</i><b>'+d.name+'</b><span><i style="--v:'+d.fill+'"></i></span><em>'+d.weight+'</em></div>'}).join('');
}

function renderProShots(){
  var story=document.querySelector('.pro-story');if(!story||story.dataset.currentProductVisuals==='1')return;
  var steps=Array.prototype.slice.call(document.querySelectorAll('[data-pro-screen]'));
  var panels=Array.prototype.slice.call(document.querySelectorAll('[data-pro-panel]'));
  if(steps.length<5||panels.length<5)return;

  var copy=[
    ['01 / Property workspace','Open the home.<br>Keep the whole story.','A current property workspace brings the image, assessment, tax context, Watchdog Score and next actions into one professional view.'],
    ['02 / Watchdog Score + ROBUST','See the score.<br>Then see its structure.','The Watchdog Score is powered by the ROBUST Framework. One score. Six evidence-backed dimensions.'],
    ['03 / Change intelligence','Watch what moves.<br>Ignore what does not.','Saved properties return to the surface when assessment, record, permit or other governed facts deserve another look.'],
    ['04 / Professional workspace','Go from record<br>to working file.','Data Workbench combines sourced markers, derived context and professional workflow without making you rebuild the property story in a spreadsheet.'],
    ['05 / Watchdog Intelligence + Voice','Ask the property.<br>Listen to the brief.','Use governed Watchdog Intelligence for sourced questions, analysis and Voice inside entitled workflows. Written evidence stays authoritative.']
  ];
  steps.slice(0,5).forEach(function(step,i){
    var s=step.querySelector('span'),h=step.querySelector('h3'),p=step.querySelector('p');
    if(s)s.textContent=copy[i][0];if(h)h.innerHTML=copy[i][1];if(p)p.textContent=copy[i][2];
  });

  panels[0].innerHTML='<div class="wd-product-shot">'+proShotSide('properties')+'<div class="wd-shot-main">'+proShotTop('Property workspace','1092 Chews Landing Road','bookmark')+'<div class="wd-property-hero"><div class="wd-property-photo" role="img" aria-label="Representative New Jersey property image"></div><div class="wd-property-score"><small>WATCHDOG SCORE</small><div class="wd-score-line"><b>82</b><span><i class="fas fa-arrow-trend-up"></i> strong context</span></div><p>Assessment, tax, market and municipal context are presented with the evidence supporting the read.</p><footer><span>Sources attached</span><span>Updated context</span></footer></div></div><div class="wd-property-metrics"><div><span>Assessment</span><b>$238,400</b><small>Current record</small></div><div><span>Annual tax</span><b>$8,420</b><small>Current context</small></div><div><span>Town ratio</span><b>67.8%</b><small>Equalization</small></div><div><span>Last sale</span><b>$351,000</b><small>Verified sale</small></div></div></div></div>';

  panels[1].innerHTML='<div class="wd-product-shot">'+proShotSide('properties')+'<div class="wd-shot-main">'+proShotTop('Watchdog Score','Score + ROBUST evidence','file-lines')+'<div class="wd-score-layout"><div class="wd-score-card"><div class="wd-score-orb"><b>82</b></div><strong>Watchdog Score</strong><small>Representative score view</small></div><div class="wd-robust-card"><div class="wd-robust-head"><div><span>ROBUST FRAMEWORK</span><b>One score. Six dimensions.</b></div><em>Framework weight</em></div><div class="wd-robust-bars">'+robustRows()+'</div></div></div></div></div>';

  panels[2].innerHTML='<div class="wd-product-shot">'+proShotSide('watchlist')+'<div class="wd-shot-main">'+proShotTop('Change intelligence','Your monitored properties','bell')+'<div class="wd-change-summary"><div><small>Watching</small><b>42</b></div><div><small>Changed this week</small><b>7</b></div><div><small>Needs review</small><b>3</b></div></div><div class="wd-change-feed"><div class="wd-change-item"><i class="fas fa-arrow-trend-up"></i><div><b>Assessment context changed</b><span>Washington Township · evidence refreshed</span></div><em>Review</em></div><div class="wd-change-item"><i class="fas fa-file-circle-check"></i><div><b>Recorded sale verified</b><span>Berlin Borough · SR1A source attached</span></div><em>New</em></div><div class="wd-change-item"><i class="fas fa-hammer"></i><div><b>Permit lifecycle updated</b><span>Cherry Hill · municipal context changed</span></div><em>Changed</em></div><div class="wd-change-item"><i class="fas fa-scale-balanced"></i><div><b>Appeal context strengthened</b><span>Property evidence now supports deeper review</span></div><em>Review</em></div></div></div></div>';

  panels[3].innerHTML='<div class="wd-product-shot">'+proShotSide('workbench')+'<div class="wd-shot-main">'+proShotTop('Professional workspace','Data Workbench','download')+'<div class="wd-workbench-tools"><span>Property</span><span>Assessment</span><span>Tax</span><span>Sales</span><span>Appeal</span><span>Permits</span><span>Flood</span><span>Signals</span></div><div class="wd-workbench-grid"><header><span>Property</span><span>Assessment</span><span>Tax</span><span>Ratio</span><span>Evidence</span><span>Signal</span></header><div><b>Sample property A</b><span>$238,400</span><span>$8,420</span><span>67.8%</span><span>Verified</span><em>Review</em></div><div><b>Sample property B</b><span>$410,200</span><span>$12,180</span><span>72.1%</span><span>Verified</span><em>Changed</em></div><div><b>Sample property C</b><span>$184,900</span><span>$6,904</span><span>61.4%</span><span>Verified</span><em>Watch</em></div><div><b>Sample property D</b><span>$595,100</span><span>$15,740</span><span>78.0%</span><span>Verified</span><em>Strong</em></div><div><b>Sample property E</b><span>$301,800</span><span>$9,310</span><span>69.6%</span><span>Verified</span><em>Review</em></div></div><div class="wd-workbench-proof"><span><i class="fas fa-link"></i> source lineage</span><span><i class="fas fa-circle-check"></i> confidence + missingness</span><span><i class="fas fa-lock"></i> plan-governed tools</span></div></div></div>';

  panels[4].innerHTML='<div class="wd-intel-shot"><div class="wd-intel-panel"><div class="wd-intel-panel-inner"><div class="wd-intel-head"><div><span class="wd-intel-mark"><i class="fas fa-dog"></i></span><span><b>Watchdog <span class="wd-intelligence-word">Intelligence</span></b><small>Analyst · evidence-backed</small></span></div><span class="wd-intel-live">LIVE</span></div><div class="wd-intel-question">What changed on this property, and what should I review first?</div><div class="wd-intel-answer"><b>Three changes deserve attention.</b>Assessment context moved, a verified sale was added, and the permit record changed. The strongest next step is to review the assessment-to-market position against the new sale evidence.<div class="wd-intel-sources"><span>SR1A verified sale</span><span>Equalization context</span><span>Municipal record</span></div></div><div class="wd-intel-compose"><i class="fas fa-microphone-lines"></i><span>Ask Watchdog by voice or text…</span><button aria-label="Send"><i class="fas fa-arrow-up"></i></button></div></div></div><aside class="wd-voice-panel"><small>WATCHDOG INTELLIGENCE VOICE</small><h4>Listen to the Intelligence Brief.</h4><p>Voice uses the same governed answer and sources. The written result remains visible and authoritative.</p><div class="wd-voice-wave" aria-hidden="true"><i style="--h:18px"></i><i style="--h:36px"></i><i style="--h:48px"></i><i style="--h:27px"></i><i style="--h:56px"></i><i style="--h:41px"></i><i style="--h:22px"></i><i style="--h:50px"></i><i style="--h:32px"></i><i style="--h:16px"></i></div><div class="wd-voice-actions"><span><i class="fas fa-play"></i> Play brief</span><span><i class="fas fa-microphone"></i> Ask Voice</span></div></aside></div>';

  story.dataset.currentProductVisuals='1';
}

function insertRobustSection(){
  if(document.getElementById('wd-robust-framework'))return;
  var story=document.querySelector('.pro-story');if(!story)return;
  var section=document.createElement('section');
  section.className='pro-section wd-robust-section';
  section.id='wd-robust-framework';
  section.innerHTML='<div class="pro-wrap wd-robust-marketing"><div class="wd-robust-copy"><span class="pro-kicker">THE METHOD UNDER THE SCORE</span><h2>The Watchdog Score is powered by <strong>ROBUST.</strong></h2><p><strong>One score. Six dimensions. ROBUST.</strong> The framework organizes the evidence behind the score so a professional can see what is driving the result instead of trusting a black box.</p></div><div class="wd-robust-grid"><div class="wd-robust-dimension"><b>R</b><strong>Recourse</strong><span>Appeal and review pathway context.</span><em>10% weight</em></div><div class="wd-robust-dimension"><b>O</b><strong>Overassessment Position</strong><span>Assessment position against governed market context.</span><em>20% weight</em></div><div class="wd-robust-dimension"><b>B</b><strong>Burden</strong><span>Property-tax burden within the scoring framework.</span><em>30% weight</em></div><div class="wd-robust-dimension"><b>U</b><strong>Uniformity</strong><span>Municipal and comparative assessment consistency.</span><em>15% weight</em></div><div class="wd-robust-dimension"><b>S</b><strong>Stability</strong><span>How stable the assessment context has been over time.</span><em>15% weight</em></div><div class="wd-robust-dimension"><b>T</b><strong>Trajectory</strong><span>The direction of assessment and related property context.</span><em>10% weight</em></div></div></div>';
  story.insertAdjacentElement('afterend',section);
}

function enhanceProCompare(){
  var shell=document.querySelector('#compare-plans .pro-compare-shell');if(!shell)return;
  Array.prototype.slice.call(shell.querySelectorAll('.pro-compare-row')).forEach(function(row){
    var first=row.firstElementChild;if(!first)return;
    if(String(first.textContent||'').trim()==='Watchdog Score + evidence')first.textContent='Watchdog Score + ROBUST evidence';
  });
  var target=Array.prototype.slice.call(shell.querySelectorAll('.pro-compare-group')).find(function(group){return /Professional workflow/i.test(group.textContent||'')});
  if(target&&!shell.querySelector('.pro-voice-row')){
    var row=document.createElement('div');
    row.className='pro-compare-row pro-voice-row';
    row.innerHTML='<div><i class="fas fa-microphone-lines"></i> Watchdog Intelligence Voice</div><div class="dim">—</div><div>With Intelligence</div><div>With Intelligence</div><div class="yes">Included</div>';
    target.insertAdjacentElement('beforebegin',row);
  }
  var intel=shell.querySelector('.pro-intelligence-row');
  if(intel){var first=intel.firstElementChild;if(first&&!first.querySelector('.wd-intelligence-word'))first.innerHTML='Watchdog <span class="wd-intelligence-word">Intelligence</span>';}
}

function brandIntelligenceReferences(){
  var selectors=['.pro-intelligence-promo-label','.pro-intel-plan b','.pro-intelligence-row>div:first-child','.pro-faq-card[data-intelligence-faq] h3'];
  selectors.forEach(function(selector){
    document.querySelectorAll(selector).forEach(function(node){
      if(node.querySelector&&node.querySelector('.wd-intelligence-word'))return;
      var text=String(node.textContent||'');if(text.indexOf('Watchdog Intelligence')<0)return;
      node.innerHTML=esc(text).replace('Watchdog Intelligence','Watchdog <span class="wd-intelligence-word">Intelligence</span>');
    });
  });
  var badge=document.querySelector('.pro-platform-side.watchdog .pro-coming-badge');
  if(badge&&!badge.querySelector('.wd-intelligence-word')&&/Watchdog Intelligence/i.test(badge.textContent||'')){
    var suffix=/available on paid plans/i.test(badge.textContent||'')?' · available on paid plans':' · live';
    badge.innerHTML='<i class="fas fa-wand-magic-sparkles"></i> Watchdog <span class="wd-intelligence-word">Intelligence</span>'+suffix;
  }
  var promo=document.querySelector('.pro-intelligence-promo');if(promo)promo.classList.add('wd-intelligence-surface');
}

function enhanceProVisuals(){
  if(!document.body.classList.contains('wd-pro-page'))return;
  ensureProBrandCss();
  renderProShots();
  insertRobustSection();
  enhanceProCompare();
  brandIntelligenceReferences();
}

function enhance(){ensureCss();enhanceAccount();dashboardUpgrade();proPricing();enhanceProVisuals()}
function observe(){var timer=0,observer=new MutationObserver(function(){clearTimeout(timer);timer=setTimeout(enhance,80)});observer.observe(document.documentElement,{childList:true,subtree:true});setTimeout(function(){observer.disconnect()},15000)}
window.WatchdogPlanOutcomes={catalog:CATALOG,outcomes:OUTCOMES,normalize:normalize,plan:plan,minimum:minimum,can:can,next:next,enhance:enhance};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){enhance();observe()},{once:true});else{enhance();observe()}
})();
