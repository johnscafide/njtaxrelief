/* Property Home profession onboarding for exact Watchdog Analyst Intel. */
(function(){
'use strict';
if(window.__WATCHDOG_PROFESSION_ONBOARDING__)return;
window.__WATCHDOG_PROFESSION_ONBOARDING__=true;

var OPTIONS=[
 ['real_estate','Real estate agent / professional'],['investor','Real estate investor'],['attorney','Attorney'],
 ['mortgage_lending','Mortgage / lending'],['appraiser','Appraiser'],['contractor','Contractor'],
 ['property_tax_professional','Property tax professional'],['title_closing','Title / closing'],
 ['homeowner','Homeowner'],['other','Other professional']
];
var client=null,user=null;
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function sb(){if(client)return client;if(window.NJPTRSupabaseRuntime&&window.NJPTRSupabaseRuntime.createClient){client=window.NJPTRSupabaseRuntime.createClient();return client;}return null;}
function key(){return user?'watchdogProfessionPrompted:'+user.id:'watchdogProfessionPrompted';}
function prompted(){try{return sessionStorage.getItem(key())==='1';}catch(_){return false;}}
function remember(){try{sessionStorage.setItem(key(),'1');}catch(_){}}
function close(){var node=document.getElementById('wd-profession-onboarding');if(node)node.remove();document.body.classList.remove('wd-profession-onboarding-open');}
function emit(value){window.dispatchEvent(new CustomEvent('watchdog:profession-updated',{detail:{profession:value||'',source:'property_home_onboarding'}}));setTimeout(function(){if(window.WatchdogHomeAnalystIntel&&window.WatchdogHomeAnalystIntel.refresh)window.WatchdogHomeAnalystIntel.refresh();},20);}
function open(){
 if(document.getElementById('wd-profession-onboarding'))return;
 var wrap=document.createElement('div');wrap.id='wd-profession-onboarding';wrap.className='wd-profession-onboarding';wrap.setAttribute('role','dialog');wrap.setAttribute('aria-modal','true');wrap.setAttribute('aria-labelledby','wd-profession-title');
 wrap.innerHTML='<div class="wd-profession-card"><div class="wd-profession-mark"><i class="fas fa-dog"></i></div><span>PERSONALIZE WATCHDOG ANALYST INTEL</span><h2 id="wd-profession-title">What is your primary profession?</h2><p>Watchdog can read the same property very differently for an agent, investor, attorney, lender, appraiser, contractor, tax professional, title professional, or homeowner. Choose your primary perspective for exact Intel. If you skip, Watchdog will stay generalized.</p><label for="wd-profession-select">Primary profession</label><select id="wd-profession-select"><option value="">Choose profession</option>'+OPTIONS.map(function(o){return'<option value="'+esc(o[0])+'">'+esc(o[1])+'</option>';}).join('')+'</select><div class="wd-profession-actions"><button type="button" id="wd-profession-save">Use this perspective</button><button type="button" class="secondary" id="wd-profession-skip">Use generalized Intel for now</button></div><small id="wd-profession-note">This personalizes recommendations only. It does not change your plan, billing, or authorization.</small></div>';
 document.body.appendChild(wrap);document.body.classList.add('wd-profession-onboarding-open');
 var select=document.getElementById('wd-profession-select');if(select)select.focus();
 document.getElementById('wd-profession-skip').onclick=function(){remember();close();emit('');};
 document.getElementById('wd-profession-save').onclick=save;
}
async function save(){
 var select=document.getElementById('wd-profession-select'),note=document.getElementById('wd-profession-note'),button=document.getElementById('wd-profession-save');var value=select&&select.value;
 if(!value){if(note)note.textContent='Choose a profession, or continue with generalized Intel.';return;}
 if(button)button.disabled=true;if(select)select.disabled=true;if(note)note.textContent='Saving your Watchdog perspective…';
 var db=sb();if(!db||!user){if(note)note.textContent='Your session could not be verified.';return;}
 var result=await db.from('professional_preferences').upsert({user_id:user.id,profession:value,onboarding_complete:true,updated_at:new Date().toISOString()},{onConflict:'user_id'}).select('profession,onboarding_complete').single();
 if(result.error){if(note)note.textContent='Could not save your profession. You can set it from Account.';if(button)button.disabled=false;if(select)select.disabled=false;return;}
 remember();close();emit(value);
}
async function boot(){
 var db=sb();if(!db)return;
 try{var auth=await db.auth.getUser();user=auth&&auth.data&&auth.data.user;if(!user||prompted())return;var pref=await db.from('professional_preferences').select('profession,onboarding_complete').eq('user_id',user.id).maybeSingle();if(!pref.error&&pref.data&&pref.data.onboarding_complete===true&&String(pref.data.profession||'').trim())return;setTimeout(open,500);}catch(_e){}
}
window.WatchdogProfessionOnboarding={open:open,close:close};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
