(function(){
  'use strict';
  if(!/(^|\.)njpropertytaxrelief\.com$/i.test(location.hostname)||!/anchor-estimator\.html$/i.test(location.pathname))return;
  if(window.__wdAnchorHandoff)return;window.__wdAnchorHandoff=true;

  var URL='https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/anchor-result-handoff';
  var KEY='sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
  var staging=false;
  var finished=false;

  function value(id){var el=document.getElementById(id);return String(el&&el.value||'').trim();}
  function selectedAnswers(){
    var out={};
    Array.prototype.slice.call(document.querySelectorAll('.est-choice.selected[data-key][data-val]')).forEach(function(btn){out[btn.getAttribute('data-key')]=btn.getAttribute('data-val');});
    return out;
  }
  function track(name,params){try{if(window.AnchorFunnel&&typeof window.AnchorFunnel.track==='function')window.AnchorFunnel.track(name,params||{});else if(typeof window.gtag==='function')window.gtag('event',name,params||{});}catch(_){}}
  function overlay(){
    var old=document.getElementById('wdx-handoff-overlay');if(old)return old;
    var el=document.createElement('div');el.id='wdx-handoff-overlay';el.className='wdx-handoff-overlay';el.innerHTML='<div class="wdx-handoff-card"><div class="wdx-handoff-logo">W</div><h2>Opening your result in Watchdog</h2><p>Your ANCHOR estimate is ready. We are securely carrying the result over and matching the residence to Watchdog property intelligence.</p><div class="wdx-handoff-bar"><span></span></div></div>';document.body.appendChild(el);return el;
  }
  function fail(message){
    var el=document.getElementById('wdx-handoff-overlay');if(el&&el.parentNode)el.parentNode.removeChild(el);
    var host=document.getElementById('est-result-content')||document.querySelector('#est-step7');
    if(host&&!document.getElementById('wdx-handoff-fail')){var n=document.createElement('div');n.id='wdx-handoff-fail';n.className='wdx-handoff-fail';n.textContent=message||'Watchdog could not open the secure handoff. Your ANCHOR result remains available here.';host.appendChild(n);}
    track('anchor_watchdog_handoff_failed',{reason:'handoff_unavailable'});
  }
  function stage(params){
    if(staging||finished)return;
    var email=value('est-email');var code=value('est-code').replace(/\D/g,'');var name=value('est-name');var address=value('est-address');
    if(!email||code.length!==6||!address)return;
    staging=true;overlay();
    var answers=selectedAnswers();
    fetch(URL,{method:'POST',headers:{'Content-Type':'application/json','apikey':KEY},body:JSON.stringify({action:'stage',email:email,code:code,result:{name:name,address:address,answers:answers,intent_score:params&&params.intent_score}})})
      .then(function(r){return r.json().catch(function(){return {};}).then(function(body){if(!r.ok)throw new Error(body.error||'Secure handoff failed.');return body;});})
      .then(function(body){
        var token=body&&body.result_token;if(!/^[a-f0-9]{64}$/i.test(String(token||'')))throw new Error('Secure handoff token was not created.');
        finished=true;track('anchor_watchdog_handoff_ready',{tenure:answers.tenure||'unknown',qualified:params&&params.qualified===true});
        setTimeout(function(){location.replace('https://www.watchdogindex.com/anchor/results/#'+token);},450);
      })
      .catch(function(err){staging=false;fail(err&&err.message?err.message:'Watchdog could not open the secure handoff. Your result remains available here.');});
  }

  window.addEventListener('anchor:funnel-event',function(event){
    var detail=event&&event.detail||{};
    if(detail.name==='anchor_result_view')stage(detail.params||{});
  });
})();
