/* Removes job-aware analysis whenever the Intent Context returns to an unanswered question. */
(function(){
'use strict';
if(window.__WATCHDOG_INTENT_CLEAR_BRIDGE__)return;
window.__WATCHDOG_INTENT_CLEAR_BRIDGE__=true;
var wasQuestion=false;
function sync(){var q=!!document.querySelector('.ai.wdai .wd-intent-context.is-question');if(q&&!wasQuestion)window.dispatchEvent(new CustomEvent('watchdog:intent-cleared'));wasQuestion=q;}
var mo=new MutationObserver(sync);function start(){sync();mo.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
