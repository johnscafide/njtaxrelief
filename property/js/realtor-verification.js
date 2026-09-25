(function(){
'use strict';
if(!window.NJPTRSupabaseRuntime)return;
var db=window.NJPTRSupabaseRuntime.createClient(),user=null,state=null,busy=false,profile=null;

function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function val(id){var n=document.getElementById(id);return n?String(n.value||'').trim():''}
function dateLabel(v){if(!v)return'—';var d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—'}
function currentVerified(row){
  if(!row||!row.verified_realtor||row.verification_status!=='verified')return false;
  if(!row.verification_due_at)return true;
  var due=new Date(row.verification_due_at);return Number.isFinite(due.getTime())&&due.getTime()>Date.now();
}
function status(row){
  if(currentVerified(row))return{label:'REALTOR® verified',className:'verified',icon:'fa-certificate',note:'Watchdog has reviewed this REALTOR® membership claim.'};
  if(row&&row.verification_status==='pending')return{label:'Review pending',className:'pending',icon:'fa-clock',note:'Your REALTOR® membership details are waiting for manual review.'};
  if(row&&row.verification_status==='rejected')return{label:'Needs correction',className:'rejected',icon:'fa-triangle-exclamation',note:row.review_note||'The submitted membership details could not be verified.'};
  if(row&&row.verification_status==='expired')return{label:'Re-verification due',className:'expired',icon:'fa-rotate',note:'Submit your current NAR membership details again.'};
  return{label:'Not submitted',className:'none',icon:'fa-certificate',note:'Submit your NAR Member ID and local association for Watchdog review.'};
}
function anchor(){
  return document.getElementById('ac-professional-verification')||
    document.getElementById('ac-agent-branding')||
    document.getElementById('ac-profile-editor')||
    document.querySelector('#ac-app .ac-section');
}
function remove(){var old=document.getElementById('ac-realtor-verification');if(old)old.remove()}
function render(){
  remove();
  if(!profile||profile.primary_profession!=='real_estate')return;
  var a=anchor();if(!a||!a.parentNode)return;
  var s=status(state),verified=currentVerified(state),section=document.createElement('section');
  section.id='ac-realtor-verification';section.className='ac-section acp-editor acr-editor';
  section.innerHTML=
   '<header class="acp-header acr-header"><div><span>REALTOR® STATUS</span><h2>REALTOR® membership</h2><p>Verify association membership separately from your New Jersey real-estate license.</p></div><div class="acp-source acr-status '+s.className+'"><i class="fas '+s.icon+'"></i><span>'+esc(s.label)+'</span></div></header>'+
   '<div class="acr-grid">'+
    '<section class="acr-panel">'+
      '<div class="acr-panel-head"><i class="fa-regular fa-id-badge"></i><div><b>Membership details</b><small>User-submitted, Watchdog-reviewed</small></div></div>'+
      '<div class="acr-fields">'+
        '<label><span>NAR Member ID</span><input id="acr-member-id" maxlength="32" autocomplete="off" value="'+esc(state&&state.nar_member_id||'')+'" placeholder="Enter your NAR Member ID"></label>'+
        '<label><span>Local REALTOR® association</span><input id="acr-association" maxlength="160" value="'+esc(state&&state.local_association||'')+'" placeholder="Example: Gloucester Salem Counties Board of REALTORS®"></label>'+
        '<label class="wide"><span>Membership proof or directory URL <em>optional</em></span><input id="acr-proof" type="url" maxlength="700" value="'+esc(state&&state.proof_url||'')+'" placeholder="https://…"></label>'+
        '<label class="wide"><span>Note for review <em>optional</em></span><textarea id="acr-note-input" maxlength="1000" rows="3" placeholder="Anything that helps us confirm your membership">'+esc(state&&state.user_note||'')+'</textarea></label>'+
      '</div>'+
      '<div class="acr-submit"><button type="button" id="acr-submit"><i class="fas fa-paper-plane"></i> '+(verified?'Update membership details':'Submit for REALTOR® review')+'</button><span id="acr-note" aria-live="polite"></span></div>'+
    '</section>'+
    '<aside class="acr-panel acr-explain">'+
      '<div class="acr-panel-head"><i class="fas fa-shield-halved"></i><div><b>How Watchdog verifies this</b><small>Membership verification is separate from license verification</small></div></div>'+
      '<p>'+esc(s.note)+'</p>'+
      (verified?'<div class="acr-verified-card"><i class="fas fa-certificate"></i><div><span>VERIFIED REALTOR®</span><b>'+esc(state.member_name||'NAR member')+'</b>'+(state.local_association?'<small>'+esc(state.local_association)+'</small>':'')+'<small>Verified '+esc(dateLabel(state.verified_at))+(state.verification_due_at?' · Review due '+esc(dateLabel(state.verification_due_at)):'')+'</small></div></div>':'')+
      '<div class="acr-nar-note"><b>Current connection</b><p>Watchdog does not yet have a direct NAR membership-verification API connection. Submissions are reviewed before the REALTOR® badge is granted.</p></div>'+
      '<div class="acr-links"><a href="https://www.nar.realtor/membership-card" target="_blank" rel="noopener noreferrer">NAR membership card <i class="fas fa-arrow-up-right-from-square"></i></a><a href="https://www.nar.realtor/membership" target="_blank" rel="noopener noreferrer">NAR membership help <i class="fas fa-arrow-up-right-from-square"></i></a></div>'+
    '</aside>'+
   '</div>';
  a.parentNode.insertBefore(section,a.nextSibling);
  var button=document.getElementById('acr-submit');if(button)button.addEventListener('click',submit);
}
async function load(){
  var auth=await db.auth.getUser();user=auth.data&&auth.data.user;if(!user)return;
  var results=await Promise.all([
    db.from('watchdog_onboarding_profiles').select('primary_profession').eq('user_id',user.id).maybeSingle(),
    db.rpc('my_realtor_verification_v1')
  ]);
  if(results[0].error)return;profile=results[0].data||null;
  if(!results[1].error){var d=results[1].data;state=Array.isArray(d)?d[0]||null:d||null}
  render();
}
async function submit(){
  if(busy)return;
  var member=val('acr-member-id').toUpperCase().replace(/\s+/g,''),association=val('acr-association'),proof=val('acr-proof'),note=val('acr-note-input'),message=document.getElementById('acr-note'),button=document.getElementById('acr-submit');
  if(!/^[A-Z0-9-]{4,32}$/.test(member)){if(message)message.textContent='Enter a valid NAR Member ID.';return}
  if(proof){try{var u=new URL(proof);if(u.protocol!=='https:')throw new Error()}catch(_){if(message)message.textContent='Proof URL must use HTTPS.';return}}
  busy=true;if(button)button.disabled=true;if(message)message.textContent='Submitting for review…';
  try{
    var result=await db.rpc('submit_my_realtor_verification_v1',{p_nar_member_id:member,p_local_association:association||null,p_proof_url:proof||null,p_user_note:note||null});
    if(result.error)throw result.error;
    await load();var fresh=document.getElementById('acr-note');if(fresh)fresh.textContent='Submitted. Watchdog will grant the REALTOR® badge only after review.';
  }catch(e){if(message)message.textContent=e&&e.message||'Could not submit REALTOR® verification.'}
  finally{busy=false;var freshButton=document.getElementById('acr-submit');if(freshButton)freshButton.disabled=false}
}
function start(){
  if(String(document.body&&document.body.getAttribute('data-account-profile-mode')||'')!=='professional')return;
  load();
  document.addEventListener('watchdog:profile-updated',load);
  var app=document.getElementById('ac-app');if(app){var obs=new MutationObserver(function(){if(profile&&!document.getElementById('ac-realtor-verification'))setTimeout(render,0)});obs.observe(app,{childList:true,subtree:false})}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();