(function(){
'use strict';
const SESSION_API='/api/watchdog-backoffice-gateway?target=login';
const BACKOFFICE_API='/api/watchdog-backoffice-gateway?target=api';
const SESSION_KEY='watchdog-backoffice-session';
const $=(s,r=document)=>r.querySelector(s);
let working=false;

function paint(message){
  const title=$('#bo-auth-title');
  const copy=$('#bo-auth-copy');
  const status=$('#bo-dev-access-status');
  const secure=$('#secure-status');
  if(title)title.textContent='Watchdog Backoffice';
  if(copy)copy.textContent='Authentication is temporarily disabled. Backoffice opens automatically.';
  if(status&&message)status.textContent=message;
  if(secure){
    secure.textContent='Open access';
    secure.className='pending';
  }
}

async function sessionStillWorks(sessionToken){
  if(!sessionToken)return false;
  try{
    const res=await fetch(BACKOFFICE_API,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+sessionToken},
      body:JSON.stringify({action:'session'})
    });
    return res.ok;
  }catch{
    return false;
  }
}

async function openPublicSession(){
  if(working)return;
  working=true;
  const btn=$('#bo-dev-login');
  if(btn){btn.disabled=true;btn.textContent='Opening Backoffice…';}
  try{
    paint('Opening Backoffice…');
    const res=await fetch(SESSION_API,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({actor:'john'})
    });
    let data={};
    try{data=await res.json();}catch{}
    if(!res.ok||!data.token)throw new Error(data.error||'Could not open Backoffice.');
    sessionStorage.setItem(SESSION_KEY,data.token);
    location.reload();
  }catch(ex){
    paint(ex.message||'Backoffice could not open.');
    if(btn){
      btn.textContent='Try again';
      btn.disabled=false;
      btn.onclick=openPublicSession;
    }
  }finally{
    working=false;
  }
}

async function install(){
  const authForm=$('#bo-auth-form');
  const rotate=$('#rotate-form');
  if(authForm)authForm.hidden=true;
  if(rotate)rotate.hidden=true;
  paint('Opening Backoffice…');

  const existing=sessionStorage.getItem(SESSION_KEY)||'';
  if(await sessionStillWorks(existing)){
    paint('Loading leads…');
    return;
  }

  sessionStorage.removeItem(SESSION_KEY);
  await openPublicSession();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
