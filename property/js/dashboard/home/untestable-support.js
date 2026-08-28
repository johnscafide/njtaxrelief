/* Watchdog Property Home support-cost guardrail.
   Makes unsupported Chapter 123 results self-explanatory without changing the governed calculation. */
(function(){
  'use strict';
  if(window.__WATCHDOG_UNTESTABLE_SUPPORT__)return;
  window.__WATCHDOG_UNTESTABLE_SUPPORT__=true;

  var HELP_URL='/property/help/why-property-cannot-be-tested/';
  var COPY='Watchdog cannot run a defensible Chapter 123 test from this record yet because the test needs independent market evidence, usually a usable verified sale or comparable sales. The assessment and town ratio cannot be used to create a market value and then test that same assessment; that would be circular. This does not mean the property cannot be appealed. It means Watchdog does not have enough independent evidence to show the test here without guessing.';

  function enhance(root){
    (root||document).querySelectorAll('section.sec').forEach(function(section){
      var heading=section.querySelector('h4');
      if(!heading||heading.textContent.trim()!=='Chapter 123 analysis')return;
      var paragraph=section.querySelector('.tl-p');
      if(paragraph&&/appeal is argued against comparable sales|stays blank until there is independent evidence/i.test(paragraph.textContent))paragraph.textContent=COPY;
      if(section.querySelector('[data-wd-untestable-help]'))return;
      var help=document.createElement('a');
      help.className='tl-btn';
      help.href=HELP_URL;
      help.dataset.wdUntestableHelp='1';
      help.textContent='Why this property cannot be tested yet';
      var primary=section.querySelector('.tl-btn');
      if(primary)primary.insertAdjacentElement('afterend',help);else section.appendChild(help);
    });
  }

  function boot(){
    enhance(document);
    var target=document.getElementById('hm-body');
    if(!target)return;
    new MutationObserver(function(records){
      records.forEach(function(record){record.addedNodes.forEach(function(node){if(node.nodeType===1)enhance(node.matches&&node.matches('section.sec')?node:node);});});
    }).observe(target,{childList:true,subtree:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();