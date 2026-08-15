(function(){
'use strict';
const DEV_LOGIN_API='https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/backoffice-dev-login';
const SESSION_KEY='watchdog-backoffice-session';
const $=(s,r=document)=>r.querySelector(s);
let working=false;

function paint(message){
  const title=$('#bo-auth-title');
  const copy=$('#bo-auth-copy');
  const status=$('#bo-dev-access-status');
  const secure=$('#secure-status');
  if(title)title.textContent='Watchdog Backoffice';
  if(copy)copy.textContent='Backoffice currently uses your Watchdog developer account. No separate shared password is required.';
  if(status&&message)status.textContent=message;
  if(secure){secure.textContent='Developer gated';secure.className='connected'}
}

async function developerToken(){
  try{
    if(!window.NJPTRAccess)return'';
    await Promise.resolve(window.njptrAccessReady).catch(()=>null);
    const result=await window.NJPTRAccess.client().auth.getSession();
    return result?.data?.session?.access_token||'';
  }catch{return''}
}

async function openWithDeveloper(){
  if(working)return;
  working=true;
  const btn=$('#bo-dev-login');
  if(btn)btn.disabled=true;
  try{
    const accessToken=await developerToken();
    if(!accessToken){
      paint('Sign in to your Watchdog developer account to continue.');
      if(btn){btn.textContent='Sign in to Watchdog';btn.disabled=false;btn.dataset.mode='signin'}
      return;
    }
    paint('Developer access confirmed. Opening Backoffice…');
    const res=await fetch(DEV_LOGIN_API,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+accessToken},body:JSON.stringify({actor:'john'})});
    let data={};try{data=await res.json()}catch{}
    if(!res.ok)throw new Error(data.error||'Could not open Backoffice.');
    sessionStorage.setItem(SESSION_KEY,data.token);
    location.reload();
  }catch(ex){
    paint(ex.message||'Developer access could not be confirmed.');
    if(btn){btn.textContent='Try developer access again';btn.disabled=false;btn.dataset.mode='retry'}
  }finally{working=false}
}

function install(){
  const authForm=$('#bo-auth-form');
  const rotate=$('#rotate-form');
  if(authForm)authForm.hidden=true;
  if(rotate)rotate.hidden=true;
  paint('Checking your Watchdog developer session…');

  const btn=$('#bo-dev-login');
  if(btn)btn.onclick=async()=>{
    if(btn.dataset.mode==='signin'){
      location.href='/property/dashboard.html?access=signin&return=%2Fproperty%2Fbackoffice%2F';
      return;
    }
    await openWithDeveloper();
  };

  const observer=new MutationObserver(()=>paint());
  const auth=$('#bo-auth');
  if(auth)observer.observe(auth,{subtree:true,childList:true,characterData:true});

  if(sessionStorage.getItem(SESSION_KEY))return;
  setTimeout(openWithDeveloper,50);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
