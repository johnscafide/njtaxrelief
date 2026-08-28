(function(){
  'use strict';
  var KEY='watchdog_pro_first_run_v1';
  var path=window.location.pathname.replace(/\/+$/,'');
  var isPro=path==='/property/pro';
  var isScan=path==='/property/scan';
  if(!isPro&&!isScan)return;

  function seen(){try{return localStorage.getItem(KEY)==='done';}catch(_){return false;}}
  function markSeen(){try{localStorage.setItem(KEY,'done');}catch(_){}}
  function addStyles(){
    if(document.getElementById('wd-first-run-style'))return;
    var s=document.createElement('style');s.id='wd-first-run-style';s.textContent='\
.wd-fr-launch{display:inline-flex;align-items:center;gap:8px;border:0;border-radius:var(--radius-pill,999px);padding:10px 14px;background:var(--navy-dark,#10294b);color:#fff;font:700 var(--type-xs,.75rem)/1.1 var(--font-ui,"Plus Jakarta Sans",Arial,sans-serif);text-decoration:none;box-shadow:0 8px 20px rgba(16,41,75,.14)}\
.wd-fr-launch:hover{background:#0b203d;color:#fff}.wd-fr-launch i{color:#35c4bd}\
.wd-fr-overlay{position:fixed;inset:0;z-index:2147483000;background:rgba(8,24,44,.58);display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(3px)}\
.wd-fr-card{width:min(520px,100%);background:var(--surface,#fff);border-radius:var(--radius-xl,1.5rem);padding:26px;box-shadow:var(--shadow-lg,0 28px 80px rgba(0,0,0,.24));color:var(--navy-dark,#10294b);font-family:var(--font-ui,"Plus Jakarta Sans",Arial,sans-serif)}\
.wd-fr-step{font:800 var(--type-xs,.75rem)/1.2 var(--font-ui,"Plus Jakarta Sans",Arial,sans-serif);letter-spacing:.08em;text-transform:uppercase;color:#087f82}.wd-fr-card h2{margin:8px 0 10px;font:800 clamp(var(--type-xl,1.5rem),5vw,var(--type-2xl,2rem))/1.08 var(--font-ui,"Plus Jakarta Sans",Arial,sans-serif)}.wd-fr-card p{margin:0;color:#52646d;font-size:var(--type-md,1rem);line-height:1.55}.wd-fr-card ul{margin:16px 0 0;padding-left:20px;color:#40545e;font-size:var(--type-sm,.875rem);line-height:1.55}.wd-fr-actions{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:22px}.wd-fr-actions button{border:0;border-radius:var(--radius-md,.75rem);padding:11px 15px;font:800 var(--type-xs,.75rem)/1 var(--font-ui,"Plus Jakarta Sans",Arial,sans-serif);cursor:pointer}.wd-fr-skip{background:transparent;color:#687980}.wd-fr-next{background:var(--navy-dark,#10294b);color:#fff}.wd-fr-next:hover{background:#0b203d}@media(max-width:480px){.wd-fr-card{padding:22px 18px}.wd-fr-actions{align-items:stretch;flex-direction:column-reverse}.wd-fr-actions button{width:100%;min-height:44px}}';
    document.head.appendChild(s);
  }

  var steps=[
    {title:'Start with a municipality',body:'Choose a county, then the municipality you actually want to review. Watchdog only runs the governed scope you select; it does not silently widen the territory.',list:['County first','Municipality second','No hidden statewide bulk pull']},
    {title:'Set the review window',body:'Use sale recency and minimum annual tax-reduction filters to narrow the queue. These controls change what is surfaced, not the underlying source facts.',list:['Verified NJ sales evidence','Current assessment context','Filters do not change the Chapter 123 math']},
    {title:'Run the scan, then review the evidence',body:'The result is a professional triage queue, not an appeal outcome. Open the highest-value supported files first and verify the evidence before acting.',list:['Ranked for review','Evidence quality stays visible','No legal, appraisal, or tax outcome is promised']}
  ];
  function openTour(){
    addStyles();
    var existing=document.getElementById('wd-first-run-overlay');if(existing)existing.remove();
    var i=0,overlay=document.createElement('div');overlay.className='wd-fr-overlay';overlay.id='wd-first-run-overlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','wd-fr-title');
    function render(){var step=steps[i];overlay.innerHTML='<div class="wd-fr-card"><div class="wd-fr-step">First scan · '+(i+1)+' of '+steps.length+'</div><h2 id="wd-fr-title">'+step.title+'</h2><p>'+step.body+'</p><ul>'+step.list.map(function(x){return '<li>'+x+'</li>';}).join('')+'</ul><div class="wd-fr-actions"><button class="wd-fr-skip" type="button">Skip walkthrough</button><button class="wd-fr-next" type="button">'+(i===steps.length-1?'Start scanning':'Next')+'</button></div></div>';
      overlay.querySelector('.wd-fr-skip').onclick=function(){markSeen();overlay.remove();};
      overlay.querySelector('.wd-fr-next').onclick=function(){if(i<steps.length-1){i++;render();}else{markSeen();overlay.remove();var county=document.getElementById('sc-county');if(county)county.focus();}};
      var next=overlay.querySelector('.wd-fr-next');if(next)next.focus();
    }
    document.body.appendChild(overlay);render();
  }

  if(isPro){
    addStyles();
    var actions=document.querySelector('.pro-hero-actions');
    if(actions&&!document.getElementById('wd-first-run-launch')){
      var a=document.createElement('a');a.id='wd-first-run-launch';a.className='wd-fr-launch';a.href='/property/scan/?tour=1';a.innerHTML='<i class="fas fa-route" aria-hidden="true"></i> Run your first professional scan';actions.appendChild(a);
    }
    return;
  }

  addStyles();
  var query=new URLSearchParams(window.location.search);
  var requested=query.get('tour')==='1';
  var start=function(){
    var main=document.getElementById('sc-main'),tool=document.getElementById('sc-tool'),planGate=document.getElementById('sc-plan-gate');
    var allowed=main&&main.style.display!=='none'&&tool&&tool.style.display!=='none'&&(!planGate||planGate.style.display==='none');
    if(!allowed)return false;
    if(requested||!seen())openTour();
    return true;
  };
  if(!start()){
    var tries=0,t=setInterval(function(){tries++;if(start()||tries>40)clearInterval(t);},250);
  }
})();
