(function(){
'use strict';
const MASKED_HTML='<div class="ic-calibration-lock" role="note" aria-label="Model output hidden until human review"><i class="fas fa-eye-slash"></i><div><b>Model output hidden until you save the human label.</b><span>Score, confidence, and predicted class stay concealed so they cannot become the answer key. Evidence coverage and governed source evidence remain available.</span></div></div>';
function protect(root=document){
  root.querySelectorAll('.ic-case-detail').forEach(detail=>{
    const actions=detail.querySelector('.ic-case-actions');
    const output=detail.querySelector('.ic-model-output');
    if(!actions||!output)return;
    const reviewed=Boolean(actions.querySelector('button.active'));
    if(reviewed){output.dataset.independenceState='revealed';return;}
    if(output.dataset.independenceState==='masked')return;
    output.dataset.independenceState='masked';
    output.innerHTML=MASKED_HTML;
  });
}
function boot(){
  const host=document.querySelector('#ic-detail');
  if(!host)return;
  protect(host);
  const observer=new MutationObserver(()=>protect(host));
  observer.observe(host,{childList:true,subtree:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
