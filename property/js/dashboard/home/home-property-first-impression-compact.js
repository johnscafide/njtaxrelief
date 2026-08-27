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
    'body.hm-dashboard-page .wdfi .hm-hero-in{max-width:1180px!important;grid-template-columns:minmax(300px,.82fr) minmax(0,1.18fr)!important;gap:18px!important;align-items:stretch!important}',
    'body.hm-dashboard-page .wdfi .hm-shot{height:360px!important;min-height:360px!important;max-height:360px!important;border-radius:24px!important}',
    'body.hm-dashboard-page .wdfi .hm-id{height:360px!important;min-height:360px!important;max-height:360px!important;padding:18px 20px!important;border-radius:24px!important}',
    '.wdfi-head{grid-template-columns:44px minmax(0,1fr) auto!important;gap:11px!important;padding-bottom:11px!important}',
    '.wdfi-mark{width:44px!important;height:44px!important;border-radius:14px!important;font-size:17px!important}',
    '.wdfi-title span{margin-bottom:3px!important;padding:4px 7px!important;font-size:8px!important}',
    '.wdfi-title h1{font-size:22px!important}',
    '.wdfi-title p{margin-top:4px!important;font-size:10px!important;line-height:1.25!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}',
    '.wdfi-model{padding:6px 8px!important;font-size:8px!important}',
    '.wdfi-score{grid-template-columns:112px minmax(0,1fr)!important;gap:14px!important;padding:12px 0 10px!important}',
    '.wdfi-score-number>span{font-size:8px!important}',
    '.wdfi-score-number>div{margin-top:5px!important}',
    '.wdfi-score-number b{font-size:54px!important;line-height:.82!important}',
    '.wdfi-score-number small{padding-bottom:5px!important;font-size:9px!important}',
    '.wdfi-score-copy strong{font-size:18px!important;line-height:1.12!important}',
    '.wdfi-score-copy p{margin-top:5px!important;font-size:10px!important;line-height:1.35!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}',
    '.wdfi-score-meta{gap:5px!important;margin-top:7px!important}',
    '.wdfi-score-meta span{padding:5px 7px!important;font-size:7.5px!important}',
    '.wdfi-facts{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:7px!important;border:0!important;border-radius:0!important;background:transparent!important}',
    '.wdfi-fact{min-height:54px!important;padding:8px 10px!important;grid-template-columns:34px minmax(0,1fr) auto 9px!important;gap:8px!important;border:1px solid #e1e8ef!important;border-radius:13px!important}',
    '.wdfi-fact-icon{width:34px!important;height:34px!important;font-size:12px!important}',
    '.wdfi-fact-copy b{font-size:10.5px!important}',
    '.wdfi-fact-copy small{margin-top:2px!important;font-size:8.5px!important}',
    '.wdfi-fact>strong{font-size:12.5px!important}',
    '.wdfi-trust{margin-top:8px!important;padding:7px 10px!important;gap:8px!important;border-radius:11px!important}',
    '.wdfi-trust>i{width:28px!important;height:28px!important;flex-basis:28px!important;border-radius:9px!important;font-size:11px!important}',
    '.wdfi-trust b{font-size:9px!important}',
    '.wdfi-trust small{margin-top:1px!important;font-size:8px!important;line-height:1.25!important}',
    '.wdfi-deeper{margin-top:7px!important;font-size:9px!important}',
    '.wdfi-photo-fallback{padding:22px!important}',
    '.wdfi-photo-fallback>div{max-width:330px!important}',
    '.wdfi-photo-mark{width:58px!important;height:58px!important;margin-bottom:12px!important;border-radius:18px!important;font-size:22px!important}',
    '.wdfi-photo-fallback h2{font-size:24px!important}',
    '.wdfi-photo-fallback p{margin-top:8px!important;font-size:11px!important;line-height:1.4!important}',
    '.wdfi-photo-cta{min-height:38px!important;margin-top:13px!important;padding:0 13px!important;border-radius:11px!important;font-size:10px!important}',
    'body.hm-dashboard-page .wdfi .wd-photo-add{min-height:30px!important;padding:0 9px!important;font-size:9px!important}',
    'body.hm-dashboard-page .wdfi .wd-image-source{padding:5px 8px!important;font-size:8px!important}',
    '@media(max-width:980px){body.hm-dashboard-page .wdfi .hm-hero-in{grid-template-columns:1fr!important;max-width:760px!important}body.hm-dashboard-page .wdfi .hm-id{height:auto!important;min-height:0!important;max-height:none!important;order:1}body.hm-dashboard-page .wdfi .hm-shot{height:260px!important;min-height:260px!important;max-height:260px!important;order:2}.wdfi-score-copy p{white-space:normal!important}.wdfi-title p{white-space:normal!important}}',
    '@media(max-width:620px){body.hm-dashboard-page .hm-hero.wdfi{padding:12px!important}.wdfi-facts{grid-template-columns:1fr!important}.wdfi-score{grid-template-columns:96px minmax(0,1fr)!important}.wdfi-score-number b{font-size:48px!important}body.hm-dashboard-page .wdfi .hm-shot{height:220px!important;min-height:220px!important;max-height:220px!important}}'
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
