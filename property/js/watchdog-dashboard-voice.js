(function(){
'use strict';
if(window.__watchdogDashboardVoice)return;window.__watchdogDashboardVoice=true;

function ensure(){
  var host=document.getElementById('db-panel-main');if(!host||document.getElementById('wd-dashboard-voice-entry'))return;
  var entry=document.createElement('div');entry.id='wd-dashboard-voice-entry';entry.className='wd-contextual-voice-entry';
  entry.innerHTML='<div><span>WATCHDOG VOICE</span><b>Ask about what needs attention now.</b><small>Uses the saved-property context already driving Dashboard Intelligence.</small></div><button type="button" class="wd-contextual-voice-open"><i class="fas fa-microphone"></i><span>Ask Watchdog</span></button>';
  host.insertBefore(entry,host.firstChild);
  entry.querySelector('button').addEventListener('click',open);
}
async function open(){
  if(!window.WatchdogContextualAnalyst)return;
  var context={surface:'dashboard',scope_type:'saved_properties',pams_pins:[]};
  try{
    if(window.WatchdogContextIntelligence&&typeof window.WatchdogContextIntelligence.context==='function'){
      var resolved=await window.WatchdogContextIntelligence.context();if(resolved&&typeof resolved==='object')context=Object.assign(context,resolved);
    }
  }catch(_error){}
  window.WatchdogContextualAnalyst.open({
    surface:'dashboard',
    pams_pins:Array.isArray(context.pams_pins)?context.pams_pins:[],
    context:{context_key:context.context_key||'dashboard:saved-properties',scope_type:context.scope_type||'saved_properties'},
    title:'Ask Watchdog about your dashboard',
    contextLabel:(Array.isArray(context.pams_pins)?context.pams_pins.length:0)+' saved or active properties',
    chips:[
      'What changed on my important properties today?',
      'Which saved property needs attention?',
      'Why are these the top priorities?',
      'Give me a 30-second dashboard brief.'
    ]
  });
}
function boot(){
  ensure();
  var root=document.getElementById('wd4-root');
  if(root&&'MutationObserver'in window)new MutationObserver(function(){ensure();}).observe(root,{childList:true,subtree:true});
  window.addEventListener('watchdog:context-refresh',function(){setTimeout(ensure,30);});
  setTimeout(ensure,500);setTimeout(ensure,1500);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();