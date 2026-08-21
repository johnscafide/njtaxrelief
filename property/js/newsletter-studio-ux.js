(function(){
'use strict';
if(window.__WATCHDOG_NEWSLETTER_STUDIO_UX__)return;
window.__WATCHDOG_NEWSLETTER_STUDIO_UX__=true;
var $=function(id){return document.getElementById(id);};
var initialized=false,userToggledConnections=false,timer=null;

function put(node,value){if(node&&node.textContent!==value)node.textContent=value;}
function putHtml(node,value){if(node&&node.innerHTML!==value)node.innerHTML=value;}
function statusConnected(id){
  var value=(($(id)||{}).textContent||'').trim().toLowerCase();
  return value==='connected'||value.indexOf('connected ·')===0;
}
function linkedCount(){
  var value=(($('nl-aud-linked')||{}).textContent||'0').replace(/[^0-9]/g,'');
  return Number(value||0);
}
function setNext(title,copy,label,href,icon){
  var t=$('nl-next-title'),c=$('nl-next-copy'),a=$('nl-next-action');
  put(t,title);
  put(c,copy);
  if(a){
    if(a.getAttribute('href')!==href)a.setAttribute('href',href);
    putHtml(a,'<span>'+label+'</span><i class="fas '+icon+'"></i>');
  }
}
function update(){
  var workspace=$('nl-workspace');
  if(!workspace||workspace.hidden)return;
  var crm=statusConnected('nl-crm-status');
  var kit=statusConnected('nl-kit-status');
  var linked=linkedCount();
  var panel=$('nl-connections-panel');
  var summary=$('nl-connections-summary');

  if(crm&&kit)put(summary,'CRM connected · Kit connected');
  else if(!crm&&!kit)put(summary,'BoldTrail and Kit still need setup');
  else if(!crm)put(summary,'BoldTrail still needs to be connected');
  else put(summary,'Kit still needs to be connected');

  if(panel&&!initialized){
    panel.open=!crm||!kit;
    initialized=true;
  }else if(panel&&!userToggledConnections&&(!crm||!kit)&&!panel.open){
    panel.open=true;
  }

  if(!crm){
    setNext('Connect your CRM','BoldTrail is the missing piece for this account. Connect it once and Watchdog will start the first contact sync.','Connect BoldTrail','#nl-connections-panel','fa-arrow-right');
  }else if(!kit){
    setNext('Connect your Kit account','Your CRM is ready. Add your personal Kit V4 key to unlock newsletter drafting.','Connect Kit','#nl-connections-panel','fa-arrow-right');
  }else if(linked<1){
    setNext('Match your newsletter audience','Both services are connected. Compare your existing Kit subscribers with your BoldTrail contacts before creating the first newsletter.','Match audience','#nl-audience-card','fa-users');
  }else{
    setNext('Create your newsletter',linked.toLocaleString()+' existing Kit subscribers are already linked to your CRM context. You are ready to build the next draft.','Create newsletter','#nl-compose-card','fa-pen-to-square');
  }
}
function scheduleUpdate(){
  window.clearTimeout(timer);
  timer=window.setTimeout(update,35);
}
function openConnectionsIfNeeded(e){
  var link=e.target.closest('a');
  if(!link||link.getAttribute('href')!=='#nl-connections-panel')return;
  var panel=$('nl-connections-panel');
  if(panel){panel.open=true;userToggledConnections=true;}
}
function boot(){
  var panel=$('nl-connections-panel');
  if(panel)panel.addEventListener('toggle',function(){if(initialized)userToggledConnections=true;});
  document.addEventListener('click',openConnectionsIfNeeded);
  var workspace=$('nl-workspace');
  if(workspace){
    new MutationObserver(scheduleUpdate).observe(workspace,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','class']});
  }
  update();
  window.setTimeout(update,250);
  window.setTimeout(update,1000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
