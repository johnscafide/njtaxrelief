(function(){
'use strict';

var currentRow=null;
var handoffState=null;
var PROJECT_URL_KEY='watchdogChatGPTProjectUrl';

function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];});}
function fmtDate(value){try{return new Intl.DateTimeFormat('en-US',{month:'long',day:'numeric',year:'numeric'}).format(new Date(value+'T12:00:00'));}catch(_){return value;}}
function stateError(message){var state=document.getElementById('recap-state');if(!state)return;state.classList.add('wr-error');state.innerHTML='<i class="fas fa-triangle-exclamation"></i><b>Unable to load recap</b><span>'+esc(message||'The protected recap could not be loaded.')+'</span>';}
async function token(){var client=window.NJPTRAccess&&window.NJPTRAccess.client?window.NJPTRAccess.client():null;if(!client)throw new Error('Authentication client unavailable.');var result=await client.auth.getSession();var session=result&&result.data&&result.data.session;if(!session||!session.access_token)throw new Error('Developer session unavailable.');return session.access_token;}
async function getRows(date){var t=await token();var url='/api/watchdog-recaps'+(date?'?date='+encodeURIComponent(date):'');var response=await fetch(url,{headers:{Authorization:'Bearer '+t},cache:'no-store'});var data=await response.json().catch(function(){return {};});if(!response.ok)throw new Error(data.error||'Recap request failed.');return Array.isArray(data.rows)?data.rows:[];}

function archive(rows){
  var app=document.getElementById('recap-app'),state=document.getElementById('recap-state'),list=document.getElementById('recap-list'),count=document.getElementById('recap-count');
  if(!app||!list)return;
  if(count)count.textContent=rows.length+' daily '+(rows.length===1?'record':'records');
  list.innerHTML=rows.length?rows.map(function(row){return '<article class="wr-row"><div class="wr-date">'+esc(fmtDate(row.recap_date))+'</div><div><h3>'+esc(row.headline)+'</h3><p>'+esc(row.executive_summary)+'</p></div><a href="/property/logs/recap/'+esc(row.recap_date)+'/">Open recap <i class="fas fa-arrow-right"></i></a></article>';}).join(''):'<div class="wr-empty">No daily recaps have been recorded yet.</div>';
  if(state)state.hidden=true;
  app.hidden=false;
}

var sectionMeta={completed:['Completed','fa-circle-check'],in_progress:['In progress','fa-spinner'],started:['Started','fa-play'],remaining:['Left to finish','fa-list-check'],todo:['Today\'s ranked TODO','fa-bullseye']};

function issueIds(item){
  var explicit=Array.isArray(item&&item.linear_issues)?item.linear_issues.filter(function(id){return /^NJW-\d+$/.test(String(id||''));}):[];
  if(explicit.length)return explicit.filter(function(id,index,array){return array.indexOf(id)===index;});
  var source=[item&&item.title,item&&item.item,item&&item.detail].filter(Boolean).join(' ');
  var found=source.match(/NJW-\d+/g)||[];
  return found.filter(function(id,index,array){return array.indexOf(id)===index;});
}

function issueLinks(item){
  var ids=issueIds(item);
  if(!ids.length)return '';
  return '<div class="wr-linear-links" aria-label="Mapped Linear issues">'+ids.map(function(id){return '<a href="https://linear.app/njwatchdog/issue/'+esc(id)+'" target="_blank" rel="noopener noreferrer"><i class="fas fa-list-check"></i>'+esc(id)+'</a>';}).join('')+'</div>';
}

function handoffButton(key,index){
  if(key!=='in_progress'&&key!=='todo')return '';
  return '<button type="button" class="wr-handoff" data-handoff-section="'+esc(key)+'" data-handoff-index="'+index+'" title="Copy the prepared Watchdog handoff prompt and open your ChatGPT Project"><i class="fas fa-arrow-up-right-from-square"></i><span>Handoff</span><small>Prompt ready</small></button>';
}

