(function(){
'use strict';
if(window.__watchdogContextualAnalyst)return;window.__watchdogContextualAnalyst=true;

var state={client:null,sessionId:null,context:null,options:null,busy:false,pendingCommands:{},pendingSequence:0};
var EVIDENCE_REVIEW_PROMPT='Why was this flagged? Show source lineage.';
var COMMAND_POLICY_SRC='/property/js/watchdog-intelligence-command-policy.js?v=20260823';
var commandPolicyPromise=null;

function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function uniq(values){var seen={};return (Array.isArray(values)?values:[]).map(function(v){return String(v||'').trim();}).filter(function(v){if(!v||seen[v])return false;seen[v]=true;return true;});}
function safeUrl(value){try{var u=new URL(String(value||''),location.origin);return /^https?:$/.test(u.protocol)?u.href:'';}catch(_error){return'';}}
function getClient(){
  if(state.client)return state.client;
  try{state.client=window.NJPTRAccess&&window.NJPTRAccess.client&&window.NJPTRAccess.client();}catch(_error){}
  if(!state.client){try{state.client=window.NJPTRSupabaseRuntime&&window.NJPTRSupabaseRuntime.createClient&&window.NJPTRSupabaseRuntime.createClient();}catch(_error){}}
  return state.client;
}
function ensureCommandPolicy(){
  if(window.WatchdogIntelligenceCommandPolicy)return Promise.resolve(window.WatchdogIntelligenceCommandPolicy);
  if(commandPolicyPromise)return commandPolicyPromise;
  commandPolicyPromise=new Promise(function(resolve,reject){
    var script=document.createElement('script');script.src=COMMAND_POLICY_SRC;script.async=true;
    script.onload=function(){window.WatchdogIntelligenceCommandPolicy?resolve(window.WatchdogIntelligenceCommandPolicy):reject(new Error('Watchdog command policy did not initialize.'));};
    script.onerror=function(){reject(new Error('Watchdog command policy could not load.'));};
    document.head.appendChild(script);
  });
  return commandPolicyPromise;
}
function close(){
  var panel=document.getElementById('dwa-panel'),backdrop=document.getElementById('dwa-backdrop');
  if(panel&&panel.dataset.contextualAnalyst==='true')panel.remove();
  if(backdrop&&backdrop.dataset.contextualAnalyst==='true')backdrop.remove();
  state.sessionId=null;state.context=null;state.options=null;state.busy=false;state.pendingCommands={};
  document.documentElement.classList.remove('watchdog-contextual-analyst-open');
}
function listSection(label,items,className){
  var rows=(Array.isArray(items)?items:[]).filter(Boolean);
  if(!rows.length)return'';
  return '<div class="dwa-section '+esc(className||'')+'"><strong>'+esc(label)+'</strong><ul>'+rows.slice(0,12).map(function(x){return'<li>'+esc(typeof x==='string'?x:(x.label||x.text||JSON.stringify(x)))+'</li>';}).join('')+'</ul></div>';
}
function sourcesSection(items){
  var rows=(Array.isArray(items)?items:[]).filter(Boolean);
  if(!rows.length)return'';
  return '<div class="dwa-section"><strong>Sources</strong><div>'+rows.slice(0,10).map(function(s){
    var label=typeof s==='string'?s:(s.label||s.title||s.url||'Source'),url=typeof s==='string'?'':safeUrl(s.url);
    return url?'<a class="dwa-source" href="'+esc(url)+'" target="_blank" rel="noopener">'+esc(label)+'</a>':'<span class="dwa-source">'+esc(label)+'</span>';
  }).join('')+'</div></div>';
}
function evidenceWorkflowHtml(toolName){
  if(toolName==='run_intelligence_model')return '<div class="dwa-chips" data-dwa-evidence-workflow><button type="button" class="dwa-chip" data-contextual-evidence aria-label="Review the evidence and source lineage for this finding">Review evidence</button><small>Seeds a read-only source-lineage follow-up. Review or edit it before submitting.</small></div>';
  if(toolName==='inspect_lineage')return '<div class="dwa-provider" data-dwa-evidence-note>Read-only evidence review · No property action was taken.</div>';
  return'';
}
function responseHtml(payload){
  var response=payload&&payload.response?payload.response:payload||{};
  var provider=payload&&payload.provider?String(payload.provider):'Watchdog governed Analyst';
  var providerStatus=payload&&payload.provider_status?String(payload.provider_status):'';
  var toolName=payload&&payload.tool&&payload.tool.name?String(payload.tool.name):'';
  var conclusion=response.conclusion||'Watchdog completed the request.';
  return '<b>Watchdog</b><p>'+esc(conclusion)+'</p>'+listSection('Evidence',response.evidence,'evidence')+listSection('Missing evidence',response.missing_evidence,'missing')+listSection('Caveats',response.caveats,'caveats')+sourcesSection(response.sources)+evidenceWorkflowHtml(toolName)+'<div class="dwa-provider" data-dwa-provider-note>Governed Analyst · '+esc(provider)+(providerStatus?' · '+esc(providerStatus):'')+'</div>';
}
function appendMessage(kind,html){
  var chat=document.getElementById('dwa-chat');if(!chat)return null;
  var node=document.createElement('div');node.className='dwa-msg '+kind;node.innerHTML=html;chat.appendChild(node);
  node.scrollIntoView({block:'nearest',behavior:'smooth'});return node;
}
function errorText(error){
  var text=String(error&&error.message||error||'Watchdog Analyst is unavailable.');
  if(/non-2xx|edge function/i.test(text))return'Watchdog could not complete that Intelligence request. Your plan, entitlement, or current evidence scope may not allow it.';
  return text;
}
function commandResultNote(mode){
  if(mode==='prepare_only')return '<div class="dwa-command-result approval">Proposal only · No external, paid, destructive, legal, marketing, communication, billing, or provider-side action was executed.</div>';
  if(mode==='confirmed')return '<div class="dwa-command-result reversible">Confirmation recorded for the governed request. Voice confirmation is not authorization, and no write is considered complete unless an approved Watchdog tool records it.</div>';
  return'';
}
function showCommandGate(prompt,confirmation){
  confirmation=confirmation||{};
  var id=String(++state.pendingSequence),mode=String(confirmation.mode||'').slice(0,40);
  if(mode!=='confirmed'&&mode!=='prepare_only')return null;
  state.pendingCommands[id]={prompt:String(prompt||'').slice(0,1800),mode:mode};
  var commandClass=String(confirmation.command_class||'').slice(0,50);
  var className=commandClass==='approval_required'?'approval':'reversible';
  var html='<div class="dwa-command-gate '+className+'" data-command-gate="'+esc(id)+'" role="group" aria-label="'+esc(confirmation.title||'Command confirmation')+'"><strong>'+esc(confirmation.title||'Confirmation required')+'</strong><p>'+esc(confirmation.body||'Confirm this request before continuing.')+'</p><div class="dwa-command-actions"><button type="button" class="dwa-command-confirm" data-command-confirm="'+esc(id)+'">'+esc(confirmation.confirm_label||'Continue')+'</button><button type="button" class="dwa-command-cancel" data-command-cancel="'+esc(id)+'">Cancel</button></div><small>'+esc(commandClass==='approval_required'?'This prepares a proposal only. Existing Watchdog approval controls remain authoritative.':'This confirmation only releases the request into governed Watchdog tools. It does not expand permissions or guarantee that a write occurred.')+'</small></div>';
  return appendMessage('assistant',html);
}
function showBlockedCommand(data){
  var message=data&&data.message?String(data.message):'This command is blocked by Watchdog policy.';
  return appendMessage('assistant','<b>Watchdog</b><div class="dwa-command-gate prohibited" role="alert"><strong>Command blocked</strong><p>'+esc(message)+'</p><small>No request was sent to the governed Analyst and no action was taken.</small></div>');
}
async function tryLocalReadOnly(prompt,options){
  if(options&&options.commandConfirmation)return false;
  if(!/\bopen\b.{0,25}\b(?:evidence|sources?|lineage)\b/i.test(String(prompt||'')))return false;
  try{
    var policy=await ensureCommandPolicy(),decision=policy.classify(prompt);
    if(decision.class!==policy.CLASSES.read_only||decision.action!=='focus_evidence')return false;
    var chat=document.getElementById('dwa-chat');if(!chat)return false;
    var messages=Array.prototype.slice.call(chat.querySelectorAll('.dwa-msg.assistant')).reverse(),target=null;
    messages.some(function(message){target=message.querySelector('.dwa-section.evidence')||Array.prototype.find.call(message.querySelectorAll('.dwa-section'),function(section){var strong=section.querySelector('strong');return strong&&String(strong.textContent||'').trim().toLowerCase()==='sources';});return !!target;});
    if(!target)return false;
    if(!options.suppressUser)appendMessage('user','<p>'+esc(prompt)+'</p>');
    target.setAttribute('tabindex','-1');target.scrollIntoView({block:'center',behavior:'smooth'});try{target.focus({preventScroll:true});}catch(_error){target.focus();}
    appendMessage('assistant','<b>Watchdog</b><p>Evidence is open in the current written response.</p><div class="dwa-provider" data-dwa-local-read-only>Read-only navigation · No Analyst request or property action was executed.</div>');
    var input=document.getElementById('dwa-input');if(input){input.value='';input.focus();}
    window.dispatchEvent(new CustomEvent('watchdog:intelligence-command-local',{detail:{surface:state.context&&state.context.surface||'unknown',command_class:'read_only',action:'focus_evidence'}}));
    return true;
  }catch(_error){return false;}
}
async function ask(prompt,options){
  options=options||{};prompt=String(prompt||'').trim();
  if(!prompt||state.busy)return;
  if(await tryLocalReadOnly(prompt,options))return;
  var client=getClient(),input=document.getElementById('dwa-input'),send=document.getElementById('dwa-send');
  if(!client){appendMessage('assistant','<b>Watchdog</b><p>Watchdog Intelligence is unavailable because the signed-in runtime could not be resolved.</p>');return;}
  state.busy=true;if(send)send.disabled=true;if(input)input.disabled=true;
  if(!options.suppressUser)appendMessage('user','<p>'+esc(prompt)+'</p>');
  try{
    var sessionResult=await client.auth.getSession();
    var accessToken=sessionResult&&sessionResult.data&&sessionResult.data.session&&sessionResult.data.session.access_token?String(sessionResult.data.session.access_token):'';
    if(!accessToken)throw new Error('Sign in required');
    var response=await fetch('/api/watchdog-intelligence-analyst',{method:'POST',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},body:JSON.stringify({prompt:prompt,session_id:state.sessionId,context:state.context||{},command_confirmation:options.commandConfirmation||null})});
    var data=await response.json().catch(function(){return{};});
    if(response.status===409&&data&&data.confirmation){showCommandGate(prompt,data.confirmation);if(input){input.value='';input.focus();}return;}
    if(response.status===403&&data&&data.command_policy&&data.command_policy.class==='prohibited'){showBlockedCommand(data);if(input){input.value='';input.focus();}return;}
    if(!response.ok)throw new Error(data&&data.error?String(data.error):'Watchdog Analyst request failed');
    if(data.session_id)state.sessionId=String(data.session_id);
    appendMessage('assistant',responseHtml(data)+commandResultNote(options.commandConfirmation||''));
    if(input){input.value='';input.focus();}
    window.dispatchEvent(new CustomEvent('watchdog:contextual-analyst-response',{detail:{surface:state.context&&state.context.surface||'unknown',session_id:state.sessionId||null,command_confirmation:options.commandConfirmation||null}}));
  }catch(error){
    appendMessage('assistant','<b>Watchdog</b><p>'+esc(errorText(error))+'</p><div class="dwa-provider" data-dwa-provider-note>No property action was taken.</div>');
  }finally{
    state.busy=false;if(send)send.disabled=false;if(input)input.disabled=false;
  }
}
function chipList(options){
  var chips=Array.isArray(options.chips)?options.chips:[];
  return chips.slice(0,6).map(function(text){return'<button type="button" class="dwa-chip" data-contextual-chip="'+esc(text)+'">'+esc(text)+'</button>';}).join('');
}
function open(options){
  options=options||{};
  close();
  var pins=uniq(options.pams_pins).slice(0,100);
  var surface=String(options.surface||'watchdog').slice(0,80);
  var context=Object.assign({},options.context||{},{surface:surface,pams_pins:pins,interaction_surface:'contextual_voice'});
  state.options=options;state.context=context;state.sessionId=null;

  var backdrop=document.createElement('div');backdrop.id='dwa-backdrop';backdrop.className='dwa-backdrop';backdrop.dataset.contextualAnalyst='true';
  var panel=document.createElement('aside');panel.id='dwa-panel';panel.className='dwa-panel';panel.dataset.contextualAnalyst='true';panel.dataset.watchdogSurface=surface;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label',options.title||'Ask Watchdog');
  var contextText=options.contextLabel||((pins.length===1?'1 property':pins.length+' properties')+' in the current Watchdog context');
  panel.innerHTML='<div class="dwa-head"><div><span>'+esc(options.kicker||'WATCHDOG INTELLIGENCE')+'</span><h2>'+esc(options.title||'Ask Watchdog')+'</h2><p>'+esc(options.subtitle||'Ask, follow up, inspect evidence, or use Voice without leaving this page.')+'</p></div><button class="dwa-close" type="button" aria-label="Close Ask Watchdog"><i class="fas fa-xmark"></i></button></div><div class="dwa-body" id="dwa-body"><div class="dwa-note"><b>Current context:</b> '+esc(contextText)+'. Spoken and typed questions use the same governed Analyst, plan gates, approved tools, evidence, source rules, and command policy.</div><div class="dwa-chips">'+chipList(options)+'</div><div class="dwa-chat" id="dwa-chat"></div><div class="dwa-compose"><textarea id="dwa-input" aria-label="Ask Watchdog" placeholder="'+esc(options.placeholder||'Ask Watchdog about the current context...')+'"></textarea><div class="dwa-compose-row"><small>Voice always shows a transcript before submission. Consequential commands retain confirmation and approval gates.</small><button class="dwa-send" id="dwa-send" type="button">Ask Watchdog</button></div></div></div>';
  document.body.appendChild(backdrop);document.body.appendChild(panel);document.documentElement.classList.add('watchdog-contextual-analyst-open');
  backdrop.addEventListener('click',close);panel.querySelector('.dwa-close').addEventListener('click',close);
  panel.querySelectorAll('[data-contextual-chip]').forEach(function(button){button.addEventListener('click',function(){var input=document.getElementById('dwa-input');if(input){input.value=button.dataset.contextualChip||'';input.focus();}});});
  panel.addEventListener('click',function(event){
    var evidenceTarget=event.target&&event.target.closest?event.target.closest('[data-contextual-evidence]'):null;
    if(evidenceTarget&&panel.contains(evidenceTarget)){
      var evidenceInput=document.getElementById('dwa-input');
      if(evidenceInput){evidenceInput.value=EVIDENCE_REVIEW_PROMPT;evidenceInput.focus();evidenceInput.dispatchEvent(new Event('input',{bubbles:true}));}
      window.dispatchEvent(new CustomEvent('watchdog:contextual-evidence-review-seeded',{detail:{surface:surface,session_id:state.sessionId||null}}));
      return;
    }
    var confirm=event.target&&event.target.closest?event.target.closest('[data-command-confirm]'):null;
    if(confirm&&panel.contains(confirm)){
      var confirmId=String(confirm.getAttribute('data-command-confirm')||''),pending=state.pendingCommands[confirmId];
      if(!pending)return;
      delete state.pendingCommands[confirmId];
      var gate=confirm.closest('[data-command-gate]');if(gate){gate.querySelectorAll('button').forEach(function(button){button.disabled=true;});gate.classList.add('confirmed');}
      window.dispatchEvent(new CustomEvent('watchdog:intelligence-command-confirmed',{detail:{surface:surface,mode:pending.mode}}));
      ask(pending.prompt,{commandConfirmation:pending.mode,suppressUser:true});
      return;
    }
    var cancel=event.target&&event.target.closest?event.target.closest('[data-command-cancel]'):null;
    if(cancel&&panel.contains(cancel)){
      var cancelId=String(cancel.getAttribute('data-command-cancel')||''),cancelled=state.pendingCommands[cancelId];
      if(!cancelled)return;
      delete state.pendingCommands[cancelId];
      var cancelGate=cancel.closest('[data-command-gate]');if(cancelGate)cancelGate.innerHTML='<strong>Cancelled</strong><p>No action was taken.</p>';
      window.dispatchEvent(new CustomEvent('watchdog:intelligence-command-cancelled',{detail:{surface:surface,mode:cancelled.mode}}));
    }
  });
  var input=panel.querySelector('#dwa-input'),send=panel.querySelector('#dwa-send');
  send.addEventListener('click',function(){ask(input.value);});
  input.addEventListener('keydown',function(event){if((event.metaKey||event.ctrlKey)&&event.key==='Enter'){event.preventDefault();ask(input.value);}});
  if(options.seed)input.value=String(options.seed);
  setTimeout(function(){input.focus();},30);
  window.dispatchEvent(new CustomEvent('watchdog:contextual-analyst-open',{detail:{surface:surface,pams_pins:pins.slice(0,5)}}));
  return panel;
}
window.WatchdogContextualAnalyst={open:open,close:close,ask:ask,contract:'contextual-analyst-v4-command-gates'};
})();
