/* Property Home first impression — 2026-08-27.
 * Direct, governed property hero for /property/home.
 * Reads the selected parcel from Supabase instead of relying on private module
 * state, uses the server-owned ROBUST score endpoint, and leaves deeper
 * evidence/intelligence below the fold.
 */
(function(){
'use strict';
if(window.__WATCHDOG_HOME_FIRST_IMPRESSION__)return;
window.__WATCHDOG_HOME_FIRST_IMPRESSION__=true;

/* Stop the legacy Google Street View / old ROBUST hero enhancer from taking
   over this page. The free-first property imagery runtime remains authoritative. */
window.__WATCHDOG_HOME_HERO_INTELLIGENCE__=true;

var client=null,observer=null,timer=0,generation=0,styleInstalled=false;
var SCORE_PATH='/functions/v1/workbench-score';

function q(sel,root){return(root||document).querySelector(sel);}
function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function num(value){var n=Number(value);return Number.isFinite(n)?n:null;}
function money(value){var n=num(value);return n==null?'—':'$'+Math.round(n).toLocaleString();}
function title(value){return String(value||'').toLowerCase().replace(/\b\w/g,function(c){return c.toUpperCase();});}
function resolvePin(){try{return new URL(location.href).searchParams.get('pin')||((q('#hm-switch')||{}).value||'');}catch(_e){return((q('#hm-switch')||{}).value||'');}}
function getClient(){if(client)return client;try{if(window.NJPTRSupabaseRuntime&&typeof window.NJPTRSupabaseRuntime.createClient==='function')client=window.NJPTRSupabaseRuntime.createClient();}catch(_e){}return client;}
function selectedAddress(){var old=q('#hm-body .hm-hero .hm-id h1');if(old&&old.textContent.trim())return old.textContent.trim();var sw=q('#hm-switch');if(sw&&sw.selectedOptions&&sw.selectedOptions[0])return String(sw.selectedOptions[0].textContent||'').replace(/\s*[·•]\s*(your home|watchlist).*$/i,'').trim();return'Property';}

function installStyles(){
  if(styleInstalled||document.getElementById('wd-home-first-impression-style'))return;
  styleInstalled=true;
  var st=document.createElement('style');st.id='wd-home-first-impression-style';st.textContent=`
body.hm-dashboard-page .hm-hero.wdfi{position:relative!important;margin:0!important;padding:clamp(22px,2.4vw,38px) var(--hm-page-pad,clamp(16px,2.15vw,34px)) clamp(24px,2.5vw,40px)!important;overflow:hidden!important;background:radial-gradient(circle at 88% 0,rgba(28,207,192,.16),transparent 25rem),radial-gradient(circle at 2% 100%,rgba(47,109,246,.2),transparent 30rem),linear-gradient(135deg,#061b35 0%,#082746 52%,#0b3558 100%)!important}
body.hm-dashboard-page .hm-hero.wdfi:before{content:"";position:absolute;inset:0;pointer-events:none;opacity:.2;background-image:radial-gradient(circle,rgba(84,221,209,.65) 1px,transparent 1.4px);background-size:24px 24px;mask-image:linear-gradient(90deg,transparent 0 60%,#000 82%,transparent 100%)}
body.hm-dashboard-page .wdfi .hm-hero-in{position:relative;z-index:1;width:100%;max-width:1500px;margin:auto;display:grid;grid-template-columns:minmax(360px,.9fr) minmax(520px,1.1fr);gap:clamp(18px,2vw,32px);align-items:stretch}
body.hm-dashboard-page .wdfi .hm-shot{position:relative!important;min-height:560px!important;height:auto!important;overflow:hidden!important;border:1px solid rgba(255,255,255,.15)!important;border-radius:clamp(24px,2vw,32px)!important;background:#1262d6!important;background-size:cover!important;background-position:center!important;box-shadow:0 28px 72px rgba(0,10,28,.34)!important}
.wdfi-photo-fallback{position:absolute;inset:0;z-index:1;display:grid;place-items:center;padding:34px;text-align:center;color:#fff;background:radial-gradient(circle at 70% 15%,rgba(255,255,255,.13),transparent 16rem),linear-gradient(145deg,#0a4bbd 0%,#1269df 55%,#0a8dc5 100%)}
.wdfi-photo-fallback[hidden]{display:none!important}.wdfi-photo-fallback>div{max-width:440px}.wdfi-photo-mark{width:76px;height:76px;margin:0 auto 18px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.3);border-radius:24px;background:rgba(255,255,255,.12);font-size:29px;box-shadow:inset 0 1px rgba(255,255,255,.14)}.wdfi-photo-fallback h2{margin:0;color:#fff;font:800 clamp(25px,2.3vw,36px)/1.08 "Plus Jakarta Sans",sans-serif;letter-spacing:-.045em}.wdfi-photo-fallback p{max-width:38ch;margin:12px auto 0;color:rgba(255,255,255,.82);font:600 14px/1.55 "Source Sans 3",sans-serif}.wdfi-photo-cta{min-height:46px;margin-top:20px;padding:0 18px;border:1px solid rgba(255,255,255,.32);border-radius:14px;background:#fff;color:#0b4da9;font:800 13px/1 "Plus Jakarta Sans",sans-serif;cursor:pointer;box-shadow:0 12px 30px rgba(0,33,87,.18)}.wdfi-photo-cta i{margin-right:7px}
body.hm-dashboard-page .wdfi .hm-id{position:relative!important;min-width:0!important;padding:clamp(24px,2.25vw,36px)!important;display:flex!important;flex-direction:column!important;justify-content:flex-start!important;overflow:hidden!important;border:1px solid #dce5ef!important;border-radius:clamp(24px,2vw,32px)!important;background:rgba(255,255,255,.99)!important;box-shadow:0 28px 72px rgba(0,10,28,.28)!important}
.wdfi-head{display:grid;grid-template-columns:54px minmax(0,1fr) auto;gap:14px;align-items:center;padding-bottom:22px;border-bottom:1px solid #e3e9f0}.wdfi-mark{width:54px;height:54px;display:grid;place-items:center;border-radius:17px;background:#e8f7f5;color:#0d8e88;font-size:20px}.wdfi-title{min-width:0}.wdfi-title span{display:inline-flex;margin-bottom:6px;padding:5px 9px;border-radius:999px;background:#edf3ff;color:#2f6df6;font:850 9px/1 "Plus Jakarta Sans",sans-serif;letter-spacing:.08em;text-transform:uppercase}.wdfi-title h1{margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#0a1f3d;font:800 clamp(20px,1.65vw,28px)/1.08 "Plus Jakarta Sans",sans-serif;letter-spacing:-.045em}.wdfi-title p{margin:7px 0 0;color:#6c7c91;font:650 12px/1.35 "Source Sans 3",sans-serif}.wdfi-model{align-self:start;padding:8px 11px;border-radius:999px;background:#f1f4f8;color:#64748a;font:850 9px/1 "Plus Jakarta Sans",sans-serif;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap}
.wdfi-score{display:grid;grid-template-columns:150px minmax(0,1fr);gap:clamp(16px,1.7vw,26px);align-items:center;padding:26px 0 22px}.wdfi-score-number{min-width:0}.wdfi-score-number>span{display:block;color:#0e9b94;font:850 10px/1.2 "Plus Jakarta Sans",sans-serif;letter-spacing:.095em;text-transform:uppercase}.wdfi-score-number>div{display:flex;align-items:flex-end;margin-top:8px}.wdfi-score-number b{color:#0a2445;font:800 clamp(58px,5vw,82px)/.8 "Plus Jakarta Sans",sans-serif;letter-spacing:-.08em}.wdfi-score-number small{padding:0 0 8px 6px;color:#8996a8;font:800 11px/1 "Plus Jakarta Sans",sans-serif}.wdfi-score-copy strong{display:block;color:#10213f;font:800 clamp(20px,1.65vw,27px)/1.14 "Plus Jakarta Sans",sans-serif;letter-spacing:-.04em}.wdfi-score-copy p{max-width:40ch;margin:9px 0 0;color:#687b91;font:600 12px/1.55 "Source Sans 3",sans-serif}.wdfi-score-meta{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}.wdfi-score-meta span{padding:7px 9px;border-radius:999px;background:#f2f5f8;color:#5e7086;font:800 9px/1 "Plus Jakarta Sans",sans-serif;letter-spacing:.02em}
.wdfi-facts{overflow:hidden;border:1px solid #dfe6ee;border-radius:19px;background:#fff}.wdfi-fact{appearance:none;width:100%;min-height:72px;padding:12px 14px;display:grid;grid-template-columns:43px minmax(0,1fr) auto 14px;gap:12px;align-items:center;border:0;border-bottom:1px solid #e6ebf1;background:#fff;color:inherit;text-align:left;text-decoration:none;cursor:pointer}.wdfi-fact:last-child{border-bottom:0}.wdfi-fact:hover,.wdfi-fact:focus-visible{background:#f8fbfd}.wdfi-fact:focus-visible{outline:3px solid rgba(15,158,151,.2);outline-offset:-3px}.wdfi-fact-icon{width:43px;height:43px;display:grid;place-items:center;border-radius:50%;background:#e7f7f4;color:#0d918a;font-size:15px}.wdfi-fact:nth-child(2) .wdfi-fact-icon{background:#eaf2ff;color:#2f6df6}.wdfi-fact:nth-child(3) .wdfi-fact-icon{background:#fff2d7;color:#a86b00}.wdfi-fact:nth-child(4) .wdfi-fact-icon{background:#ecf9ef;color:#208b4f}.wdfi-fact-copy{min-width:0}.wdfi-fact-copy b{display:block;color:#14243d;font:800 13px/1.25 "Plus Jakarta Sans",sans-serif}.wdfi-fact-copy small{display:block;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#7b899b;font:600 11px/1.25 "Source Sans 3",sans-serif}.wdfi-fact>strong{color:#11243e;font:800 clamp(14px,1.12vw,18px)/1 "Plus Jakarta Sans",sans-serif;white-space:nowrap}.wdfi-fact.relief>strong{color:#0f978f}.wdfi-fact>.fa-chevron-right{color:#91a0b1;font-size:10px}
.wdfi-trust{margin-top:14px;padding:12px 14px;display:flex;gap:11px;align-items:center;border-radius:14px;background:#f2f6fa;color:#35516d}.wdfi-trust>i{width:34px;height:34px;flex:0 0 34px;display:grid;place-items:center;border-radius:11px;background:#e3f5f2;color:#0d8f89}.wdfi-trust b{display:block;color:#29455f;font:800 11px/1.2 "Plus Jakarta Sans",sans-serif}.wdfi-trust small{display:block;margin-top:3px;color:#76879a;font:600 10px/1.4 "Source Sans 3",sans-serif}.wdfi-deeper{display:inline-flex;align-items:center;gap:7px;margin-top:14px;color:#0c8580!important;font:800 11px/1.2 "Plus Jakarta Sans",sans-serif;text-decoration:none!important}.wdfi-deeper:hover{text-decoration:underline!important}
body.hm-dashboard-page .wdfi .wd-image-source{z-index:5!important}body.hm-dashboard-page .wdfi .wd-photo-add{z-index:6!important}
@media(max-width:980px){body.hm-dashboard-page .wdfi .hm-hero-in{grid-template-columns:1fr}.wdfi .hm-id{order:1}.wdfi .hm-shot{order:2;min-height:360px!important}}
@media(max-width:620px){body.hm-dashboard-page .hm-hero.wdfi{padding:14px 14px 20px!important}.wdfi-head{grid-template-columns:46px minmax(0,1fr);padding-bottom:18px}.wdfi-mark{width:46px;height:46px;border-radius:14px}.wdfi-model{display:none}.wdfi-score{grid-template-columns:108px minmax(0,1fr);gap:13px;padding:20px 0 18px}.wdfi-score-number b{font-size:58px}.wdfi-fact{min-height:66px;padding:11px 10px;grid-template-columns:38px minmax(0,1fr) auto 10px;gap:9px}.wdfi-fact-icon{width:38px;height:38px}.wdfi .hm-shot{min-height:280px!important;border-radius:22px!important}.wdfi-photo-fallback{padding:24px}.wdfi-photo-mark{width:62px;height:62px;border-radius:19px;font-size:24px}}
`;
  (document.head||document.documentElement).appendChild(st);
}

function markerHref(row,id,value,note){return'/property/marker?id='+encodeURIComponent(id)+'&pin='+encodeURIComponent(row.pams_pin||'')+'&value='+encodeURIComponent(value||'')+'&note='+encodeURIComponent(note||'');}
function fact(icon,label,note,value,href,extra){var tag=href?'a':'button',attrs=href?' href="'+esc(href)+'"':' type="button" data-wdfi-relief="1"';return'<'+tag+' class="wdfi-fact '+(extra||'')+'"'+attrs+'><span class="wdfi-fact-icon"><i class="fas '+esc(icon)+'"></i></span><span class="wdfi-fact-copy"><b>'+esc(label)+'</b><small>'+esc(note)+'</small></span><strong>'+esc(value)+'</strong><i class="fas fa-chevron-right" aria-hidden="true"></i></'+tag+'>';}

function scoreLabel(score){if(!score||score.watchdog_score==null)return'Watchdog Score is building';if(score.verdict)return String(score.verdict);var n=Number(score.watchdog_score);if(n>=80)return'Strong current tax position';if(n>=65)return'Generally favorable tax position';if(n>=50)return'Typical or mixed tax position';if(n>=35)return'Watch areas in this tax position';return'Property tax position needs review';}
function mergeRecord(lookup,saved){lookup=lookup||{};saved=saved||{};return{
  pams_pin:String(saved.pams_pin||lookup.pams_pin||resolvePin()||''),address:saved.address||lookup.address||selectedAddress(),town:saved.town||lookup.town||'',city:saved.city||lookup.city||'',county:saved.county||lookup.county||'',zip:saved.zip||lookup.zip||'',block:saved.block||lookup.block||'',lot:saved.lot||lookup.lot||'',kind:saved.kind||'home',assessed:saved.assessed!=null?saved.assessed:lookup.assessed_value,last_year_tax:saved.last_year_tax!=null?saved.last_year_tax:lookup.last_year_tax,lat:saved.lat!=null?saved.lat:lookup.lat,lon:saved.lon!=null?saved.lon:lookup.lon,qualifier:lookup.qualifier||''};}

function loadRecord(pin){var sb=getClient();if(!sb||!pin)return Promise.resolve(null);var lookup=sb.from('property_lookups').select('pams_pin,address,town,city,county,zip,block,lot,qualifier,assessed_value,last_year_tax,lat,lon').eq('pams_pin',pin).maybeSingle();var saved=sb.from('saved_properties').select('pams_pin,kind,address,town,city,county,zip,block,lot,assessed,last_year_tax,lat,lon').eq('pams_pin',pin).maybeSingle();return Promise.all([lookup,saved]).then(function(rows){return mergeRecord(rows[0]&&rows[0].data,rows[1]&&rows[1].data);}).catch(function(){return mergeRecord(null,{pams_pin:pin,address:selectedAddress(),kind:'home'});});}
function loadChanges(pin){var sb=getClient();if(!sb||!pin)return Promise.resolve(null);var since=new Date(Date.now()-365*24*60*60*1000).toISOString();return sb.from('property_update_events').select('id',{count:'exact',head:true}).eq('pams_pin',pin).gte('occurred_at',since).then(function(res){return res&&res.error?null:Number(res.count||0);}).catch(function(){return null;});}
function loadScore(row){var cfg=window.NJPTRSupabaseRuntime;if(!row||!row.pams_pin||!cfg||!cfg.url||!cfg.key)return Promise.resolve(null);var payload={pams_pin:row.pams_pin,town:row.town||row.city||'',county:row.county||'',block:row.block||'',lot:row.lot||'',qualifier:row.qualifier||'',assessed_value:num(row.assessed),last_year_tax:num(row.last_year_tax)};return fetch(cfg.url.replace(/\/+$/,'')+SCORE_PATH,{method:'POST',headers:{'Content-Type':'application/json','apikey':cfg.key,'x-client-info':'watchdog-property-home-first-impression/1.0'},body:JSON.stringify({mode:'public_score',rows:[payload]})}).then(function(response){if(!response.ok)throw new Error('score '+response.status);return response.json();}).then(function(data){var rows=data&&Array.isArray(data.rows)?data.rows:[];for(var i=0;i<rows.length;i++)if(String(rows[i]&&rows[i].pams_pin||'')===row.pams_pin)return rows[i];return null;}).catch(function(){return null;});}

function render(hero,row,score,changes){
  if(!hero||!row)return;
  installStyles();
  var scoreValue=score&&score.watchdog_score!=null?Math.round(Number(score.watchdog_score)):'—';
  var model=(score&&(score.model_version||score.modelVersion))||'ROBUST-v1';
  var coverage=score&&num(score.evidence_coverage);if(coverage!=null&&coverage<=1)coverage*=100;
  var confidence=score&&score.confidence?String(score.confidence):'';
  var locality=[row.city||row.town||'','NJ',row.zip||''].filter(Boolean).join(' ');
  var jurisdiction=[row.town?title(row.town):'',row.county?title(row.county)+' County':'',row.block?'Block '+row.block:'',row.lot?'Lot '+row.lot:''].filter(Boolean).join(' · ');
  var assessed=money(row.assessed),tax=money(row.last_year_tax),changeValue=changes==null?'Review':String(changes);
  hero.className='hm-hero wdfi';
  hero.dataset.wdfiPin=row.pams_pin;
  hero.innerHTML='<div class="hm-hero-in">'+
    '<div class="hm-shot" aria-label="Property imagery"><div class="wdfi-photo-fallback"><div><span class="wdfi-photo-mark"><i class="fas fa-house"></i></span><h2>Add a photo of your property</h2><p>No free property photo is available here yet. If you want, add your own photo and Watchdog will use it on your Property Home.</p><button class="wdfi-photo-cta" type="button"><i class="fas fa-camera"></i>Add property photo</button></div></div></div>'+
    '<div class="hm-id">'+
      '<div class="wdfi-head"><span class="wdfi-mark"><i class="fas fa-dog"></i></span><div class="wdfi-title"><span>'+(row.kind==='home'?'Your home':'Saved property')+'</span><h1>'+esc(row.address||'Property')+'</h1><p>'+esc(locality+(jurisdiction?' · '+jurisdiction:''))+'</p></div><span class="wdfi-model">'+esc(model)+'</span></div>'+
      '<section class="wdfi-score" aria-label="Watchdog Score"><div class="wdfi-score-number"><span>Watchdog Score</span><div><b>'+esc(scoreValue)+'</b><small>/100</small></div></div><div class="wdfi-score-copy"><strong>'+esc(scoreLabel(score))+'</strong><p>One simple first look at this property. The evidence, sources and detailed ROBUST dimensions stay below.</p><div class="wdfi-score-meta">'+(confidence?'<span>'+esc(confidence)+' confidence</span>':'')+(coverage!=null?'<span>'+Math.round(coverage)+'% evidence coverage</span>':'')+'<span>'+esc(model)+'</span></div></div></section>'+
      '<div class="wdfi-facts">'+
        fact('fa-file-lines','Assessment','Current assessment on record',assessed,markerHref(row,'property.assessed_value',assessed,'Current assessment on record'))+
        fact('fa-building-columns','Annual tax','Last full tax year on record',tax,markerHref(row,'property.annual_tax',tax,'Last full tax year on record'))+
        fact('fa-wave-square','Record changes','Last 12 months',changeValue,'/property/pulse?pin='+encodeURIComponent(row.pams_pin))+
        fact('fa-circle-check','NJ relief check','ANCHOR, Stay NJ and Senior Freeze','Review',null,'relief')+
      '</div>'+
      '<div class="wdfi-trust"><i class="fas fa-shield-halved"></i><span><b>Public records + governed Watchdog calculations.</b><small>Missing evidence stays missing. Nothing in this first-look card is guessed.</small></span></div>'+
      '<a class="wdfi-deeper" href="/property/robust/">See evidence &amp; methodology <i class="fas fa-arrow-right"></i></a>'+
    '</div></div>';
  wireHero(hero,row);
  refreshImagery(hero);
}

function refreshImagery(hero){
  var shot=q('.hm-shot',hero);if(!shot)return;
  function sync(){var fallback=q('.wdfi-photo-fallback',shot),bg=String(shot.style.backgroundImage||'');if(fallback)fallback.hidden=!!(bg&&bg!=='none'&&bg.indexOf('gradient')<0);}
  var mo=new MutationObserver(sync);mo.observe(shot,{attributes:true,attributeFilter:['style','data-wd-imagery-done'],childList:true});
  var tries=0,t=setInterval(function(){tries++;if(window.WatchdogPropertyImagery&&typeof window.WatchdogPropertyImagery.refresh==='function'){clearInterval(t);window.WatchdogPropertyImagery.refresh();setTimeout(sync,80);}else if(tries>40)clearInterval(t);},100);
  sync();
}
function wireHero(hero,row){
  var cta=q('.wdfi-photo-cta',hero);if(cta)cta.addEventListener('click',function(){var add=q('.wd-photo-add',hero);if(add){add.click();return;}if(window.WatchdogPropertyImagery&&typeof window.WatchdogPropertyImagery.refresh==='function'){window.WatchdogPropertyImagery.refresh();setTimeout(function(){var next=q('.wd-photo-add',hero);if(next)next.click();},180);}});
  var relief=q('[data-wdfi-relief]',hero);if(relief)relief.addEventListener('click',function(){if(typeof window.hmOpen==='function')window.hmOpen('owed');else location.hash='sec-owed';});
}

function mount(){
  clearTimeout(timer);
  var hero=q('#hm-body .hm-hero'),pin=resolvePin();
  if(!hero||!pin)return;
  if(hero.dataset.wdfiPin===pin&&hero.classList.contains('wdfi'))return;
  var token=++generation;
  loadRecord(pin).then(function(row){if(token!==generation||!row)return;return Promise.all([loadScore(row),loadChanges(pin)]).then(function(parts){if(token!==generation)return;var latest=q('#hm-body .hm-hero');if(!latest)return;render(latest,row,parts[0],parts[1]);});}).catch(function(error){console.warn('[Watchdog] Property first impression unavailable:',error&&error.message||error);});
}
function schedule(){clearTimeout(timer);timer=setTimeout(mount,65);}
function boot(){installStyles();var host=q('#hm-body');if(host&&typeof MutationObserver!=='undefined'){observer=new MutationObserver(schedule);observer.observe(host,{childList:true,subtree:false});}document.addEventListener('change',function(e){if(e.target&&e.target.id==='hm-switch'){generation++;schedule();}});window.addEventListener('watchdog:context-refresh',schedule);schedule();}

window.WatchdogHomeFirstImpression={refresh:function(){generation++;schedule();}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
