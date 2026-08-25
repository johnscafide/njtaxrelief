(function(){
  'use strict';
  if(window.__WATCHDOG_ROBUST_PUBLIC_BRAND__)return;
  window.__WATCHDOG_ROBUST_PUBLIC_BRAND__=true;

  function text(node,value){if(node&&node.textContent!==value)node.textContent=value;}

  function loadScript(id,src,done){
    var existing=document.getElementById(id);
    if(existing){if(done){if(existing.dataset.loaded==='1')done();else existing.addEventListener('load',done,{once:true});}return;}
    var s=document.createElement('script');
    s.id=id;s.src=src;s.async=false;
    s.addEventListener('load',function(){s.dataset.loaded='1';if(done)done();},{once:true});
    document.head.appendChild(s);
  }

  function loadCanonicalScore(){
    function loadPublic(){
      if(window.WatchdogScorePublic)return;
      loadScript('wd-public-score-script','/property/js/watchdog-score-public.js');
    }
    if(window.WatchdogScoreCore){loadPublic();return;}
    loadScript('wd-score-core-script','/property/js/watchdog-score-core.js',loadPublic);
  }

  function isPropertyLanding(){
    var path=(location.pathname||'').replace(/\/+$/,'');
    var host=String(location.hostname||'').toLowerCase();
    var root=(host==='watchdogindex.com'||host==='www.watchdogindex.com')&&path==='';
    return path==='/property'||path==='/property/index.html'||root;
  }

  function loadLandingRecentIntelligence(){
    if(!isPropertyLanding())return;
    if(window.__WATCHDOG_LANDING_RECENT_INTELLIGENCE__)return;
    loadScript('watchdog-landing-recent-intelligence','/property/js/landing-recent-intelligence.js?v=20260825-mapless1');
  }

  function loadLookupSummaryEnhancements(){
    if(!isPropertyLanding())return;
    if(window.__WATCHDOG_LOOKUP_SUMMARY_ENHANCEMENTS__)return;
    loadScript('watchdog-lookup-summary-enhancements','/property/js/lookup-summary-enhancements.js?v=20260825-mapless1');
  }

  function syncPublicMenu(){
    var sheet=document.getElementById('wd-main-sheet');
    if(!sheet)return;
    var uniformity=sheet.querySelector('a[href="/property/fairness"],a[href="/property/fairness/"]');
    if(uniformity){
      var label=uniformity.querySelector('span');
      text(label,'U · Uniformity Index');
      uniformity.setAttribute('aria-label','Open U — Uniformity Index');
    }
    if(!sheet.querySelector('a[href="/property/robust/"]')){
      var section=uniformity&&uniformity.closest('.wd-public-section');
      if(section){
        var link=document.createElement('a');
        link.className='wd-public-link';
        link.href='/property/robust/';
        link.innerHTML='<i class="fas fa-gauge-high"></i><span>ROBUST Framework</span><i class="fas fa-chevron-right"></i>';
        section.insertBefore(link,uniformity||null);
      }
    }
  }

  function syncLandingShowcase(){
    var root=document.getElementById('wd-showcase');
    if(!root)return;
    root.querySelectorAll('.wds-platform-track span').forEach(function(node){
      if(node.textContent.trim()==='Watchdog Score')node.textContent='Watchdog Score · ROBUST';
    });
    var compareStep=root.querySelector('.wds-story-step[data-screen="2"] p');
    if(compareStep)compareStep.textContent='Compare uniformity, assessment currency and tax direction without stitching together five tabs.';
    root.querySelectorAll('.wds-demo-compare-cols em').forEach(function(node){
      if(node.textContent.trim()==='FAIRNESS')node.textContent='U · UNIFORMITY';
    });
    var scoreCard=root.querySelector('.wds-bento-score');
    if(scoreCard){
      var mini=scoreCard.querySelector('.wds-mini-label');
      var heading=scoreCard.querySelector('h3');
      var body=scoreCard.querySelector('.wds-card-copy p');
      text(mini,'Watchdog Score · ROBUST');
      text(heading,'One score. Six dimensions. See why.');
      text(body,'R · O · B · U · S · T keeps the evidence behind the number close by.');
      scoreCard.setAttribute('title','The Watchdog Score is powered by the ROBUST Framework');
    }
    var scoreLines=root.querySelector('.wds-bento-score .wds-score-lines');
    if(scoreLines&&scoreLines.children.length!==6){
      scoreLines.innerHTML='<i style="--w:76%"></i><i style="--w:88%"></i><i style="--w:64%"></i><i style="--w:81%"></i><i style="--w:69%"></i><i style="--w:74%"></i>';
    }
  }

  function ensureLookupPhotoCtaStyle(){
    if(!isPropertyLanding()||document.getElementById('wd-mapless-photo-cta-style'))return;
    var s=document.createElement('style');
    s.id='wd-mapless-photo-cta-style';
    s.textContent='#plm-photos .wd-mapless-copy{display:none!important}#plm-photos .wd-mapless-photo-note{margin-top:8px!important}#plm-photos .wd-mapless-photo-link{color:#9eece4!important;font-weight:850;text-decoration:underline;text-underline-offset:3px}#plm-photos .wd-mapless-photo-link:hover,#plm-photos .wd-mapless-photo-link:focus-visible{color:#fff!important}';
    document.head.appendChild(s);
  }

  function syncLookupPhotoCta(){
    if(!isPropertyLanding())return;
    ensureLookupPhotoCtaStyle();
    var hero=document.querySelector('#plm-photos .wd-mapless-property-hero');
    if(!hero)return;
    var copy=hero.querySelector('.wd-mapless-copy');
    if(copy)copy.remove();
    var note=hero.querySelector('.wd-mapless-photo-note');
    if(!note)return;
    var addressNode=hero.querySelector('.wd-mapless-address');
    var address=addressNode&&addressNode.textContent?addressNode.textContent.trim():'';
    var href='/home?photo=1'+(address?'&address='+encodeURIComponent(address):'');
    if(note.dataset.wdPhotoCtaHref===href)return;
    note.dataset.wdPhotoCtaHref=href;
    note.innerHTML='<i class="fas fa-camera"></i><span>Own this home? <a class="wd-mapless-photo-link" href="'+href+'">Add a homeowner photo</a></span>';
  }

  function sync(){syncPublicMenu();syncLandingShowcase();syncLookupPhotoCta();}
  var scheduled=false;
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(function(){scheduled=false;sync();});}

  ensureLookupPhotoCtaStyle();
  loadCanonicalScore();
  loadLandingRecentIntelligence();
  loadLookupSummaryEnhancements();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});else sync();
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  window.WatchdogROBUSTBrand={sync:sync,loadCanonicalScore:loadCanonicalScore,loadLandingRecentIntelligence:loadLandingRecentIntelligence,loadLookupSummaryEnhancements:loadLookupSummaryEnhancements};
})();