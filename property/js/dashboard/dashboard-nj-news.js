(function(){
'use strict';
if(window.__WATCHDOG_NJ_NEWS_WIRE__)return;
window.__WATCHDOG_NJ_NEWS_WIRE__=true;

var NEWS_API='/api/nj-news-feed';
var OFFICIAL_API='/api/nj-official-updates';
var BRIEF_API='/api/nj-news-brief';
var db=null;
var state={items:[],filter:'all',source:'all',loaded:false,loading:false,error:false,generatedAt:null,briefCache:{},briefingUrl:''};
var FILTERS=[
  ['all','All topics'],
  ['property-tax','Property Tax'],
  ['residential','Residential'],
  ['commercial','Commercial'],
  ['development','Housing / Development'],
  ['policy','NJ Policy']
];
var SOURCES=[['all','All sources'],['publication','Newsrooms'],['official','Official NJ']];

function q(s,r){return(r||document).querySelector(s)}
function esc(v){return String(v==null?'':v).replace(/[&<>\"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]})}
function arr(v){return Array.isArray(v)?v:[]}
function when(v){var t=new Date(v).getTime();if(!Number.isFinite(t))return'';var h=Math.floor((Date.now()-t)/36e5);if(h<1)return'just now';if(h<24)return h+'h ago';var d=Math.floor(h/24);return d<7?d+'d ago':new Date(t).toLocaleDateString('en-US',{month:'short',day:'numeric'})}
function safe(v){try{var u=new URL(String(v||''),location.origin);return /^https?:$/.test(u.protocol)?u.href:''}catch(_){return''}}
function client(){if(db)return db;try{db=window.NJPTRSupabaseRuntime&&window.NJPTRSupabaseRuntime.createClient()}catch(_){ }return db}
async function token(){var c=client(),s=c&&await c.auth.getSession();return s&&s.data&&s.data.session&&s.data.session.access_token||''}
function impactTone(v){v=String(v||'unknown').toLowerCase();return /high/.test(v)?'high':/moderate/.test(v)?'moderate':/low/.test(v)?'low':/none/.test(v)?'none':'unknown'}
function impactLabel(v){v=String(v||'unknown').toLowerCase();return v==='high'?'High potential impact':v==='moderate'?'Moderate potential impact':v==='low'?'Low potential impact':v==='none'?'No direct impact identified':'Impact not established'}

function css(){
  if(q('#wd-nj-news-css'))return;
  var s=document.createElement('style');s.id='wd-nj-news-css';s.textContent=`
#wd-nj-news-wire{margin:18px 24px 30px;padding:0;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172542}
.wdnj-shell{border:1px solid #dde5ee;border-radius:16px;background:#fff;box-shadow:0 3px 12px rgba(20,33,61,.035);overflow:hidden}
.wdnj-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding:18px 20px 14px;border-bottom:1px solid #edf1f5}
.wdnj-title{display:flex;gap:11px;align-items:flex-start;min-width:0}.wdnj-icon{width:38px;height:38px;border-radius:10px;background:#eef4ff;color:#2f6df6;display:grid;place-items:center;flex:none}
.wdnj-eyebrow{display:flex;align-items:center;gap:8px;color:#3568ca;font:800 9px/1.2 Inter,sans-serif;letter-spacing:.09em;text-transform:uppercase}.wdnj-live{width:7px;height:7px;border-radius:50%;background:#1f9d72;box-shadow:0 0 0 3px rgba(31,157,114,.11)}
.wdnj-head h2{margin:4px 0 4px;color:#172542;font:800 18px/1.15 Inter,sans-serif;letter-spacing:-.02em}.wdnj-head p{margin:0;color:#718096;font:500 11.5px/1.45 Inter,sans-serif;max-width:760px}
.wdnj-refresh{border:1px solid #dbe2eb;border-radius:9px;background:#fff;color:#304565;min-height:36px;padding:0 11px;font:800 10.5px Inter,sans-serif;cursor:pointer;display:inline-flex;align-items:center;gap:7px;white-space:nowrap}.wdnj-refresh:hover{background:#f7f9fc}
.wdnj-source-tabs{display:flex;gap:7px;padding:12px 20px 4px;overflow:auto;scrollbar-width:none}.wdnj-source-tabs::-webkit-scrollbar,.wdnj-filters::-webkit-scrollbar{display:none}.wdnj-source-filter{border:0;border-radius:8px;background:#f3f6fa;color:#5f7088;min-height:31px;padding:0 11px;font:800 10px Inter,sans-serif;cursor:pointer;white-space:nowrap}.wdnj-source-filter.active{background:#17305f;color:#fff}.wdnj-source-filter[data-source-filter="official"].active{background:#1b5d52}
.wdnj-filters{display:flex;gap:7px;padding:8px 20px 12px;overflow:auto;border-bottom:1px solid #edf1f5;scrollbar-width:none}.wdnj-filter{border:1px solid #dfe6ee;border-radius:999px;background:#fff;color:#66758b;min-height:29px;padding:0 10px;font:750 9.5px Inter,sans-serif;cursor:pointer;white-space:nowrap}.wdnj-filter.active{background:#eef4ff;border-color:#cddcf7;color:#315cae}
.wdnj-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:24px;padding:4px 20px 8px}.wdnj-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;padding:13px 0;border-top:1px solid #edf1f5;min-width:0;align-items:start}.wdnj-item:nth-child(-n+2){border-top:0}.wdnj-story{display:block;color:#22324e;font:750 12.5px/1.42 Inter,sans-serif;text-decoration:none;transition:.15s}.wdnj-story:hover{color:#2f6df6}.wdnj-meta{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-top:5px;color:#7a8798;font:600 10px/1.25 Inter,sans-serif}.wdnj-source{color:#3d5579;font-weight:800}.wdnj-topic{padding:3px 6px;border-radius:999px;background:#f1f5fb;color:#52698a;font-size:9px;font-weight:800}.wdnj-official{display:inline-flex;align-items:center;gap:4px;padding:3px 6px;border-radius:999px;background:#edf8f5;color:#146858;font-size:9px;font-weight:850}.wdnj-actions{display:flex;align-items:center;gap:6px;padding-top:1px}.wdnj-brief{border:1px solid #d5dfed;border-radius:8px;background:#f7faff;color:#315a9e;min-height:31px;padding:0 8px;font:800 9.5px Inter,sans-serif;cursor:pointer;display:inline-flex;align-items:center;gap:5px;white-space:nowrap}.wdnj-brief:hover{background:#eef4ff;border-color:#c7d7ef}.wdnj-brief[disabled]{opacity:.55;cursor:wait}.wdnj-open{width:31px;height:31px;border:1px solid #e0e6ee;border-radius:8px;background:#fff;color:#8a97a8;text-decoration:none;display:grid;place-items:center;font-size:10px}.wdnj-open:hover{color:#315cae;background:#f7f9fc}
.wdnj-empty{grid-column:1/-1;padding:30px 0;text-align:center;color:#78869a;font:600 11.5px/1.5 Inter,sans-serif}.wdnj-empty i{display:block;margin-bottom:8px;color:#5f7eb6;font-size:18px}
.wdnj-foot{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:10px 20px 14px;border-top:1px solid #edf1f5;color:#8591a2;font:500 9.5px/1.4 Inter,sans-serif}.wdnj-foot strong{color:#62728a}.wdnj-policy{max-width:850px}.wdnj-status{white-space:nowrap}
.wdnj-brief-wrap{position:fixed;inset:0;z-index:1600;pointer-events:none;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wdnj-brief-wrap.open{pointer-events:auto}.wdnj-brief-back{position:absolute;inset:0;border:0;background:rgba(8,18,35,.45);opacity:0;transition:opacity .18s ease}.wdnj-brief-wrap.open .wdnj-brief-back{opacity:1}.wdnj-drawer{position:absolute;right:0;top:0;bottom:0;width:min(680px,96vw);background:#f7f9fc;box-shadow:-24px 0 58px rgba(8,18,35,.2);transform:translateX(102%);transition:transform .22s ease;display:flex;flex-direction:column}.wdnj-brief-wrap.open .wdnj-drawer{transform:none}.wdnj-drawer-head{min-height:74px;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 18px;border-bottom:1px solid #e2e8f0;background:#fff}.wdnj-drawer-kicker{color:#3568ca;font:850 9px/1.2 Inter,sans-serif;letter-spacing:.09em;text-transform:uppercase}.wdnj-drawer-head h2{margin:4px 0 0;color:#14213d;font:800 17px/1.25 Inter,sans-serif;letter-spacing:-.02em;max-width:555px}.wdnj-close{width:38px;height:38px;border:0;border-radius:9px;background:#f2f5f9;color:#263a5d;cursor:pointer;flex:none}.wdnj-drawer-body{padding:17px;overflow:auto;flex:1}.wdnj-loading{padding:38px 20px;text-align:center;color:#6d7b8e;font:650 12px/1.5 Inter,sans-serif}.wdnj-loading i{display:block;margin-bottom:10px;color:#3568ca;font-size:20px}.wdnj-brief-section{margin-bottom:12px;padding:15px;border:1px solid #e0e6ee;border-radius:13px;background:#fff}.wdnj-brief-section h3{margin:0 0 8px;color:#1d2e4b;font:800 12.5px/1.2 Inter,sans-serif}.wdnj-brief-section p{margin:0;color:#526278;font:500 12px/1.55 Inter,sans-serif}.wdnj-take{border-color:#d2def2;background:#fbfdff}.wdnj-take h3{color:#315cae}.wdnj-impact-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px}.wdnj-impact{display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border-radius:999px;font:850 9.5px Inter,sans-serif}.wdnj-impact.high{background:#fff0f2;color:#a2394b}.wdnj-impact.moderate{background:#fff7e8;color:#8a5a12}.wdnj-impact.low{background:#eef4ff;color:#315cae}.wdnj-impact.none{background:#eef7f3;color:#116c56}.wdnj-impact.unknown{background:#f1f3f6;color:#687486}.wdnj-count{color:#738095;font:700 10px Inter,sans-serif}.wdnj-property-list{display:grid;gap:7px;margin-top:11px}.wdnj-property{padding:9px 10px;border-radius:9px;background:#f5f8fc}.wdnj-property b{display:block;color:#263957;font:750 11px/1.3 Inter,sans-serif}.wdnj-property small{display:block;margin-top:3px;color:#758296;font:500 10.5px/1.4 Inter,sans-serif}.wdnj-bullets{margin:0;padding-left:18px;color:#526278;font:500 11.5px/1.5 Inter,sans-serif}.wdnj-bullets li+li{margin-top:5px}.wdnj-original{display:inline-flex;align-items:center;gap:6px;margin-top:10px;color:#315cae;font:800 10.5px Inter,sans-serif;text-decoration:none}.wdnj-disclaimer{margin:3px 2px 10px;color:#8994a4;font:500 9.5px/1.45 Inter,sans-serif}.wdnj-error{padding:16px;border:1px solid #f0d9dd;border-radius:12px;background:#fff6f7;color:#873b48;font:600 11.5px/1.5 Inter,sans-serif}.wdnj-error a{color:#315cae;font-weight:800}
@media(max-width:900px){#wd-nj-news-wire{margin:14px 12px 22px}.wdnj-head{padding:16px}.wdnj-source-tabs{padding:10px 16px 3px}.wdnj-filters{padding:7px 16px 10px}.wdnj-list{grid-template-columns:1fr;padding:3px 16px 8px}.wdnj-item:nth-child(2){border-top:1px solid #edf1f5}.wdnj-foot{padding:10px 16px 14px;align-items:flex-start;flex-direction:column}.wdnj-status{white-space:normal}.wdnj-drawer{width:100vw}}
@media(max-width:560px){.wdnj-head{gap:10px}.wdnj-head h2{font-size:16px}.wdnj-refresh span{display:none}.wdnj-refresh{width:36px;padding:0;justify-content:center}.wdnj-story{font-size:12px}.wdnj-item{grid-template-columns:1fr}.wdnj-actions{justify-content:flex-start}.wdnj-brief{min-height:30px}.wdnj-drawer-head h2{font-size:15px}.wdnj-drawer-body{padding:12px}}
`;document.head.appendChild(s)
}

function host(){
  var root=q('#wd4-root');if(!root||root.hidden)return null;
  var el=q('#wd-nj-news-wire');if(!el){el=document.createElement('section');el.id='wd-nj-news-wire';el.setAttribute('aria-label','New Jersey property and tax intelligence wire');root.appendChild(el);el.addEventListener('click',click)}
  return el
}
function drawer(){
  var d=q('#wd-nj-brief-drawer');
  if(d)return d;
  d=document.createElement('div');d.id='wd-nj-brief-drawer';d.className='wdnj-brief-wrap';d.setAttribute('aria-hidden','true');
  d.innerHTML='<button class="wdnj-brief-back" type="button" data-brief-close aria-label="Close Watchdog Brief"></button><aside class="wdnj-drawer" role="dialog" aria-modal="true" aria-labelledby="wdnj-brief-title"><header class="wdnj-drawer-head"><div><div class="wdnj-drawer-kicker">WATCHDOG INTELLIGENCE BRIEF</div><h2 id="wdnj-brief-title">Loading source…</h2></div><button class="wdnj-close" type="button" data-brief-close aria-label="Close"><i class="fas fa-xmark"></i></button></header><div class="wdnj-drawer-body" data-brief-body></div></aside>';
  d.addEventListener('click',function(ev){if(ev.target.closest('[data-brief-close]'))closeDrawer()});document.body.appendChild(d);return d
}
function openDrawer(item){var d=drawer();q('#wdnj-brief-title',d).textContent=item.title||'Watchdog Brief';d.classList.add('open');d.setAttribute('aria-hidden','false');document.body.style.overflow='hidden'}
function closeDrawer(){var d=q('#wd-nj-brief-drawer');if(!d)return;d.classList.remove('open');d.setAttribute('aria-hidden','true');document.body.style.overflow=''}
function briefBody(html){var d=drawer(),b=q('[data-brief-body]',d);if(b)b.innerHTML=html}

function itemsFor(){return state.items.filter(function(x){return(state.source==='all'||x.sourceType===state.source)&&(state.filter==='all'||x.topic===state.filter)})}
function filterHtml(){return FILTERS.map(function(f){return'<button type="button" class="wdnj-filter '+(state.filter===f[0]?'active':'')+'" data-news-filter="'+f[0]+'">'+esc(f[1])+'</button>'}).join('')}
function sourceHtml(){return SOURCES.map(function(f){return'<button type="button" class="wdnj-source-filter '+(state.source===f[0]?'active':'')+'" data-source-filter="'+f[0]+'">'+esc(f[1])+'</button>'}).join('')}
function listHtml(){
  if(state.loading&&!state.loaded)return'<div class="wdnj-empty"><i class="fas fa-spinner fa-spin"></i>Gathering current New Jersey property intelligence…</div>';
  if(state.error&&!state.items.length)return'<div class="wdnj-empty"><i class="fas fa-signal"></i>The NJ Intelligence Wire is temporarily unavailable. Watchdog will retry on the next refresh.</div>';
  var rows=itemsFor().slice(0,14);if(!rows.length)return'<div class="wdnj-empty"><i class="fas fa-newspaper"></i>No current updates match these filters.</div>';
  return rows.map(function(x){var url=safe(x.url);if(!url)return'';var official=x.sourceType==='official'||x.official;return'<article class="wdnj-item"><div><a class="wdnj-story" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+esc(x.title)+'</a><span class="wdnj-meta"><span class="wdnj-source">'+esc(x.source)+'</span><span>·</span><span>'+esc(when(x.publishedAt))+'</span><span class="wdnj-topic">'+esc(x.topicLabel||'Property Insights')+'</span>'+(official?'<span class="wdnj-official"><i class="fas fa-landmark"></i>Official agency release</span>':'')+'</span></div><div class="wdnj-actions"><button type="button" class="wdnj-brief" data-news-brief data-url="'+esc(url)+'" '+(state.briefingUrl===url?'disabled':'')+'><i class="fas '+(state.briefingUrl===url?'fa-spinner fa-spin':'fa-dog')+'"></i>'+(state.briefingUrl===url?'Briefing…':'Watchdog Brief')+'</button><a class="wdnj-open" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer" aria-label="Open original source"><i class="fas fa-arrow-up-right-from-square"></i></a></div></article>'}).join('')
}
function draw(){
  css();var el=host();if(!el)return;var healthy=state.loaded&&!state.error;
  el.innerHTML='<div class="wdnj-shell"><div class="wdnj-head"><div class="wdnj-title"><div class="wdnj-icon"><i class="fas fa-newspaper"></i></div><div><div class="wdnj-eyebrow"><span class="wdnj-live"></span>NJ INTELLIGENCE WIRE</div><h2>New Jersey Property, Tax & Official Updates</h2><p>Curated newsroom coverage and official New Jersey agency releases. Use <strong>Watchdog Brief</strong> for a quick source summary, Watchdog Intelligence interpretation, and evidence-bounded portfolio impact.</p></div></div><button type="button" class="wdnj-refresh" data-news-refresh><i class="fas fa-rotate"></i><span>Refresh</span></button></div><div class="wdnj-source-tabs">'+sourceHtml()+'</div><div class="wdnj-filters">'+filterHtml()+'</div><div class="wdnj-list">'+listHtml()+'</div><div class="wdnj-foot"><div class="wdnj-policy"><strong>Source policy:</strong> newsroom opinion/sponsored material is excluded when identifiable. Official releases are labeled as agency statements. Watchdog interpretation is separate from source fact and does not establish legal, tax or financial outcomes.</div><div class="wdnj-status">'+(healthy?'Updated '+esc(when(state.generatedAt)):state.loading?'Updating…':'Partial source availability')+'</div></div></div>'
}

function findItem(url){return state.items.find(function(x){return safe(x.url)===url})||null}
function bullets(rows){rows=arr(rows).filter(Boolean);return rows.length?'<ul class="wdnj-bullets">'+rows.map(function(x){return'<li>'+esc(x)+'</li>'}).join('')+'</ul>':'<p>Nothing additional was identified from the available evidence.</p>'}
function briefHtml(item,data){
  var b=data&&data.brief||{},impact=b.portfolio_impact||{},props=arr(impact.properties),url=safe(item.url),count=Number(impact.potentially_affected_count||0),total=Number(data&&data.portfolioCount||0);
  return'<section class="wdnj-brief-section"><h3>Quick Summary</h3><p>'+esc(b.summary||'Watchdog could not produce a reliable summary from the available source text.')+'</p></section><section class="wdnj-brief-section wdnj-take"><h3>Watchdog Take</h3><p>'+esc(b.watchdog_take||'No separate Watchdog interpretation was produced.')+'</p></section><section class="wdnj-brief-section"><div class="wdnj-impact-top"><h3 style="margin:0">Portfolio Impact</h3><span class="wdnj-impact '+impactTone(impact.level)+'">'+esc(impactLabel(impact.level))+'</span></div><p>'+esc(impact.explanation||'Watchdog could not establish a direct portfolio impact from the available source and saved-property context.')+'</p><div class="wdnj-count" style="margin-top:8px">Potentially affected for review: '+esc(count)+' of '+esc(total)+' saved propert'+(total===1?'y':'ies')+'</div>'+(props.length?'<div class="wdnj-property-list">'+props.map(function(p){return'<div class="wdnj-property"><b>'+esc(p.address||p.pams_pin||'Saved property')+'</b><small>'+esc(p.reason||'Potential relevance identified for review.')+' · '+esc(String(p.confidence||'low')+' confidence')+'</small></div>'}).join('')+'</div>':'')+'</section><section class="wdnj-brief-section"><h3>What to Watch</h3>'+bullets(b.what_to_watch)+'</section><section class="wdnj-brief-section"><h3>Limitations</h3>'+bullets(b.limitations)+'</section>'+(url?'<a class="wdnj-original" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer"><i class="fas fa-arrow-up-right-from-square"></i>Read the original at '+esc(item.source)+'</a>':'')+'<div class="wdnj-disclaimer">'+esc(data&&data.disclaimer||'Watchdog Intelligence summarizes and interprets source material and portfolio context. Verify important decisions against original sources and qualified professional advice.')+'</div>'
}
async function runBrief(item){
  var url=safe(item&&item.url);if(!url)return;
  openDrawer(item);
  if(state.briefCache[url]){briefBody(briefHtml(item,state.briefCache[url]));return}
  state.briefingUrl=url;draw();briefBody('<div class="wdnj-loading"><i class="fas fa-spinner fa-spin"></i>Watchdog is reading the source and checking it against your saved-property portfolio…</div>');
  try{
    var t=await token();if(!t)throw Object.assign(new Error('Sign in is required to generate a Watchdog portfolio brief.'),{status:401});
    var r=await fetch(BRIEF_API,{method:'POST',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},body:JSON.stringify({url:url,title:item.title,source:item.source,sourceType:item.sourceType||'publication'})});var d=await r.json().catch(function(){return{}});if(!r.ok)throw Object.assign(new Error(d&&d.error||'Watchdog Brief failed.'),{status:r.status});state.briefCache[url]=d;briefBody(briefHtml(item,d))
  }catch(er){var sourceUrl=safe(item.url);briefBody('<div class="wdnj-error"><strong>Watchdog could not generate this brief.</strong><br>'+esc(er&&er.message||'The briefing service is temporarily unavailable.')+(sourceUrl?'<br><br><a href="'+esc(sourceUrl)+'" target="_blank" rel="noopener noreferrer">Open the original source</a>':'')+'</div>')}
  finally{state.briefingUrl='';draw()}
}

function click(ev){
  var sf=ev.target.closest('[data-source-filter]');if(sf){state.source=sf.dataset.sourceFilter||'all';draw();return}
  var f=ev.target.closest('[data-news-filter]');if(f){state.filter=f.dataset.newsFilter||'all';draw();return}
  var brief=ev.target.closest('[data-news-brief]');if(brief){var item=findItem(safe(brief.dataset.url));if(item)runBrief(item);return}
  if(ev.target.closest('[data-news-refresh]'))load(true)
}

async function getFeed(api,type,force){var r=await fetch(api+(force?'?refresh='+Date.now():''),{headers:{accept:'application/json'}});if(!r.ok)throw new Error(type+' feed '+r.status);var d=await r.json();return{items:arr(d&&d.items).map(function(x){return Object.assign({sourceType:type,official:type==='official'},x)}),generatedAt:d&&d.generatedAt||null}}
async function load(force){
  if(state.loading)return;if(state.loaded&&!force){draw();return}state.loading=true;state.error=false;draw();
  try{var results=await Promise.allSettled([getFeed(NEWS_API,'publication',force),getFeed(OFFICIAL_API,'official',force)]),items=[],times=[];results.forEach(function(r){if(r.status==='fulfilled'){items=items.concat(r.value.items);if(r.value.generatedAt)times.push(new Date(r.value.generatedAt).getTime())}});if(!items.length)throw new Error('all feeds unavailable');state.items=items.sort(function(a,b){var ta=new Date(a.publishedAt||0).getTime(),tb=new Date(b.publishedAt||0).getTime();return(tb-ta)||(Number(b.relevance||0)-Number(a.relevance||0))});state.generatedAt=times.length?new Date(Math.max.apply(Math,times)).toISOString():new Date().toISOString();state.loaded=true;state.error=results.every(function(r){return r.status==='rejected'})}catch(_){state.error=true}finally{state.loading=false;draw()}
}

function boot(){css();drawer();draw();load(false);document.addEventListener('keydown',function(ev){if(ev.key==='Escape')closeDrawer()});if(!window.MutationObserver)return;var root=q('#wd4-root');if(!root)return;var timer;new MutationObserver(function(){clearTimeout(timer);timer=setTimeout(function(){if(!q('#wd-nj-news-wire'))draw()},160)}).observe(root,{childList:true,subtree:false})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,1100)},{once:true});else setTimeout(boot,1100);
})();
