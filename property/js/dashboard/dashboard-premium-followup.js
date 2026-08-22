/* Watchdog Dashboard premium follow-up.
   Keeps the paid workspace curated even when legacy layers repaint cards. */
(function(){
  'use strict';
  if(window.__watchdogDashboardPremiumFollowup)return;
  window.__watchdogDashboardPremiumFollowup=true;

  var SURFACE_DEFAULT_MIGRATION='watchdog_dashboard_surface_defaults_v3';
  var CRM_PREF_KEY='watchdog_dashboard_crm_card_v1';
  var observer=null,settleTimer=null,presenceTimer=null,presenceClient=null;
  var crm={loaded:false,connected:false,count:0,provider:'',lastSuccess:null,visible:true,userId:null};

  function q(s,r){return(r||document).querySelector(s);}
  function qa(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));}
  function esc(v){return String(v==null?'':v).replace(/[&<>\"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c];});}
  function providerLabel(v){v=String(v||'').toLowerCase();if(v==='boldtrail'||v==='kvcore')return'BoldTrail';return v?v.replace(/(^|[_-])([a-z])/g,function(_,a,b){return(a?' ':'')+b.toUpperCase();}):'CRM';}
  function relativeTime(value){if(!value)return'Not synced yet';var t=new Date(value).getTime();if(!Number.isFinite(t))return'Last sync recorded';var mins=Math.max(0,Math.round((Date.now()-t)/60000));if(mins<2)return'Synced just now';if(mins<60)return'Synced '+mins+'m ago';var hours=Math.round(mins/60);if(hours<24)return'Synced '+hours+'h ago';var days=Math.round(hours/24);return'Synced '+days+'d ago';}

  function removeSizingControls(){
    qa('.wdv2-expand,.wdv2-drag-handle,.wd5-resize-handle,.wd4-card-menu,.wd4-map-handle,[data-drag-handle]').forEach(function(el){el.remove();});
    qa('.wd4-card').forEach(function(card){
      card.classList.remove('wdv2-expanded','wdv2-dragging','wdv2-drop-target','wd4-dragging','wd4-drop');
      card.draggable=false;
      card.removeAttribute('draggable');
    });
    var arrange=q('[data-action="layout"]');if(arrange)arrange.remove();
  }

  function migrateDefaultCardsOff(){
    var done=false;try{done=localStorage.getItem(SURFACE_DEFAULT_MIGRATION)==='done';}catch(_){ }
    if(done)return;
    var snapshotToggle=q('[data-wdv2-toggle="taxvalue"]');
    var liveToggle=q('[data-premium-toggle="live-activity"]');
    if(!snapshotToggle||!liveToggle)return;
    var snapshotOn=snapshotToggle.classList.contains('on')||snapshotToggle.getAttribute('aria-pressed')==='true';
    var liveOn=liveToggle.classList.contains('on')||liveToggle.getAttribute('aria-pressed')==='true';
    if(snapshotOn){try{snapshotToggle.click();}catch(_){ }}
    if(liveOn){try{liveToggle.click();}catch(_){ }}
    qa('[data-card-id="taxvalue"],[data-card-id="live-activity"]').forEach(function(card){card.remove();});
    try{localStorage.setItem(SURFACE_DEFAULT_MIGRATION,'done');}catch(_){ }
  }

  function normalizeOptionalLiveActivity(){
    var toggle=q('[data-premium-toggle="live-activity"]');
    var enabled=toggle&&toggle.getAttribute('aria-pressed')==='true';
    var nodes=qa('[data-card-id="live-activity"]');
    if(!enabled){nodes.forEach(function(node){node.remove();});return;}
    if(!nodes.length)return;
    var band=q('.wdv2-band[data-band="premium"]');
    if(!band)return;
    var live=nodes[nodes.length-1];
    nodes.slice(0,-1).forEach(function(node){node.remove();});
    if(live.parentElement!==band)band.appendChild(live);
    live.classList.remove('wd-premium-history-replacement','wdv2-span-6','wdv2-span-8','wdv2-span-12');
    live.classList.add('wdv2-card-s','wdv2-span-3');
    live.hidden=false;band.hidden=false;
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
    card.style.gridColumn='1 / -1';card.style.width='100%';card.style.maxWidth='none';card.style.justifySelf='stretch';
    var link=q('.wdv2-up-link',card);if(link){link.style.width='100%';link.style.maxWidth='none';}
  }

  function safeAvatarUrls(live){var raw=live&&live.avatar_urls,urls=Array.isArray(raw)?raw:[];return urls.filter(function(v){try{var u=new URL(String(v));return u.protocol==='https:';}catch(_){return false;}}).slice(0,5);}
  function paintPresence(live){
    if(!live)return;
    var count=Number(live.active_visitors);
    if(!Number.isFinite(count))count=Number(live.active_sessions)||0;
    var windowMin=Number(live.window_minutes)||3,urls=safeAvatarUrls(live);
    var chip=q('#wd-live-presence');
    if(chip){
      var b=q('b',chip);if(b&&b.textContent!==count+' active now')b.textContent=count+' active now';
      var avatars=q('.wd-live-avatars',chip);if(avatars){
        var markup=urls.map(function(url){return'<img src="'+esc(url)+'" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" aria-hidden="true">';}).join('');
        if(avatars.innerHTML!==markup)avatars.innerHTML=markup;
      }
      chip.title='Active visitors seen in the last '+windowMin+' minutes. Up to five signed-in account photos are shown; names and account identifiers are not exposed here.';
    }
    var card=q('[data-card-id="live-activity"]');
    if(card){var first=q('.wd-premium-stat-grid>div:first-child strong',card);if(first&&first.textContent!==String(count))first.textContent=String(count);}
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

  async function loadCrmSummary(){
    if(crm.loaded)return;
    var db=getPresenceClient();if(!db)return;
    try{
      var sessionRes=await db.auth.getSession(),user=sessionRes&&sessionRes.data&&sessionRes.data.session&&sessionRes.data.session.user;
      if(!user){crm.loaded=true;return;}crm.userId=user.id;
      var results=await Promise.allSettled([
        db.rpc('get_my_crm_dashboard_summary'),
        db.from('dashboard_layout_preferences').select('layout').eq('user_id',user.id).maybeSingle()
      ]);
      var summary=results[0].status==='fulfilled'&&!results[0].value.error?results[0].value.data:null;
      summary=Array.isArray(summary)?summary[0]:summary;
      crm.connected=!!(summary&&summary.connected);
      crm.count=summary?Number(summary.contact_count)||0:0;
      crm.provider=summary&&summary.provider||'';
      crm.lastSuccess=summary&&summary.last_success_at||null;
      var layout=results[1].status==='fulfilled'&&results[1].value.data&&results[1].value.data.layout||{};
      var remote=layout&&layout[CRM_PREF_KEY];
      var local=null;try{local=localStorage.getItem(CRM_PREF_KEY);}catch(_){ }
      if(local==='hidden')crm.visible=false;else if(local==='visible')crm.visible=true;else if(remote&&typeof remote.hidden==='boolean')crm.visible=!remote.hidden;
    }catch(_){ }
    crm.loaded=true;settle();
  }

  function persistCrmPreference(){
    try{localStorage.setItem(CRM_PREF_KEY,crm.visible?'visible':'hidden');}catch(_){ }
    var db=getPresenceClient();if(!db||!crm.userId)return;
    db.from('dashboard_layout_preferences').select('layout').eq('user_id',crm.userId).maybeSingle().then(function(res){
      var layout=res&&res.data&&res.data.layout&&typeof res.data.layout==='object'?res.data.layout:{};
      layout[CRM_PREF_KEY]={hidden:!crm.visible,updated_at:new Date().toISOString()};
      return db.from('dashboard_layout_preferences').upsert({user_id:crm.userId,layout:layout,updated_at:new Date().toISOString()},{onConflict:'user_id'});
    }).catch(function(){});
  }

  function crmCardMarkup(){return'<a class="wd-crm-count-link" href="/property/integrations" aria-label="Open CRM integrations"><span class="wd-premium-card-head"><span>CRM contacts</span><em>'+esc(providerLabel(crm.provider))+'</em></span><span class="wd-crm-count-main"><strong>'+crm.count.toLocaleString('en-US')+'</strong><span>synced contacts</span></span><small>'+esc(relativeTime(crm.lastSuccess))+'</small></a>';}
  function renderCrmCard(){
    var card=q('[data-card-id="crm-count"]');
    if(!crm.loaded||!crm.connected||!crm.visible){if(card)card.remove();return;}
    var dash=q('#wdv2-dash'),band=q('.wdv2-band[data-band="premium"]');
    if(!dash)return;
    if(!band){band=document.createElement('section');band.className='wdv2-band wd-premium-band';band.dataset.band='premium';var portfolio=q('[data-band="portfolio"]',dash);dash.insertBefore(band,portfolio||q('[data-band="secondary"]',dash)||null);}
    if(!card){card=document.createElement('section');card.className='wd4-card wd-premium-analytics-card wdv2-card-s wdv2-span-3 wd-crm-count-card';card.dataset.cardId='crm-count';band.appendChild(card);}
    else if(card.parentElement!==band)band.appendChild(card);
    var markup=crmCardMarkup();if(card.innerHTML!==markup)card.innerHTML=markup;
    if(card.hidden)card.hidden=false;if(band.hidden)band.hidden=false;
  }

  function renderCrmSetting(){
    var host=q('[data-wd-premium-settings]');
    var existing=q('[data-wd-crm-setting]');
    if(!crm.loaded||!crm.connected||!host){if(existing)existing.remove();return;}
    if(!existing){
      existing=document.createElement('div');existing.dataset.wdCrmSetting='1';existing.className='wdv2-widget-row wd-crm-setting-row';
      existing.innerHTML='<span>CRM contacts<small>Integration</small></span><button class="wdv2-switch" type="button" data-crm-toggle="crm-count"><i></i></button>';
      host.appendChild(existing);
      q('[data-crm-toggle="crm-count"]',existing).addEventListener('click',function(){crm.visible=!crm.visible;persistCrmPreference();renderCrmCard();renderCrmSetting();});
    }
    var btn=q('[data-crm-toggle="crm-count"]',existing),pressed=String(crm.visible);if(btn){btn.classList.toggle('on',crm.visible);if(btn.getAttribute('aria-pressed')!==pressed)btn.setAttribute('aria-pressed',pressed);}
  }

  function settle(){
    removeSizingControls();
    migrateDefaultCardsOff();
    normalizeOptionalLiveActivity();
    placeFreeUpgrade();
    renderCrmCard();
    renderCrmSetting();
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
        loadCrmSummary();
        presenceTimer=setInterval(refreshPresence,25000);
        observer=new MutationObserver(function(){clearTimeout(settleTimer);settleTimer=setTimeout(settle,35);});
        observer.observe(q('#wd4-root')||document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden','aria-pressed']});
      }else if(tries>100)clearInterval(ready);
    },80);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
