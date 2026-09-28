/* Watchdog Agent Desk hub.
   One page for agents. Six sections (Home, Clients, Farm, Marketing, Research, Deals)
   switch in place, and every agent tool opens inside the desk in a framed view with a
   Back button, so agents never hunt across separate pages. Browser Back works: each
   section and each open tool is a history entry (#farm, #farm/farm-map).
   Without this script every section simply shows in order, so the desk still works. */
(function(){
  'use strict';
  if(window.WatchdogAgentHub)return;
  var app=document.getElementById('ad-app');
  if(!app)return;

  var host=String(location.hostname||'').toLowerCase();
  var cleanHost=host==='watchdogindex.com'||host==='www.watchdogindex.com';

  var SECTIONS={home:'Home',clients:'Clients',farm:'Farm',marketing:'Marketing',research:'Research',deals:'Deals'};
  /* key: [clean public path, physical path, title, section] */
  var TOOLS={
    'contacts':['/agent/contacts','/property/agent/contacts/','Contacts','clients'],
    'farm-map':['/farm-map','/property/farm-map/','Farm map','farm'],
    'farm-builder':['/farm-builder','/property/farm-builder/','Farm by filters','farm'],
    'market-list':['/market-list','/property/market-list/','Farm list','farm'],
    'mailers':['/marketing-studio/postcards','/property/marketing-studio/postcards/','Mailers & postcards','marketing'],
    'broadcasts':['/newsletter-studio','/property/newsletter-studio/','Email updates','marketing'],
    'report-studio':['/report-studio','/property/report-studio/','Farm reports','marketing'],
    'report-builder':['/report-builder','/property/report-builder/','Client reports','marketing'],
    'marketing-plan':['/marketing-plan','/property/marketing-plan/','Marketing plan','marketing'],
    'growth':['/growth/','/property/growth/','Playbooks','marketing'],
    'lookup':['/','/property/','Look up a property','research'],
    'home':['/home','/property/home/','Property','research'],
    'scan':['/scan','/property/scan/','Appeal scanner','research'],
    'town-compare':['/town-compare','/property/town-compare/','Compare towns','research'],
    'data-center':['/data-center','/property/data-center/','Data center','research'],
    'transactions':['/transaction/','/transaction/','Transactions','deals'],
    'listing-prep':['/agent/listing-prep','/agent/listing-prep/','Listing prep','deals'],
    'buyers':['/agent/buyers','/agent/buyers/','Buyer shortlists','deals'],
    'true-cost':['/true-cost','/api/watchdog-true-cost','True cost card','deals'],
    'open-house':['/agent/open-house','/agent/open-house/','Open houses','deals'],
    'training':['/agent/training','/agent/training/','Training & how-tos','home']
  };

  var views=[].slice.call(app.querySelectorAll('[data-adh-view]'));
  var frame=document.getElementById('adh-frame');
  var iframe=document.getElementById('adh-iframe');
  var frameTitle=document.getElementById('adh-frame-title');
  var backLabel=document.getElementById('adh-frame-back-label');
  var outLink=document.getElementById('adh-frame-out');
  var loading=document.getElementById('adh-frame-loading');
  var current={section:'home',tool:null};

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  /* The true cost card carries the agent's page name so their contact card shows on it. */
  var agentSlug=null;
  function path(key){var t=TOOLS[key];if(!t)return '/';var p=cleanHost?t[0]:t[1];return key==='true-cost'&&agentSlug?p+'?agent='+encodeURIComponent(agentSlug):p;}

  /* Which tool does a link point at? Accepts clean, physical and legacy /property/ paths. */
  function normalize(p){
    p=String(p||'/').replace(/\/index\.html$/i,'').replace(/\.html$/i,'');
    if(p.length>1)p=p.replace(/\/+$/,'');
    return p||'/';
  }
  var BY_PATH={};
  Object.keys(TOOLS).forEach(function(k){
    [TOOLS[k][0],TOOLS[k][1],'/property'+TOOLS[k][0]].forEach(function(p){var n=normalize(p);if(!BY_PATH[n])BY_PATH[n]=k;});
  });
  function toolFor(url){
    try{var u=new URL(url,location.href);if(u.origin!==location.origin)return null;return BY_PATH[normalize(u.pathname)]||null;}catch(_){return null;}
  }
  function isDesk(url){try{var u=new URL(url,location.href);var n=normalize(u.pathname);return n==='/agent-desk'||n==='/property/agent-desk';}catch(_){return false;}}

  /* On preview and local hosts the clean root routes do not exist, so tool links use the physical path. */
  if(!cleanHost){
    app.querySelectorAll('a[data-adh-tool]').forEach(function(a){a.setAttribute('href',path(a.dataset.adhTool));});
  }

  function setNav(section){
    app.querySelectorAll('[data-adh-nav]').forEach(function(a){
      var on=a.dataset.adhNav===section;
      a.classList.toggle('on',on);
      if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
    });
  }

  function showSection(section){
    if(!SECTIONS[section])section='home';
    current.section=section;current.tool=null;
    views.forEach(function(v){v.hidden=v.dataset.adhView!==section;});
    frame.hidden=true;
    app.classList.remove('adh-tool-open');
    setNav(section);
    document.title=(section==='home'?'Agent Desk':SECTIONS[section]+' · Agent Desk')+' | Watchdog';
  }

  function openTool(key,url,from){
    var t=TOOLS[key];if(!t)return;
    var section=from&&SECTIONS[from]?from:t[3];
    current.section=section;current.tool=key;
    views.forEach(function(v){v.hidden=true;});
    frame.hidden=false;
    app.classList.add('adh-tool-open');
    setNav(section);
    frameTitle.textContent=t[2];
    backLabel.textContent=SECTIONS[section];
    var target=url||path(key);
    outLink.href=target;
    if(iframe.dataset.src!==target){
      iframe.dataset.src=target;
      loading.hidden=false;iframe.classList.add('loading');
      iframe.src=target;
    }
    document.title=t[2]+' · Agent Desk | Watchdog';
    try{window.scrollTo(0,0);}catch(_){}
  }

  function stateHash(section,tool){return '#'+section+(tool?'/'+tool:'');}
  function go(section,tool,url){
    var state={section:section,tool:tool||null,url:url||null};
    try{history.pushState(state,'',stateHash(section,tool));}catch(_){location.hash=stateHash(section,tool);}
    render(state);
    /* A new screen starts at the top, and keyboard/screen-reader focus lands on its heading. */
    try{window.scrollTo(0,0);}catch(_){}
    var heading=tool?frameTitle:app.querySelector('[data-adh-view="'+section+'"] h1');
    if(heading){heading.setAttribute('tabindex','-1');try{heading.focus({preventScroll:true});}catch(_){heading.focus();}}
  }
  function render(state){
    if(state&&state.tool&&TOOLS[state.tool])openTool(state.tool,state.url,state.section);
    else showSection(state&&state.section||'home');
  }
  function fromHash(){
    var h=String(location.hash||'').replace(/^#/,'').split('/');
    var section=SECTIONS[h[0]]?h[0]:'home',tool=TOOLS[h[1]]?h[1]:null;
    return {section:section,tool:tool,url:null};
  }

  /* Clicks: section tabs, tool cards, and any in-desk link that points at an agent tool. */
  app.addEventListener('click',function(e){
    if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
    /* Extra "Add clients" buttons open the same import dialog; calling the handler directly
       keeps this button as the one focus returns to when the dialog closes. */
    var add=e.target.closest&&e.target.closest('[data-start-import]');
    if(add&&!add.closest('#ad-focus')){var opener=document.getElementById('ad-import-open');if(opener&&typeof opener.onclick==='function'){e.preventDefault();opener.onclick.call(opener);}return;}
    var nav=e.target.closest&&e.target.closest('[data-adh-nav]');
    if(nav){e.preventDefault();go(nav.dataset.adhNav);return;}
    var a=e.target.closest&&e.target.closest('a[href]');
    if(!a||frame.contains(a)||a.target==='_blank'||a.hasAttribute('download'))return;
    var key=a.dataset.adhTool||toolFor(a.href);
    if(!key)return;
    e.preventDefault();
    var u=new URL(a.href,location.href);
    var url=path(key)+(u.search||'')+(u.hash||'');
    go(current.section,key,a.dataset.adhTool&&!u.search?null:url);
  });
  document.getElementById('adh-frame-back').addEventListener('click',function(){
    if(history.state&&history.state.tool)history.back();
    else go(current.section);
  });
  window.addEventListener('popstate',function(e){render(e.state||fromHash());});

  /* Tools render without their own site chrome inside the desk. */
  var EMBED_CSS=[
    '.wdx-topbar,#agent-workspace-nav,.wdx-pagebar,.awx-tabs,.awx-utility,#rs-close,#rs-fullscreen,.wd-public-nav,.pn-header,.site-header,header.site-nav,.wd-site-footer,footer.site-footer,.cookie-banner,#cookie-banner,.wd-consent-banner{display:none!important}',
    'html,body{scroll-padding-top:0!important}',
    ':root{--aw-top:0px!important;--aw-bar:0px!important}',
    'body{padding-top:0!important}'
  ].join('');
  function prepareFrame(){
    loading.hidden=true;iframe.classList.remove('loading');
    var doc;try{doc=iframe.contentDocument;}catch(_){doc=null;}
    if(!doc||!doc.documentElement)return;
    var href='';try{href=iframe.contentWindow.location.href;}catch(_){}
    if(href&&isDesk(href)){iframe.dataset.src='';iframe.src='about:blank';go('home');return;}
    doc.documentElement.classList.add('wd-embedded');
    if(!doc.getElementById('adh-embed-style')){
      var st=doc.createElement('style');st.id='adh-embed-style';st.textContent=EMBED_CSS;(doc.head||doc.documentElement).appendChild(st);
    }
    /* Keep the title in step with what the agent navigated to inside the tool. */
    var key=href&&toolFor(href);
    if(key&&key!==current.tool){current.tool=key;frameTitle.textContent=TOOLS[key][2];}
    if(href&&href!=='about:blank'){iframe.dataset.src=new URL(href).pathname+new URL(href).search;outLink.href=iframe.dataset.src;}
    /* Links that leave for the desk itself come back to the desk instead of nesting it. */
    doc.addEventListener('click',function(ev){
      var a=ev.target.closest&&ev.target.closest('a[href]');
      if(a&&isDesk(a.href)&&!ev.metaKey&&!ev.ctrlKey){ev.preventDefault();var s=String(new URL(a.href).hash||'').replace('#','').split('/')[0];go(SECTIONS[s]?s:'home');}
    },true);
  }
  iframe.addEventListener('load',function(){if(iframe.getAttribute('src')!=='about:blank')prepareFrame();});

  /* Deals repeats the dated deal work from Today, so deadlines sit next to the deal tools. */
  var todayQueue=document.getElementById('ad-today-queue'),dealsQueue=document.getElementById('adh-deals-queue');
  if(todayQueue&&dealsQueue&&window.MutationObserver){
    var mirror=function(){dealsQueue.innerHTML=todayQueue.innerHTML;};
    mirror();new MutationObserver(mirror).observe(todayQueue,{childList:true,subtree:true,characterData:true});
  }

  /* Greeting and the agent page card. */
  function greet(name){
    var h=new Date().getHours(),part=h<12?'Good morning':h<17?'Good afternoon':'Good evening';
    var first=String(name||'').trim().split(/\s+/)[0];
    var el=document.getElementById('adh-home-title');if(el)el.textContent=part+(first?', '+first:'');
    var d=document.getElementById('adh-date');if(d)d.textContent=new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
  }
  function portal(slug){
    agentSlug=slug||null;
    app.querySelectorAll('a[data-adh-tool="true-cost"]').forEach(function(a){a.setAttribute('href',path('true-cost'));});
    var body=document.getElementById('adh-portal-body');if(!body)return;
    var profileHref=cleanHost?'/account/professional-profile':'/account/professional-profile/';
    if(!slug){
      body.innerHTML='<p class="adh-help">Your own page on Watchdog where clients can look up their home and reach you. Pick a short web address to turn it on.</p><a class="ad27-btn primary" href="'+esc(profileHref)+'"><i class="fas fa-pen" aria-hidden="true"></i> Pick my page address</a>';
      return;
    }
    var url='https://www.watchdogindex.com/agent/'+slug;
    body.innerHTML='<p class="adh-help">Share this link in your email signature, texts and social posts. Visits and leads show up below.</p>'+
      '<div class="adh-portal-link"><code>'+esc(url.replace('https://',''))+'</code>'+
      '<button type="button" class="ad27-btn primary" data-adh-copy="'+esc(url)+'"><i class="fas fa-copy" aria-hidden="true"></i> Copy link</button>'+
      '<a class="ad27-btn" href="'+esc(url)+'" target="_blank" rel="noopener"><i class="fas fa-eye" aria-hidden="true"></i> View</a>'+
      '<a class="ad27-btn" href="'+esc(profileHref)+'"><i class="fas fa-pen" aria-hidden="true"></i> Edit</a></div>';
  }
  document.addEventListener('click',function(e){
    var b=e.target.closest&&e.target.closest('[data-adh-copy]');if(!b)return;
    var text=b.dataset.adhCopy,done=function(){var t=document.getElementById('pl-toast');if(t){t.textContent='Link copied';t.classList.add('show');setTimeout(function(){t.classList.remove('show');},2200);}b.innerHTML='<i class="fas fa-check" aria-hidden="true"></i> Copied';};
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(done,function(){window.prompt('Copy your link',text);});
    else window.prompt('Copy your link',text);
  });
  /* Live numbers on the tool cards, so agents can see the desk is working for them. */
  function stat(key,text){app.querySelectorAll('[data-adh-stat="'+key+'"]').forEach(function(el){el.textContent=text;});}
  function plural(n,one,many){return n.toLocaleString()+' '+(n===1?one:many);}
  function count(q){return Promise.resolve(q).then(function(r){return r&&!r.error&&typeof r.count==='number'?r.count:null;},function(){return null;});}
  function loadStats(db,uid){
    Promise.all([
      count(db.from('agent_farm_properties').select('id',{count:'exact',head:true}).eq('user_id',uid).eq('relationship','farm')),
      count(db.from('agent_farm_properties').select('id',{count:'exact',head:true}).eq('user_id',uid)),
      count(db.from('agent_dynamic_lists').select('id',{count:'exact',head:true}).eq('user_id',uid)),
      count(db.from('marketing_campaigns').select('id',{count:'exact',head:true}).eq('user_id',uid))
    ]).then(function(n){
      if(n[0]!==null)stat('farm',n[0]?plural(n[0],'home in your farm','homes in your farm'):'No farm yet. Start here.');
      if(n[1]!==null)stat('watched',n[1]?plural(n[1],'home watched','homes watched'):'Nothing watched yet');
      if(n[2]!==null)stat('lists',n[2]?plural(n[2],'saved list','saved lists'):'No saved lists yet');
      if(n[3]!==null)stat('campaigns',n[3]?plural(n[3],'campaign','campaigns'):'No mailers yet');
    });
  }

  /* A short first-visit tour. Shown once per browser; "Show me around" replays it. */
  var TOUR_KEY='wd_agent_desk_tour_v1';
  var TOUR=[
    {target:function(){return window.matchMedia('(max-width:900px)').matches?app.querySelector('.adh-tabbar'):app.querySelector('.adh-nav-list');},title:'Everything is in this menu',text:'Home, Clients, Farm, Marketing, Research and Deals. Every tool opens right here, so you never have to hunt for another page.'},
    {target:function(){return app.querySelector('.adh-quick');},title:'Not sure where to start?',text:'These four buttons cover the jobs agents do most: add clients, draw a farm, send a mailer and start a deal.'},
    {target:function(){return document.getElementById('ad-today-hub');},title:'Today',text:'Closings, listing prep and open houses that need you soon show up here automatically.'},
    {target:function(){return app.querySelector('.ad27-worklist');},title:'Who to reach out to',text:'Homes in your sphere and farm with a fresh public-record reason to check in. Tap Evidence to see the proof before you call.'},
    {target:null,title:'That is it',text:'When a tool opens, the Back button at the top brings you right back. You can replay this tour any time from "Show me around".'}
  ];
  var tourEl=null,tourStep=0,tourTarget=null,tourReturn=null;
  function seen(){try{return localStorage.getItem(TOUR_KEY)==='1';}catch(_){return true;}}
  function markSeen(){try{localStorage.setItem(TOUR_KEY,'1');}catch(_){}}
  function clearTarget(){if(tourTarget){tourTarget.classList.remove('adh-coach-target');tourTarget=null;}}
  function endTour(){clearTarget();if(tourEl){tourEl.remove();tourEl=null;}markSeen();document.removeEventListener('keydown',tourKeys,true);if(tourReturn&&tourReturn.focus)try{tourReturn.focus({preventScroll:true});}catch(_){}}
  function tourKeys(e){if(e.key==='Escape'){e.preventDefault();endTour();}}
  function place(card,target){
    card.style.top='';card.style.left='';card.classList.toggle('adh-coach-center',!target);
    if(!target||window.matchMedia('(max-width:900px)').matches)return;
    var r=target.getBoundingClientRect(),cw=card.offsetWidth,ch=card.offsetHeight,vw=innerWidth,vh=innerHeight;
    var left=r.right+16+cw<=vw-12?r.right+16:Math.max(12,Math.min(r.left,vw-cw-12));
    var top=r.right+16+cw<=vw-12?Math.max(76,Math.min(r.top,vh-ch-12)):(r.bottom+12+ch<=vh-12?r.bottom+12:Math.max(76,r.top-ch-12));
    card.style.left=Math.round(left)+'px';card.style.top=Math.round(top)+'px';
  }
  function showStep(i){
    tourStep=i;var step=TOUR[i];clearTarget();
    var target=step.target&&step.target();if(target&&!target.getClientRects().length)target=null;
    if(target){tourTarget=target;target.classList.add('adh-coach-target');try{target.scrollIntoView({block:'center',behavior:'auto'});}catch(_){}}
    var last=i===TOUR.length-1;
    tourEl.querySelector('.adh-coach-count').textContent=(i+1)+' of '+TOUR.length;
    tourEl.querySelector('#adh-coach-title').textContent=step.title;
    tourEl.querySelector('.adh-coach-text').textContent=step.text;
    tourEl.querySelector('[data-coach="back"]').hidden=i===0;
    var next=tourEl.querySelector('[data-coach="next"]');next.textContent=last?'Got it':'Next';
    place(tourEl.querySelector('.adh-coach-card'),target);
    try{next.focus({preventScroll:true});}catch(_){next.focus();}
  }
  function startTour(){
    if(tourEl)return;
    if(current.tool||current.section!=='home')go('home');
    tourReturn=document.activeElement;
    tourEl=document.createElement('div');tourEl.className='adh-coach';
    tourEl.innerHTML='<div class="adh-coach-shade" aria-hidden="true"></div><div class="adh-coach-card" role="dialog" aria-modal="true" aria-labelledby="adh-coach-title"><span class="adh-coach-count"></span><h2 id="adh-coach-title"></h2><p class="adh-coach-text"></p><div class="adh-coach-actions"><button type="button" class="adh-coach-skip" data-coach="skip">Skip tour</button><span><button type="button" class="ad27-btn" data-coach="back">Back</button><button type="button" class="ad27-btn primary" data-coach="next">Next</button></span></div></div>';
    document.body.appendChild(tourEl);
    tourEl.addEventListener('click',function(e){var b=e.target.closest('[data-coach]');if(!b)return;var a=b.dataset.coach;if(a==='skip')endTour();else if(a==='back')showStep(Math.max(0,tourStep-1));else if(tourStep>=TOUR.length-1)endTour();else showStep(tourStep+1);});
    document.addEventListener('keydown',tourKeys,true);
    showStep(0);
  }
  document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('[data-adh-tour]');if(b){e.preventDefault();startTour();}});
  window.addEventListener('resize',function(){if(tourEl)place(tourEl.querySelector('.adh-coach-card'),tourTarget);});
  function maybeAutoTour(){
    if(seen()||app.hidden||current.tool||current.section!=='home')return false;
    setTimeout(function(){if(!seen()&&!tourEl&&!app.hidden&&current.section==='home'&&!current.tool)startTour();},900);
    return true;
  }
  if(!maybeAutoTour()&&!seen()&&window.MutationObserver){
    var shown=new MutationObserver(function(){if(!app.hidden){shown.disconnect();maybeAutoTour();}});
    shown.observe(app,{attributes:true,attributeFilter:['hidden']});
  }

  greet('');
  Promise.resolve(window.njptrAccessReady).then(function(ctx){
    var db=window.NJPTRAccess&&window.NJPTRAccess.client?window.NJPTRAccess.client():null;
    var user=ctx&&ctx.user;if(!db||!user){portal(null);return;}
    var meta=user.user_metadata||{};greet(meta.full_name||meta.name||'');
    loadStats(db,user.id);
    return db.from('profiles').select('display_name,full_name,vanity_slug').eq('id',user.id).maybeSingle().then(function(r){
      var p=r&&!r.error&&r.data||{};
      greet(p.full_name||p.display_name||meta.full_name||'');
      portal(p.vanity_slug||null);
    });
  }).catch(function(){portal(null);});

  app.classList.add('adh-ready');
  var initial=fromHash();
  try{history.replaceState(initial,'',location.hash?stateHash(initial.section,initial.tool):location.pathname+location.search);}catch(_){}
  render(initial);

  window.WatchdogAgentHub={open:function(key,url){go(TOOLS[key]?TOOLS[key][3]:'home',key,url||null);},section:function(s){go(s);},tools:TOOLS};
})();
