/* Dashboard Watchdog Score spotlight.
   Makes the portfolio Watchdog Score a primary branded action on desktop and mobile
   without changing score calculation, history, or ROBUST governance. */
(function(){
  'use strict';
  if(window.__WATCHDOG_DASHBOARD_SCORE_SPOTLIGHT__) return;
  window.__WATCHDOG_DASHBOARD_SCORE_SPOTLIGHT__ = true;

  function ensureStyles(){
    if(document.getElementById('wd-score-spotlight-style')) return;
    var style=document.createElement('style');
    style.id='wd-score-spotlight-style';
    style.textContent=[
      '.wd4-card[data-card-id="score"]{background:radial-gradient(circle at 90% 5%,rgba(79,143,255,.34),transparent 42%),linear-gradient(145deg,#0d274b 0%,#123b72 53%,#1d61cf 100%)!important;border-color:rgba(255,255,255,.12)!important;box-shadow:0 18px 42px rgba(15,50,105,.22)!important;color:#fff!important;isolation:isolate}',
      '.wd4-card[data-card-id="score"]:hover{border-color:rgba(255,255,255,.28)!important;box-shadow:0 24px 54px rgba(15,50,105,.30)!important;transform:translateY(-2px)}',
      '.wd4-card[data-card-id="score"]:before{content:"";position:absolute;right:-35px;bottom:-55px;width:170px;height:170px;border-radius:50%;background:rgba(255,255,255,.055);pointer-events:none}',
      '.wd4-card[data-card-id="score"] .wd4-card-title,.wd4-card[data-card-id="score"] .wd4-kpi-value,.wd4-card[data-card-id="score"] .wd4-score-meta b{color:#fff!important}',
      '.wd4-card[data-card-id="score"] .wd4-card-title{font-weight:850!important;letter-spacing:-.02em}',
      '.wd4-card[data-card-id="score"] .wd4-card-title:before{content:"\\f6d3";font-family:"Font Awesome 6 Free";font-weight:900;display:grid;place-items:center;width:28px;height:28px;margin-right:3px;border-radius:9px;background:rgba(255,255,255,.14);color:#fff;font-size:12px}',
      '.wd4-card[data-card-id="score"] .wd4-card-title .fa-circle-info{color:rgba(255,255,255,.68)!important}',
      '.wd4-card[data-card-id="score"] .wd4-kpi-value{font-size:clamp(40px,3.1vw,56px)!important;font-weight:850!important;letter-spacing:-.065em!important;text-shadow:0 6px 22px rgba(0,0,0,.12)}',
      '.wd4-card[data-card-id="score"] .wd4-kpi-status{color:#d8ffe9!important;background:rgba(20,184,106,.22);border:1px solid rgba(167,255,208,.22);border-radius:999px;padding:5px 9px;margin-bottom:1px!important;font-size:10px!important}',
      '.wd4-card[data-card-id="score"] .wd4-trend-pill{border:1px solid rgba(255,255,255,.18)!important;background:rgba(255,255,255,.12)!important;color:#fff!important}',
      '.wd4-card[data-card-id="score"] .wd4-trend-pill.down{background:rgba(255,105,120,.17)!important;color:#ffdce1!important}',
      '.wd4-card[data-card-id="score"] .wd4-scorebar{background:rgba(255,255,255,.18)!important}',
      '.wd4-card[data-card-id="score"] .wd4-scorebar:before,.wd4-card[data-card-id="score"] .wd4-scorebar:after{opacity:.5}',
      '.wd4-card[data-card-id="score"] .wd4-scorebar>i{background:#fff!important;box-shadow:0 0 0 3px rgba(255,255,255,.20),0 3px 10px rgba(0,0,0,.18)!important}',
      '.wd4-card[data-card-id="score"] .wd4-score-meta{color:rgba(235,243,255,.72)!important}',
      '.wd4-card[data-card-id="score"] .wd4-score-meta span{color:rgba(235,243,255,.72)!important}',
      '.wd4-card[data-card-id="score"] .wd4-card-menu{color:rgba(255,255,255,.68)!important;z-index:20}',
      '.wd4-card[data-card-id="score"] .wd4-card-menu:hover{background:rgba(255,255,255,.12)!important;color:#fff!important}',
      '.wd-score-spotlight-link{position:absolute;inset:0;z-index:9;border-radius:inherit;text-decoration:none!important;color:inherit!important;cursor:pointer}',
      '.wd-score-spotlight-cta{position:absolute;right:15px;bottom:12px;z-index:10;display:inline-flex;align-items:center;gap:6px;color:rgba(255,255,255,.84);font-size:9px;font-weight:800;letter-spacing:.015em;pointer-events:none}',
      '.wd-score-spotlight-cta i{font-size:8px;transition:transform .16s ease}',
      '.wd4-card[data-card-id="score"]:hover .wd-score-spotlight-cta i{transform:translateX(2px)}',
      '.wd4-card[data-card-id="score"]:focus-within{box-shadow:0 0 0 3px rgba(47,109,246,.22),0 24px 54px rgba(15,50,105,.30)!important}',

      /* Cascade lock: dashboard.css promotes the generic white card surface with !important
         after body.wdv2-mounted is applied. The #wd4-root + KPI-band scope intentionally
         outranks that generic rule while keeping this override isolated to Watchdog Score. */
      'body[data-sidebar-page="dashboard"].wdv2-mounted #wd4-root .wdv2-band[data-band="kpis"] .wd4-card[data-card-id="score"]{background:radial-gradient(circle at 90% 5%,rgba(79,143,255,.34),transparent 42%),linear-gradient(145deg,#0d274b 0%,#123b72 53%,#1d61cf 100%)!important;background-color:#123b72!important;border-color:rgba(255,255,255,.12)!important;box-shadow:0 18px 42px rgba(15,50,105,.22)!important;color:#fff!important;isolation:isolate!important}',
      'body[data-sidebar-page="dashboard"].wdv2-mounted #wd4-root .wdv2-band[data-band="kpis"] .wd4-card[data-card-id="score"]:hover{border-color:rgba(255,255,255,.28)!important;box-shadow:0 24px 54px rgba(15,50,105,.30)!important;transform:translateY(-2px)!important}',
      'body[data-sidebar-page="dashboard"].wdv2-mounted #wd4-root .wdv2-band[data-band="kpis"] .wd4-card[data-card-id="score"]:before{background:rgba(255,255,255,.055)!important}',
      'body[data-sidebar-page="dashboard"].wdv2-mounted #wd4-root .wdv2-band[data-band="kpis"] .wd4-card[data-card-id="score"] .wd4-card-title,body[data-sidebar-page="dashboard"].wdv2-mounted #wd4-root .wdv2-band[data-band="kpis"] .wd4-card[data-card-id="score"] .wd4-kpi-value,body[data-sidebar-page="dashboard"].wdv2-mounted #wd4-root .wdv2-band[data-band="kpis"] .wd4-card[data-card-id="score"] .wd4-score-meta b{color:#fff!important}',
      'body[data-sidebar-page="dashboard"].wdv2-mounted #wd4-root .wdv2-band[data-band="kpis"] .wd4-card[data-card-id="score"] .wd4-card-title{font-weight:850!important;letter-spacing:-.02em!important}',
      'body[data-sidebar-page="dashboard"].wdv2-mounted #wd4-root .wdv2-band[data-band="kpis"] .wd4-card[data-card-id="score"] .wd4-card-title:before{background:rgba(255,255,255,.14)!important;color:#fff!important}',
      'body[data-sidebar-page="dashboard"].wdv2-mounted #wd4-root .wdv2-band[data-band="kpis"] .wd4-card[data-card-id="score"] .wd4-card-title .fa-circle-info{color:rgba(255,255,255,.68)!important}',
      'body[data-sidebar-page="dashboard"].wdv2-mounted #wd4-root .wdv2-band[data-band="kpis"] .wd4-card[data-card-id="score"] .wd4-kpi-value{font-size:clamp(40px,3.1vw,56px)!important;font-weight:850!important;letter-spacing:-.065em!important;color:#fff!important;text-shadow:0 6px 22px rgba(0,0,0,.12)!important}',
      'body[data-sidebar-page="dashboard"].wdv2-mounted #wd4-root .wdv2-band[data-band="kpis"] .wd4-card[data-card-id="score"] .wd4-kpi-status{color:#d8ffe9!important;background:rgba(20,184,106,.22)!important;border:1px solid rgba(167,255,208,.22)!important;border-radius:999px!important;padding:5px 9px!important;margin-bottom:1px!important;font-size:10px!important}',
      'body[data-sidebar-page="dashboard"].wdv2-mounted #wd4-root .wdv2-band[data-band="kpis"] .wd4-card[data-card-id="score"] .wd4-trend-pill{border:1px solid rgba(255,255,255,.18)!important;background:rgba(255,255,255,.12)!important;color:#fff!important}',
      'body[data-sidebar-page="dashboard"].wdv2-mounted #wd4-root .wdv2-band[data-band="kpis"] .wd4-card[data-card-id="score"] .wd4-trend-pill.down{background:rgba(255,105,120,.17)!important;color:#ffdce1!important}',
      'body[data-sidebar-page="dashboard"].wdv2-mounted #wd4-root .wdv2-band[data-band="kpis"] .wd4-card[data-card-id="score"] .wd4-scorebar{background:rgba(255,255,255,.18)!important}',
      'body[data-sidebar-page="dashboard"].wdv2-mounted #wd4-root .wdv2-band[data-band="kpis"] .wd4-card[data-card-id="score"] .wd4-scorebar>i{background:#fff!important;box-shadow:0 0 0 3px rgba(255,255,255,.20),0 3px 10px rgba(0,0,0,.18)!important}',
      'body[data-sidebar-page="dashboard"].wdv2-mounted #wd4-root .wdv2-band[data-band="kpis"] .wd4-card[data-card-id="score"] .wd4-score-meta,body[data-sidebar-page="dashboard"].wdv2-mounted #wd4-root .wdv2-band[data-band="kpis"] .wd4-card[data-card-id="score"] .wd4-score-meta span{color:rgba(235,243,255,.72)!important}',
      'body[data-sidebar-page="dashboard"].wdv2-mounted #wd4-root .wdv2-band[data-band="kpis"] .wd4-card[data-card-id="score"] .wd-score-spotlight-cta{color:rgba(255,255,255,.84)!important}',
      'body[data-sidebar-page="dashboard"].wdv2-mounted #wd4-root .wdv2-band[data-band="kpis"] .wd4-card[data-card-id="score"]:focus-within{box-shadow:0 0 0 3px rgba(47,109,246,.22),0 24px 54px rgba(15,50,105,.30)!important}',

      '@media(max-width:768px){.wd4-card[data-card-id="score"]{min-height:190px!important;padding:20px!important;border-radius:22px!important}.wd4-card[data-card-id="score"] .wd4-kpi-value-row{margin-top:18px!important;gap:10px!important;align-items:center!important}.wd4-card[data-card-id="score"] .wd4-kpi-value{font-size:58px!important}.wd4-card[data-card-id="score"] .wd4-kpi-status{font-size:12px!important;padding:6px 10px}.wd-score-spotlight-cta{right:20px;bottom:16px;font-size:11px}body[data-sidebar-page="dashboard"].wdv2-mounted #wd4-root .wdv2-band[data-band="kpis"] .wd4-card[data-card-id="score"]{min-height:190px!important;padding:20px!important;border-radius:22px!important}body[data-sidebar-page="dashboard"].wdv2-mounted #wd4-root .wdv2-band[data-band="kpis"] .wd4-card[data-card-id="score"] .wd4-kpi-value-row{margin-top:18px!important;gap:10px!important;align-items:center!important}body[data-sidebar-page="dashboard"].wdv2-mounted #wd4-root .wdv2-band[data-band="kpis"] .wd4-card[data-card-id="score"] .wd4-kpi-value{font-size:58px!important}body[data-sidebar-page="dashboard"].wdv2-mounted #wd4-root .wdv2-band[data-band="kpis"] .wd4-card[data-card-id="score"] .wd4-kpi-status{font-size:12px!important;padding:6px 10px!important}body[data-sidebar-page="dashboard"].wdv2-mounted #wd4-root .wdv2-band[data-band="kpis"] .wd4-card[data-card-id="score"] .wd-score-spotlight-cta{right:20px!important;bottom:16px!important;font-size:11px!important}}',
      '@media(max-width:430px){.wd4-card[data-card-id="score"] .wd4-kpi-value-row{flex-wrap:wrap!important}.wd4-card[data-card-id="score"] .wd4-kpi-value{font-size:54px!important}.wd-score-spotlight-cta{left:20px;right:auto}body[data-sidebar-page="dashboard"].wdv2-mounted #wd4-root .wdv2-band[data-band="kpis"] .wd4-card[data-card-id="score"] .wd4-kpi-value-row{flex-wrap:wrap!important}body[data-sidebar-page="dashboard"].wdv2-mounted #wd4-root .wdv2-band[data-band="kpis"] .wd4-card[data-card-id="score"] .wd4-kpi-value{font-size:54px!important}body[data-sidebar-page="dashboard"].wdv2-mounted #wd4-root .wdv2-band[data-band="kpis"] .wd4-card[data-card-id="score"] .wd-score-spotlight-cta{left:20px!important;right:auto!important}}'
    ].join('');
    document.head.appendChild(style);
  }

  function enhance(){
    var card=document.querySelector('.wd4-card[data-card-id="score"]');
    if(!card || card.dataset.scoreSpotlight==='1') return;
    card.dataset.scoreSpotlight='1';
    card.classList.add('wd-score-spotlight');
    var link=document.createElement('a');
    link.className='wd-score-spotlight-link';
    link.href='/property/robust/';
    link.setAttribute('aria-label','Explore what makes up the Watchdog Score and the ROBUST framework');
    link.title='See what makes up the Watchdog Score';
    card.appendChild(link);
    var cta=document.createElement('span');
    cta.className='wd-score-spotlight-cta';
    cta.innerHTML='See what makes up your score <i class="fas fa-arrow-right" aria-hidden="true"></i>';
    card.appendChild(cta);
  }

  function boot(){
    ensureStyles();
    enhance();
    var root=document.getElementById('wd4-root');
    if(root) new MutationObserver(function(){ enhance(); }).observe(root,{childList:true,subtree:true});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})();
