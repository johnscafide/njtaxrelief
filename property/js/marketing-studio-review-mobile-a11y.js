(function(){'use strict';
const mobile=()=>window.matchMedia('(max-width: 720px)').matches;
const liveId='ms-review-mobile-live';
function live(){let el=document.getElementById(liveId);if(el)return el;el=document.createElement('div');el.id=liveId;el.setAttribute('role','status');el.setAttribute('aria-live','polite');el.setAttribute('aria-atomic','true');el.style.position='fixed';el.style.width='1px';el.style.height='1px';el.style.padding='0';el.style.margin='-1px';el.style.overflow='hidden';el.style.clip='rect(0,0,0,0)';el.style.whiteSpace='nowrap';el.style.border='0';document.body.appendChild(el);return el}
function announce(message){if(!mobile()||!message)return;const el=live();el.textContent='';requestAnimationFrame(()=>{el.textContent=message})}
function syncButton(button){if(!mobile()||!button)return;const text=(button.textContent||'').trim();const busy=/Pricing…|Opening checkout…/i.test(text);button.setAttribute('aria-busy',busy?'true':'false');if(busy){button.setAttribute('aria-disabled','true');announce(text.replace('…','… Please wait.'))}else if(!button.disabled){button.removeAttribute('aria-disabled')}
}
function enhance(root=document){if(!mobile())return;root.querySelectorAll?.('[data-commerce-quote],[data-commerce-checkout]').forEach(button=>{if(button.dataset.mobileReviewA11y==='1'){syncButton(button);return}button.dataset.mobileReviewA11y='1';syncButton(button);new MutationObserver(()=>syncButton(button)).observe(button,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['disabled']})})}
function init(){if(document.body.dataset.msWizard!=='review'||!mobile())return;enhance();new MutationObserver(records=>{for(const record of records){for(const node of record.addedNodes){if(node.nodeType===1)enhance(node)}}}).observe(document.body,{childList:true,subtree:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
