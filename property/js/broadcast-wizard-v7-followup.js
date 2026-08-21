(function(){
'use strict';
if(window.__WD_BROADCAST_WIZARD_FOLLOWUP_V7__)return;
window.__WD_BROADCAST_WIZARD_FOLLOWUP_V7__=true;
var $=id=>document.getElementById(id),q=(s,r)=>(r||document).querySelector(s);
function fixUtilityIcon(){var b=$('wd-utility-fab');if(b)b.innerHTML='<i class="fas fa-gear" aria-hidden="true"></i>';}
function installDeliveryPreview(){
  var page4=q('.wd-wizard-page[data-step="4"]'),page5=q('.wd-wizard-page[data-step="5"]'),preview=q('.nl-client-preview-card'),canvas=$('wd-editor-canvas'),main=$('wd-delivery-main');
  if(!page4||!page5||!preview||!canvas||!main)return;
  var shell=$('wd-delivery-preview-shell');
  if(!shell){shell=document.createElement('section');shell.id='wd-delivery-preview-shell';shell.className='wd-delivery-preview-shell';shell.innerHTML='<header><div><span>FINAL PREVIEW</span><h3>Your newsletter</h3><p>This is the message your selected audience will receive.</p></div><button type="button" id="wd-delivery-full-preview"><i class="fas fa-expand"></i><span>Full preview</span></button></header><div class="wd-delivery-preview-body" id="wd-delivery-preview-body"></div>';main.insertBefore(shell,main.firstChild);$('wd-delivery-full-preview').onclick=()=>$('nl-preview-fullscreen')?.click();}
  var body=$('wd-delivery-preview-body');
  function sync(){
    if(!page5.hidden){
      shell.hidden=false;
      if(preview.parentNode!==body)body.appendChild(preview);
      preview.hidden=false;
      requestAnimationFrame(function(){ $('nl-preview-tab-open')?.click(); window.WDBroadcastV5?.previewDevice?.('desktop'); });
    }else{
      shell.hidden=true;
      if(!page4.hidden&&preview.parentNode!==canvas)canvas.appendChild(preview);
    }
  }
  new MutationObserver(sync).observe(page4,{attributes:true,attributeFilter:['hidden']});
  new MutationObserver(sync).observe(page5,{attributes:true,attributeFilter:['hidden']});
  sync();
}
function keepConnectionsInteractive(){var d=$('wd-utility-drawer');if(d)d.setAttribute('aria-modal','true');}
function boot(){var tries=0,t=setInterval(function(){tries++;if($('wd-bcast-wizard')){clearInterval(t);fixUtilityIcon();keepConnectionsInteractive();installDeliveryPreview();return;}if(tries>50)clearInterval(t);},120);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
