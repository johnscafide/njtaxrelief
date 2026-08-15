(function(){
'use strict';
const RECOVERY_API='https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/backoffice-recover';
const SESSION_KEY='watchdog-backoffice-session';
const $=(s,r=document)=>r.querySelector(s);

async function developerToken(){
  try{
    if(!window.NJPTRAccess)return'';
    const result=await window.NJPTRAccess.client().auth.getSession();
    return result?.data?.session?.access_token||'';
  }catch{return''}
}

function install(){
  const authForm=$('#bo-auth-form');
  if(!authForm||$('#bo-recovery-wrap'))return;

  const loginKey=authForm.querySelector('input[name="key"]');
  if(loginKey){
    loginKey.setAttribute('autocomplete','off');
    loginKey.setAttribute('data-lpignore','true');
    loginKey.setAttribute('data-1p-ignore','true');
  }

  const wrap=document.createElement('div');
  wrap.id='bo-recovery-wrap';
  wrap.style.marginTop='14px';
  wrap.innerHTML=`
    <button type="button" class="bo-button bo-button-quiet" id="bo-recovery-toggle" style="width:100%">Forgot or reset shared key</button>
    <form id="bo-recovery-form" hidden style="margin-top:14px;padding:16px;border:1px solid #dde4ea;border-radius:16px;background:#f8fafb">
      <p style="margin:0 0 12px;color:#526273">A signed-in Watchdog developer account can replace the shared Backoffice key without deleting leads or settings.</p>
      <label>New shared key<input type="password" name="recovery_key" minlength="14" autocomplete="new-password" data-lpignore="true" data-1p-ignore="true" required></label>
      <label>Confirm new key<input type="password" name="recovery_confirm" minlength="14" autocomplete="new-password" data-lpignore="true" data-1p-ignore="true" required></label>
      <div id="bo-recovery-error" class="bo-form-error" role="alert"></div>
      <button type="submit" class="bo-button bo-button-primary" id="bo-recovery-submit" style="width:100%">Reset with developer account</button>
      <button type="button" class="bo-button bo-button-quiet" id="bo-recovery-signin" style="width:100%;margin-top:8px">Sign in to Watchdog developer account</button>
    </form>`;
  authForm.insertAdjacentElement('afterend',wrap);

  $('#bo-recovery-toggle').onclick=()=>{
    const form=$('#bo-recovery-form');
    form.hidden=!form.hidden;
    if(!form.hidden)form.querySelector('input[name="recovery_key"]').focus();
  };
  $('#bo-recovery-signin').onclick=()=>{
    location.href='/property/dashboard.html?access=signin&return=%2Fproperty%2Fbackoffice%2F';
  };
  $('#bo-recovery-form').onsubmit=async(e)=>{
    e.preventDefault();
    const form=e.currentTarget;
    const err=$('#bo-recovery-error');
    const btn=$('#bo-recovery-submit');
    const fd=new FormData(form);
    const key=String(fd.get('recovery_key')||'');
    const confirm=String(fd.get('recovery_confirm')||'');
    err.textContent='';
    if(key!==confirm){err.textContent='The two key entries do not match.';return}
    if(key.length<14){err.textContent='Use at least 14 characters.';return}
    btn.disabled=true;
    try{
      const accessToken=await developerToken();
      if(!accessToken)throw new Error('Sign into your Watchdog developer account first, then return here.');
      const res=await fetch(RECOVERY_API,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+accessToken},body:JSON.stringify({key})});
      let data={};try{data=await res.json()}catch{}
      if(!res.ok)throw new Error(data.error||'Could not reset the Backoffice key.');
      sessionStorage.removeItem(SESSION_KEY);
      form.reset();
      form.hidden=true;
      const mainError=$('#bo-auth-error');
      if(mainError){mainError.textContent='Shared key reset. Enter your new key to unlock Backoffice.';mainError.style.color='#18794e'}
      if(loginKey){loginKey.value='';loginKey.focus()}
    }catch(ex){err.textContent=ex.message||'Could not reset the Backoffice key.'}
    finally{btn.disabled=false}
  };
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
