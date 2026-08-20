(function(){
'use strict';

const $=(s,r=document)=>r.querySelector(s);

function toast(message){
  const t=$('#pl-toast');
  if(!t)return;
  t.textContent=message;
  t.style.display='block';
  clearTimeout(window.__crReasonToast);
  window.__crReasonToast=setTimeout(()=>{t.style.display='none';},5200);
}

function enhanceReasonField(){
  const select=$('#cr-reason');
  if(!select||select.dataset.reasonGuard==='true')return;
  select.dataset.reasonGuard='true';
  const label=select.closest('label');
  if(label){
    const first=label.childNodes[0];
    if(first&&first.nodeType===Node.TEXT_NODE)first.textContent='Required reason';
  }
  const empty=select.querySelector('option[value=""]');
  if(empty)empty.textContent='Select the main reason';
  select.setAttribute('required','required');
  select.setAttribute('aria-required','true');
}

function validateSave(event){
  const save=event.target.closest?.('#cr-save');
  if(!save)return;
  const reason=$('#cr-reason')?.value||'';
  const note=$('#cr-notes')?.value?.trim()||'';
  if(!reason){
    event.preventDefault();
    event.stopImmediatePropagation();
    $('#cr-reason')?.focus();
    toast('Choose the main evidence reason before saving. This keeps future calibration labels useful for model repair.');
    return;
  }
  if(reason==='other'&&!note){
    event.preventDefault();
    event.stopImmediatePropagation();
    $('#cr-notes')?.focus();
    toast('Add a short note when choosing Other so the reason can be reconstructed later.');
  }
}

const observer=new MutationObserver(enhanceReasonField);
observer.observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('click',validateSave,true);
document.addEventListener('change',event=>{
  if(event.target?.id==='cr-reason')enhanceReasonField();
},true);
enhanceReasonField();
})();
