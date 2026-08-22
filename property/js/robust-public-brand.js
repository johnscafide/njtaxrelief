(function(){
  'use strict';
  if(window.__WATCHDOG_ROBUST_PUBLIC_BRAND__)return;
  window.__WATCHDOG_ROBUST_PUBLIC_BRAND__=true;

  function text(node,value){if(node&&node.textContent!==value)node.textContent=value;}

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

  function sync(){syncPublicMenu();syncLandingShowcase();}
  var scheduled=false;
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(function(){scheduled=false;sync();});}

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});else sync();
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  window.WatchdogROBUSTBrand={sync:sync};
})();
