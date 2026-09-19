'use strict';

const API='https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/watchdog-crm-companion';
const VERSION='0.3.0';
const CONNECT_URL='https://watchdogindex.com/agent/extension/connect/';

const storageGet=(keys)=>new Promise(resolve=>chrome.storage.local.get(keys,resolve));
const storageSet=(value)=>new Promise(resolve=>chrome.storage.local.set(value,resolve));
const storageRemove=(keys)=>new Promise(resolve=>chrome.storage.local.remove(keys,resolve));
const sendTab=(tabId,message)=>new Promise((resolve,reject)=>{
  chrome.tabs.sendMessage(tabId,message,response=>{
    if(chrome.runtime.lastError)reject(new Error(chrome.runtime.lastError.message));
    else resolve(response);
  });
});
const browserFamily=()=>/Edg\//.test(navigator.userAgent)?'edge':'chrome';

async function api(action,payload={},withToken=true){
  const saved=await storageGet(['wdc_token']);
  const token=saved.wdc_token||null;
  const headers={'Content-Type':'application/json','X-Watchdog-Extension-Version':VERSION};
  if(withToken&&token)headers['X-Watchdog-Extension-Token']=token;
  const res=await fetch(API,{method:'POST',headers,body:JSON.stringify({action,extension_version:VERSION,...payload})});
  let data={};try{data=await res.json();}catch(_){data={error:'invalid_response'};}
  if(!res.ok){const error=new Error(data.error||`http_${res.status}`);error.status=res.status;error.data=data;throw error;}
  return data;
}
function randomSecret(){
  const bytes=crypto.getRandomValues(new Uint8Array(32));let s='';
  bytes.forEach(b=>s+=String.fromCharCode(b));
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
}
async function sha256(value){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function beginConnect(){
  const device_id=crypto.randomUUID(),device_secret=randomSecret(),challenge=await sha256(device_secret);
  const pairing={device_id,device_secret,created_at:Date.now()};
  await storageSet({wdc_pairing:pairing});
  const url=new URL(CONNECT_URL);url.searchParams.set('device_id',device_id);url.searchParams.set('challenge',challenge);url.searchParams.set('version',VERSION);
  await chrome.tabs.create({url:url.toString()});
  return{ok:true,pairing:true};
}
async function claimPairing(){
  const saved=await storageGet(['wdc_pairing']);const pairing=saved.wdc_pairing||null;
  if(!pairing)return{ok:false,error:'no_pairing'};
  const data=await api('pair.claim',{device_id:pairing.device_id,device_secret:pairing.device_secret,browser:browserFamily()},false);
  await storageSet({wdc_token:data.token,wdc_plan:data.plan,wdc_expires_at:data.expires_at});
  await storageRemove(['wdc_pairing']);
  return{ok:true,connected:true,plan:data.plan,expires_at:data.expires_at};
}
async function sessionState(){
  const saved=await storageGet(['wdc_token','wdc_plan','wdc_pairing','wdc_expires_at']);
  if(!saved.wdc_token)return{ok:true,connected:false,pairing:!!saved.wdc_pairing,plan:saved.wdc_plan||null};
  try{
    const data=await api('session.status');
    await storageSet({wdc_plan:data.plan,wdc_expires_at:data.expires_at});
    return{ok:true,connected:true,plan:data.plan,expires_at:data.expires_at};
  }catch(error){
    if(['not_connected','session_expired','paid_plan_required'].includes(error.message)){
      await storageRemove(['wdc_token','wdc_plan','wdc_expires_at']);
      return{ok:true,connected:false,pairing:!!saved.wdc_pairing,error:error.message};
    }
    throw error;
  }
}
async function disconnect(){
  try{await api('session.disconnect');}catch(_){}
  await storageRemove(['wdc_token','wdc_plan','wdc_expires_at','wdc_pairing']);
  return{ok:true};
}

chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  (async()=>{
    const type=message?.type||'';
    if(type==='WDC_SESSION_STATE')return sessionState();
    if(type==='WDC_BEGIN_CONNECT')return beginConnect();
    if(type==='WDC_CLAIM_PAIRING')return claimPairing();
    if(type==='WDC_DISCONNECT')return disconnect();
    if(type==='WDC_API')return api(message.action,message.payload||{},message.withToken!==false);
    if(type==='WDC_SCAN_LOCAL'){
      if(!sender.tab?.id)throw new Error('tab_unavailable');
      return sendTab(sender.tab.id,{type:'WATCHDOG_SCAN_CONTACT'});
    }
    if(type==='WDC_APPLY_PROPERTY'){
      if(!sender.tab?.id)throw new Error('tab_unavailable');
      return sendTab(sender.tab.id,{type:'WATCHDOG_APPLY_PROPERTY_V021',payload:message.payload||{}});
    }
    if(type==='WDC_OPEN_URL'){
      const url=String(message.url||'');if(!/^https:\/\//i.test(url))throw new Error('invalid_url');
      await chrome.tabs.create({url});return{ok:true};
    }
    if(type==='WDC_OPEN_PACKET'){
      const packet=message.packet&&typeof message.packet==='object'?message.packet:null;
      if(!packet)throw new Error('packet_missing');
      await storageSet({wdc_last_municipal_packet:packet});
      await chrome.tabs.create({url:chrome.runtime.getURL('municipal-packet.html')});
      return{ok:true};
    }
    return{ok:false,error:'unknown_message'};
  })().then(sendResponse).catch(error=>sendResponse({ok:false,error:error?.message||'request_failed',status:error?.status||0,data:error?.data||null}));
  return true;
});
