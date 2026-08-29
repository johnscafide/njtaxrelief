/* NJW-293 — featured county intelligence for the consumer landing page.
   The focused cards reinforce existing canonical county hubs selected from the
   Search Growth cohort. They do not create new SEO destinations or duplicate
   the exhaustive county/town directory later on the page. */
(function(){
  'use strict';
  if(window.__WATCHDOG_LANDING_COUNTY_INTEL__)return;
  window.__WATCHDOG_LANDING_COUNTY_INTEL__=true;

  var CARDS=[
    {
      county:'Bergen',
      count:'70 municipalities',
      href:'/towns/bergen/',
      title:'Bergen County property tax records',
      copy:'Browse assessment and tax-rate context across Bergen County municipalities, then drill into the town or property you need.',
      image:'https://images.unsplash.com/photo-1505843795480-5cfb3c03f6ff?auto=format&fit=crop&w=1200&q=78'
    },
    {
      county:'Burlington',
      count:'40 municipalities',
      href:'/towns/burlington/',
      title:'Burlington County assessments & tax records',
      copy:'Explore municipality-level assessment signals, property-tax context and direct paths into New Jersey property lookup.',
      image:'https://images.unsplash.com/photo-1758691031749-607d43c14f63?auto=format&fit=crop&w=1200&q=78'
    },
    {
      county:'Camden',
      count:'36 municipalities',
      href:'/towns/camden/',
      title:'Camden County property records & tax assessments',
      copy:'Compare municipal tax context across Camden County and open the existing town reports behind the county view.',
      image:'https://images.unsplash.com/photo-1758523670969-dd1b1254062d?auto=format&fit=crop&w=1200&q=78'
    }
  ];

  function isLanding(){
    var path=(location.pathname||'').replace(/\/+$/,'');
    var host=String(location.hostname||'').toLowerCase();
    var root=(host==='watchdogindex.com'||host==='www.watchdogindex.com')&&path==='';
    return path==='/property'||path==='/property/index.html'||root;
  }

  function esc(value){
    return String(value==null?'':value).replace(/[&<>"']/g,function(c){
      return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function ensureStyles(){
    if(document.getElementById('wd-landing-county-intel-style'))return;
    var style=document.createElement('style');
    style.id='wd-landing-county-intel-style';
    style.textContent=[
      '.wd-county-intel{background:#fff;border-bottom:1px solid #e8ecec;padding:8px 0 64px}',
      '.wd-county-intel .wd-county-intel-wrap{width:min(1240px,calc(100% - 48px));margin:0 auto}',
      '.wd-county-intel-head{display:flex;align-items:end;justify-content:space-between;gap:28px;margin-bottom:24px}',
      '.wd-county-intel-title{max-width:850px}',
      '.wd-county-intel-kicker{display:block;margin-bottom:9px;color:#087f82;font:800 12px/1.2 "Plus Jakarta Sans",sans-serif;letter-spacing:.08em;text-transform:uppercase}',
      '.wd-county-intel h2{margin:0;color:#10294b;font:800 clamp(28px,3.6vw,43px)/1.08 "Plus Jakarta Sans",sans-serif;letter-spacing:-.045em}',
      '.wd-county-intel-intro{max-width:760px;margin:12px 0 0;color:#60717b;font-size:17px;line-height:1.55}',
      '.wd-county-intel-all{display:inline-flex;align-items:center;gap:8px;flex:0 0 auto;color:#087f82;text-decoration:none;font-size:15px;font-weight:800;white-space:nowrap}',
      '.wd-county-intel-all:hover,.wd-county-intel-all:focus-visible{text-decoration:underline;text-underline-offset:4px}',
      '.wd-county-intel-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}',
      '.wd-county-intel-card{min-width:0;overflow:hidden;border-radius:24px;background:#f5f7f7;color:#172234;text-decoration:none;transition:transform .18s ease,box-shadow .18s ease}',
      '.wd-county-intel-card:hover,.wd-county-intel-card:focus-visible{transform:translateY(-2px);box-shadow:0 18px 36px rgba(16,41,75,.10);outline:none}',
      '.wd-county-intel-image{position:relative;display:block;height:190px;overflow:hidden;background:#dfe6e6}',
      '.wd-county-intel-image img{width:100%;height:100%;display:block;object-fit:cover;transition:transform .35s ease}',
      '.wd-county-intel-card:hover .wd-county-intel-image img,.wd-county-intel-card:focus-visible .wd-county-intel-image img{transform:scale(1.025)}',
      '.wd-county-intel-image:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(8,28,51,.05),rgba(8,28,51,.48))}',
      '.wd-county-intel-badge{position:absolute;z-index:2;left:16px;bottom:16px;padding:8px 11px;border-radius:999px;background:rgba(255,255,255,.94);color:#20374b;font:800 11px/1 "Plus Jakarta Sans",sans-serif;box-shadow:0 2px 12px rgba(8,28,51,.10)}',
      '.wd-county-intel-copy{display:block;padding:20px 20px 22px}',
      '.wd-county-intel-county{display:block;margin-bottom:7px;color:#087f82;font:800 11px/1.2 "Plus Jakarta Sans",sans-serif;letter-spacing:.07em;text-transform:uppercase}',
      '.wd-county-intel-card h3{margin:0;color:#10294b;font:800 21px/1.22 "Plus Jakarta Sans",sans-serif;letter-spacing:-.025em}',
      '.wd-county-intel-card p{margin:10px 0 0;color:#61717a;font-size:15.5px;line-height:1.5}',
      '.wd-county-intel-open{display:inline-flex;align-items:center;gap:8px;margin-top:17px;color:#087f82;font-size:14.5px;font-weight:800}',
      '@media(max-width:900px){.wd-county-intel-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.wd-county-intel-card:last-child{grid-column:1/-1}.wd-county-intel-card:last-child{display:grid;grid-template-columns:minmax(230px,.8fr) minmax(0,1.2fr)}.wd-county-intel-card:last-child .wd-county-intel-image{height:100%;min-height:220px}}',
      '@media(max-width:680px){.wd-county-intel{padding:6px 0 48px}.wd-county-intel .wd-county-intel-wrap{width:min(100% - 28px,1240px)}.wd-county-intel-head{display:block;margin-bottom:20px}.wd-county-intel-intro{font-size:16px}.wd-county-intel-all{margin-top:16px}.wd-county-intel-grid{grid-template-columns:1fr;gap:14px}.wd-county-intel-card:last-child{display:block;grid-column:auto}.wd-county-intel-image,.wd-county-intel-card:last-child .wd-county-intel-image{height:170px;min-height:0}.wd-county-intel-copy{padding:18px}.wd-county-intel-card h3{font-size:20px}}'
    ].join('');
    document.head.appendChild(style);
  }

  function build(){
    var section=document.createElement('section');
    section.id='wd-county-intel';
    section.className='wd-county-intel';
    section.setAttribute('aria-labelledby','wd-county-intel-heading');
    section.setAttribute('data-search-growth','landing-county-intel');
    var cards=CARDS.map(function(card){
      return '<a class="wd-county-intel-card" href="'+esc(card.href)+'" data-county-intel="'+esc(card.county.toLowerCase())+'">'+
        '<span class="wd-county-intel-image"><img src="'+esc(card.image)+'" alt="'+esc(card.county)+' County New Jersey property-tax intelligence" loading="lazy" width="1200" height="700"><span class="wd-county-intel-badge">'+esc(card.count)+'</span></span>'+
        '<span class="wd-county-intel-copy"><span class="wd-county-intel-county">'+esc(card.county)+' County, New Jersey</span><h3>'+esc(card.title)+'</h3><p>'+esc(card.copy)+'</p><span class="wd-county-intel-open">Explore '+esc(card.county)+' County <i class="fas fa-arrow-right" aria-hidden="true"></i></span></span>'+
      '</a>';
    }).join('');
    section.innerHTML='<div class="wd-county-intel-wrap"><div class="wd-county-intel-head"><div class="wd-county-intel-title"><span class="wd-county-intel-kicker">County Watchdog intel</span><h2 id="wd-county-intel-heading">Explore New Jersey property-tax records by county</h2><p class="wd-county-intel-intro">Go beyond one address. These county hubs connect property-tax records, assessment context and municipality-level reports in one place.</p></div><a class="wd-county-intel-all" href="/towns/">Browse all NJ county reports <i class="fas fa-arrow-right" aria-hidden="true"></i></a></div><div class="wd-county-intel-grid">'+cards+'</div></div>';
    section.addEventListener('click',function(event){
      var card=event.target&&event.target.closest&&event.target.closest('[data-county-intel]');
      if(!card)return;
      try{if(typeof window.gtag==='function')window.gtag('event','county_intel_click',{county:card.getAttribute('data-county-intel'),surface:'property_landing'});}catch(_error){}
    });
    return section;
  }

  function recentSection(){
    return document.getElementById('wd-consumer-recents')||document.querySelector('.wd-consumer-recents');
  }

  function placeAfterRecents(section){
    var recents=recentSection();
    if(!recents)return false;
    if(section.previousElementSibling!==recents)recents.insertAdjacentElement('afterend',section);
    return true;
  }

  function init(){
    if(!isLanding())return;
    ensureStyles();
    var section=document.getElementById('wd-county-intel')||build();
    if(placeAfterRecents(section))return;

    var hero=document.querySelector('.pl-hero');
    if(hero&&!section.isConnected)hero.insertAdjacentElement('afterend',section);

    var attempts=0;
    var timer=setInterval(function(){
      attempts+=1;
      if(placeAfterRecents(section)||attempts>=40)clearInterval(timer);
    },100);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
