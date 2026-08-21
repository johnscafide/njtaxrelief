(function(){
'use strict';
if(window.__watchdogTodayVoice)return;window.__watchdogTodayVoice=true;
var observer=null;

function attrsFromItem(item){
  var source=item&&item.querySelector('[data-pin][data-model]');
  return source?{pin:String(source.dataset.pin||''),model:String(source.dataset.model||''),digest:String(source.dataset.digest||'')}:{pin:'',model:'',digest:''};
}
function visibleQueuePins(){
  var seen={};return Array.from(document.querySelectorAll('#wdi-today .wdi-today-item [data-pin]')).map(function(el){return String(el.dataset.pin||'').trim();}).filter(function(pin){if(!pin||seen[pin])return false;seen[pin]=true;return true;}).slice(0,20);
}
function openQueue(){
  if(!window.WatchdogContextualAnalyst)return;
  var pins=visibleQueuePins();
  window.WatchdogContextualAnalyst.open({
    surface:'daily_intelligence_today',
    pams_pins:pins,
    context:{context_key:'daily-intelligence:today',scope_type:'today_queue'},
    title:'Ask Watchdog about Today',
    contextLabel:pins.length+' properties in the visible governed Today queue',
    seed:'What changed on my important properties today?',
    chips:[
      'What changed on my important properties today?',
      'Which property needs attention first?',
      'Why are these items in Today?',
      'Give me a 30-second Today brief.'
    ]
  });
}
function openItem(item){
  if(!window.WatchdogContextualAnalyst)return;
  var attrs=attrsFromItem(item),address=item.querySelector('.wdi-today-copy>b')?.textContent?.trim()||attrs.pin;
  window.WatchdogContextualAnalyst.open({
    surface:'daily_intelligence_today',
    pams_pins:attrs.pin?[attrs.pin]:[],
    context:{context_key:'daily-intelligence:today',scope_type:'today_item',today_digest_id:attrs.digest||null,today_model_key:attrs.model||null},
    title:'Ask Watchdog about this Today item',
    contextLabel:address+(attrs.model?' · '+attrs.model.replace(/_/g,' '):''),
    seed:'Why is this property in my Today queue?',
    chips:[
      'Why is this property in my Today queue?',
      'What changed on this property?',
      'Show me the strongest evidence.',
      'What should I review next?'
    ]
  });
}
function install(){
  var root=document.getElementById('wdi-today');if(!root)return;
  var head=root.querySelector('.wdi-today-head');
  if(head&&!head.querySelector('[data-today-voice-queue]')){
    var button=document.createElement('button');button.type='button';button.className='wdi-today-voice-open';button.setAttribute('data-today-voice-queue','true');button.innerHTML='<i class="fas fa-microphone"></i><span>Ask Watchdog</span>';button.addEventListener('click',openQueue);
    var link=head.querySelector('a');if(link)head.insertBefore(button,link);else head.appendChild(button);
  }
  root.querySelectorAll('.wdi-today-item').forEach(function(item){
    var actions=item.querySelector('.wdi-today-actions');if(!actions||actions.querySelector('[data-today-voice-item]'))return;
    var button=document.createElement('button');button.type='button';button.className='wdi-today-voice-item';button.setAttribute('data-today-voice-item','true');button.innerHTML='<i class="fas fa-microphone"></i> Ask';button.addEventListener('click',function(){openItem(item);});
    actions.insertBefore(button,actions.firstChild);
  });
}
function boot(){
  install();
  var shell=document.getElementById('wdi-app')?.parentElement||document.body;
  if('MutationObserver'in window){observer=new MutationObserver(function(){install();});observer.observe(shell,{childList:true,subtree:true});}
  setTimeout(install,600);setTimeout(install,1600);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();