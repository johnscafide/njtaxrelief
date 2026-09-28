/* Watchdog Backoffice shell, shared by every Backoffice page.
   - Developer-only navigation (Application Reviews, Professional Reviews,
     Real Estate OS) stays hidden unless the signed-in Watchdog account passes
     the server-side is_watchdog_developer check.
   - Pending-review badge counts are requested only for developers.
   - "Lock Backoffice" on pages other than Lead Intelligence revokes this tab's
     Backoffice session and returns to the locked card. Lead Intelligence
     registers its own lock handler (backoffice.js). */
(function(){
'use strict';
const REVIEWS_API='/api/watchdog-backoffice-reviews';
const PROFESSIONAL_API='/api/watchdog-backoffice-professional';
const GATEWAY_API='/api/watchdog-backoffice-gateway?target=api';
const SESSION_KEY='watchdog-backoffice-session';
const LOCK_KEY='watchdog-backoffice-locked';
const REFRESH_MS=60000;
let developerCheck=null;
let timer=null;

function store(method,key,value){
  try{
    if(method==='get')return sessionStorage.getItem(key)||'';
    if(method==='set')sessionStorage.setItem(key,value);
    if(method==='remove')sessionStorage.removeItem(key);
  }catch(_){/* storage blocked: the page still works, it just can't remember the session */}
  return '';
}

async function watchdogClient(){
  if(window.njptrAccessReady){try{await Promise.resolve(window.njptrAccessReady)}catch(_){/* page gate handles redirects */}}
  if(!window.NJPTRAccess||typeof window.NJPTRAccess.client!=='function')return null;
  try{return window.NJPTRAccess.client()}catch(_){return null}
}

async function watchdogAccessToken(){
  const client=await watchdogClient();
  if(!client)return '';
  try{const result=await client.auth.getSession();return result&&result.data&&result.data.session&&result.data.session.access_token||''}catch(_){return ''}
}

function isDeveloper(){
  if(!developerCheck){
    developerCheck=(async()=>{
      const client=await watchdogClient();
      if(!client)return false;
      try{
        const session=await client.auth.getSession();
        if(!(session&&session.data&&session.data.session))return false;
        const result=await client.rpc('is_watchdog_developer');
        return !result.error&&result.data===true;
      }catch(_){return false}
    })();
  }
  return developerCheck;
}

function badge(name){return document.querySelector('.bo-review-badge[data-bo-badge="'+name+'"]')}

async function refreshCount(url,name){
  const el=badge(name);
  if(!el)return;
  const token=await watchdogAccessToken();
  if(!token){el.hidden=true;return}
  try{
    const res=await fetch(url,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({action:'count'})});
    const data=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(data.error||'count unavailable');
    const count=Math.max(0,Number(data.pending_count)||0);
    const slot=el.querySelector('[data-bo-badge-count]');
    if(slot)slot.textContent=count.toLocaleString();
    el.hidden=count<1;
  }catch(_){el.hidden=true}
}

function refreshBadges(){refreshCount(REVIEWS_API,'reviews');refreshCount(PROFESSIONAL_API,'professional')}

async function revealDeveloperTools(){
  const developer=await isDeveloper();
  document.querySelectorAll('[data-bo-dev-only]').forEach((el)=>{el.hidden=!developer});
  if(!developer)return;
  refreshBadges();
  clearInterval(timer);
  timer=setInterval(()=>{if(!document.hidden)refreshBadges()},REFRESH_MS);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshBadges()});
}

async function lockFromOtherPage(){
  const token=store('get',SESSION_KEY);
  store('remove',SESSION_KEY);
  store('set',LOCK_KEY,'1');
  if(token){
    try{await fetch(GATEWAY_API,{method:'POST',cache:'no-store',keepalive:true,headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({action:'logout'})})}catch(_){/* the server session still expires on its own */}
  }
  location.assign('/backoffice');
}

const shell={isDeveloper,onLock:null};
window.WatchdogBackofficeShell=shell;

function init(){
  document.querySelectorAll('[data-bo-lock]').forEach((button)=>{
    button.addEventListener('click',()=>{(typeof shell.onLock==='function'?shell.onLock:lockFromOtherPage)()});
  });
  revealDeveloperTools();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
