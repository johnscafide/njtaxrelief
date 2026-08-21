(function(){
'use strict';
if(window.__WD_BROADCAST_TEMPLATE_REFRESH_V8__)return;
window.__WD_BROADCAST_TEMPLATE_REFRESH_V8__=true;
var $=id=>document.getElementById(id),q=(s,r)=>(r||document).querySelector(s);
function hasStructuredContent(){return ['nl-build-headline','nl-build-intro','nl-story-1-title','nl-story-1-summary'].some(id=>String($(id)?.value||'').trim())}
function refreshPreview(){
  var content=$('nl-content');
  if(!content)return;
  var advanced=document.body.classList.contains('wd-bcast-advanced');
  var blank=!!q('.wd-blank-card.selected');
  if(!advanced&&!blank&&hasStructuredContent()&&$('nl-build-html')){
    $('nl-build-html').click();
  }else{
    content.dispatchEvent(new Event('input',{bubbles:true}));
  }
  window.setTimeout(function(){
    content.dispatchEvent(new Event('input',{bubbles:true}));
    var frame=$('nl-email-preview-frame');
    if(frame&&frame.srcdoc!==content.value)frame.srcdoc=content.value||'';
  },40);
}
function addRefreshButton(){
  var actions=q('.wd-editor-top-actions');
  if(!actions||$('wd-refresh-preview'))return;
  var b=document.createElement('button');
  b.type='button';b.id='wd-refresh-preview';
  b.innerHTML='<i class="fas fa-rotate"></i><span>Refresh preview</span>';
  b.title='Rebuild the selected Starting Point with the current content and Brand Kit';
  b.onclick=function(e){e.preventDefault();refreshPreview()};
  var full=$('wd-preview-full');actions.insertBefore(b,full||null);
}
function bindTemplateRefresh(){
  var grid=$('nl-template-grid');
  if(!grid||grid.dataset.wdRefreshBound)return false;
  grid.dataset.wdRefreshBound='1';
  grid.addEventListener('click',function(e){
    var card=e.target.closest('.nl-template-card');
    if(!card||!card.dataset.templateKey)return;
    window.setTimeout(refreshPreview,0);
  },true);
  return true;
}
function boot(){
  var tries=0,t=window.setInterval(function(){
    tries++;
    var ok=bindTemplateRefresh();
    addRefreshButton();
    if(ok&&$('wd-refresh-preview'))window.clearInterval(t);
    if(tries>80)window.clearInterval(t);
  },100);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();