function renderItems(key,items){
  if(!Array.isArray(items)||!items.length)return '';
  var meta=sectionMeta[key]||[key,'fa-circle'];
  var todo=key==='todo';
  return '<section class="wr-section '+(todo?'wr-todo':'')+'"><div class="wr-section-head"><span class="wr-section-icon"><i class="fas '+meta[1]+'"></i></span><h2>'+meta[0]+'</h2>'+(key==='in_progress'||key==='todo'?'<span class="wr-section-note"><i class="fas fa-bolt"></i> Ready for handoff</span>':'')+'</div><div class="wr-items">'+items.map(function(item,index){
    if(todo){
      return '<article class="wr-item wr-item-actionable"><span class="wr-rank">'+esc(item.rank||index+1)+'</span><div class="wr-item-main"><b>'+esc(item.item||'')+'</b>'+issueLinks(item)+'</div>'+handoffButton(key,index)+'</article>';
    }
    var label=item.area||item.priority||'';
    return '<article class="wr-item '+(key==='in_progress'?'wr-item-actionable':'')+'"><div class="wr-item-main"><div class="wr-item-top">'+(label?'<span class="wr-area">'+esc(label)+'</span>':'')+'<b>'+esc(item.title||item.item||'')+'</b></div>'+(item.detail?'<p>'+esc(item.detail)+'</p>':'')+issueLinks(item)+'</div>'+handoffButton(key,index)+'</article>';
  }).join('')+'</div></section>';
}

function detail(row){
  currentRow=row;
  var state=document.getElementById('recap-state'),head=document.getElementById('recap-detail-head'),detail=document.getElementById('recap-detail');
  document.getElementById('recap-headline').textContent=row.headline||'';
  document.getElementById('recap-summary').textContent=row.executive_summary||'';
  var chips=document.getElementById('recap-system-chips');
  if(chips){var systems=row.systems&&typeof row.systems==='object'?row.systems:{};chips.innerHTML=Object.keys(systems).map(function(k){return '<span class="wr-chip">'+esc(k.replace(/_/g,' '))+': '+esc(systems[k])+'</span>';}).join('');}
  detail.innerHTML=['completed','in_progress','started','remaining','todo'].map(function(key){return renderItems(key,row[key]);}).join('');
  if(state)state.hidden=true;
  if(head)head.hidden=false;
  detail.hidden=false;
}

function normalizeProjectUrl(value){
  try{
    var parsed=new URL(String(value||'').trim());
    var host=String(parsed.hostname||'').toLowerCase();
    if(parsed.protocol!=='https:')return '';
    if(host!=='chatgpt.com'&&host!=='www.chatgpt.com'&&host!=='chat.openai.com')return '';
    return parsed.href;
  }catch(_){return '';}
}

function savedProjectUrl(){
  try{return normalizeProjectUrl(localStorage.getItem(PROJECT_URL_KEY)||'');}catch(_){return '';}
}

function saveProjectUrl(value){
  var normalized=normalizeProjectUrl(value);
  if(!normalized)throw new Error('Paste the URL of your Watchdog Project from chatgpt.com.');
  try{localStorage.setItem(PROJECT_URL_KEY,normalized);}catch(_){throw new Error('This browser could not save the Watchdog Project URL.');}
  return normalized;
}

function handoffPrompt(section,item,index){
  var date=currentRow&&currentRow.recap_date?currentRow.recap_date:document.body.getAttribute('data-recap-date')||'';
  var ids=issueIds(item);
  var title=section==='todo'?'Today priority #'+String(item.rank||index+1):String(item.title||item.item||'Watchdog task');
  var task=String(item.item||item.title||'');
  var detailText=String(item.detail||'');
  var area=String(item.area||'Watchdog');
  var special=String(item.handoff_note||'');
  var lines=[
    '@GitHub @Linear @Supabase',
    '',
    'Continue directly on this Watchdog task from the '+date+' daily operating recap.',
    '',
    'AREA: '+area,
    'HANDOFF: '+title,
    'TASK: '+task
  ];
  if(detailText)lines.push('CONTEXT: '+detailText);
  if(ids.length)lines.push('LINEAR: '+ids.join(', '));
  if(special)lines.push('SPECIAL HANDOFF NOTE: '+special);
  lines=lines.concat([
    '',
    'Start by reading the current mapped Linear issue(s), current GitHub main branch, and the relevant production Supabase state before changing anything. Other Watchdog chats and automations may be working concurrently, so do not assume the recap is the latest implementation state and do not redo work that has already landed.',
    '',
    'Work this task aggressively now and close as much executable work as the evidence supports. Prefer completing and verifying real work over planning or creating backlog.',
    '',
    'Operating requirements:',
    '- Re-fetch current main and current file SHAs immediately before every GitHub write so concurrent work is never overwritten.',
    '- Reuse and update the mapped Linear issue(s). Do not create a duplicate issue unless the current scope genuinely has no appropriate existing issue.',
    '- Preserve entitlement, RLS, privacy, billing, security, compliance, evidence-lineage, provenance, accessibility, and data-governance boundaries.',
    '- Do not fabricate completion, sources, LIVE status, provider behavior, customer outcomes, test evidence, or external certification.',
    '- If an owner/provider/external dependency blocks part of the work, document exactly what is blocked, complete every safe adjacent step that can be done now, and leave the issue status truthful.',
    '- Run the relevant tests, canaries, contracts, visual checks, or production verification for the work you change.',
    '- Update Linear with what changed, what was verified, what remains, and any blocker that now requires owner input.',
    '- Commit validated changes to main when the work is safe to ship.',
    '- Do not weaken or silently open billing, vendor-send, auth, privacy, or other production gates just to close the task.',
    '',
    'At the end, give me a concise completion summary. If meaningful work remains, include a clean next-chat handoff; otherwise mark the mapped Linear work complete only when its acceptance criteria are actually satisfied.'
  ]);
  return lines.join('\n');
}

