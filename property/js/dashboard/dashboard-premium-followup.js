/* Watchdog Dashboard premium follow-up.
   Keeps the paid workspace curated even when legacy layers repaint cards. */
(function(){
  'use strict';
  if(window.__watchdogDashboardPremiumFollowup)return;
  window.__watchdogDashboardPremiumFollowup=true;

  var HISTORY_MIGRATION='watchdog_dashboard_history_default_v2';
  var observer=null,settleTimer=null,presenceTimer=null,presenceClient=null;

  function q(s,r){return(r||document).querySelector(s);}
  function qa(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));}

  function removeSizingControls(){
    qa('.wdv2-expand,.wdv2-drag-handle,.wd5-resize-handle,.wd4-card-menu,.wd4-map-handle,[data-drag-handle]').forEach(function(el){el.remove();});
    qa('.wd4-card').forEach(function(card){
      card.classList.remove('wdv2-expanded','wdv2-dragging','wdv2-drop-target','wd4-dragging','wd4-drop');
      card.draggable=false;
      card.removeAttribute('draggable');
    });
    var arrange=q('[data-action="layout"]');if(arrange)arrange.remove();
  }

  function migrateHistoryOff(){
    var done=false;try{done=localStorage.getItem(HISTORY_MIGRATION)==='done';}catch(_){ }
    if(done)return;
    var toggle=q('[data-wdv2-toggle="taxvalue"]');
    var card=q('[data-card-id="taxvalue"]');
    if(card)card.hidden=true;
    if(!toggle)return;
    if(toggle.classList.contains('on')||toggle.getAttribute('aria-pressed')==='true'){
      try{toggle.click();}catch(_){ }
    }
    if(card)card.hidden=true;
    try{localStorage.setItem(HISTORY_MIGRATION,'done');}catch(_){ }
  }

  function placeLiveActivity(){
    var analysis=q('.wdv2-band[data-band="analysis"]');
    if(!analysis)return;
    var toggle=q('[data-premium-toggle="live-activity"]');
    var enabled=!toggle||toggle.getAttribute('aria-pressed')!=='false';
    var nodes=qa('[data-card-id="live-activity"]');
    if(!enabled){nodes.forEach(function(node){node.remove();});return;}
    if(!nodes.length)return;
    var live=nodes[nodes.length-1];
    nodes.slice(0,-1).forEach(function(node){node.remove();});
    if(live.parentElement!==analysis)analysis.insertBefore(live,analysis.firstChild);
    live.classList.add('wd-premium-history-replacement','wdv2-span-6');
  }

  function placeFreeUpgrade(){
    var card=q('[data-card-id="upgrade-pro"]');
    var dash=q('#wdv2-dash');
    var primary=q('.wdv2-band[data-band="primary"]');
    var band=q('.wdv2-upgrade-band');
    if(!card||!dash||!primary){if(band&&!card)band.remove();return;}
    if(!band){
      band=document.createElement('section');
      band.className='wdv2-band wdv2-upgrade-band';
      band.dataset.band='upgrade';
      primary.insertAdjacentElement('afterend',band);
    }else if(band.previousElementSibling!==primary){
      primary.insertAdjacentElement('afterend',band);
    }
    if(card.parentElement!==band)band.appendChild(card);
    ['wdv2-span-2','wdv2-span-3','wdv2-span-4','wdv2-span-6','wdv2-span-8'].forEach(function(c){card.classList.remove(c);});
    card.classList.add('wdv2-span-12','wdv2-upgrade-full');
  }

  function paintPresence(live){
    if(!live)return;
    var count=Number(live.active_visitors);
    if(!Number.isFinite(count))count=Number(live.active_sessions)||0;
    var windowMin=Number(live.window_minutes)||3;
    var chip=q('#wd-live-presence');
    if(chip){
      var b=q('b',chip);if(b)b.textContent=count+' active now';
      var avatars=q('.wd-live-avatars',chip);if(avatars){avatars.innerHTML='';for(var i=0;i<Math.min(count,4);i++){var dot=document.createElement('i');dot.setAttribute('aria-hidden','true');avatars.appendChild(dot);}}
      chip.title='Active visitors seen in the last '+windowMin+' minutes. No names or visitor identities are exposed.';
    }
    var card=q('[data-card-id="live-activity"]');
    if(card){var first=q('.wd-premium-stat-grid>div:first-child strong',card);if(first)first.textContent=String(count);}
  }

  function getPresenceClient(){
    if(presenceClient)return presenceClient;
    try{if(window.NJPTRSupabaseRuntime&&typeof window.NJPTRSupabaseRuntime.createClient==='function')presenceClient=window.NJPTRSupabaseRuntime.createClient();}catch(_){ }
    return presenceClient;
  }

  async function refreshPresence(){
    var client=getPresenceClient();if(!client)return;
    try{var res=await client.rpc('get_watchdog_live_presence');if(res&&res.error)return;var live=res&&res.data;live=Array.isArray(live)?live[0]:live;paintPresence(live);}catch(_){ }
  }

  function settle(){
    removeSizingControls();
    migrateHistoryOff();
    placeLiveActivity();
    placeFreeUpgrade();
  }

  function start(){
    var tries=0,ready=setInterval(function(){
      tries++;
      if(q('#wdv2-dash')&&document.body.classList.contains('wdv2-mounted')){
        clearInterval(ready);
        settle();
        setTimeout(settle,250);
        setTimeout(settle,900);
        refreshPresence();
        presenceTimer=setInterval(refreshPresence,25000);
        observer=new MutationObserver(function(){clearTimeout(settleTimer);settleTimer=setTimeout(settle,35);});
        observer.observe(q('#wd4-root')||document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden','aria-pressed']});
      }else if(tries>100)clearInterval(ready);
    },80);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
