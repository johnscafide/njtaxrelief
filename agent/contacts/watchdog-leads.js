(function(){
'use strict';
if(!window.NJPTRSupabaseRuntime)return;
var button=document.getElementById('acx-load-watchdog-leads');if(!button)return;
var db=window.NJPTRSupabaseRuntime.createClient();
button.addEventListener('click',async function(){
  if(button.disabled)return;button.disabled=true;var old=button.innerHTML;button.innerHTML='<i class="fa-solid fa-circle-notch fa-spin"></i> Loading Watchdog leads';
  try{
    var auth=await db.auth.getUser(),user=auth.data&&auth.data.user;if(!user)throw new Error('Sign in required');
    var r=await db.from('agent_portal_leads').select('id,full_name,email,phone,address,city,zip,source,created_at').eq('agent_user_id',user.id).order('created_at',{ascending:false}).limit(1000);if(r.error)throw r.error;
    if(!window.WatchdogAgentContacts||typeof window.WatchdogAgentContacts.loadWatchdogLeads!=='function')throw new Error('Contact workspace is still loading');
    window.WatchdogAgentContacts.loadWatchdogLeads(r.data||[]);
  }catch(e){var t=document.getElementById('acx-toast');if(t){t.className='acx-toast show error';t.textContent=e.message||'Watchdog leads could not load.'}}finally{button.disabled=false;button.innerHTML=old}
});
})();