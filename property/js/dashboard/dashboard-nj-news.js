(function(){
'use strict';
if(window.__WATCHDOG_NJ_NEWS_WIRE__)return;
window.__WATCHDOG_NJ_NEWS_WIRE__=true;

var API='/api/nj-news-feed';
var state={items:[],filter:'all',loaded:false,loading:false,error:false,generatedAt:null};
var FILTERS=[
  ['all','All'],
  ['property-tax','Property Tax'],
  ['residential','Residential'],
  ['commercial','Commercial'],
  ['development','Housing / Development'],
  ['policy','NJ Policy']
];

function q(s,r){return(r||document).querySelector(s)}
function esc(v){return String(v==null?'':v).replace(/[&<>\"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]})}
function when(v){var t=new Date(v).getTime();if(!Number.isFinite(t))return'';var h=Math.floor((Date.now()-t)/36e5);if(h<1)return'just now';if(h<24)return h+'h ago';var d=Math.floor(h/24);return d<7?d+'d ago':new Date(t).toLocaleDateString('en-US',{month:'short',day:'numeric'})}
function safe(v){try{var u=new URL(String(v||''),location.origin);return /^https?:$/.test(u.protocol)?u.href:''}catch(_){return''}}

function css(){
  if(q('#wd-nj-news-css'))return;
  var s=document.createElement('style');s.id='wd-nj-news-css';s.textContent=`
#wd-nj-news-wire{margin:18px 24px 30px;padding:0;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172542}
.wdnj-shell{border:1px solid #dde5ee;border-radius:16px;background:#fff;box-shadow:0 3px 12px rgba(20,33,61,.035);overflow:hidden}
.wdnj-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding:18px 20px 14px;border-bottom:1px solid #edf1f5}
.wdnj-title{display:flex;gap:11px;align-items:flex-start;min-width:0}.wdnj-icon{width:38px;height:38px;border-radius:10px;background:#eef4ff;color:#2f6df6;display:grid;place-items:center;flex:none}
.wdnj-eyebrow{display:flex;align-items:center;gap:8px;color:#3568ca;font:800 9px/1.2 Inter,sans-serif;letter-spacing:.09em;text-transform:uppercase}.wdnj-live{width:7px;height:7px;border-radius:50%;background:#1f9d72;box-shadow:0 0 0 3px rgba(31,157,114,.11)}
.wdnj-head h2{margin:4px 0 4px;color:#172542;font:800 18px/1.15 Inter,sans-serif;letter-spacing:-.02em}.wdnj-head p{margin:0;color:#718096;font:500 11.5px/1.45 Inter,sans-serif}
.wdnj-refresh{border:1px solid #dbe2eb;border-radius:9px;background:#fff;color:#304565;min-height:36px;padding:0 11px;font:800 10.5px Inter,sans-serif;cursor:pointer;display:inline-flex;align-items:center;gap:7px;white-space:nowrap}.wdnj-refresh:hover{background:#f7f9fc}
.wdnj-filters{display:flex;gap:7px;padding:12px 20px;overflow:auto;border-bottom:1px solid #edf1f5;scrollbar-width:none}.wdnj-filters::-webkit-scrollbar{display:none}.wdnj-filter{border:1px solid #dfe6ee;border-radius:999px;background:#fff;color:#66758b;min-height:30px;padding:0 10px;font:750 10px Inter,sans-serif;cursor:pointer;white-space:nowrap}.wdnj-filter.active{background:#17305f;border-color:#17305f;color:#fff}
.wdnj-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:24px;padding:4px 20px 8px}.wdnj-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;padding:13px 0;border-top:1px solid #edf1f5;text-decoration:none;min-width:0}.wdnj-item:nth-child(-n+2){border-top:0}.wdnj-item:hover .wdnj-story{color:#2f6df6}.wdnj-story{display:block;color:#22324e;font:750 12.5px/1.42 Inter,sans-serif;transition:.15s}.wdnj-meta{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-top:5px;color:#7a8798;font:600 10px/1.25 Inter,sans-serif}.wdnj-source{color:#3d5579;font-weight:800}.wdnj-topic{padding:3px 6px;border-radius:999px;background:#f1f5fb;color:#52698a;font-size:9px;font-weight:800}.wdnj-arrow{color:#9aa7b8;padding-top:2px;font-size:10px}
.wdnj-empty{grid-column:1/-1;padding:30px 0;text-align:center;color:#78869a;font:600 11.5px/1.5 Inter,sans-serif}.wdnj-empty i{display:block;margin-bottom:8px;color:#5f7eb6;font-size:18px}
.wdnj-foot{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:10px 20px 14px;border-top:1px solid #edf1f5;color:#8591a2;font:500 9.5px/1.4 Inter,sans-serif}.wdnj-foot strong{color:#62728a}.wdnj-policy{max-width:850px}.wdnj-status{white-space:nowrap}
@media(max-width:900px){#wd-nj-news-wire{margin:14px 12px 22px}.wdnj-head{padding:16px}.wdnj-filters{padding:10px 16px}.wdnj-list{grid-template-columns:1fr;padding:3px 16px 8px}.wdnj-item:nth-child(2){border-top:1px solid #edf1f5}.wdnj-foot{padding:10px 16px 14px;align-items:flex-start;flex-direction:column}.wdnj-status{white-space:normal}}
@media(max-width:560px){.wdnj-head{gap:10px}.wdnj-head h2{font-size:16px}.wdnj-refresh span{display:none}.wdnj-refresh{width:36px;padding:0;justify-content:center}.wdnj-story{font-size:12px}}
`;document.head.appendChild(s)
}

function host(){
  var root=q('#wd4-root');if(!root||root.hidden)return null;
  var el=q('#wd-nj-news-wire');if(!el){el=document.createElement('section');el.id='wd-nj-news-wire';el.setAttribute('aria-label','New Jersey property and tax news');root.appendChild(el);el.addEventListener('click',click)}
  return el
}

function itemsFor(){return state.filter==='all'?state.items:state.items.filter(function(x){return x.topic===state.filter})}
function filterHtml(){return FILTERS.map(function(f){return'<button type="button" class="wdnj-filter '+(state.filter===f[0]?'active':'')+'" data-news-filter="'+f[0]+'">'+esc(f[1])+'</button>'}).join('')}
function listHtml(){
  if(state.loading&&!state.loaded)return'<div class="wdnj-empty"><i class="fas fa-spinner fa-spin"></i>Gathering current New Jersey property headlines…</div>';
  if(state.error&&!state.items.length)return'<div class="wdnj-empty"><i class="fas fa-signal"></i>The NJ news wire is temporarily unavailable. Watchdog will retry on the next refresh.</div>';
  var rows=itemsFor().slice(0,12);if(!rows.length)return'<div class="wdnj-empty"><i class="fas fa-newspaper"></i>No current headlines match this topic.</div>';
  return rows.map(function(x){var url=safe(x.url);if(!url)return'';return'<a class="wdnj-item" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer"><div><span class="wdnj-story">'+esc(x.title)+'</span><span class="wdnj-meta"><span class="wdnj-source">'+esc(x.source)+'</span><span>·</span><span>'+esc(when(x.publishedAt))+'</span><span class="wdnj-topic">'+esc(x.topicLabel||'Property Insights')+'</span></span></div><i class="fas fa-arrow-up-right-from-square wdnj-arrow" aria-hidden="true"></i></a>'}).join('')
}
function draw(){
  css();var el=host();if(!el)return;var healthy=state.loaded&&!state.error;
  el.innerHTML='<div class="wdnj-shell"><div class="wdnj-head"><div class="wdnj-title"><div class="wdnj-icon"><i class="fas fa-newspaper"></i></div><div><div class="wdnj-eyebrow"><span class="wdnj-live"></span>NJ INTELLIGENCE WIRE</div><h2>New Jersey Property & Tax News</h2><p>Curated property-tax, housing, real-estate, development and commercial headlines from respected New Jersey sources.</p></div></div><button type="button" class="wdnj-refresh" data-news-refresh><i class="fas fa-rotate"></i><span>Refresh</span></button></div><div class="wdnj-filters">'+filterHtml()+'</div><div class="wdnj-list">'+listHtml()+'</div><div class="wdnj-foot"><div class="wdnj-policy"><strong>Source policy:</strong> multi-source headlines only. Opinion and sponsored material are excluded when identifiable; every story opens at the original publisher.</div><div class="wdnj-status">'+(healthy?'Updated '+esc(when(state.generatedAt)):state.loading?'Updating…':'Feed status unavailable')+'</div></div></div>'
}

function click(ev){
  var f=ev.target.closest('[data-news-filter]');if(f){state.filter=f.dataset.newsFilter||'all';draw();return}
  if(ev.target.closest('[data-news-refresh]'))load(true)
}

async function load(force){
  if(state.loading)return;if(state.loaded&&!force){draw();return}state.loading=true;state.error=false;draw();
  try{var r=await fetch(API+(force?'?refresh='+Date.now():''),{headers:{accept:'application/json'}});if(!r.ok)throw new Error('feed '+r.status);var d=await r.json();state.items=Array.isArray(d&&d.items)?d.items:[];state.generatedAt=d&&d.generatedAt||new Date().toISOString();state.loaded=true;state.error=false}catch(_){state.error=true}finally{state.loading=false;draw()}
}

function boot(){css();draw();load(false);if(!window.MutationObserver)return;var root=q('#wd4-root');if(!root)return;var timer;new MutationObserver(function(){clearTimeout(timer);timer=setTimeout(function(){if(!q('#wd-nj-news-wire'))draw()},160)}).observe(root,{childList:true,subtree:false})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,1100)},{once:true});else setTimeout(boot,1100);
})();
