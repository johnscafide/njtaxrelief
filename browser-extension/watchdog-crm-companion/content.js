(()=>{
  'use strict';
  if(location.hostname!=='app.boldtrail.com')return;

  const visible=(el)=>!!(el&&el.getClientRects&&el.getClientRects().length)&&getComputedStyle(el).visibility!=='hidden'&&getComputedStyle(el).display!=='none';
  const text=(v)=>String(v||'').replace(/\s+/g,' ').trim();
  const key=(v)=>text(v).toLowerCase().replace(/[^a-z0-9]+/g,' ');
  const valueOf=(el)=>{if(!el)return'';if('value'in el)return text(el.value);if(el.isContentEditable)return text(el.innerText);return text(el.textContent);};
  const controlForLabel=(label)=>{if(!label)return null;const f=label.getAttribute('for');if(f){const c=document.getElementById(f);if(c&&visible(c))return c;}const own=label.querySelector('input,textarea,select,[contenteditable="true"]');if(own&&visible(own))return own;const parent=label.parentElement;return parent&&parent.querySelector('input,textarea,select,[contenteditable="true"]');};
  function candidates(){return Array.from(document.querySelectorAll('input,textarea,select,[contenteditable="true"]')).filter(visible);}
  function findField(labels){
    const wanted=labels.map(key);
    for(const label of Array.from(document.querySelectorAll('label')).filter(visible)){
      const lk=key(label.textContent);if(wanted.some(w=>lk===w||lk.includes(w))){const c=controlForLabel(label);if(c)return c;}
    }
    for(const el of candidates()){
      const meta=key([el.getAttribute('name'),el.getAttribute('id'),el.getAttribute('placeholder'),el.getAttribute('aria-label'),el.getAttribute('data-testid')].filter(Boolean).join(' '));
      if(wanted.some(w=>meta===w||meta.includes(w)))return el;
    }
    return null;
  }
  function nearbyValue(labels){
    const wanted=labels.map(key);
    const nodes=Array.from(document.querySelectorAll('label,dt,th,span,div,p,strong')).filter(visible);
    for(const node of nodes){
      const nk=key(node.textContent);if(!wanted.some(w=>nk===w||nk===`${w}:`||nk.startsWith(`${w} `)))continue;
      const parent=node.parentElement;if(!parent)continue;
      const controls=parent.querySelectorAll('input,textarea,select,[contenteditable="true"]');
      for(const c of controls)if(visible(c)&&valueOf(c))return valueOf(c);
      const kids=Array.from(parent.children).filter(x=>x!==node&&visible(x));
      for(const kid of kids){const v=valueOf(kid);if(v&&v.length<220&&key(v)!==nk)return v;}
    }
    return'';
  }
  function read(labels){const el=findField(labels);const v=valueOf(el);return v||nearbyValue(labels);}
  function scanContact(){
    const address=read(['property address','street address','mailing address','address']);
    const city=read(['city','town','municipality']);
    const state=read(['state']);
    const zip=read(['zip code','zipcode','postal code','zip']);
    const likelyNJ=!state||/^(nj|new jersey)$/i.test(state)||/\bNJ\b/i.test(address);
    if(!address||!/^\d+[A-Za-z]?(?:[- ]\d+)?\s+/.test(address)||!likelyNJ)return{ok:false,error:'address_not_found'};
    return{ok:true,contact:{address:text(address).slice(0,220),city:text(city).slice(0,80),state:text(state||'NJ').slice(0,30),zip:(text(zip).match(/\d{5}(?:-\d{4})?/)||[''])[0]}};
  }
  function nativeSet(el,value){
    if(!el)return false;
    if(el.isContentEditable){el.focus();el.textContent=value;el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:value}));el.dispatchEvent(new Event('change',{bubbles:true}));return true;}
    const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:el instanceof HTMLInputElement?HTMLInputElement.prototype:null;
    const setter=proto&&Object.getOwnPropertyDescriptor(proto,'value')?.set;
    el.focus();if(setter)setter.call(el,value);else el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true;
  }
  const fmtMoney=(v)=>Number.isFinite(Number(v))?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(v)):'';
  function fieldValue(f,keyName){
    if(keyName==='assessed_value')return fmtMoney(f.assessed_value);
    if(keyName==='annual_property_tax')return fmtMoney(f.annual_property_tax);
    if(keyName==='last_sale_price')return fmtMoney(f.last_sale_price);
    return f[keyName]===null||f[keyName]===undefined?'':String(f[keyName]);
  }
  const FIELD_LABELS={
    assessed_value:['watchdog assessment','assessed value','assessment'],
    annual_property_tax:['watchdog annual tax','annual property tax','property tax'],
    block:['watchdog block','block'],lot:['watchdog lot','lot'],property_class:['watchdog property class','property class'],
    year_built:['watchdog year built','year built'],last_sale_price:['watchdog last sale price','last sale price'],last_sale_year:['watchdog last sale year','last sale year']
  };
  function sourceLine(src){const label=text(src.kind||'Public record source').replace(/_/g,' ');const date=src.recorded_at?new Date(src.recorded_at).toLocaleDateString():'';return`• ${label}${date?` (${date})`:''}${src.url?` — ${src.url}`:''}`;}
  function noteBlock(payload,selected){
    const f=payload.facts||{},lines=['WATCHDOG VERIFIED PROPERTY — public-record research'];
    lines.push(`Property: ${[f.address,f.municipality,'NJ',f.zip].filter(Boolean).join(', ')}`);
    if(selected.includes('assessed_value')&&f.assessed_value!=null)lines.push(`Assessment: ${fmtMoney(f.assessed_value)}`);
    if(selected.includes('annual_property_tax')&&f.annual_property_tax!=null)lines.push(`Annual property tax: ${fmtMoney(f.annual_property_tax)}`);
    if((selected.includes('block')||selected.includes('lot'))&&(f.block||f.lot))lines.push(`Block / Lot: ${[f.block,f.lot].filter(Boolean).join(' / ')}`);
    if(selected.includes('property_class')&&f.property_class)lines.push(`Property class: ${f.property_class}`);
    if(selected.includes('year_built')&&f.year_built)lines.push(`Year built: ${f.year_built}`);
    if(selected.includes('last_sale_price')&&f.last_sale_price!=null)lines.push(`Last sale: ${fmtMoney(f.last_sale_price)}${f.last_sale_year?` (${f.last_sale_year})`:''}`);
    if((payload.sources||[]).length){lines.push('Sources:');(payload.sources||[]).slice(0,5).forEach(src=>lines.push(sourceLine(src)));}else if(payload.source_summary)lines.push(`Source: ${payload.source_summary}`);
    if(f.last_verified)lines.push(`Watchdog warehouse last verified: ${new Date(f.last_verified).toLocaleDateString()}`);
    lines.push(payload.limitation||'Research context only. No ownership, seller-intent, demographic, title, or appraisal inference.');
    return lines.join('\n');
  }
  function notesField(){return findField(['contact notes','notes','note','comments']);}
  function applyProperty(payload){
    const selected=Array.isArray(payload?.selected)?payload.selected:[];const f=payload?.facts||{};const skipped=[],written=[];
    for(const keyName of selected){
      if(keyName==='source_note'||!FIELD_LABELS[keyName])continue;
      const value=fieldValue(f,keyName);if(!value)continue;const el=findField(FIELD_LABELS[keyName]);if(!el)continue;
      const current=valueOf(el);if(current&&current!==value){skipped.push(keyName);continue;}if(nativeSet(el,value))written.push(keyName);
    }
    let noteWritten=false;
    if(selected.includes('source_note')){
      const notes=notesField();if(notes){const block=noteBlock(payload,selected),current=valueOf(notes);if(!current.includes('WATCHDOG VERIFIED PROPERTY')){nativeSet(notes,current?`${current}\n\n${block}`:block);noteWritten=true;}else skipped.push('source_note');}
    }
    if(!written.length&&!noteWritten)return{ok:false,error:'no_safe_write_target',skipped};
    return{ok:true,mode:noteWritten?(written.length?'custom_fields_and_note':'note'):'custom_fields',written,skipped,note_written:noteWritten};
  }
  chrome.runtime.onMessage.addListener((message,_sender,sendResponse)=>{
    try{
      if(message?.type==='WATCHDOG_SCAN_CONTACT'){sendResponse(scanContact());return;}
      if(message?.type==='WATCHDOG_APPLY_PROPERTY'){sendResponse(applyProperty(message.payload||{}));return;}
    }catch(error){sendResponse({ok:false,error:'adapter_failed'});}
  });
})();
