(()=>{
  'use strict';
  if(location.hostname!=='app.boldtrail.com'||document.getElementById('watchdog-agent-command-root'))return;

  const VERSION='0.3.0';
  const RECOMMENDED=['watchdog_score','assessed_value','annual_property_tax','property_class','year_built','last_sale_price','last_sale_year','block','lot','source_note'];
  const state={session:null,contact:null,result:null,municipal:null,lastHref:'',busy:false,drawerOpen:false};
  const money=v=>Number.isFinite(Number(v))?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(v)):'—';
  const plain=v=>v===null||v===undefined||v===''?'—':String(v);
  const score=v=>Number.isFinite(Number(v))?`${Math.round(Number(v)<=1?Number(v)*100:Number(v))}/100`:'—';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const compact=v=>String(v??'').replace(/\s+/g,' ').trim();
  const planLabel=p=>({agent:'Agent',pro:'Pro',pro_plus:'Pro+',teams:'Teams',developer:'Developer'})[p]||'Watchdog';
  const bg=(type,payload={})=>new Promise((resolve,reject)=>chrome.runtime.sendMessage({type,...payload},response=>{
    if(chrome.runtime.lastError)return reject(new Error(chrome.runtime.lastError.message));
    if(response?.ok===false&&response?.error)return reject(Object.assign(new Error(response.error),{data:response.data||null,status:response.status||0}));
    resolve(response||{});
  }));

  const root=document.createElement('div');root.id='watchdog-agent-command-root';
  function syncHostSpace(){const desktop=window.innerWidth>760;root.style.cssText=desktop?'display:block!important;height:52px!important;min-height:52px!important;flex:0 0 52px!important;width:100%!important;':'display:none!important;height:0!important;min-height:0!important;flex:0 0 0!important;';}
  syncHostSpace();window.addEventListener('resize',syncHostSpace,{passive:true});
  const shadow=root.attachShadow({mode:'open'});
  shadow.innerHTML=`<style>
    :host{all:initial}*{box-sizing:border-box}.shell{position:fixed;left:0;right:0;top:0;z-index:2147483647;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#13233b;pointer-events:none}.bar{height:52px;background:rgba(255,255,255,.985);border-bottom:1px solid #d9e2ec;box-shadow:0 4px 18px rgba(15,35,60,.10);display:flex;align-items:center;gap:9px;padding:0 12px;pointer-events:auto}.brand{display:flex;align-items:center;gap:8px;min-width:152px}.mark{width:28px;height:28px;border-radius:9px;background:#103a67;color:#fff;display:grid;place-items:center;font:800 14px/1 ui-sans-serif,system-ui;box-shadow:inset 0 0 0 1px rgba(255,255,255,.16)}.brand b{font-size:12px;letter-spacing:.09em}.brand small{display:block;color:#708196;font-size:9px;margin-top:1px}.context{min-width:180px;max-width:330px;display:flex;align-items:center;gap:7px;border-left:1px solid #e3e9ef;padding-left:10px}.dot{width:7px;height:7px;border-radius:50%;background:#a7b4c3;flex:0 0 auto}.dot.live{background:#12a594;box-shadow:0 0 0 3px rgba(18,165,148,.12)}.context-copy{min-width:0}.context b,.context small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.context b{font-size:11px}.context small{font-size:9px;color:#77889c;margin-top:1px}.command{height:34px;flex:1;min-width:180px;display:flex;align-items:center;border:1px solid #cfd9e4;border-radius:9px;background:#f9fbfd;overflow:hidden;transition:.15s}.command:focus-within{background:#fff;border-color:#2d6fae;box-shadow:0 0 0 3px rgba(45,111,174,.12)}.command span{padding-left:10px;color:#789;font-size:12px}.command input{border:0;outline:0;background:transparent;width:100%;height:100%;padding:0 10px 0 7px;color:#15263c;font:500 12px/1 ui-sans-serif,system-ui}.command kbd{margin-right:8px;background:#eef3f7;color:#68798b;border:1px solid #dbe3eb;border-bottom-width:2px;border-radius:5px;padding:2px 5px;font:600 9px/1 ui-monospace,SFMono-Regular,Menlo,monospace}.actions{display:flex;align-items:center;gap:5px}.btn{height:31px;border:1px solid #d4dde6;border-radius:8px;background:#fff;color:#17324e;padding:0 9px;font:650 10px/1 ui-sans-serif,system-ui;cursor:pointer;white-space:nowrap}.btn:hover{border-color:#9fb4c7;background:#f7fafc}.btn.primary{background:#103a67;border-color:#103a67;color:#fff}.btn.primary:hover{background:#0c3158}.btn:disabled{opacity:.5;cursor:wait}.iconbtn{width:31px;padding:0}.status{font-size:9px;color:#7a8a9b;white-space:nowrap;min-width:62px;text-align:right}.drawer{position:absolute;top:58px;right:12px;width:min(620px,calc(100vw - 24px));max-height:min(620px,calc(100vh - 80px));overflow:auto;background:#fff;border:1px solid #d7e0e9;border-radius:14px;box-shadow:0 18px 55px rgba(15,35,60,.22);pointer-events:auto;display:none}.drawer.open{display:block}.drawer-head{position:sticky;top:0;background:#fff;border-bottom:1px solid #e7edf2;padding:14px 16px 11px;display:flex;justify-content:space-between;gap:12px;z-index:2}.drawer-head b{font-size:14px}.drawer-head p{margin:4px 0 0;color:#708196;font-size:10px;line-height:1.4}.drawer-body{padding:14px 16px 18px}.x{border:0;background:#eff3f7;border-radius:7px;width:28px;height:28px;cursor:pointer;color:#41566d}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.metric{border:1px solid #e0e7ee;border-radius:9px;padding:9px;background:#fbfcfd}.metric small{display:block;color:#78899a;font-size:9px}.metric b{display:block;margin-top:3px;font-size:12px}.section{margin-top:14px;border-top:1px solid #e7edf2;padding-top:12px}.section:first-child{margin-top:0;border-top:0;padding-top:0}.section h3{margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#53697f}.row{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-top:1px solid #edf1f4}.row:first-of-type{border-top:0}.row .state{flex:0 0 auto;min-width:90px;font-size:9px;font-weight:750;border-radius:999px;padding:4px 7px;text-align:center;background:#edf4fb;color:#2e587e}.row .state.required{background:#fff0e7;color:#8f451f}.row .state.process{background:#eef8f6;color:#236d64}.row .state.verify{background:#f2f3f5;color:#65717e}.row b{font-size:11px}.row p{font-size:10px;color:#5f7184;line-height:1.45;margin:3px 0 0}.list{margin:6px 0 0;padding:0 0 0 17px;color:#344b63;font-size:10px;line-height:1.5}.fee{display:inline-block;margin:5px 5px 0 0;border:1px solid #dfe6ed;border-radius:6px;padding:4px 6px;font-size:9px;background:#fafcfd}.links{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.links a{color:#195b93;text-decoration:none;font-size:9px;font-weight:700;border-bottom:1px solid #b7cee2}.candidate{width:100%;display:flex;justify-content:space-between;gap:12px;text-align:left;border:1px solid #dfe6ed;border-radius:9px;padding:9px 10px;background:#fff;margin-top:7px;cursor:pointer}.candidate:hover{background:#f8fbfd;border-color:#afc3d5}.candidate b{display:block;font-size:11px}.candidate small{color:#718396;font-size:9px}.candidate em{font-style:normal;font-size:10px;font-weight:800;color:#28618d}.notice{padding:10px;border-radius:9px;background:#f4f7fa;color:#566a7e;font-size:10px;line-height:1.45}.brief{white-space:pre-wrap;border:1px solid #dfe6ed;border-radius:10px;background:#fbfcfd;padding:11px;font:500 10px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;color:#2e4053}.drawer-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}.toast{position:absolute;top:61px;left:50%;transform:translateX(-50%) translateY(-8px);background:#132f4c;color:#fff;border-radius:8px;padding:8px 12px;font:650 10px/1.25 ui-sans-serif,system-ui;opacity:0;pointer-events:none;transition:.18s;box-shadow:0 10px 30px rgba(13,37,60,.22)}.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}.collapsed .context,.collapsed .command,.collapsed .actions .wide,.collapsed .status{display:none}.collapsed .bar{width:max-content;margin-left:auto;border-left:1px solid #d9e2ec;border-radius:0 0 0 10px}.collapsed .brand{min-width:auto}.mobile-hide{}@media(max-width:1100px){.actions .secondary{display:none}.context{max-width:220px}.brand small{display:none}.brand{min-width:105px}}@media(max-width:760px){.bar{display:none}}
  </style><div class="shell"><div class="bar"><div class="brand"><span class="mark">W</span><div><b>WATCHDOG</b><small>AGENT COMMAND</small></div></div><div class="context"><span class="dot"></span><div class="context-copy"><b id="wdc-context-title">Open a BoldTrail contact</b><small id="wdc-context-sub">Watchdog stays ready as you move through CRM</small></div></div><label class="command"><span>⌘</span><input id="wdc-command" autocomplete="off" placeholder="Ask Watchdog or type a command…"><kbd>Alt+W</kbd></label><div class="actions"><button class="btn primary wide" data-action="enrich">Enrich</button><button class="btn secondary wide" data-action="town">Town Closing</button><button class="btn secondary wide" data-action="packet">Municipal Packet</button><button class="btn secondary wide" data-action="brief">Listing Brief</button><button class="btn secondary wide" data-action="property">Property</button><button class="btn secondary wide" data-action="transaction">Transaction</button><button class="btn wide" data-action="connect">Connect</button><button class="btn iconbtn" title="Collapse Watchdog" data-action="collapse">▴</button></div><span class="status" id="wdc-status">Checking…</span></div><div class="drawer" id="wdc-drawer"><div class="drawer-head"><div><b id="wdc-drawer-title">Watchdog</b><p id="wdc-drawer-sub"></p></div><button class="x" data-action="close">×</button></div><div class="drawer-body" id="wdc-drawer-body"></div></div><div class="toast" id="wdc-toast"></div></div>`;
  (document.documentElement||document).appendChild(root);

  const $=id=>shadow.getElementById(id);
  const bar=shadow.querySelector('.shell'),drawer=$('wdc-drawer'),drawerBody=$('wdc-drawer-body'),command=$('wdc-command');
  function status(value){$('wdc-status').textContent=value||'';}
  function toast(value){const el=$('wdc-toast');el.textContent=value;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),2200);}
  function busy(on,label='Working…'){state.busy=on;shadow.querySelectorAll('button[data-action]').forEach(b=>{if(!['collapse','close'].includes(b.dataset.action))b.disabled=on;});if(on)status(label);else renderSession();}
  function openDrawer(title,sub,html){$('wdc-drawer-title').textContent=title;$('wdc-drawer-sub').textContent=sub||'';drawerBody.innerHTML=html;drawer.classList.add('open');state.drawerOpen=true;}
  function closeDrawer(){drawer.classList.remove('open');state.drawerOpen=false;}
  function renderSession(){
    const connected=!!state.session?.connected;status(connected?planLabel(state.session.plan):state.session?.pairing?'Finish connect':'Not connected');
    const btn=shadow.querySelector('[data-action="connect"]');if(btn){btn.textContent=connected?'Connected':state.session?.pairing?'Finish connect':'Connect';btn.classList.toggle('primary',!connected);}
  }
  function setContext(scan){
    state.contact=scan?.ok?scan.contact:null;
    const dot=shadow.querySelector('.dot');dot.classList.toggle('live',!!state.contact);
    $('wdc-context-title').textContent=state.contact?.address||'Open a BoldTrail contact';
    $('wdc-context-sub').textContent=state.contact?[state.contact.city,state.contact.state||'NJ',state.contact.zip].filter(Boolean).join(' · '):'Watchdog stays ready as you move through CRM';
  }
  async function refreshSession(){
    try{state.session=await bg('WDC_SESSION_STATE');renderSession();if(state.session?.pairing&&document.visibilityState==='visible'){try{state.session=await bg('WDC_CLAIM_PAIRING');renderSession();toast('Watchdog connected');}catch(_){}}}catch(_){state.session={connected:false};renderSession();}
  }
  async function scanLocal(){
    if(!/^\/contacts\/\d+\/?$/i.test(location.pathname)){setContext(null);state.result=null;state.municipal=null;return null;}
    try{const scan=await bg('WDC_SCAN_LOCAL');setContext(scan);if(!scan?.ok){state.result=null;state.municipal=null;}return scan;}catch(_){setContext(null);return null;}
  }
  function candidateHtml(items){return (items||[]).map((x,i)=>`<button class="candidate" data-candidate="${esc(x.id)}"><span><b>${esc(x.address)}</b><small>${esc([x.town,'NJ',x.zip,x.county?`${x.county} County`:null].filter(Boolean).join(' · '))}</small></span><em>${Math.round((x.confidence||0)*100)}%</em></button>`).join('');}
  async function chooseCandidate(id){
    busy(true,'Matching…');
    try{const result=await bg('WDC_API',{action:'lookup',payload:{contact:{candidate_id:id}}});state.result=result;renderMatch(result);return result;}finally{busy(false);}
  }
  function bindCandidates(){drawerBody.querySelectorAll('[data-candidate]').forEach(btn=>btn.addEventListener('click',()=>chooseCandidate(btn.dataset.candidate)));}
  function renderMatch(result){
    const f=result?.facts||{};
    openDrawer('Watchdog property match',[f.municipality,'NJ',f.zip].filter(Boolean).join(' · '),`<div class="grid"><div class="metric"><small>Watchdog Score</small><b>${esc(score(f.watchdog_score))}</b></div><div class="metric"><small>Assessment</small><b>${esc(money(f.assessed_value))}</b></div><div class="metric"><small>Annual tax</small><b>${esc(money(f.annual_property_tax))}</b></div><div class="metric"><small>Block / Lot</small><b>${esc([f.block,f.lot].filter(Boolean).join(' / ')||'—')}</b></div></div><div class="section"><div class="notice">${Math.round((result.confidence||0)*100)}% address match · ${esc(result.source_summary||'Watchdog public-record warehouse')}</div></div>`);
  }
  async function ensureConnected(){
    if(state.session?.connected)return true;
    if(state.session?.pairing){try{state.session=await bg('WDC_CLAIM_PAIRING');renderSession();return true;}catch(_){toast('Finish Watchdog approval, then try again');return false;}}
    await bg('WDC_BEGIN_CONNECT');state.session={connected:false,pairing:true};renderSession();toast('Approve this browser in the Watchdog tab');return false;
  }
  async function ensureMatch({show=false}={}){
    if(state.result?.kind==='match')return state.result;
    if(!(await ensureConnected()))return null;
    const scan=state.contact?{ok:true,contact:state.contact}:await scanLocal();
    if(!scan?.ok||!scan.contact?.address){toast('Open a BoldTrail contact with a property address');return null;}
    busy(true,'Looking up…');
    try{
      const result=await bg('WDC_API',{action:'lookup',payload:{contact:scan.contact}});state.result=result;
      if(result.kind==='match'){if(show)renderMatch(result);return result;}
      const title=result.kind==='ambiguous'?'Choose the correct property':'No confident match yet';
      openDrawer(title,'Watchdog will not guess. Select a public-record candidate.',candidateHtml(result.candidates||[])||'<div class="notice">No safe property candidates were returned.</div>');bindCandidates();return null;
    }catch(error){toast(error.message==='lookup_rate_limited'?'Lookup limit reached':'Watchdog lookup unavailable');return null;}
    finally{busy(false);}
  }
  function selectedFacts(f){return RECOMMENDED.filter(k=>k==='source_note'||(f[k]!==null&&f[k]!==undefined&&f[k]!==''));}
  async function enrich(){
    const result=await ensureMatch();if(!result)return;
    const selected=selectedFacts(result.facts||{});busy(true,'Enriching…');
    try{
      try{await bg('WDC_API',{action:'track',payload:{event_name:'crm_write_started',fields_count:selected.length,metadata:{field_mode:'command_bar'}}});}catch(_){}
      const response=await bg('WDC_APPLY_PROPERTY',{payload:{facts:result.facts,sources:result.sources||[],source_summary:result.source_summary,limitation:result.limitation,selected}});
      if(!response?.ok)throw new Error(response?.error||'write_failed');
      try{await bg('WDC_API',{action:'track',payload:{event_name:'crm_write_succeeded',fields_count:selected.length,metadata:{field_mode:response.mode||'command_bar'}}});}catch(_){}
      toast(response.note_written?'Watchdog data + sourced note added':'Watchdog data added to BoldTrail');
    }catch(_){try{await bg('WDC_API',{action:'track',payload:{event_name:'crm_write_failed',fields_count:selected.length,metadata:{reason:'command_bar_write_failed'}}});}catch(__){}toast('Nothing changed. Watchdog could not write safely.');}
    finally{busy(false);}
  }
  function itemLabel(item){
    if(typeof item==='string')return item;
    if(!item||typeof item!=='object')return'';
    return compact(item.label||item.text||item.requirement||item.description||item.name||item.title||Object.values(item).find(v=>typeof v==='string')||'');
  }
  function feeLabel(item){
    if(typeof item==='string')return item;
    if(!item||typeof item!=='object')return'';
    const label=compact(item.label||item.name||item.type||item.description||'Fee'),amount=item.amount??item.fee??item.cost;
    return amount!==undefined&&amount!==null?`${label}: ${typeof amount==='number'?money(amount):amount}`:label;
  }
  function stateMeta(value){
    if(value==='explicit_required')return{label:'REQUIRED',cls:'required'};
    if(value==='official_process_found')return{label:'OFFICIAL PROCESS',cls:'process'};
    if(value==='statewide_baseline')return{label:'STATE BASELINE',cls:'process'};
    return{label:'VERIFY',cls:'verify'};
  }
  function requirementCard(row){
    const meta=stateMeta(row.requirement_state),reqs=(row.requirements||[]).map(itemLabel).filter(Boolean),fees=(row.fees||[]).map(feeLabel).filter(Boolean),links=row.links||[];
    return `<div class="row"><span class="state ${meta.cls}">${meta.label}</span><div><b>${esc(row.title||row.requirement_key)}</b><p>${esc(row.summary||'Verify the current municipal process before closing.')}</p>${reqs.length?`<ul class="list">${reqs.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}${fees.length?`<div>${fees.map(x=>`<span class="fee">${esc(x)}</span>`).join('')}</div>`:''}${links.length?`<div class="links">${links.map(x=>`<a href="${esc(x.url)}" target="_blank" rel="noreferrer">${esc(x.label||'Official source')}</a>`).join('')}</div>`:''}</div></div>`;
  }
  async function municipalPreview({open=true}={}){
    const result=await ensureMatch();if(!result)return null;
    if(state.municipal?.municipality_code===String(result.facts?.property_id||'').replace(/\D/g,'').slice(0,4)){if(open)renderMunicipal(state.municipal,result);return state.municipal;}
    busy(true,'Loading town rules…');
    try{
      const preview=await bg('WDC_API',{action:'municipal.preview',payload:{property_id:result.facts.property_id}});state.municipal=preview;if(open)renderMunicipal(preview,result);return preview;
    }catch(_){toast('Municipal intelligence is unavailable');return null;}finally{busy(false);}
  }
  function renderMunicipal(preview,result){
    const rows=preview.requirements||[];
    openDrawer(`${preview.municipality_name||result.facts?.municipality||'Town'} closing intelligence`,`${preview.county?`${preview.county} County · `:''}Municipality ${preview.municipality_code||''}`,`<div class="notice">Official-source closing requirements. Missing web coverage is never treated as “not required.” Always verify final applicability with the municipality.</div><div class="section">${rows.map(requirementCard).join('')||'<div class="notice">No municipal registry rows are currently available for this property.</div>'}</div><div class="drawer-actions"><button class="btn primary" data-action="packet-now">Open municipal packet</button><button class="btn" data-action="transaction-now">Open Transaction</button></div>`);
    drawerBody.querySelector('[data-action="packet-now"]')?.addEventListener('click',openPacket);
    drawerBody.querySelector('[data-action="transaction-now"]')?.addEventListener('click',openTransaction);
  }
  async function openPacket(){
    const result=await ensureMatch();if(!result)return;const preview=await municipalPreview({open:false});if(!preview)return;
    await bg('WDC_OPEN_PACKET',{packet:{generated_at:new Date().toISOString(),extension_version:VERSION,facts:result.facts||{},sources:result.sources||[],municipal:preview}});toast('Municipal packet opened');
  }
  function listingBriefText(result){
    const f=result.facts||{};return [
      'WATCHDOG LISTING APPOINTMENT BRIEF',
      [f.address,f.municipality,'NJ',f.zip].filter(Boolean).join(', '),
      '',`Watchdog Score: ${score(f.watchdog_score)}`,`Assessment: ${money(f.assessed_value)}`,`Annual property tax: ${money(f.annual_property_tax)}`,`Block / Lot: ${[f.block,f.lot].filter(Boolean).join(' / ')||'—'}`,`Property class: ${plain(f.property_class)}`,`Year built: ${plain(f.year_built)}`,`Last sale: ${f.last_sale_price?money(f.last_sale_price):'—'}${f.last_sale_year?` (${f.last_sale_year})`:''}`,'',result.limitation||'Research context only. Verify material facts with the appropriate public agency.'
    ].join('\n');
  }
  async function listingBrief(){
    const result=await ensureMatch();if(!result)return;const brief=listingBriefText(result);openDrawer('Listing appointment brief',[result.facts?.municipality,'NJ'].filter(Boolean).join(' · '),`<div class="brief" id="wdc-brief">${esc(brief)}</div><div class="drawer-actions"><button class="btn primary" data-copy-brief>Copy brief</button><button class="btn" data-town-brief>Town closing intelligence</button></div>`);drawerBody.querySelector('[data-copy-brief]')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(brief);toast('Brief copied');}catch(_){toast('Copy unavailable');}});drawerBody.querySelector('[data-town-brief]')?.addEventListener('click',()=>municipalPreview({open:true}));
  }
  async function openProperty(){
    const result=await ensureMatch();if(!result)return;const f=result.facts||{};const url=f.property_id?`https://www.watchdogindex.com/home?pin=${encodeURIComponent(f.property_id)}`:`https://www.watchdogindex.com/?address=${encodeURIComponent([f.address,f.municipality,'NJ',f.zip].filter(Boolean).join(', '))}`;await bg('WDC_OPEN_URL',{url});
  }
  async function openTransaction(){
    const result=await ensureMatch();if(!result)return;const f=result.facts||{},q=new URLSearchParams();if(f.property_id)q.set('pin',f.property_id);if(f.address)q.set('address',f.address);if(f.municipality)q.set('municipality',f.municipality);if(f.zip)q.set('zip',f.zip);q.set('source','boldtrail-extension');await bg('WDC_OPEN_URL',{url:`https://www.watchdogindex.com/transaction?${q.toString()}`});
  }
  async function connect(){
    if(state.session?.connected){toast(`${planLabel(state.session.plan)} connected`);return;}
    if(state.session?.pairing){try{state.session=await bg('WDC_CLAIM_PAIRING');renderSession();toast('Watchdog connected');}catch(error){toast(error.message==='pairing_not_ready'?'Finish approval in the Watchdog tab':'Start a new Watchdog connection');}return;}
    await bg('WDC_BEGIN_CONNECT');state.session={connected:false,pairing:true};renderSession();toast('Approve this browser in Watchdog');
  }
  async function runCommand(raw){
    const value=compact(raw).toLowerCase();if(!value)return;
    command.value='';
    if(/^(enrich|one click enrich|sync|add data)/.test(value))return enrich();
    if(/town|closing|cco|co |resale|smoke|fire/.test(value))return municipalPreview({open:true});
    if(/packet/.test(value))return openPacket();
    if(/listing|appointment|brief/.test(value))return listingBrief();
    if(/transaction|closing file/.test(value))return openTransaction();
    if(/property|x-ray|xray|record/.test(value))return openProperty();
    if(/refresh|rescan|scan/.test(value)){state.result=null;state.municipal=null;await scanLocal();toast('Contact context refreshed');return;}
    openDrawer('Agent Command Bar','Try a command or use a quick action.',`<div class="notice"><b>Available now</b><br>Enrich · Town Closing · Municipal Packet · Listing Brief · Property · Transaction · Refresh</div>`);
  }
  async function action(name){
    if(name==='enrich')return enrich();if(name==='town')return municipalPreview({open:true});if(name==='packet')return openPacket();if(name==='brief')return listingBrief();if(name==='property')return openProperty();if(name==='transaction')return openTransaction();if(name==='connect')return connect();if(name==='close')return closeDrawer();if(name==='collapse'){bar.classList.toggle('collapsed');const btn=shadow.querySelector('[data-action="collapse"]');btn.textContent=bar.classList.contains('collapsed')?'▾':'▴';btn.title=bar.classList.contains('collapsed')?'Expand Watchdog':'Collapse Watchdog';return;}
  }
  shadow.querySelectorAll('[data-action]').forEach(btn=>btn.addEventListener('click',()=>action(btn.dataset.action)));
  command.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();runCommand(command.value);}});
  window.addEventListener('keydown',e=>{if(e.altKey&&e.key.toLowerCase()==='w'){e.preventDefault();bar.classList.remove('collapsed');command.focus();command.select();}} ,true);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshSession();});
  window.addEventListener('focus',refreshSession);
  window.addEventListener('popstate',()=>routeChanged(true));
  const observer=new MutationObserver(()=>routeChanged(false));observer.observe(document.documentElement,{subtree:true,childList:true});
  async function routeChanged(force){
    const href=location.href;if(!force&&href===state.lastHref)return;state.lastHref=href;state.result=null;state.municipal=null;closeDrawer();setTimeout(scanLocal,180);
  }
  setInterval(()=>routeChanged(false),800);
  refreshSession();routeChanged(true);
})();
