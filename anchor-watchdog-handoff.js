(function(){
  'use strict';
  if(!/(^|\.)njpropertytaxrelief\.com$/i.test(location.hostname)||!/anchor-estimator\.html\/?$/i.test(location.pathname))return;
  if(window.__wdAnchorHandoff)return;window.__wdAnchorHandoff=true;

  var URL='https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/anchor-result-handoff';
  var LOGO='/property/branding/watchdog-logo-horizontal.svg';
  // Publishable key for the uvkvaxljhhngydvlrzom project (same one anchor-estimator.html uses for verify-email).
  var FALLBACK_KEY='sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
  var MAX_PREREQ_WAITS=20;
  var prereqWaits=0;
  var MAX_ATTEMPTS=4;
  var staging=false;
  var finished=false;
  var attemptCount=0;
  var retryTimer=0;
  var latestResultParams={};

  function value(id){var el=document.getElementById(id);return String(el&&el.value||'').trim();}
  function apiKey(){return String(window.VERIFY_KEY||FALLBACK_KEY||'').trim();}
  function selectedAnswers(){
    var out={};
    Array.prototype.slice.call(document.querySelectorAll('.est-choice.selected[data-key][data-val]')).forEach(function(btn){out[btn.getAttribute('data-key')]=btn.getAttribute('data-val');});
    return out;
  }
  function resultVisible(){
    var step=document.getElementById('est-step7');
    var host=document.getElementById('est-result-content');
    if(!(step&&step.classList.contains('active')&&host))return false;
    return !!host.querySelector('.est-result-qualify,.est-no-qualify');
  }
  function track(name,params){try{if(window.AnchorFunnel&&typeof window.AnchorFunnel.track==='function')window.AnchorFunnel.track(name,params||{});else if(typeof window.gtag==='function')window.gtag('event',name,params||{});}catch(_){} }
  function overlay(){
    var old=document.getElementById('wdx-handoff-overlay');if(old)return old;
    var el=document.createElement('div');el.id='wdx-handoff-overlay';el.className='wdx-handoff-overlay';el.setAttribute('role','status');el.setAttribute('aria-live','polite');
    el.innerHTML='<div class="wdx-handoff-card"><div class="wdx-handoff-brand"><img src="'+LOGO+'" alt="Watchdog Property Intelligence"></div><div class="wdx-handoff-kicker">Secure ANCHOR result handoff</div><h2>Opening your result in Watchdog</h2><p>Your ANCHOR estimate is ready. We are securely carrying the verified result over and matching the residence to Watchdog property intelligence.</p><div class="wdx-handoff-steps" aria-hidden="true"><div class="wdx-handoff-step"><strong>01</strong>Verified estimate</div><div class="wdx-handoff-step"><strong>02</strong>Secure transfer</div><div class="wdx-handoff-step"><strong>03</strong>Property context</div></div><div class="wdx-handoff-bar"><span></span></div></div>';
    document.body.appendChild(el);return el;
  }
  function clearFailure(){var n=document.getElementById('wdx-handoff-fail');if(n&&n.parentNode)n.parentNode.removeChild(n);}
  function fail(message){
    var el=document.getElementById('wdx-handoff-overlay');if(el&&el.parentNode)el.parentNode.removeChild(el);
    var host=document.getElementById('est-result-content')||document.querySelector('#est-step7');
    if(host&&!document.getElementById('wdx-handoff-fail')){var n=document.createElement('div');n.id='wdx-handoff-fail';n.className='wdx-handoff-fail';n.textContent=message||'Watchdog could not open the secure handoff. Your ANCHOR result remains available here.';host.appendChild(n);}
    track('anchor_watchdog_handoff_failed',{reason:'handoff_unavailable',attempts:attemptCount});
  }
  function scheduleRetry(){
    if(finished||staging||attemptCount>=MAX_ATTEMPTS||retryTimer)return;
    var delay=Math.min(3000,500*Math.pow(2,Math.max(0,attemptCount-1)));
    retryTimer=setTimeout(function(){retryTimer=0;stage(latestResultParams);},delay);
  }
  function stage(params){
    if(staging||finished||attemptCount>=MAX_ATTEMPTS)return;
    if(!resultVisible())return;
    var email=value('est-email');var name=value('est-name');var address=value('est-address');var key=apiKey();
    if(!email||!address||!key){
      prereqWaits+=1;
      if(prereqWaits>=MAX_PREREQ_WAITS){finished=true;fail('Watchdog could not read the details needed to open your result. Your ANCHOR result remains available here.');return;}
      scheduleRetry();return;
    }
    staging=true;attemptCount+=1;clearFailure();overlay();
    var answers=selectedAnswers();
    var controller=typeof AbortController==='function'?new AbortController():null;
    var timeout=controller?setTimeout(function(){controller.abort();},10000):0;
    fetch(URL,{method:'POST',headers:{'Content-Type':'application/json','apikey':key},body:JSON.stringify({action:'stage',email:email,result:{name:name,address:address,answers:answers,intent_score:params&&params.intent_score}}),signal:controller?controller.signal:undefined})
      .then(function(r){return r.json().catch(function(){return {};}).then(function(body){if(!r.ok)throw new Error(body.error||'Secure handoff failed.');return body;});})
      .then(function(body){
        if(timeout)clearTimeout(timeout);
        var token=body&&body.result_token;if(!/^[a-f0-9]{64}$/i.test(String(token||'')))throw new Error('Secure handoff token was not created.');
        finished=true;staging=false;if(retryTimer){clearTimeout(retryTimer);retryTimer=0;}
        track('anchor_watchdog_handoff_ready',{tenure:answers.tenure||'unknown',qualified:params&&params.qualified===true,attempts:attemptCount});
        setTimeout(function(){location.replace('https://www.watchdogindex.com/#anchor-result='+token);},150);
      })
      .catch(function(err){
        if(timeout)clearTimeout(timeout);
        staging=false;
        if(attemptCount<MAX_ATTEMPTS){scheduleRetry();return;}
        fail(err&&err.name==='AbortError'?'Watchdog took too long to open the secure handoff. Your result remains available here.':err&&err.message?err.message:'Watchdog could not open the secure handoff. Your result remains available here.');
      });
  }
  function maybeStage(){if(!finished&&resultVisible())stage(latestResultParams);}
  function bindResultFallback(){
    var host=document.getElementById('est-result-content');
    if(host&&window.MutationObserver){
      new MutationObserver(function(){maybeStage();}).observe(host,{childList:true,subtree:true,characterData:true});
    }
    setTimeout(maybeStage,0);
    setTimeout(maybeStage,500);
    setTimeout(maybeStage,1600);
    setTimeout(maybeStage,3500);
  }

  window.AnchorWatchdogHandoff={start:function(params){latestResultParams=params||latestResultParams||{};stage(latestResultParams);}};

  window.addEventListener('anchor:funnel-event',function(event){
    var detail=event&&event.detail||{};
    if(detail.name==='anchor_result_view'){
      latestResultParams=detail.params||{};
      stage(latestResultParams);
    }
  });

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bindResultFallback,{once:true});
  else bindResultFallback();
})();
