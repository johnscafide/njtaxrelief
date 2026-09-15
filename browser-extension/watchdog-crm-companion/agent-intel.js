(()=>{
  'use strict';
  if(location.hostname!=='app.boldtrail.com')return;

  const text=(v)=>String(v??'').replace(/\s+/g,' ').trim();
  const key=(v)=>text(v).toLowerCase().replace(/[^a-z0-9]+/g,' ');
  const visible=(el)=>!!(el&&el.getClientRects&&el.getClientRects().length)&&getComputedStyle(el).visibility!=='hidden'&&getComputedStyle(el).display!=='none';
  const SENSITIVE_RE=/(^|\b)(first name|last name|full name|contact name|email|e mail|phone|mobile|cell|telephone)(\b|$)/i;

  const LABELS={
    watchdog_score:['watchdog score'],
    assessed_value:['watchdog assessment','assessed value','assessment'],
    annual_property_tax:['watchdog annual tax','annual property tax','property tax'],
    effective_tax_rate:['watchdog effective tax rate','effective tax rate','tax rate'],
    land_value:['watchdog land value','land value'],
    improvement_value:['watchdog improvement value','improvement value'],
    property_class:['watchdog property class','property class'],
    year_built:['watchdog year built','year built'],
    dwelling_units:['watchdog dwelling units','dwelling units','units'],
    acres:['watchdog acreage','acreage','acres'],
    building_description:['watchdog building description','building description','building type'],
    last_sale_price:['watchdog last sale price','last sale price'],
    last_sale_year:['watchdog last sale year','last sale year'],
    block:['watchdog block','block'],
    lot:['watchdog lot','lot'],
    qualifier:['watchdog qualifier','qualifier'],
    municipality:['watchdog municipality','municipality','city','town'],
    county:['watchdog county','county'],
    zip:['watchdog zip','zip code','zipcode','postal code','zip']
  };

  const DISPLAY={
    watchdog_score:'Watchdog Score',assessed_value:'Assessment',annual_property_tax:'Annual property tax',
    effective_tax_rate:'Effective tax rate',land_value:'Land value',improvement_value:'Improvement value',
    property_class:'Property class',year_built:'Year built',dwelling_units:'Dwelling units',acres:'Acreage',
    building_description:'Building description',last_sale_price:'Last sale price',last_sale_year:'Last sale year',
    block:'Block',lot:'Lot',qualifier:'Qualifier',municipality:'Municipality',county:'County',zip:'ZIP'
  };

  const metaOf=(el)=>key([el?.getAttribute?.('name'),el?.getAttribute?.('id'),el?.getAttribute?.('placeholder'),el?.getAttribute?.('aria-label'),el?.getAttribute?.('data-testid'),el?.getAttribute?.('data-cy'),el?.getAttribute?.('data-field'),el?.getAttribute?.('data-label'),el?.getAttribute?.('title'),el?.className].filter(v=>typeof v==='string'&&v).join(' '));
  const safeControl=(el)=>!!el&&visible(el)&&!SENSITIVE_RE.test(metaOf(el));
  const valueOf=(el)=>{if(!el)return'';if('value'in el)return text(el.value);if(el.isContentEditable)return text(el.innerText);return text(el.textContent);};

  function controlForLabel(label){
    if(!label)return null;
    const f=label.getAttribute('for');
    if(f){const c=document.getElementById(f);if(safeControl(c))return c;}
    const own=label.querySelector('input,textarea,select,[contenteditable="true"]');if(safeControl(own))return own;
    const parent=label.parentElement,c=parent&&parent.querySelector('input,textarea,select,[contenteditable="true"]');
    return safeControl(c)?c:null;
  }
  function findField(labels){
    const wanted=labels.map(key);
    for(const label of Array.from(document.querySelectorAll('label')).filter(visible)){
      const lk=key(label.textContent);if(SENSITIVE_RE.test(lk))continue;
      if(wanted.some(w=>lk===w||lk.includes(w))){const c=controlForLabel(label);if(c)return c;}
    }
    for(const el of Array.from(document.querySelectorAll('input,textarea,select,[contenteditable="true"]')).filter(safeControl)){
      const meta=metaOf(el);if(wanted.some(w=>meta===w||meta.includes(w)))return el;
    }
    return null;
  }
  function nativeSet(el,value){
    if(!el)return false;
    if(el.isContentEditable){el.focus();el.textContent=value;el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:value}));el.dispatchEvent(new Event('change',{bubbles:true}));return true;}
    const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:el instanceof HTMLInputElement?HTMLInputElement.prototype:null;
    const setter=proto&&Object.getOwnPropertyDescriptor(proto,'value')?.set;
    el.focus();if(setter)setter.call(el,value);else el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true;
  }
  const money=(v)=>Number.isFinite(Number(v))?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(v)):'';
  const rate=(v)=>{const n=Number(v);if(!Number.isFinite(n))return'';const pct=Math.abs(n)<1?n*100:n;return`${pct.toFixed(3).replace(/\.?0+$/,'')}%`;};
  const score=(v)=>{const n=Number(v);if(!Number.isFinite(n))return'';return`${Math.round(n<=1?n*100:n)}/100`;};
  function fieldValue(f,k){
    if(['assessed_value','annual_property_tax','land_value','improvement_value','last_sale_price'].includes(k))return money(f[k]);
    if(k==='effective_tax_rate')return rate(f[k]);
    if(k==='watchdog_score')return score(f[k]);
    if(k==='acres')return Number.isFinite(Number(f[k]))?String(Number(f[k])):'';
    return f[k]===null||f[k]===undefined?'':String(f[k]);
  }
  function sourceLine(src){
    const label=text(src.kind||'Public record source').replace(/_/g,' ');
    const date=src.recorded_at?new Date(src.recorded_at).toLocaleDateString():'';
    return`• ${label}${date?` (${date})`:''}${src.url?` — ${src.url}`:''}`;
  }
  function noteBlock(payload,selected){
    const f=payload.facts||{},lines=['WATCHDOG VERIFIED PROPERTY — public-record research'];
    lines.push(`Property: ${[f.address,f.municipality,'NJ',f.zip].filter(Boolean).join(', ')}`);
    for(const k of selected){
      if(k==='source_note'||!DISPLAY[k])continue;
      const value=fieldValue(f,k);if(value)lines.push(`${DISPLAY[k]}: ${value}`);
    }
    if((payload.sources||[]).length){lines.push('Sources:');(payload.sources||[]).slice(0,5).forEach(src=>lines.push(sourceLine(src)));}
    else if(payload.source_summary)lines.push(`Source: ${payload.source_summary}`);
    if(f.last_verified)lines.push(`Watchdog warehouse last verified: ${new Date(f.last_verified).toLocaleDateString()}`);
    lines.push(payload.limitation||'Research context only. No ownership, seller-intent, demographic, title, or appraisal inference.');
    return lines.join('\n');
  }
  function notesField(){return findField(['contact notes','notes','note','comments']);}
  function apply(payload){
    const selected=Array.isArray(payload?.selected)?payload.selected:[],f=payload?.facts||{},skipped=[],written=[];
    for(const k of selected){
      if(k==='source_note'||!LABELS[k])continue;
      const value=fieldValue(f,k);if(!value)continue;
      const el=findField(LABELS[k]);if(!el)continue;
      const current=valueOf(el);if(current&&current!==value){skipped.push(k);continue;}
      if(nativeSet(el,value))written.push(k);
    }
    let noteWritten=false;
    if(selected.includes('source_note')){
      const notes=notesField();
      if(notes){
        const block=noteBlock(payload,selected),current=valueOf(notes);
        if(!current.includes('WATCHDOG VERIFIED PROPERTY')){nativeSet(notes,current?`${current}\n\n${block}`:block);noteWritten=true;}
        else skipped.push('source_note');
      }
    }
    if(!written.length&&!noteWritten)return{ok:false,error:'no_safe_write_target',skipped};
    return{ok:true,mode:noteWritten?(written.length?'custom_fields_and_note':'note'):'custom_fields',written,skipped,note_written:noteWritten};
  }

  chrome.runtime.onMessage.addListener((message,_sender,sendResponse)=>{
    if(message?.type!=='WATCHDOG_APPLY_AGENT_INTEL')return;
    try{sendResponse(apply(message.payload||{}));}catch(_){sendResponse({ok:false,error:'adapter_failed'});}
  });
})();