(function(){
'use strict';
const RECOVERY_API='https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/backoffice-recover';
const BACKOFFICE_API='https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/backoffice-api';
const SESSION_KEY='watchdog-backoffice-session';
const $=(s,r=document)=>r.querySelector(s);

async function developerToken(){
  try{
    if(!window.NJPTRAccess)return'';
    const result=await window.NJPTRAccess.client().auth.getSession();
    return result?.data?.session?.access_token||'';
  }catch{return''}
}

function makeAutofillSafe(input){
  if(!input)return;
  input.setAttribute('autocomplete','one-time-code');
  input.setAttribute('data-lpignore','true');
  input.setAttribute('data-1p-ignore','true');
  input.setAttribute('data-bwignore','true');
  input.setAttribute('readonly','readonly');
  const activate=()=>{
    input.removeAttribute('readonly');
    if(input.dataset.userActivated!=='1'){
      input.value='';
      input.dataset.userActivated='1';
    }
  };
  input.addEventListener('pointerdown',activate,{once:true});
  input.addEventListener('focus',activate,{once:true});
  setTimeout(()=>{if(input.dataset.userActivated!=='1')input.value=''},100);
  setTimeout(()=>{if(input.dataset.userActivated!=='1')input.value=''},500);
}

async function loginWithNewKey(key,actor){
  const res=await fetch(BACKOFFICE_API,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'login',key,actor})
  });
  let data={};try{data=await res.json()}catch{}
  if(!res.ok||!data.token)throw new Error(data.error||'The key was reset, but automatic sign-in failed.');
  sessionStorage.setItem(SESSION_KEY,data.token);
  return data;
}

function install(){
  const authForm=$('#bo-auth-form');
  if(!authForm||$('#bo-recovery-wrap'))return;

  const loginKey=authForm.querySelector('input[name="key"]');
  makeAutofillSafe(loginKey);

  const wrap=document.createElement('div');
  wrap.id='bo-recovery-wrap';
  wrap.style.marginTop='14px';
  wrap.innerHTML=`
    <button type="button" class="bo-button bo-button-quiet" id="bo-recovery-toggle" style="width:100%">Forgot or reset shared key</button>
    <form id="bo-recovery-form" hidden style="margin-top:14px;padding:16px;border:1px solid #dde4ea;border-radius:16px;background:#f8fafb">
      <p style="margin:0 0 12px;color:#526273">A signed-in Watchdog developer account can replace the shared Backoffice key without deleting leads or settings. After reset, Backoffice signs you in automatically.</p>
      <label>New shared key<input type="password" name="recovery_key" minlength="14" autocomplete="one-time-code" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" readonly required></label>
      <label>Confirm new key<input type="password" name="recovery_confirm" minlength="14" autocomplete="one-time-code" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" readonly required></label>
      <div id="bo-recovery-error" class="bo-form-error" role="alert"></div>
      <button type="submit" class="bo-button bo-button-primary" id="bo-recovery-submit" style="width:100%">Reset and unlock Backoffice</button>
      <button type="button" class="bo-button bo-button-quiet" id="bo-recovery-signin" style="width:100%;margin-top:8px">Sign in to Watchdog developer account</button>
    </form>`;
  authForm.insertAdjacentElement('afterend',wrap);

  const recoveryKey=$('#bo-recovery-form input[name="recovery_key"]');
  const recoveryConfirm=$('#bo-recovery-form input[name="recovery_confirm"]');
  makeAutofillSafe(recoveryKey);
  makeAutofillSafe(recoveryConfirm);

  $('#bo-recovery-toggle').onclick=()=>{
    const form=$('#bo-recovery-form');
    form.hidden=!form.hidden;
    if(!form.hidden){
      recoveryKey.value='';
      recoveryConfirm.value='';
      recoveryKey.dataset.userActivated='0';
      recoveryConfirm.dataset.userActivated='0';
      recoveryKey.setAttribute('readonly','readonly');
      recoveryConfirm.setAttribute('readonly','readonly');
      setTimeout(()=>recoveryKey.focus(),0);
    }
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
    const key=String(fd.get('recovery_key')||'').trim();
    const confirm=String(fd.get('recovery_confirm')||'').trim();
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
      const actor=String(authForm.querySelector('select[name="actor"]')?.value||'john');
      await loginWithNewKey(key,actor);
      form.reset();
      location.reload();
    }catch(ex){err.textContent=ex.message||'Could not reset and unlock the Backoffice.'}
    finally{btn.disabled=false}
  };
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
