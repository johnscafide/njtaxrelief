(function(){
'use strict';
const $=(s,r=document)=>r.querySelector(s);
let timer=null;
function pick(assets,types){for(const type of types){const list=(assets||[]).filter(a=>a.asset_type===type&&a.status!=='archived');const hit=list.find(a=>a.is_primary&&a.signed_url)||list.find(a=>a.signed_url);if(hit)return hit}return null}
function text(el,value){if(el&&value!=null)el.textContent=String(value)}
function apply(){const api=window.WDDBrandMediaV1;if(!api)return;const snap=api.snapshot?.();const back=$('.wddc-back');if(!snap||!back)return;const p=snap.profile||{},assets=snap.assets||[],brandline=$('.wddc-brandline',back),contact=$('.wddc-contact',back);back.classList.add('wddbm-brand-applied');back.dataset.logoTreatment=p.logo_treatment||'full_color';back.dataset.headshotTreatment=p.headshot_treatment||'rounded_card';
const name=p.display_name||p.name||'Your Name',company=p.company||p.brokerage||'Your Company',title=p.professional_title||p.title||'',license=p.license||'',phone=p.phone||'',email=p.email||'';
if(brandline){text($('b',brandline),company);text($('small',brandline),[name,title||license].filter(Boolean).join(' · '));const mark=$('.wddc-monogram',brandline),logo=pick(assets,['personal_logo','team_logo','brokerage_logo','brand_mark','secondary_logo']);if(mark){if(logo){mark.classList.add('wddbm-has-logo');if(!$('img',mark)){mark.textContent='';const img=document.createElement('img');img.alt='';mark.appendChild(img)}$('img',mark).src=logo.signed_url}else{mark.classList.remove('wddbm-has-logo')}}}
if(contact){text($('b',contact),name);text($('span',contact),company);text($('small',contact),[phone,email].filter(Boolean).join(' · '));let img=$('.wddbm-composer-headshot',contact);const headshot=p.headshot_treatment==='none'?null:pick(assets,['headshot']);if(headshot){if(!img){img=document.createElement('img');img.className='wddbm-composer-headshot';img.alt='';contact.insertBefore(img,contact.firstChild)}img.src=headshot.signed_url}else if(img)img.remove()}
}
function schedule(){clearTimeout(timer);timer=setTimeout(apply,25)}
document.addEventListener('wdd:brand-profile-updated',schedule);document.addEventListener('wdd:canvas-rendered',schedule);document.addEventListener('wdd:side-changed',schedule);new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});setInterval(apply,650);schedule();
})();
