(function(){
  'use strict';

  var scheduled=false;
  function value(id){var node=document.getElementById(id);return node?String(node.value||'').trim():'';}
  function checked(group){return document.querySelectorAll('[data-acp-list="'+group+'"]:checked').length>0;}
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(function(){scheduled=false;paint();});}
  function percentFromEditor(){
    var editor=document.getElementById('ac-profile-editor');
    if(!editor)return null;
    var persona=value('acp-persona');
    if(!persona)return null;
    var professional=persona==='professional'||persona==='both';
    var geography=!!(value('acp-zip')||value('acp-markets'));
    var checks=[
      !!value('acp-contact-email'),
      !!persona,
      geography,
      checked('goals'),
      checked('property_types'),
      !!value('acp-time')
    ];
    if(professional){
      checks.push(!!value('acp-profession'));
      checks.push(checked('professional_priorities'));
    }
    return Math.round(checks.filter(Boolean).length/checks.length*100);
  }
  function paint(){
    var pct=percentFromEditor();
    if(pct===null)return;
    var completion=document.querySelector('.ac-completion');
    if(!completion)return;
    var number=completion.querySelector('b');
    var label=completion.querySelector('span');
    var bar=completion.querySelector('em');
    var text=pct+'%';
    if(number&&number.textContent!==text)number.textContent=text;
    if(label&&label.textContent!=='Watchdog profile complete')label.textContent='Watchdog profile complete';
    if(bar&&bar.style.width!==text)bar.style.width=text;
    completion.setAttribute('data-profile-completion',String(pct));
  }
  function start(){
    var app=document.getElementById('ac-app');
    if(!app){setTimeout(start,80);return;}
    app.addEventListener('input',schedule,true);
    app.addEventListener('change',schedule,true);
    app.addEventListener('click',function(event){if(event.target&&event.target.closest&&event.target.closest('#acp-save'))setTimeout(schedule,250);},true);
    new MutationObserver(schedule).observe(app,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['style']});
    schedule();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
