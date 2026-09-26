(function(){'use strict';
  var host=document.getElementById('ad-portal-analytics');
  var windowSelect=document.getElementById('ad-funnel-window');
  if(!host||!windowSelect)return;

  function safeClient(){
    try{return window.NJPTRAccess&&window.NJPTRAccess.client?window.NJPTRAccess.client():null}catch(_){return null}
  }

  function render(views,leads){
    var conversion=views>0?Math.round((leads/views)*1000)/10:0;
    host.innerHTML='<div class="ad-portal-metric"><span>Portal visits</span><b>'+Number(views||0).toLocaleString()+'</b></div>'+
      '<div class="ad-portal-metric"><span>Portal leads</span><b>'+Number(leads||0).toLocaleString()+'</b></div>'+
      '<div class="ad-portal-metric"><span>Visit-to-lead</span><b>'+conversion.toLocaleString(undefined,{maximumFractionDigits:1})+'%</b></div>';
  }

  async function load(){
    var client=safeClient();
    if(!client)return;
    var days=Math.max(1,Number(windowSelect.value||30));
    var since=new Date(Date.now()-days*86400000).toISOString();
    host.setAttribute('aria-busy','true');
    var result=await client.from('agent_funnel_events')
      .select('event_name')
      .in('event_name',['portal_view','portal_lead_captured'])
      .gte('occurred_at',since);
    host.removeAttribute('aria-busy');
    if(result.error){
      host.innerHTML='<p class="ad-funnel-note">Portal analytics are temporarily unavailable.</p>';
      return;
    }
    var rows=result.data||[];
    render(rows.filter(function(r){return r.event_name==='portal_view'}).length,rows.filter(function(r){return r.event_name==='portal_lead_captured'}).length);
  }

  Promise.resolve(window.njptrAccessReady).then(function(ctx){if(ctx&&ctx.user)load()}).catch(function(){});
  windowSelect.addEventListener('change',load);
})();
