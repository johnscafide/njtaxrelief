/* Watchdog Postcard Studio (/marketing-studio/postcards).
   One page, six steps: audience -> PostcardMania editor -> return address ->
   proof -> price and pay -> tracking. All PostcardMania calls go through the
   pcm-postcard-studio edge function under the agent's own PCM child account.
   Prices come from the server quote; paying only opens Stripe Checkout. */
(()=>{'use strict';
const qs=(s,r=document)=>r.querySelector(s);
const qsa=(s,r=document)=>Array.from(r.querySelectorAll(s));
const money=c=>'$'+(Number(c||0)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const safe=(e,c)=>window.WatchdogAgentSafety?window.WatchdogAgentSafety.friendlyError(e,c):(e&&e.message)||'Something went wrong. Please try again.';
const W=window.WatchdogAgentWorkspace,route=W&&W.route?W.route:(p=>'/property'+p);
const PCM_ORIGIN='https://portal.pcmintegrations.com';
const STATUS={submitted:'Sent to print',pending:'Waiting to print',processing:'Printing',mailed:'In the mail',delivered:'Delivered',completed:'Delivered',canceled:'Canceled',failed:'Needs attention',awaiting_live_enable:'Paid, waiting for mail launch',awaiting_provider_credentials:'Paid, waiting for mail launch',queued:'Queued',submitting:'Sending'};

let client,campaigns=[],campaignId='',st=null,editorDesign='',quote=null;

function toast(m){const n=qs('#pl-toast');if(!n)return;n.textContent=m;n.style.display='block';clearTimeout(window.__ps);window.__ps=setTimeout(()=>n.style.display='none',4200)}
function fill(key,text){qsa(`[data-f="${key}"]`).forEach(n=>n.textContent=text)}
function show(sel,on){const n=qs(sel);if(n)n.hidden=!on}
function stepState(step,state,label){const li=qs(`.ps-step[data-step="${step}"]`);if(!li)return;li.dataset.status=state;const pill=qs('[data-state]',li);if(pill)pill.textContent=label}
async function busy(btn,fn){if(btn){btn.disabled=true;btn.setAttribute('aria-busy','true')}try{return await fn()}catch(e){toast(await message(e));return null}finally{if(btn){btn.disabled=false;btn.removeAttribute('aria-busy')}}}
async function message(e){try{const b=await e?.context?.json?.();if(b?.error)return b.error}catch(_){}return safe(e,'postcard-studio')}
async function studio(action,extra={}){const r=await client.functions.invoke('pcm-postcard-studio',{body:{action,campaign_id:campaignId,...extra}});if(r.error)throw r.error;return r.data}

function paintCampaigns(){
  const sel=qs('#ps-campaign');sel.replaceChildren();
  // content-architecture: dynamic, one option per saved audience, labeled with its live home count.
  campaigns.forEach(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=`${c.name||'Untitled'} · ${Number(c.audience_count||0).toLocaleString()} homes`;sel.append(o)});
  show('#ps-no-campaigns',!campaigns.length);sel.disabled=!campaigns.length;
  if(campaigns.length){const want=new URLSearchParams(location.search).get('campaign');campaignId=campaigns.some(c=>c.id===want)?want:campaigns[0].id;sel.value=campaignId}
}

function paint(){
  if(!st)return;
  // content-architecture: dynamic, environment and credit come from the live PCM connection and the agent's credit ledger.
  fill('env',st.environment==='live'?'Live printing':'Sandbox · nothing is printed');
  qs('[data-f="env"]').classList.toggle('live',st.environment==='live');
  const credit=qs('[data-f="credit"]');credit.hidden=!st.mail_credit_cents;credit.textContent=`${money(st.mail_credit_cents)} mail credit`;

  const valid=Number(st.recipients?.valid||0),total=Number(st.recipients?.total||0);
  fill('valid',valid.toLocaleString());fill('total',total.toLocaleString());
  const audienceOk=valid>=50;stepState('audience',audienceOk?'done':'todo',audienceOk?'Ready':valid?'Need 50+':'To do');

  const design=st.design;show('#ps-design-line',Boolean(design));
  fill('designId',design?`#${design.design_id}`:'');fill('editorLabel',design?'Edit postcard':'Open postcard editor');
  stepState('design',design?'done':'todo',design?'Saved':'To do');

  const ra=st.return_address,form=qs('#ps-ra-form');
  if(ra&&!form.dataset.touched)['company','address','address2','city','state','zipCode'].forEach(k=>{form.elements[k].value=ra[k]||''});
  else if(!ra&&st.brokerage_name&&!form.elements.company.value)form.elements.company.value=st.brokerage_name;
  stepState('return',ra?'done':'todo',ra?'Saved':'To do');

  const proof=st.proof,approved=st.proof_review?.status==='approved'&&proof&&String(st.proof_review.design_id)===String(design?.design_id);
  ['front','back'].forEach(side=>{const a=qs(`#ps-proof-${side}`);a.hidden=!proof?.[side];if(proof?.[side])a.href=proof[side]});
  show('#ps-proof-check',Boolean(proof)&&!approved);show('#ps-proof-approve',Boolean(proof)&&!approved);show('#ps-proof-approved',approved);
  fill('proofLabel',proof?'Make a new proof':'Make a proof');
  qs('#ps-proof-make').disabled=!design||!ra;
  stepState('proof',approved?'done':'todo',approved?'Approved':proof?'Review it':'To do');

  const order=st.order,ordered=order&&!['canceled','failed'].includes(order.status);
  const ready=audienceOk&&design&&ra&&approved&&!ordered;
  qs('#ps-quote').disabled=!ready;show('#ps-quote',!ordered);if(!ready){quote=null;show('#ps-quote-box',false);show('#ps-pay',false)}
  stepState('pay',ordered?'done':ready?'todo':'wait',ordered?'Paid':ready?'Ready':'Waiting');

  fill('orderStatus',order?(STATUS[order.status]||order.status):'Not ordered yet');
  show('#ps-order-line',Boolean(order?.order_id));fill('orderId',order?.order_id?`#${order.order_id}`:'');fill('orderCount',Number(order?.recipient_count||0).toLocaleString());
  const und=order?.undeliverable;show('#ps-undeliverable',Boolean(und?.undeliverable));
  if(und?.undeliverable)fill('undeliverable',`${Number(und.undeliverable).toLocaleString()} addresses could not be mailed. ${money(und.credited)} went to your mail credit.`);
  show('#ps-cancel',Boolean(order?.cancelable));show('#ps-cancel-note',Boolean(order?.cancelable));
  if(order?.cancel_deadline)fill('deadline',new Date(order.cancel_deadline).toLocaleString('en-US',{timeZone:'America/New_York',weekday:'short',hour:'numeric',minute:'2-digit'})+' ET');
  stepState('track',order?(order.status==='canceled'?'wait':'done'):'wait',order?(STATUS[order.status]||order.status):'Waiting');

  // Design is locked once the order is paid and sent.
  qs('#ps-open-editor').disabled=Boolean(ordered);
}

async function refresh(){if(!campaignId){paint();return}st=await studio('status');paint()}

async function prepare(){
  await busy(qs('#ps-prepare'),async()=>{const r=await client.rpc('marketing_prepare_direct_mail_recipients',{p_campaign_id:campaignId});if(r.error)throw r.error;await refresh();toast(`${Number(st?.recipients?.valid||0).toLocaleString()} addresses ready to mail.`)});
}

async function openEditor(){
  await busy(qs('#ps-open-editor'),async()=>{
    const r=await studio('editor');editorDesign=String(r.design_id||'');
    const frame=qs('#ps-frame');frame.src=r.url;qs('#ps-editor').showModal();
  });
}
async function saveDesign(id){
  const designId=String(id||editorDesign||'');if(!/^\d+$/.test(designId)){toast('Save your design in the editor first.');return}
  await busy(qs('#ps-editor-save'),async()=>{await studio('save_design',{design_id:designId});closeEditor();await refresh();toast('Design saved. Next, check the return address and make a proof.')});
}
function closeEditor(){const d=qs('#ps-editor');if(d.open)d.close();qs('#ps-frame').src='about:blank'}
// PostcardMania's embedded editor posts the design ID back to the page when the agent saves.
function onEditorMessage(e){
  if(e.origin!==PCM_ORIGIN)return;
  let data=e.data;if(typeof data==='string'){try{data=JSON.parse(data)}catch(_){return}}
  const id=data&&(data.designID??data.designId??data.DesignID??data?.data?.designID);
  if(id!==undefined&&id!==null&&/^\d+$/.test(String(id))){editorDesign=String(id);saveDesign(editorDesign)}
}

async function saveReturn(e){
  e.preventDefault();const f=e.currentTarget;
  const v=Object.fromEntries(['company','address','address2','city','state','zipCode'].map(k=>[k,f.elements[k].value.trim()]));
  v.state=v.state.toUpperCase();
  await busy(qs('#ps-ra-save'),async()=>{await studio('return_address',{return_address:v});f.dataset.touched='';await refresh();toast('Return address saved.')});
}

async function makeProof(){await busy(qs('#ps-proof-make'),async()=>{await studio('proof');await refresh();toast('Proof ready. Open the front and back to check them.')})}
async function approveProof(){
  if(!qs('#ps-proof-ok').checked){toast('Check the box once you have looked over both sides.');return}
  await busy(qs('#ps-proof-approve'),async()=>{await studio('approve_proof');await refresh();toast('Proof approved.')});
}

async function getQuote(){
  await busy(qs('#ps-quote'),async()=>{
    const r=await client.rpc('marketing_direct_mail_product_quote',{p_campaign_id:campaignId,p_product_type:'postcard',p_quantity:Number(st.recipients.valid),p_size_label:'6 x 8.5',p_mail_class:'FirstClass',p_provider_key:'pcm'});
    if(r.error)throw r.error;quote=r.data;
    fill('qty',Number(quote.quantity).toLocaleString());fill('unit',money(quote.retail_unit_cents));
    show('#ps-quote-credit',Number(quote.mail_credit_applied_cents)>0);fill('qcredit','−'+money(quote.mail_credit_applied_cents));
    fill('qtotal',money(quote.retail_cents));show('#ps-quote-box',true);show('#ps-pay',true);
  });
}
async function pay(){
  if(!quote?.quote_id)return;
  await busy(qs('#ps-pay'),async()=>{const r=await client.functions.invoke('marketing-campaign-checkout',{body:{quote_id:quote.quote_id,return_to:'postcards'}});if(r.error)throw r.error;if(!r.data?.url)throw new Error('Checkout did not open.');location.href=r.data.url});
}
async function cancelOrder(){
  if(!window.confirm('Cancel this postcard order? The full amount comes back as mail credit.'))return;
  await busy(qs('#ps-cancel'),async()=>{const r=await studio('cancel');await refresh();toast(`Order canceled. ${money(r.credit_cents)} added to your mail credit.`)});
}

function wire(root){
  qsa('[data-route]',root).forEach(a=>{a.href=route(a.dataset.route)});
  qs('#ps-campaign',root).addEventListener('change',async e=>{campaignId=e.target.value;quote=null;const u=new URL(location.href);u.searchParams.set('campaign',campaignId);history.replaceState(null,'',u);await busy(null,refresh)});
  qs('#ps-prepare',root).addEventListener('click',prepare);
  qs('#ps-open-editor',root).addEventListener('click',openEditor);
  qs('#ps-editor-save',root).addEventListener('click',()=>saveDesign());
  qs('#ps-editor-close',root).addEventListener('click',closeEditor);
  qs('#ps-editor',root).addEventListener('cancel',()=>{qs('#ps-frame').src='about:blank'});
  const form=qs('#ps-ra-form',root);form.addEventListener('submit',saveReturn);form.addEventListener('input',()=>{form.dataset.touched='1'});
  qs('#ps-proof-make',root).addEventListener('click',makeProof);
  qs('#ps-proof-approve',root).addEventListener('click',approveProof);
  qs('#ps-quote',root).addEventListener('click',getQuote);
  qs('#ps-pay',root).addEventListener('click',pay);
  qs('#ps-cancel',root).addEventListener('click',cancelOrder);
  window.addEventListener('message',onEditorMessage);
}

async function start(ctx){
  if(!ctx?.user)throw new Error('Sign in required');
  client=window.NJPTRAccess?.client?.();if(!client)throw new Error('Watchdog data client unavailable');
  const boot=await client.rpc('marketing_studio_bootstrap');if(boot.error)throw boot.error;
  campaigns=(boot.data?.campaigns||[]).filter(c=>!['archived','deleted'].includes(String(c.status)));
  const page=qs('#ps-page').content.cloneNode(true);wire(page);qs('#ps-app').replaceChildren(page);
  paintCampaigns();await refresh();
  const paid=new URLSearchParams(location.search).get('payment');
  if(paid==='success')toast('Payment received. Your postcards go to print as soon as the payment is confirmed.');
  if(paid==='cancelled')toast('Checkout was canceled. You were not charged.');
}
const ready=window.njptrAccessReady||Promise.reject(new Error('Access info did not initialize'));
Promise.resolve(ready).then(start).catch(err=>{
  if(window.WatchdogAgentSafety)window.WatchdogAgentSafety.report('postcard-studio-start',err);
  const h=qs('#ps-app'),t=qs('#ps-fail');if(!h||!t)return;
  const box=t.content.cloneNode(true);qs('[data-f="message"]',box).textContent=safe(err,'postcard-studio-start');
  qs('[data-reload]',box).addEventListener('click',()=>location.reload());
  h.replaceChildren(box);
});
})();