function ensureModal(){
  var modal=document.getElementById('wr-handoff-modal');
  if(modal)return modal;
  modal=document.createElement('div');
  modal.id='wr-handoff-modal';
  modal.className='wr-handoff-modal';
  modal.hidden=true;
  modal.innerHTML='<div class="wr-handoff-backdrop" data-handoff-close></div><section class="wr-handoff-dialog" role="dialog" aria-modal="true" aria-labelledby="wr-handoff-title"><button type="button" class="wr-handoff-close" data-handoff-close aria-label="Close handoff"><i class="fas fa-xmark"></i></button><span class="wr-kicker">WATCHDOG PROJECT HANDOFF</span><h2 id="wr-handoff-title">Ready to continue this task</h2><p class="wr-handoff-intro">The task-specific prompt is already prepared. Save your Watchdog ChatGPT Project URL once, then future Handoff buttons will copy the prompt and open that Project automatically.</p><div class="wr-handoff-issue-row" id="wr-handoff-issues"></div><label class="wr-handoff-field"><span>Prepared prompt</span><textarea id="wr-handoff-prompt" rows="16" spellcheck="false"></textarea></label><div class="wr-project-config" id="wr-project-config"><label class="wr-handoff-field"><span>Watchdog ChatGPT Project URL</span><input id="wr-project-url" type="url" inputmode="url" placeholder="Paste the URL of your Watchdog Project in ChatGPT"></label><small>This stays only in this browser via local storage; it is not written to GitHub or Supabase.</small></div><div class="wr-handoff-error" id="wr-handoff-error" hidden></div><div class="wr-handoff-actions"><button type="button" class="wr-button wr-button-secondary" data-handoff-copy><i class="fas fa-copy"></i> Copy prompt</button><button type="button" class="wr-button wr-button-primary" data-handoff-open><i class="fas fa-arrow-up-right-from-square"></i> Copy + open Watchdog Project</button></div></section>';
  document.body.appendChild(modal);
  return modal;
}

function showModal(prompt,item){
  var modal=ensureModal();
  handoffState={prompt:prompt,item:item};
  var textarea=modal.querySelector('#wr-handoff-prompt');
  textarea.value=prompt;
  var input=modal.querySelector('#wr-project-url');
  input.value=savedProjectUrl();
  var ids=issueIds(item);
  var issues=modal.querySelector('#wr-handoff-issues');
  issues.innerHTML=ids.length?'<span>Mapped work</span>'+ids.map(function(id){return '<a href="https://linear.app/njwatchdog/issue/'+esc(id)+'" target="_blank" rel="noopener noreferrer">'+esc(id)+'</a>';}).join(''):'<span>No mapped Linear issue yet; the handoff prompt tells ChatGPT to reuse an existing issue before creating one.</span>';
  var error=modal.querySelector('#wr-handoff-error');
  error.hidden=true;
  error.textContent='';
  modal.hidden=false;
  document.body.classList.add('wr-modal-open');
  window.setTimeout(function(){textarea.focus();textarea.setSelectionRange(0,0);},20);
}

