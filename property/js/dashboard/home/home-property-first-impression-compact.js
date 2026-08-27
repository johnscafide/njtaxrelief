/* Compact layout + legacy-injection guard for Property Home first impression. */
(function(){
'use strict';
if(window.__WATCHDOG_HOME_FIRST_IMPRESSION_COMPACT__)return;
window.__WATCHDOG_HOME_FIRST_IMPRESSION_COMPACT__=true;

function installStyle(){
  if(document.getElementById('wd-home-first-impression-compact-style'))return;
  var s=document.createElement('style');
  s.id='wd-home-first-impression-compact-style';
  s.textContent=[
    'body.hm-dashboard-page .hm-hero.wdfi{padding:16px 22px 18px!important}',
    'body.hm-dashboard-page .wdfi .hm-hero-in{max-width:1240px!important;grid-template-columns:minmax(310px,.8fr) minmax(0,1.2fr)!important;gap:18px!important;align-items:stretch!important}',
    'body.hm-dashboard-page .wdfi .hm-shot{height:auto!important;min-height:420px!important;max-height:none!important;border-radius:24px!important}',
    'body.hm-dashboard-page .wdfi .hm-id{height:auto!important;min-height:420px!important;max-height:none!important;padding:20px 22px!important;border-radius:24px!important}',
    '.wdfi-head{grid-template-columns:48px minmax(0,1fr) auto!important;gap:12px!important;padding-bottom:13px!important}',
    '.wdfi-mark{width:48px!important;height:48px!important;border-radius:15px!important;font-size:18px!important}',
    '.wdfi-title span{margin-bottom:4px!important;padding:5px 8px!important;font-size:10px!important}',
    '.wdfi-title h1{font-size:26px!important}',
    '.wdfi-title p{margin-top:5px!important;font-size:12.5px!important;line-height:1.35!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}',
    '.wdfi-model{padding:7px 9px!important;font-size:9.5px!important}',
    '.wdfi-score{grid-template-columns:124px minmax(0,1fr)!important;gap:16px!important;padding:14px 0 12px!important}',
    '.wdfi-score-number>span{font-size:10.5px!important}',
    '.wdfi-score-number>div{margin-top:6px!important}',
    '.wdfi-score-number b{font-size:60px!important;line-height:.82!important}',
    '.wdfi-score-number small{padding-bottom:6px!important;font-size:11px!important}',
    '.wdfi-score-copy strong{font-size:21px!important;line-height:1.14!important}',
    '.wdfi-score-copy p{display:none!important}',
    '.wdfi-score-meta{gap:6px!important;margin-top:8px!important}',
    '.wdfi-score-meta span{padding:6px 8px!important;font-size:9.5px!important}',
    '.wdfi-facts{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important;border:0!important;border-radius:0!important;background:transparent!important}',
    '.wdfi-fact{min-height:62px!important;padding:10px 12px!important;grid-template-columns:38px minmax(0,1fr) auto 10px!important;gap:9px!important;border:1px solid #e1e8ef!important;border-radius:14px!important}',
    '.wdfi-fact-icon{width:38px!important;height:38px!important;font-size:13px!important}',
    '.wdfi-fact-copy b{font-size:12.5px!important;line-height:1.2!important}',
    '.wdfi-fact-copy small{margin-top:3px!important;font-size:10.5px!important;line-height:1.25!important}',
    '.wdfi-fact>strong{font-size:15px!important}',
    '.wdfi-trust{margin-top:9px!important;padding:9px 11px!important;gap:9px!important;border-radius:12px!important}',
    '.wdfi-trust>i{width:32px!important;height:32px!important;flex-basis:32px!important;border-radius:10px!important;font-size:12px!important}',
    '.wdfi-trust b{font-size:11.5px!important}',
    '.wdfi-trust small{margin-top:2px!important;font-size:10px!important;line-height:1.3!important}',
    '.wdfi-deeper{margin-top:9px!important;font-size:11px!important}',
    '.wdfi-photo-fallback{padding:22px!important}',
    '.wdfi-photo-fallback>div{max-width:360px!important}',
    '.wdfi-photo-mark{width:62px!important;height:62px!important;margin-bottom:13px!important;border-radius:19px!important;font-size:23px!important}',
    '.wdfi-photo-fallback h2{font-size:26px!important}',
    '.wdfi-photo-fallback p{margin-top:9px!important;font-size:12.5px!important;line-height:1.45!important}',
    '.wdfi-photo-cta{min-height:40px!important;margin-top:14px!important;padding:0 14px!important;border-radius:11px!important;font-size:11.5px!important}',
    'body.hm-dashboard-page .wdfi .wd-photo-add{min-height:32px!important;padding:0 10px!important;font-size:10.5px!important}',
    'body.hm-dashboard-page .wdfi .wd-image-source{padding:6px 9px!important;font-size:9.5px!important}',
    '@media(max-width:980px){body.hm-dashboard-page .wdfi .hm-hero-in{grid-template-columns:1fr!important;max-width:760px!important}body.hm-dashboard-page .wdfi .hm-id{height:auto!important;min-height:0!important;max-height:none!important;order:1}body.hm-dashboard-page .wdfi .hm-shot{height:280px!important;min-height:280px!important;max-height:280px!important;order:2}.wdfi-title p{white-space:normal!important}}',
    '@media(max-width:620px){body.hm-dashboard-page .hm-hero.wdfi{padding:12px!important}.wdfi-facts{grid-template-columns:1fr!important}.wdfi-title h1{font-size:23px!important}.wdfi-title p{font-size:12px!important}.wdfi-score{grid-template-columns:104px minmax(0,1fr)!important}.wdfi-score-number b{font-size:52px!important}.wdfi-score-copy strong{font-size:18px!important}.wdfi-score-meta span{font-size:9px!important}.wdfi-fact-copy b{font-size:12.5px!important}.wdfi-fact-copy small{font-size:10.5px!important}body.hm-dashboard-page .wdfi .hm-shot{height:230px!important;min-height:230px!important;max-height:230px!important}}'
  ].join('');
  (document.head||document.documentElement).appendChild(s);
}

var allowed=['wdfi-head','wdfi-score','wdfi-facts','wdfi-trust','wdfi-deeper'];
function cleanCard(){
  var card=document.querySelector('#hm-body .hm-hero.wdfi .hm-id');
  if(!card)return;
  Array.prototype.slice.call(card.children).forEach(function(child){
    var keep=allowed.some(function(name){return child.classList&&child.classList.contains(name);});
    if(!keep)child.remove();
  });
}
function run(){installStyle();cleanCard();}
function boot(){
  run();
  var host=document.getElementById('hm-body');
  if(host&&typeof MutationObserver!=='undefined')new MutationObserver(function(){requestAnimationFrame(run);}).observe(host,{childList:true,subtree:true});
  window.addEventListener('watchdog:context-refresh',run);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
