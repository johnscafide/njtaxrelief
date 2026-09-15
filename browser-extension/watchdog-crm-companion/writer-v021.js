(()=>{
  'use strict';
  if(location.hostname!=='app.boldtrail.com')return;

  const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
  const text=(v)=>String(v??'').replace(/\s+/g,' ').trim();
  const key=(v)=>text(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const visible=(el)=>!!(el&&el.getClientRects&&el.getClientRects().length)&&getComputedStyle(el).visibility!=='hidden'&&getComputedStyle(el).display!=='none';
  const SENSITIVE_RE=/(^|\b)(first name|last name|full name|contact name|email|e mail|phone|mobile|cell|telephone)(\b|$)/i;
  const NOTE_RE=/(note|notes|comment|comments|activity note)/i;
  const CONTROL_SELECTOR='input,textarea,select,[contenteditable="true"]';

  const FIELD_LABELS={
    watchdog_score:['watchdog score','property score','score'],
    assessed_value:['watchdog assessment','assessed value','assessment','tax assessment','current assessment'],
    annual_property_tax:['watchdog annual tax','annual property tax','property tax','annual taxes','tax amount'],
    effective_tax_rate:['effective tax rate','tax rate','effective rate'],
    land_value:['land value','assessed land value'],
    improvement_value:['improvement value','building value','improvements value'],
    property_class:['watchdog property class','property class','class'],
    year_built:['watchdog year built','year built','built year','construction year'],
    dwelling_units:['dwelling units','units','number of units','unit count'],
    acres:['acreage','acres','lot acreage','lot size acres'],
    building_description:['building description','building type','property description','style'],
    last_sale_price:['watchdog last sale price','last sale price','sale price','most recent sale price'],
    last_sale_year:['watchdog last sale year','last sale year','sale year','most recent sale year'],
    block:['watchdog block','block','tax block'],
    lot:['watchdog lot','lot','tax lot'],
    qualifier:['qualifier','lot qualifier'],
    municipality:['municipality','town','township'],
    county:['county'],
    zip:['zip','zip code','postal code']
  };

  const NOTE_LABELS=['contact notes','notes','note','comments','contact comments'];
  const money=(v)=>Number.isFinite(Number(v))?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(v)):'';
  const pct=(v)=>{const n=Number(v);if(!Number.isFinite(n))return'';const p=Math.abs(n)<1?n*100:n;return `${p.toFixed(3).replace(/\.?0+$/,'')}%`;};
  const score=(v)=>{const n=Number(v);if(!Number.isFinite(n))return'';return `${Math.round(n<=1?n*100:n)}/100`;};
  const date=(v)=>{const d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'}):'';};

  function valueOf(el){if(!el)return'';if('value'in el)return text(el.value);if(el.isContentEditable)return text(el.innerText);return text(el.textContent);}
  function metaOf(el){return key([el?.getAttribute?.('name'),el?.getAttribute?.('id'),el?.getAttribute?.('placeholder'),el?.getAttribute?.('aria-label'),el?.getAttribute?.('data-testid'),el?.getAttribute?.('data-cy'),el?.getAttribute?.('data-field'),el?.getAttribute?.('data-label'),el?.getAttribute?.('title'),typeof el?.className==='string'?el.className:''].filter(Boolean).join(' '));}
  function safeControl(el){if(!el||!visible(el)||el.disabled||el.readOnly)return false;return !SENSITIVE_RE.test(metaOf(el));}
  function labelText(el){
    const parts=[];
    if(el.labels)Array.from(el.labels).forEach(l=>parts.push(text(l.textContent)));
    const own=el.closest?.('label');if(own)parts.push(text(own.textContent));
    let cur=el.parentElement;
    for(let i=0;cur&&i<3;i++,cur=cur.parentElement){
      const lab=cur.querySelector?.(':scope > label,:scope > span,:scope > small,:scope > strong,:scope > div');
      if(lab&&lab!==el&&text(lab.textContent).length<100)parts.push(text(lab.textContent));
    }
    parts.push(metaOf(el));
    return key(parts.join(' '));
  }
  function controls(scope=document){return Array.from(scope.querySelectorAll(CONTROL_SELECTOR)).filter(safeControl);}
  function tokenScore(a,b){
    const A=new Set(key(a).split(' ').filter(Boolean)),B=new Set(key(b).split(' ').filter(Boolean));
    if(!A.size||!B.size)return 0;let hit=0;for(const t of A)if(B.has(t))hit++;
    return hit/Math.max(A.size,B.size);
  }
  function aliasScore(descriptor,alias){
    const d=key(descriptor),a=key(alias);if(!d||!a)return 0;if(d===a)return 1;
    if(d.includes(a)||a.includes(d))return .9;
    return tokenScore(d,a);
  }
  function findBestField(aliases,{notes=false,scope=document}={}){
    let best=null;
    for(const el of controls(scope)){
      const descriptor=labelText(el),meta=metaOf(el);
      if(!notes&&NOTE_RE.test(descriptor+' '+meta))continue;
      if(notes&&!NOTE_RE.test(descriptor+' '+meta))continue;
      const s=Math.max(...aliases.map(a=>aliasScore(descriptor,a)),0);
      if(s>=(notes?.42:.58)&&(!best||s>best.score))best={el,score:s,descriptor};
    }
    return best;
  }
  function nativeSet(el,value){
    if(!el)return false;
    if(el.isContentEditable){el.focus();el.textContent=value;el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:value}));el.dispatchEvent(new Event('change',{bubbles:true}));return true;}
    const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:el instanceof HTMLInputElement?HTMLInputElement.prototype:null;
    const setter=proto&&Object.getOwnPropertyDescriptor(proto,'value')?.set;
    el.focus();if(setter)setter.call(el,value);else el.value=value;
    el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));el.dispatchEvent(new Event('blur',{bubbles:true}));return true;
  }
  function fieldValue(f,k){
    if(['assessed_value','annual_property_tax','land_value','improvement_value','last_sale_price'].includes(k))return money(f[k]);
    if(k==='effective_tax_rate')return pct(f[k]);
    if(k==='watchdog_score')return score(f[k]);
    if(k==='acres'&&f[k]!=null)return String(f[k]);
    return f[k]===null||f[k]===undefined?'':String(f[k]);
  }

  function buttonCandidates(scope=document){return Array.from(scope.querySelectorAll('button,a,[role="button"]')).filter(visible);}
  function buttonByText(pattern,scope=document){return buttonCandidates(scope).find(el=>pattern.test(text(el.textContent))||pattern.test(text(el.getAttribute('aria-label'))))||null;}
  async function enterEditMode(){
    const edits=buttonCandidates().filter(el=>/^edit(?: contact)?$/i.test(text(el.textContent))||/^edit(?: contact)?$/i.test(text(el.getAttribute('aria-label'))));
    if(!edits.length)return false;
    edits.sort((a,b)=>{const A=a.getBoundingClientRect(),B=b.getBoundingClientRect();return A.top-B.top||A.left-B.left;});
    edits[0].click();
    await wait(220);
    return true;
  }
  async function saveContactEdits(anchor){
    const scope=anchor?.closest?.('[role="dialog"],form,.modal,.drawer')||document;
    const save=buttonByText(/^(save|save changes|update|done)$/i,scope)||buttonByText(/^(save|save changes|update)$/i,document);
    if(!save)return false;save.click();await wait(240);return true;
  }

  function propertyUrl(f){
    if(f.property_id)return `https://www.watchdogindex.com/home?pin=${encodeURIComponent(f.property_id)}`;
    const address=[f.address,f.municipality,'NJ',f.zip].filter(Boolean).join(', ');
    return `https://www.watchdogindex.com/?address=${encodeURIComponent(address)}`;
  }
  function sourceLine(src){
    const label=text(src?.kind||'Public record source').replace(/_/g,' '),d=date(src?.recorded_at||src?.captured_at);
    return `• ${label}${d?` · ${d}`:''}${src?.url?` · ${src.url}`:''}`;
  }
  const NOTE_FACTS={
    watchdog_score:'Watchdog Score',assessed_value:'Assessment',annual_property_tax:'Annual property tax',effective_tax_rate:'Effective tax rate',land_value:'Land value',improvement_value:'Improvement value',property_class:'Property class',year_built:'Year built',dwelling_units:'Dwelling units',acres:'Acreage',building_description:'Building description',last_sale_price:'Last sale price',last_sale_year:'Last sale year',block:'Block',lot:'Lot',qualifier:'Qualifier',municipality:'Municipality',county:'County',zip:'ZIP'
  };
  function noteBlock(payload,selected,includeAll=false){
    const f=payload.facts||{},now=new Date(),lines=['WATCHDOG PROPERTY INTELLIGENCE'];
    lines.push(`Property: ${[f.address,f.municipality,'NJ',f.zip].filter(Boolean).join(', ')}`);
    if(f.watchdog_score!=null)lines.push(`Watchdog Score: ${score(f.watchdog_score)}`);
    lines.push(`Sourced from Watchdog: ${now.toLocaleString('en-US',{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}`);
    if(f.watchdog_score_observed_at)lines.push(`Watchdog Score observed: ${date(f.watchdog_score_observed_at)}`);
    if(f.last_verified)lines.push(`Public-record warehouse verified: ${date(f.last_verified)}`);
    const chosen=(includeAll?Object.keys(NOTE_FACTS):(selected||[])).filter(k=>k!=='source_note'&&k!=='watchdog_score');
    for(const k of chosen){if(!(k in NOTE_FACTS))continue;const v=fieldValue(f,k);if(v)lines.push(`${NOTE_FACTS[k]}: ${v}`);}
    if(f.block||f.lot)lines.push(`Parcel: ${[f.block,f.lot,f.qualifier].filter(Boolean).join(' / ')}`);
    lines.push(`Watchdog property: ${propertyUrl(f)}`);
    if((payload.sources||[]).length){lines.push('Sources:');(payload.sources||[]).slice(0,5).forEach(s=>lines.push(sourceLine(s)));}
    else if(payload.source_summary)lines.push(`Source: ${payload.source_summary}`);
    lines.push(payload.limitation||'Research context only. No ownership, seller-intent, demographic, title, or appraisal inference.');
    return lines.join('\n');
  }

  function semanticNoteEditor(scope=document){const semantic=findBestField(NOTE_LABELS,{notes:true,scope});return semantic?.el||null;}
  function genericNoteEditor(scope=document){
    return controls(scope).find(el=>(el.tagName==='TEXTAREA'||el.isContentEditable)&&!SENSITIVE_RE.test(labelText(el)+' '+metaOf(el)))||null;
  }
  async function openNoteComposer(){
    let editor=semanticNoteEditor();if(editor)return editor;
    const before=new Set(controls().filter(el=>el.tagName==='TEXTAREA'||el.isContentEditable));
    const btn=buttonCandidates().find(el=>/^(add note|new note|create note|add a note)$/i.test(text(el.textContent))||/add note/i.test(text(el.getAttribute('aria-label'))));
    if(!btn)return null;
    btn.click();
    for(let i=0;i<14;i++){
      await wait(140);
      const dialog=Array.from(document.querySelectorAll('[role="dialog"],.modal,.drawer')).filter(visible).pop()||document;
      editor=semanticNoteEditor(dialog);if(editor)return editor;
      const newEditors=controls(dialog).filter(el=>(el.tagName==='TEXTAREA'||el.isContentEditable)&&!before.has(el));
      if(newEditors.length===1)return newEditors[0];
      if(dialog!==document){const generic=genericNoteEditor(dialog);if(generic)return generic;}
    }
    return null;
  }
  async function persistNote(editor){
    const scope=editor?.closest?.('[role="dialog"],form,.modal,.drawer')||document;
    const save=buttonByText(/^(add note|save note|create note|save|add)$/i,scope)||buttonByText(/^(add note|save note|create note)$/i,document);
    if(!save)return false;
    save.click();await wait(260);return true;
  }
  async function writeNote(payload,selected,includeAll=false){
    const editor=await openNoteComposer();if(!editor)return{ok:false,error:'note_ui_not_found'};
    const block=noteBlock(payload,selected,includeAll),current=valueOf(editor),marker=`Watchdog property: ${propertyUrl(payload.facts||{})}`;
    if(current.includes(marker)&&current.includes('WATCHDOG PROPERTY INTELLIGENCE'))return{ok:true,duplicate:true};
    if(!nativeSet(editor,current?`${current}\n\n${block}`:block))return{ok:false,error:'note_write_failed'};
    const persisted=await persistNote(editor);return{ok:persisted,error:persisted?'':'note_save_not_found'};
  }

  async function apply(payload){
    const selected=Array.isArray(payload?.selected)?payload.selected.filter(Boolean):[],f=payload?.facts||{};
    const wanted=selected.filter(k=>k!=='source_note'&&FIELD_LABELS[k]&&fieldValue(f,k));
    let written=[],skipped=[],unmatched=[],matched_fields=[];

    function attempt(keys){
      const remain=[];
      for(const k of keys){
        const match=findBestField(FIELD_LABELS[k]);if(!match){remain.push(k);continue;}
        const value=fieldValue(f,k),current=valueOf(match.el);
        matched_fields.push({key:k,label:match.descriptor,score:Math.round(match.score*100)/100});
        if(current&&current!==value){skipped.push(k);continue;}
        if(nativeSet(match.el,value))written.push({key:k,el:match.el});else remain.push(k);
      }
      return remain;
    }

    let pending=attempt(wanted),enteredEdit=false;
    if(pending.length){enteredEdit=await enterEditMode();if(enteredEdit){await wait(180);pending=attempt(pending);}}
    unmatched.push(...pending);

    let fieldsPersisted=false;
    if(written.length)fieldsPersisted=await saveContactEdits(written[0].el);
    if(written.length&&!fieldsPersisted){unmatched.push(...written.map(x=>x.key));written=[];}

    const needsNote=selected.includes('source_note')||unmatched.length>0||written.length===0;
    let note={ok:false};if(needsNote)note=await writeNote(payload,selected,written.length===0);

    if(!written.length&&!note.ok)return{ok:false,error:'no_safe_write_target',skipped,unmatched:[...new Set(unmatched)],matched_fields};
    return{
      ok:true,
      mode:note.ok?(written.length?'fields_and_note':'note'):'fields',
      written:written.map(x=>x.key),
      skipped,
      unmatched:[...new Set(unmatched)],
      matched_fields,
      note_written:!!note.ok,
      note_duplicate:!!note.duplicate,
      entered_edit:enteredEdit,
      fields_persisted:fieldsPersisted
    };
  }

  chrome.runtime.onMessage.addListener((message,_sender,sendResponse)=>{
    if(message?.type!=='WATCHDOG_APPLY_PROPERTY_V021')return;
    apply(message.payload||{}).then(sendResponse).catch(()=>sendResponse({ok:false,error:'writer_failed'}));
    return true;
  });
})();