function closeModal(){var modal=document.getElementById('wr-handoff-modal');if(!modal)return;modal.hidden=true;document.body.classList.remove('wr-modal-open');handoffState=null;}

async function copyText(text){
  if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(text);return true;}
  var temp=document.createElement('textarea');temp.value=text;temp.setAttribute('readonly','');temp.style.cssText='position:fixed;left:-9999px;top:0';document.body.appendChild(temp);temp.select();var ok=document.execCommand('copy');temp.remove();if(!ok)throw new Error('Copy failed.');return true;
}

function toast(message){
  var old=document.getElementById('wr-toast');if(old)old.remove();
  var node=document.createElement('div');node.id='wr-toast';node.className='wr-toast';node.innerHTML='<i class="fas fa-circle-check"></i><span>'+esc(message)+'</span>';document.body.appendChild(node);
  requestAnimationFrame(function(){node.classList.add('show');});
  window.setTimeout(function(){node.classList.remove('show');window.setTimeout(function(){node.remove();},180);},2600);
}

async function copyAndOpen(prompt,url){
  var popup=null;
  try{popup=window.open(url,'_blank');if(popup)popup.opener=null;}catch(_){}
  await copyText(prompt);
  toast(popup?'Handoff prompt copied. Paste it into the new Watchdog chat.':'Handoff prompt copied. Open the Watchdog Project and paste it.');
}

function launchHandoff(section,index){
  if(!currentRow)return;
  var items=currentRow[section];
  if(!Array.isArray(items)||!items[index])return;
  var item=items[index];
  var prompt=handoffPrompt(section,item,index);
  var projectUrl=savedProjectUrl();
  if(projectUrl){
    copyAndOpen(prompt,projectUrl).catch(function(){showModal(prompt,item);var error=document.getElementById('wr-handoff-error');if(error){error.hidden=false;error.textContent='The prompt is ready below. Copy it manually, then open the Watchdog Project.';}});
    return;
  }
  showModal(prompt,item);
}

function bindHandoffs(){
  document.addEventListener('click',function(event){
    var button=event.target.closest('[data-handoff-section]');
    if(button){event.preventDefault();launchHandoff(button.getAttribute('data-handoff-section'),Number(button.getAttribute('data-handoff-index'))||0);return;}
    if(event.target.closest('[data-handoff-close]')){event.preventDefault();closeModal();return;}
    var copy=event.target.closest('[data-handoff-copy]');
    if(copy){event.preventDefault();var textarea=document.getElementById('wr-handoff-prompt');copyText(textarea?textarea.value:(handoffState&&handoffState.prompt)||'').then(function(){toast('Handoff prompt copied.');}).catch(function(error){var box=document.getElementById('wr-handoff-error');if(box){box.hidden=false;box.textContent=error.message||'Copy failed.';}});return;}
    var open=event.target.closest('[data-handoff-open]');
    if(open){
      event.preventDefault();
      var input=document.getElementById('wr-project-url'),textarea=document.getElementById('wr-handoff-prompt'),box=document.getElementById('wr-handoff-error');
      try{
        var url=saveProjectUrl(input?input.value:'');
        var promptText=textarea?textarea.value:(handoffState&&handoffState.prompt)||'';
        copyAndOpen(promptText,url).then(closeModal).catch(function(error){if(box){box.hidden=false;box.textContent=error.message||'Unable to open the Watchdog Project.';}});
      }catch(error){if(box){box.hidden=false;box.textContent=error.message||'Enter a valid Watchdog Project URL.';}if(input)input.focus();}
    }
  });
  document.addEventListener('keydown',function(event){if(event.key==='Escape'&&document.getElementById('wr-handoff-modal')&&!document.getElementById('wr-handoff-modal').hidden)closeModal();});
}

async function run(){
  try{
    if(window.njptrAccessReady)await window.njptrAccessReady;
    var mode=document.body.getAttribute('data-recap-mode')||'archive';
    var date=document.body.getAttribute('data-recap-date')||'';
    var rows=await getRows(mode==='detail'?date:'');
    if(mode==='detail'){if(!rows.length)throw new Error('Recap not found.');detail(rows[0]);}else archive(rows);
  }catch(error){stateError(error&&error.message?error.message:'Unable to load recap.');}
}

bindHandoffs();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
})();
