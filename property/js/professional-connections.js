(function(){
'use strict';
if(!window.NJPTRSupabaseRuntime)return;
var db=window.NJPTRSupabaseRuntime.createClient(),profile=null,rows=[],busy=false;
var PROVIDERS=[
  {key:'bright_mls',name:'Bright MLS',kind:'MLS',icon:'fa-house-signal',copy:'Request a Bright MLS member connection for identity, office and profile sync once provider authorization is enabled.',fields:'Identity · office · member profile'},
  {key:'reso_mls',name:'Other RESO MLS',kind:'MLS',icon:'fa-database',copy:'Request another RESO-compatible MLS. Watchdog will map member/profile data only through authorized provider access.',fields:'Member profile · office · designations'},
  {key:'realtor_com',name:'Realtor.com',kind:'PROFILE',icon:'fa-star',copy:'Link your public Realtor.com profile now. Live ratings/review sync will require approved Realtor.com partner/API access; Watchdog will not scrape reviews.',fields:'Profile · ratings/reviews when authorized'}
];
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function rowFor(key){return rows.find(function(r){return r.provider_key===key})||null}
function date(v){if(!v)return'';var d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):''}
function status(row){if(!row)return{label:'Not requested',cls:'none'};return({
  requested:{label:'Requested',cls:'requested'},needs_action:{label:'Setup available',cls:'action'},connected:{label:'Connected',cls:'connected'},error:{label:'Needs attention',cls:'error'},disconnected:{label:'Disconnected',cls:'none'}
})[row.connection_status]||{label:row.connection_status||'Not requested',cls:'none'}}
function anchor(){return document.getElementById('ac-realtor-verification')||document.getElementById('ac-professional-verification')||document.getElementById('ac-agent-branding')||document.getElementById('ac-profile-editor')}
function remove(){var old=document.getElementById('ac-professional-connections');if(old)old.remove()}
function card(p){
  var r=rowFor(p.key),s=status(r),connected=r&&r.connection_status==='connected',requested=r&&['requested','needs_action'].includes(r.connection_status);
  return '<article class="apc-card" data-provider="'+esc(p.key)+'">'+
    '<div class="apc-card-top"><span class="apc-icon"><i class="fas '+p.icon+'"></i></span><div><small>'+esc(p.kind)+'</small><h3>'+esc(p.name)+'</h3></div><em class="'+esc(s.cls)+'">'+esc(s.label)+'</em></div>'+
    '<p>'+esc(p.copy)+'</p>'+
    '<div class="apc-fields">'+esc(p.fields)+'</div>'+
    (r&&r.last_synced_at?'<div class="apc-sync"><i class="fas fa-rotate"></i> Last synced '+esc(date(r.last_synced_at))+'</div>':'')+
    '<label><span>Profile / member URL <i>optional</i></span><input data-connection-url="'+esc(p.key)+'" type="url" placeholder="https://…" value="'+esc(r&&r.external_profile_url||'')+'" '+(connected?'readonly':'')+'></label>'+
    '<div class="apc-actions">'+
      (connected?'<span class="apc-connected"><i class="fas fa-circle-check"></i> Authorized connection</span>':
       '<button type="button" data-request-connection="'+esc(p.key)+'" '+(busy||requested?'disabled':'')+'>'+(requested?'Request received':'Request connection')+'</button>')+
      (r&&r.last_error?'<small>'+esc(r.last_error)+'</small>':'')+
    '</div></article>';
}
function render(){
  remove();if(!profile||profile.primary_profession!=='real_estate')return;var a=anchor();if(!a||!a.parentNode)return;
  var section=document.createElement('section');section.id='ac-professional-connections';section.className='ac-section acp-editor apc-editor';
  section.innerHTML='<header class="acp-header"><div><span>PROFESSIONAL CONNECTIONS</span><h2>MLS & reputation connections</h2><p>Request provider connections that can verify identity and, where authorized, sync professional profile data.</p></div><div class="acp-source"><i class="fas fa-link"></i><span>Provider-controlled</span></div></header>'+
    '<div class="apc-notice"><i class="fas fa-shield-halved"></i><span>Watchdog never treats a profile URL as proof of membership and does not scrape Realtor.com reviews. A connection is shown as <b>Connected</b> only after provider authorization is established.</span></div>'+
    '<div class="apc-grid">'+PROVIDERS.map(card).join('')+'</div>'+
    '<div class="apc-foot"><span id="apc-note" aria-live="polite"></span><a href="/integrations">Open Integration Center <i class="fas fa-arrow-right"></i></a></div>';
  a.parentNode.insertBefore(section,a.nextSibling);
  section.querySelectorAll('[data-request-connection]').forEach(function(btn){btn.addEventListener('click',function(){request(btn.dataset.requestConnection)})});
}
async function load(){
  var auth=await db.auth.getUser(),user=auth.data&&auth.data.user;if(!user)return;
  var result=await db.from('watchdog_onboarding_profiles').select('primary_profession').eq('user_id',user.id).maybeSingle();if(result.error)return;profile=result.data||null;
  if(!profile||profile.primary_profession!=='real_estate'){render();return}
  var connections=await db.rpc('my_professional_connections_v1');if(!connections.error)rows=Array.isArray(connections.data)?connections.data:[];
  render();
}
async function request(key){
  if(busy)return;var provider=PROVIDERS.find(function(p){return p.key===key});if(!provider)return;
  var input=document.querySelector('[data-connection-url="'+key+'"]'),url=String(input&&input.value||'').trim(),note=document.getElementById('apc-note');
  if(url){try{var u=new URL(url);if(u.protocol!=='https:')throw new Error()}catch(_){if(note)note.textContent='Profile URLs must use HTTPS.';return}}
  busy=true;if(note)note.textContent='Submitting '+provider.name+' connection request…';render();
  try{
    var result=await db.rpc('request_my_professional_connection_v1',{p_provider_key:key,p_external_profile_url:url||null});if(result.error)throw result.error;
    await load();var fresh=document.getElementById('apc-note');if(fresh)fresh.textContent=provider.name+' request received. Watchdog will only activate sync after provider authorization is available.';
  }catch(e){if(note)note.textContent=e&&e.message||'Could not request this connection.'}
  finally{busy=false;render()}
}
function start(){
  if(String(document.body&&document.body.getAttribute('data-account-profile-mode')||'')!=='professional')return;load();
  document.addEventListener('watchdog:profile-updated',load);
  var app=document.getElementById('ac-app');if(app){var obs=new MutationObserver(function(){if(profile&&!document.getElementById('ac-professional-connections'))setTimeout(render,0)});obs.observe(app,{childList:true,subtree:false})}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();