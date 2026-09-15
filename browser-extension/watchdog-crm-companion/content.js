(()=>{
  'use strict';
  if(location.hostname!=='app.boldtrail.com')return;

  const visible=(el)=>!!(el&&el.getClientRects&&el.getClientRects().length)&&getComputedStyle(el).visibility!=='hidden'&&getComputedStyle(el).display!=='none';
  const text=(v)=>String(v||'').replace(/\s+/g,' ').trim();
  const key=(v)=>text(v).toLowerCase().replace(/[^a-z0-9]+/g,' ');
  const wait=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
  const SENSITIVE_RE=/(^|\b)(first name|last name|full name|contact name|email|e mail|phone|mobile|cell|telephone)(\b|$)/i;
  const ADDRESS_LABELS=['property address','home address','primary address','contact address','mailing address','physical address','street address','address','street','residence address'];
  const CITY_LABELS=['city','town','municipality'];
  const STATE_LABELS=['state','province'];
  const ZIP_LABELS=['zip code','zipcode','postal code','postal','zip'];

  const valueOf=(el)=>{if(!el)return'';if('value'in el)return text(el.value);if(el.isContentEditable)return text(el.innerText);return text(el.textContent);};
  const metaOf=(el)=>key([el?.getAttribute?.('name'),el?.getAttribute?.('id'),el?.getAttribute?.('placeholder'),el?.getAttribute?.('aria-label'),el?.getAttribute?.('data-testid'),el?.getAttribute?.('data-cy'),el?.getAttribute?.('data-field'),el?.getAttribute?.('data-label'),el?.getAttribute?.('title'),el?.className].filter(v=>typeof v==='string'&&v).join(' '));
  const safeControl=(el)=>!!el&&visible(el)&&!SENSITIVE_RE.test(metaOf(el));
  const controlForLabel=(label)=>{if(!label)return null;const f=label.getAttribute('for');if(f){const c=document.getElementById(f);if(safeControl(c))return c;}const own=label.querySelector('input,textarea,select,[contenteditable="true"]');if(safeControl(own))return own;const parent=label.parentElement;const c=parent&&parent.querySelector('input,textarea,select,[contenteditable="true"]');return safeControl(c)?c:null;};
  function candidates(){return Array.from(document.querySelectorAll('input,textarea,select,[contenteditable="true"]')).filter(safeControl);}
  function findField(labels){
    const wanted=labels.map(key);
    for(const label of Array.from(document.querySelectorAll('label')).filter(visible)){
      const lk=key(label.textContent);if(SENSITIVE_RE.test(lk))continue;if(wanted.some(w=>lk===w||lk.includes(w))){const c=controlForLabel(label);if(c)return c;}
    }
    for(const el of candidates()){
      const meta=metaOf(el);if(wanted.some(w=>meta===w||meta.includes(w)))return el;
    }
    return null;
  }
  const looksLikeStreet=(v)=>/^\d{1,7}[A-Za-z]?(?:[- ]\d{1,7})?\s+[A-Za-z0-9][A-Za-z0-9.'’#&/\- ]{1,110}(?:\b(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|cir|circle|blvd|boulevard|pkwy|parkway|pl|place|ter|terrace|way|hwy|highway|trl|trail|sq|square|route|rte)\b\.?|\s(?:N|S|E|W)\b|$)/i.test(text(v));
  const looksLikeCityStateZip=(v)=>/\b(?:NJ|New Jersey)\b(?:\s*,?\s*\d{5}(?:-\d{4})?)?/i.test(text(v));
  function compactLines(v){return String(v||'').split(/[\n\r]+|\s{2,}/).map(text).filter(Boolean).slice(0,20);}
  function extractStreet(v){
    const lines=compactLines(v);
    for(const line of lines){if(looksLikeStreet(line)&&line.length<=180&&!looksLikeCityStateZip(line))return line.replace(/\s*,\s*$/,'');}
    const flat=text(v);const match=flat.match(/\b\d{1,7}[A-Za-z]?(?:[- ]\d{1,7})?\s+[A-Za-z0-9][A-Za-z0-9.'’#&/\- ]{1,100}?(?=(?:,|\s)+(?:[A-Za-z .'-]+,?\s+)?(?:NJ|New Jersey)\b|$)/i);return match?text(match[0]):'';
  }
  function parseCombined(v){
    const raw=String(v||'');const street=extractStreet(raw);if(!street)return null;
    const flat=text(raw);const zip=(flat.match(/\b\d{5}(?:-\d{4})?\b/)||[''])[0];const state=(flat.match(/\b(?:NJ|New Jersey)\b/i)||[''])[0];
    let city='';
    const escaped=street.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const cityMatch=flat.match(new RegExp(`${escaped}\\s*,?\\s*([^,]{2,70}?)\\s*,?\\s*(?:NJ|New Jersey)\\b`,'i'));if(cityMatch)city=text(cityMatch[1]);
    return{address:street,city,state:state||'',zip};
  }
  function fieldNeighborhood(node){
    let cur=node;
    for(let depth=0;cur&&depth<4;depth++,cur=cur.parentElement){
      const controls=Array.from(cur.querySelectorAll('input,textarea,select,[contenteditable="true"]')).filter(safeControl);
      for(const c of controls){const v=valueOf(c);if(v&&(looksLikeStreet(v)||looksLikeCityStateZip(v)))return v;}
      const leaves=Array.from(cur.querySelectorAll('dd,a,span,p,strong,div')).filter(el=>visible(el)&&el.children.length===0&&!SENSITIVE_RE.test(metaOf(el)));
      for(const el of leaves){const v=valueOf(el);if(v&&v.length<=260&&(looksLikeStreet(v)||looksLikeCityStateZip(v)))return v;}
    }
    return'';
  }
  function nearbyValue(labels){
    const wanted=labels.map(key);
    const nodes=Array.from(document.querySelectorAll('label,dt,th,[role="term"],span,p,strong,div')).filter(visible);
    for(const node of nodes){
      const raw=text(node.textContent);if(!raw||raw.length>90)continue;const nk=key(raw);if(SENSITIVE_RE.test(nk))continue;
      if(!wanted.some(w=>nk===w||nk===`${w}:`||nk.startsWith(`${w} `)))continue;
      const v=fieldNeighborhood(node);if(v)return v;
    }
    return'';
  }
  function annotatedAddress(){
    const selectors='[aria-label],[data-testid],[data-cy],[data-field],[data-label],[title]';
    for(const el of Array.from(document.querySelectorAll(selectors)).filter(visible)){
      const meta=metaOf(el);if(SENSITIVE_RE.test(meta)||!/(address|street|residence|mailing|property location)/i.test(meta))continue;
      const direct=valueOf(el);const parsed=parseCombined(direct);if(parsed)return parsed;
      const nearby=fieldNeighborhood(el);const p=parseCombined(nearby);if(p)return p;
    }
    return null;
  }
  function contactCardAddress(){
    if(!/^\/contacts\/\d+\/?$/i.test(location.pathname))return null;
    const leafSelector='span,p,strong,div,a,dd,li';
    const found=[];
    for(const el of Array.from(document.querySelectorAll(leafSelector)).filter(visible)){
      if(el.children.length!==0||SENSITIVE_RE.test(metaOf(el)))continue;
      const raw=valueOf(el);if(!raw||raw.length<12||raw.length>220||!looksLikeCityStateZip(raw))continue;
      const parsed=parseCombined(raw);if(!parsed||!parsed.zip||!parsed.state||!looksLikeStreet(parsed.address))continue;
      const rect=el.getBoundingClientRect();
      let score=10;
      if(rect.left<window.innerWidth*.38)score+=6;
      if(rect.top<window.innerHeight*.58)score+=3;
      let cur=el;
      for(let depth=0;cur&&depth<5;depth++,cur=cur.parentElement){
        const local=text(cur.textContent).slice(0,900);
        if(/\bEdit\b/.test(local))score+=4;
        if(/\bValidated\b|\bRating\b/.test(local))score+=3;
        if(/Listing Valuation/i.test(local))score-=5;
      }
      found.push({parsed,score,top:rect.top,left:rect.left});
    }
    found.sort((a,b)=>b.score-a.score||a.top-b.top||a.left-b.left);
    return found[0]?.parsed||null;
  }
  function read(labels){const el=findField(labels);const v=valueOf(el);return v||nearbyValue(labels);}
  function scanOnce(){
    let address=read(ADDRESS_LABELS),city=read(CITY_LABELS),state=read(STATE_LABELS),zip=read(ZIP_LABELS),mode='labeled_field';
    let parsed=parseCombined(address);
    if(parsed){address=parsed.address;city=city||parsed.city;state=state||parsed.state;zip=zip||parsed.zip;mode='combined_labeled';}
    if(!address||!looksLikeStreet(address)){
      const annotated=annotatedAddress();
      if(annotated){address=annotated.address;city=city||annotated.city;state=state||annotated.state;zip=zip||annotated.zip;mode='annotated_element';}
    }
    if(!address||!looksLikeStreet(address)){
      const card=contactCardAddress();
      if(card){address=card.address;city=city||card.city;state=state||card.state;zip=zip||card.zip;mode='contact_card_text';}
    }
    address=extractStreet(address)||text(address);
    const likelyNJ=!state||/^(nj|new jersey)$/i.test(text(state))||/\b(?:NJ|New Jersey)\b/i.test([address,city,state,zip].join(' '));
    if(!address||!looksLikeStreet(address)||!likelyNJ)return{ok:false,error:'address_not_found',mode};
    return{ok:true,mode,contact:{address:text(address).slice(0,220),city:text(city).replace(/,$/,'').slice(0,80),state:text(state||'NJ').slice(0,30),zip:(text(zip).match(/\d{5}(?:-\d{4})?/)||[''])[0]}};
  }
  async function scanContact(){
    let last={ok:false,error:'address_not_found',mode:'not_ready'};
    for(let attempt=0;attempt<8;attempt++){
      last=scanOnce();if(last.ok)return{...last,attempts:attempt+1};
      if(attempt<7)await wait(attempt<2?220:380);
    }
    return{...last,attempts:8};
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
      if(message?.type==='WATCHDOG_SCAN_CONTACT'){
        scanContact().then(sendResponse).catch(()=>sendResponse({ok:false,error:'adapter_failed'}));
        return true;
      }
      if(message?.type==='WATCHDOG_APPLY_PROPERTY'){sendResponse(applyProperty(message.payload||{}));return;}
    }catch(error){sendResponse({ok:false,error:'adapter_failed'});}
  });
})();
