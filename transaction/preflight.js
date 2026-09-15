(function(){
'use strict';
if(window.__WATCHDOG_TRANSACTION_AUTO_PREFLIGHT__)return;window.__WATCHDOG_TRANSACTION_AUTO_PREFLIGHT__=true;
const pending=new Set();let timer=null,client=null,flushBusy=false;
const clean=v=>String(v||'').trim();
function toast(message,type){const n=document.querySelector('#tx-toast');if(!n)return;n.textContent=message;n.className='tx-toast show '+(type||'');setTimeout(()=>{if(n.textContent===message)n.className='tx-toast'},3200)}
function getClient(){if(client)return client;try{client=window.NJPTRSupabaseRuntime&&window.NJPTRSupabaseRuntime.createClient?window.NJPTRSupabaseRuntime.createClient():null}catch(e){console.warn('Transaction preflight client unavailable',e)}return client}
function schedule(ids,delay){(ids||[]).map(clean).filter(Boolean).forEach(id=>pending.add(id));clearTimeout(timer);timer=setTimeout(flush,delay||900)}
async function flush(){if(flushBusy||!pending.size)return;const c=getClient();if(!c)return;flushBusy=true;const ids=[...pending].slice(0,50);ids.forEach(id=>pending.delete(id));try{const r=await c.functions.invoke('transaction-auto-check',{body:{transaction_ids:ids}});if(r.error)throw r.error;const active=document.querySelector('.tx-list-card.active');if(active&&ids.includes(active.dataset.txId))setTimeout(()=>active.click(),50);document.dispatchEvent(new CustomEvent('watchdog:transaction-preflight-complete',{detail:r.data||{}}))}catch(e){console.error('Automatic transaction preflight failed',e);toast('Transaction saved, but automatic source checks need a retry.','error')}finally{flushBusy=false;if(pending.size)schedule([],250)}}

const nativeFetch=window.fetch.bind(window);
window.fetch=async function(input,init){
  const response=await nativeFetch(input,init);try{
    const url=typeof input==='string'?input:(input&&input.url)||'';
    const method=String((init&&init.method)||(input&&input.method)||'GET').toUpperCase();
    if(/\/rest\/v1\/transaction_workspaces(?:\?|$)/.test(url)&&['POST','PATCH'].includes(method)&&response.ok){
      let shouldQueue=method==='POST';
      if(method==='PATCH'){
        let raw='';try{raw=typeof init?.body==='string'?init.body:''}catch{}
        if(raw){try{const body=JSON.parse(raw);shouldQueue=Object.prototype.hasOwnProperty.call(body,'address')||Object.prototype.hasOwnProperty.call(body,'pams_pin')}catch{}}
      }
      if(shouldQueue){const data=await response.clone().json().catch(()=>null),rows=Array.isArray(data)?data:data?[data]:[];const ids=rows.map(r=>r&&r.id).filter(Boolean);if(ids.length)schedule(ids,1200)}
    }
  }catch(e){console.warn('Transaction preflight hook skipped',e)}return response
};

document.addEventListener('click',function(e){
  const button=e.target&&e.target.closest&&e.target.closest('#tx-run-review');if(!button)return;
  const active=document.querySelector('.tx-list-card.active');const id=active&&active.dataset.txId;if(!id)return;
  e.preventDefault();e.stopPropagation();if(e.stopImmediatePropagation)e.stopImmediatePropagation();
  button.disabled=true;button.innerHTML='<i class="fas fa-circle-notch fa-spin"></i> Checking sources';
  const done=()=>{button.disabled=false;button.innerHTML='<i class="fas fa-rotate"></i> Refresh preflight'};
  const handler=()=>{document.removeEventListener('watchdog:transaction-preflight-complete',handler);done();toast('Watchdog transaction preflight refreshed.','success')};
  document.addEventListener('watchdog:transaction-preflight-complete',handler,{once:true});schedule([id],0);setTimeout(done,15000);
},true);

async function checkExisting(){const c=getClient();if(!c)return;try{const auth=await c.auth.getUser();if(!auth?.data?.user)return;const r=await c.from('transaction_workspaces').select('id').eq('user_id',auth.data.user.id).is('last_watch_at',null).order('created_at',{ascending:false}).limit(50);if(!r.error&&r.data?.length)schedule(r.data.map(x=>x.id),500)}catch(e){console.warn('Existing transaction preflight scan skipped',e)}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',checkExisting,{once:true});else checkExisting();
})();
