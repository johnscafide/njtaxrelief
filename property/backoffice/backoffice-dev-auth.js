(function(){
'use strict';
const SESSION_API='/api/watchdog-backoffice-gateway?target=login';
const BACKOFFICE_API='/api/watchdog-backoffice-gateway?target=api';
const REVIEWS_API='/api/watchdog-backoffice-reviews';
const LEGACY_BACKOFFICE_API='https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/backoffice-api';
const SESSION_KEY='watchdog-backoffice-session';
const $=(s,r=document)=>r.querySelector(s);
let working=false;
let reviewTimer=null;

// backoffice.js predates the WatchdogIndex.com cutover and still references the
// Supabase function directly. Keep its behavior intact while routing browser
// requests through the same-origin canonical gateway, which avoids the old
// NJPropertyTaxRelief-only CORS boundary without weakening the Edge Function.
if(window.fetch&&!window.__watchdogBackofficeCanonicalFetch){
  const nativeFetch=window.fetch.bind(window);
  window.fetch=function(input,init){
    const url=typeof input==='string'?input:(input&&input.url)||'';
    if(String(url).indexOf(LEGACY_BACKOFFICE_API)===0)return nativeFetch(BACKOFFICE_API,init);
    return nativeFetch(input,init);
  };
  window.__watchdogBackofficeCanonicalFetch=true;
}

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

async function developerToken(){
  try{
    if(window.njptrAccessReady)await Promise.resolve(window.njptrAccessReady);
    if(!window.NJPTRAccess||typeof window.NJPTRAccess.client!=='function')return'';
    const result=await window.NJPTRAccess.client().auth.getSession();
    return result?.data?.session?.access_token||'';
  }catch{return''}
}

function ensureReviewNav(){
  const nav=$('.bo-nav');
  if(!nav)return null;
  let link=nav.querySelector('[data-backoffice-reviews-link]');
  if(!link){
    link=document.createElement('a');
    link.href='/backoffice/reviews';
    link.setAttribute('data-backoffice-reviews-link','1');
    link.innerHTML='<span>05</span>Application Reviews <em class="bo-review-badge" data-review-badge hidden>0</em>';
    const realestate=Array.from(nav.querySelectorAll('a')).find(a=>String(a.getAttribute('href')||'').indexOf('/backoffice/realestate')===0);
    if(realestate){
      const number=realestate.querySelector('span');
      if(number)number.textContent='06';
      nav.insertBefore(link,realestate);
    }else nav.appendChild(link);
  }
  if(!document.getElementById('bo-review-badge-style')){
    const style=document.createElement('style');
    style.id='bo-review-badge-style';
    style.textContent='.bo-nav .bo-review-badge{margin-left:auto;display:inline-grid;min-width:22px;height:22px;padding:0 6px;place-items:center;border-radius:999px;background:#d92d20;color:#fff;font-style:normal;font:800 11px/1 "Plus Jakarta Sans",Arial,sans-serif;box-shadow:0 0 0 3px rgba(217,45,32,.16)}.bo-nav .bo-review-badge[hidden]{display:none!important}';
    document.head.appendChild(style);
  }
  return link.querySelector('[data-review-badge]');
}

async function refreshReviewBadge(){
  const badge=ensureReviewNav();
  if(!badge)return;
  const accessToken=await developerToken();
  if(!accessToken){badge.hidden=true;return;}
  try{
    const res=await fetch(REVIEWS_API,{
      method:'POST',
      cache:'no-store',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+accessToken},
      body:JSON.stringify({action:'count'})
    });
    const data=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(data.error||'Review count unavailable');
    const count=Math.max(0,Number(data.pending_count)||0);
    badge.textContent=count.toLocaleString();
    badge.hidden=count<1;
  }catch{
    badge.hidden=true;
  }
}

function scheduleReviewBadge(){
  clearInterval(reviewTimer);
  reviewTimer=setInterval(refreshReviewBadge,60000);
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
  ensureReviewNav();
  refreshReviewBadge();
  scheduleReviewBadge();
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshReviewBadge()});

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
