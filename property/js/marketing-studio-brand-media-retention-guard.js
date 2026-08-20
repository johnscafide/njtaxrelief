(function(){
'use strict';
let busy=false;
function toast(message,bad=false){const t=document.querySelector('#pl-toast,#ms-toast');if(!t)return;t.textContent=String(message||'');t.style.display='block';t.classList.toggle('bad',bad);clearTimeout(window.__wddBrandRetentionToast);window.__wddBrandRetentionToast=setTimeout(()=>{t.style.display='none';t.classList.remove('bad')},4300)}
document.addEventListener('click',async e=>{const btn=e.target?.closest?.('[data-wddbm-remove]');if(!btn||busy)return;e.preventDefault();e.stopPropagation();if(typeof e.stopImmediatePropagation==='function')e.stopImmediatePropagation();try{busy=true;await window.njptrAccessReady;const client=window.NJPTRAccess.client(),r=await client.rpc('marketing_archive_brand_asset',{p_asset_id:btn.dataset.wddbmRemove});if(r.error)throw r.error;await window.WDDBrandMediaV1?.refresh?.();toast('Brand asset archived from future creative. The private source is retained for approved creative history.')}catch(err){toast(err?.message||'Could not archive that brand asset.',true)}finally{busy=false}},true);
})();
