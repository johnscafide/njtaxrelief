/* Property Home · Watchdog Intelligence
   Visible Voice entry for every signed-in plan, server-authoritative entitlement
   gating on click, Intelligence branding, and Explore workspace polish. */
(function(){
'use strict';
if(window.__WATCHDOG_HOME_INTELLIGENCE__)return;
window.__WATCHDOG_HOME_INTELLIGENCE__=true;

var mountTimer=0;
var client=null;
var depsPromise=null;

function addStyle(href,key){
  if(document.querySelector('link[data-wd-intelligence="'+key+'"]'))return;
  var link=document.createElement('link');
  link.rel='stylesheet';
  link.href=href;
  link.setAttribute('data-wd-intelligence',key);
  document.head.appendChild(link);
}
function loadScript(src,key){
  return new Promise(function(resolve,reject){
    var found=document.querySelector('script[data-wd-intelligence="'+key+'"]');
    if(found){
      if(found.getAttribute('data-ready')==='1')return resolve();
      found.addEventListener('load',resolve,{once:true});
      found.addEventListener('error',reject,{once:true});
      return;
    }
    var script=document.createElement('script');
    script.src=src;
    script.async=false;
    script.setAttribute('data-wd-intelligence',key);
    script.addEventListener('load',function(){script.setAttribute('data-ready','1');resolve()},{once:true});
    script.addEventListener('error',reject,{once:true});
    document.body.appendChild(script);
  });
}
function ensureStyles(){
  addStyle('/property/css/home/home-watchdog-intelligence.css','home');
  addStyle('/property/css/data-workbench-analyst.css','analyst');
  addStyle('/property/css/watchdog-contextual-voice.css','voice-entry');
  addStyle('/property/css/watchdog-intelligence-voice.css','voice');
}
function ensureVoiceDeps(){
  if(window.WatchdogContextualAnalyst && window.WatchdogIntelligenceVoice)return Promise.resolve();
  if(depsPromise)return depsPromise;
  depsPromise=loadScript('/property/js/watchdog-contextual-analyst.js','analyst-js')
    .then(function(){return loadScript('/property/js/watchdog-intelligence-voice.js','voice-js')})
    .then(function(){return loadScript('/property/js/watchdog-intelligence-voice-browser.js','voice-browser-js')});
  return depsPromise;
}
function getClient(){
  if(client)return client;
  try{
    if(window.NJPTRSupabaseRuntime && typeof window.NJPTRSupabaseRuntime.createClient==='function'){
      client=window.NJPTRSupabaseRuntime.createClient();
    }
  }catch(_error){}
  return client;
}
async function accessToken(){
  var sb=getClient();
  if(!sb || !sb.auth || typeof sb.auth.getSession!=='function')return '';
  try{
    var result=await sb.auth.getSession();
    return String(result && result.data && result.data.session && result.data.session.access_token || '');
  }catch(_error){return ''}
}
async function voiceStatus(){
  var token=await accessToken();
  if(!token)return {ok:false,http_status:401,error:'Sign in required.'};
  try{
    var response=await fetch('/api/watchdog-intelligence-voice',{
      method:'POST',
      credentials:'same-origin',
      headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({action:'status'})
    });
    var data={};
    try{data=await response.json()}catch(_error){}
    data.http_status=response.status;
    return data;
  }catch(_error){
    return {ok:false,http_status:0,error:'Watchdog Intelligence Voice could not be reached.'};
  }
}
function propertyContext(){
  var select=document.getElementById('hm-switch');
  var chosen=select && select.selectedOptions && select.selectedOptions[0];
  var pin=select ? String(select.value || '') : '';
  if(!pin){
    try{pin=new URLSearchParams(location.search).get('pin') || ''}catch(_error){}
  }
  var addressNode=document.querySelector('#hm-body .hm-id h1, #hm-body [data-property-address], #hm-body .hm-property-address');
  var address=addressNode ? String(addressNode.textContent || '').trim() : '';
  if(!address && chosen)address=String(chosen.textContent || '').split('·')[0].trim();
  var townNode=document.querySelector('#hm-body .hm-id .hm-place, #hm-body .hm-id p');
  var town=townNode ? String(townNode.textContent || '').trim() : '';
  return {pams_pin:pin,address:address,town:town};
}
function gateMarkup(){
  return '<div class="wd-intelligence-gate" id="wd-intelligence-gate" aria-hidden="true">'+
    '<section class="wd-intelligence-gate-card" role="dialog" aria-modal="true" aria-labelledby="wd-intelligence-gate-title">'+
      '<button class="wd-intelligence-gate-close" type="button" data-wd-intelligence-close aria-label="Close"><i class="fas fa-xmark"></i></button>'+
      '<div class="wd-intelligence-gate-mark"><i class="fas fa-microphone-lines"></i></div>'+
      '<span class="wd-intelligence-gate-kicker">Watchdog Intelligence · Voice</span>'+
      '<h2 id="wd-intelligence-gate-title">Watchdog Intelligence Voice</h2>'+
      '<p id="wd-intelligence-gate-copy"></p>'+
      '<div class="wd-intelligence-gate-actions" id="wd-intelligence-gate-actions"></div>'+
    '</section>'+
  '</div>';
}
function ensureGate(){
  var gate=document.getElementById('wd-intelligence-gate');
  if(gate)return gate;
  var box=document.createElement('div');
  box.innerHTML=gateMarkup();
  gate=box.firstElementChild;
  document.body.appendChild(gate);
  gate.addEventListener('click',function(event){
    if(event.target===gate || event.target.closest('[data-wd-intelligence-close]'))closeGate();
  });
  document.addEventListener('keydown',function(event){if(event.key==='Escape')closeGate()});
  return gate;
}
function closeGate(){
  var gate=document.getElementById('wd-intelligence-gate');
  if(!gate)return;
  gate.classList.remove('open');
  gate.setAttribute('aria-hidden','true');
}
function showGate(status){
  var gate=ensureGate();
  var title=gate.querySelector('#wd-intelligence-gate-title');
  var copy=gate.querySelector('#wd-intelligence-gate-copy');
  var actions=gate.querySelector('#wd-intelligence-gate-actions');
  var plan=String(status && status.plan || 'standard').toLowerCase();
  var unavailable=status && status.ok && status.eligible && !status.enabled;
  if(status && status.http_status===401){
    title.textContent='Sign in to use Watchdog Intelligence Voice';
    copy.textContent='Voice uses your saved-property context and is available only inside an authenticated Watchdog workspace.';
    actions.innerHTML='<a class="wd-intelligence-gate-primary" href="/property/account">Open account</a><button class="wd-intelligence-gate-secondary" type="button" data-wd-intelligence-close>Not now</button>';
  }else if(unavailable){
    title.textContent='Voice is temporarily unavailable';
    copy.textContent='Your account is eligible for Watchdog Intelligence Voice, but the Voice service is not available right now. Your property data and other Watchdog Intelligence tools are unaffected.';
    actions.innerHTML='<button class="wd-intelligence-gate-primary" type="button" data-wd-intelligence-close>Got it</button>';
  }else{
    title.textContent='Watchdog Intelligence Voice is a premium capability';
    if(plan==='agent' || plan==='pro'){
      copy.textContent='Your '+(plan==='agent'?'Agent':'Pro')+' plan can use Voice when the Watchdog Intelligence add-on is active. Voice is included with Pro+ and Teams.';
    }else{
      copy.textContent='Watchdog Intelligence Voice is included with Pro+ and Teams. Agent and Pro accounts can use it with the Watchdog Intelligence add-on.';
    }
    actions.innerHTML='<a class="wd-intelligence-gate-primary" href="/property/pro#plans">See Intelligence access</a><button class="wd-intelligence-gate-secondary" type="button" data-wd-intelligence-close>Not now</button>';
  }
  gate.classList.add('open');
  gate.setAttribute('aria-hidden','false');
  var close=gate.querySelector('.wd-intelligence-gate-close');
  if(close)close.focus();
}
function voiceMarkup(){
  return '<section class="wd-home-voice-entry wd-intelligence-frame" id="wd-home-voice-entry" aria-label="Watchdog Intelligence Voice">'+
    '<div class="wd-home-voice-copy">'+
      '<span class="wd-home-voice-kicker">Watchdog Intelligence · Voice</span>'+
      '<h2 class="wd-home-voice-title">Ask about what needs attention now.</h2>'+
      '<p class="wd-home-voice-sub">Uses this saved property’s governed context so you can ask a focused question without starting over.</p>'+
    '</div>'+
    '<button class="wd-home-voice-button" id="wd-home-voice-button" type="button"><i class="fas fa-microphone"></i><span>Ask Watchdog</span></button>'+
  '</section>';
}
async function openVoice(){
  var button=document.getElementById('wd-home-voice-button');
  if(!button || button.getAttribute('aria-busy')==='true')return;
  button.setAttribute('aria-busy','true');
  var original=button.innerHTML;
  button.innerHTML='<i class="fas fa-circle-notch fa-spin"></i><span>Checking access</span>';
  try{
    var status=await voiceStatus();
    if(!status || !status.ok || !status.eligible || !status.enabled){
      showGate(status || {});
      return;
    }
    await ensureVoiceDeps();
    if(!window.WatchdogContextualAnalyst || typeof window.WatchdogContextualAnalyst.open!=='function')throw new Error('Analyst unavailable');
    var property=propertyContext();
    window.WatchdogContextualAnalyst.open({
      surface:'property_home',
      title:'Ask Watchdog Intelligence',
      kicker:'WATCHDOG INTELLIGENCE',
      intro:'Ask a focused question about this saved property. Watchdog will keep the current governed property context attached to the conversation.',
      context:property,
      record:property,
      chips:['What needs attention now?','What changed?','Explain the tax and value story','What should I verify next?']
    });
  }catch(_error){
    showGate({ok:true,eligible:true,enabled:false});
  }finally{
    button.innerHTML=original;
    button.removeAttribute('aria-busy');
  }
}
function mountVoice(panel){
  if(document.getElementById('wd-home-voice-entry'))return;
  var box=document.createElement('div');
  box.innerHTML=voiceMarkup();
  var entry=box.firstElementChild;
  panel.parentNode.insertBefore(entry,panel);
  var button=entry.querySelector('#wd-home-voice-button');
  if(button)button.addEventListener('click',openVoice);
}
function rebrandIntelligence(panel){
  var main=panel.querySelector(':scope > .wdai-main');
  if(main)main.classList.add('wd-intelligence-frame');
  var brand=panel.querySelector('.wdai-title > span');
  if(brand && String(brand.textContent || '').trim()!=='WATCHDOG INTELLIGENCE')brand.textContent='WATCHDOG INTELLIGENCE';
  var roleLine=panel.querySelector('.wdai-role-set span');
  if(roleLine){
    Array.prototype.slice.call(roleLine.childNodes).forEach(function(node){
      if(node.nodeType===3 && /Profession-aware Intel/.test(node.nodeValue || ''))node.nodeValue=(node.nodeValue || '').replace('Profession-aware Intel','Profession-aware Intelligence');
    });
  }
  var mobile=document.getElementById('hm-mobile-intel-overlay');
  if(mobile){
    var sheet=mobile.querySelector('[aria-labelledby]');
    var close=mobile.querySelector('.mobile-intel-close');
    if(sheet)sheet.setAttribute('aria-label','Watchdog Intelligence');
    if(close)close.setAttribute('aria-label','Close Watchdog Intelligence');
  }
}
function mountExplore(){
  var header=document.querySelector('#hm-body .hm-secbar');
  if(!header || header.closest('.hm-explore-card'))return;
  var rows=[];
  var node=header.nextElementSibling;
  while(node && node.classList && node.classList.contains('sec2')){
    rows.push(node);
    node=node.nextElementSibling;
  }
  if(!rows.length)return;
  var parent=header.parentNode;
  var wrap=document.createElement('section');
  wrap.className='hm-explore-card';
  wrap.setAttribute('aria-label','Explore your property');
  parent.insertBefore(wrap,header);
  wrap.appendChild(header);
  rows.forEach(function(row){wrap.appendChild(row)});
}
function mount(){
  ensureStyles();
  var panel=document.querySelector('#hm-body .ai.wdai[data-watchdog-analyst-intel]');
  if(panel){
    rebrandIntelligence(panel);
    mountVoice(panel);
  }
  mountExplore();
}
function schedule(){clearTimeout(mountTimer);mountTimer=setTimeout(mount,90)}
function boot(){
  ensureStyles();
  ensureGate();
  mount();
  var body=document.getElementById('hm-body');
  if(body)new MutationObserver(schedule).observe(body,{childList:true,subtree:true});
  ['watchdog:intent-ready','watchdog:intent-updated','watchdog:context-refresh','watchdog:profession-updated'].forEach(function(name){window.addEventListener(name,schedule)});
}

window.WatchdogHomeIntelligence={mount:mount,openVoice:openVoice};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
