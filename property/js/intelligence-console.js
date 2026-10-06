(function(){
'use strict';
if(window.__watchdogIntelligenceConsole)return;window.__watchdogIntelligenceConsole=true;
var mount=document.getElementById('wi-analyst-mount');
var params=new URLSearchParams(location.search);
var embedded=params.get('embed')==='1';
var requestedPin=String(params.get('pams_pin')||'').trim().slice(0,100);
var requestedFinding=String(params.get('finding_id')||'').trim().slice(0,100);
var requestedPrompt=String(params.get('prompt')||'').replace(/\s+/g,' ').trim().slice(0,1800);
if(embedded)document.documentElement.classList.add('wi-embedded');
function q(s,r){return(r||document).querySelector(s);}
function qa(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));}
function latestAssistant(){var rows=qa('.dwa-msg.assistant');return rows.length?rows[rows.length-1]:null;}
function syncRail(){var message=latestAssistant(),copy=q('#wi-brief-copy'),play=q('#wi-play-brief'),badge=q('#wi-brief-badge');if(!copy||!play)return;if(!message){copy.textContent='Ask Watchdog a question. The latest checked written answer can be played here as a voice brief.';play.disabled=true;if(badge)badge.textContent='Waiting for a written brief';return;}var p=q(':scope > p',message),text=p&&p.textContent&&p.textContent.trim();copy.textContent=text||'A checked Watchdog answer is ready. Use the message controls to inspect evidence or listen.';var listen=q('[data-dwa-listen]',message);play.disabled=!listen;if(badge)badge.textContent=listen?'Brief ready':'Voice brief preparing';}
function prefill(panel){if(!requestedPrompt||!panel)return;var input=q('#dwa-input',panel);if(!input)return;input.value=requestedPrompt;input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();}
function mountPanel(panel){if(!panel||!mount)return;var backdrop=document.getElementById('dwa-backdrop');if(backdrop)backdrop.remove();panel.removeAttribute('aria-modal');panel.setAttribute('aria-label','Watchdog Intelligence conversation');panel.classList.add('wi-mounted-analyst');mount.innerHTML='';mount.appendChild(panel);var close=q('.dwa-close',panel);if(close)close.style.display='none';var chat=q('#dwa-chat',panel);if(chat&&window.MutationObserver)new MutationObserver(function(){setTimeout(syncRail,80);}).observe(chat,{childList:true,subtree:true});setTimeout(syncRail,250);setTimeout(function(){prefill(panel);},120);}
/* The analyst needs the properties it is asked about. Without a selected
   property, attach the signed-in user's saved properties (their own rows). */
async function savedPins(){try{var sb=window.NJPTRAccess&&typeof window.NJPTRAccess.client==='function'?window.NJPTRAccess.client():null;if(!sb)return[];var res=await sb.from('saved_properties').select('pams_pin').not('pams_pin','is',null).limit(100);if(res.error)return[];var seen={};return(res.data||[]).map(function(r){return String(r.pams_pin||'').trim();}).filter(function(p){if(!/^\d{4}_.+/.test(p)||seen[p])return false;seen[p]=1;return true;});}catch(_e){return[];}}
async function open(){try{await Promise.resolve(window.njptrAccessReady);}catch(_e){return;}if(!window.WatchdogContextualAnalyst)return;var context={context_key:requestedPin?'intelligence:dashboard-property':'intelligence:standalone',scope_type:requestedPin?'property':'saved_properties'};if(requestedFinding)context.finding_id=requestedFinding;var pins=requestedPin?[requestedPin]:await savedPins();var today=new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});var panel=window.WatchdogContextualAnalyst.open({surface:'intelligence_console',pams_pins:pins,context:context,title:requestedPin?'Ask about this property':'Your brief',kicker:'Watchdog Intelligence',subtitle:requestedPin?'This property is attached. Review your question before sending.':today+' · what deserves your attention, in plain English.',contextLabel:requestedPin?'the selected dashboard property':(pins.length?pins.length+' saved propert'+(pins.length===1?'y':'ies'):'your signed-in Watchdog dashboard'),placeholder:requestedPin?'Ask about this property...':'Ask a follow-up, like \u201cwhy is the first one flagged?\u201d',chips:requestedPin?['What changed on this property?','Show me the strongest evidence.','What evidence is missing?','What should I review next?','Give me a professional brief.']:['What should I review first?','Which findings are missing important evidence?','Show me the top 10.']});mountPanel(panel);startBrief(pins);}
/* Instant brief: the workspace shows the user's saved brief straight from
   the database, then refreshes it in the background when it is older than
   six hours or the saved-property count changed. The first brief for an
   account runs once while the user waits. */
var BRIEF_PROMPT='Give me a 30-second professional brief.',BRIEF_STALE_MS=6*60*60*1000,briefNode=null,briefRefreshing=false;
function agoLabel(iso){var t=Date.parse(iso||'');if(!Number.isFinite(t))return'';var m=Math.max(0,Math.round((Date.now()-t)/60000));if(m<1)return'just now';if(m<60)return m+' min ago';var h=Math.round(m/60);if(h<24)return h+' hr ago';var d=Math.round(h/24);return d+' day'+(d===1?'':'s')+' ago';}
function statusLine(node,text,showRefresh){if(!node)return;var line=q('[data-wi-brief-status]',node);if(!line){line=document.createElement('div');line.className='dwa-brief-status';line.setAttribute('data-wi-brief-status','');var lead=q('.dwa-brief-lead',node);if(lead)lead.insertAdjacentElement('beforebegin',line);else node.insertBefore(line,node.firstChild);}
  // content-architecture: dynamic, freshness text ("Updated 40 min ago", "Updating…") reflects the saved brief's live state.
  line.textContent=text;if(showRefresh){var b=document.createElement('button');b.type='button';b.textContent='Refresh';b.setAttribute('data-wi-brief-refresh','');b.addEventListener('click',function(){refreshBrief();});line.appendChild(document.createTextNode(' \u00b7 '));line.appendChild(b);}}
async function savedBrief(){try{var sb=window.NJPTRAccess&&typeof window.NJPTRAccess.client==='function'?window.NJPTRAccess.client():null;if(!sb)return null;var r=await sb.from('intelligence_saved_briefs').select('payload,property_count,created_at').maybeSingle();return r.error?null:r.data;}catch(_e){return null;}}
function refreshBrief(){
  if(briefRefreshing||!window.WatchdogContextualAnalyst)return;briefRefreshing=true;
  var old=briefNode;
  if(old)statusLine(old,'Updating your brief\u2026',false);
  // content-architecture: dynamic, first-run state only: shown while an account has no saved brief yet.
  else{var chat=q('#dwa-chat');if(chat){chat.insertAdjacentHTML('beforeend','<div class="dwa-msg assistant dwa-brief-loading" data-wi-brief-loading><p>Writing your first brief. This one takes a little while; after that it opens instantly.</p></div>');}}
  var done=function(){briefRefreshing=false;var l=q('[data-wi-brief-loading]');if(l)l.remove();var rows=document.querySelectorAll('#dwa-chat .dwa-msg.assistant');var latest=rows.length?rows[rows.length-1]:null;if(latest&&q('.dwa-brief-lead',latest)){briefNode=latest;statusLine(latest,'Updated just now',true);}else if(old&&old.parentNode){statusLine(old,'Could not update right now',true);}setTimeout(syncRail,120);};
  Promise.resolve(window.WatchdogContextualAnalyst.ask(BRIEF_PROMPT,{suppressUser:true,saveBrief:true,replace:old||null})).then(done,done);
}
async function startBrief(pins){
  if(requestedPrompt||requestedPin||!pins.length||!window.WatchdogContextualAnalyst||!window.WatchdogContextualAnalyst.renderStored)return;
  var saved=await savedBrief();
  if(saved&&saved.payload&&saved.payload.response){
    briefNode=window.WatchdogContextualAnalyst.renderStored(saved.payload);
    var stale=Date.now()-Date.parse(saved.created_at||'')>BRIEF_STALE_MS||Number(saved.property_count||0)!==pins.length;
    statusLine(briefNode,'Updated '+agoLabel(saved.created_at),true);
    setTimeout(syncRail,120);
    if(stale)refreshBrief();
    return;
  }
  refreshBrief();
}
function clickLatestListen(){var message=latestAssistant(),button=message&&q('[data-dwa-listen]',message);if(button&&!button.disabled)button.click();}
function clickVoice(){var voice=q('#dwa-voice');if(voice&&!voice.disabled)voice.click();else{var input=q('#dwa-input');if(input)input.focus();}}
var play=q('#wi-play-brief');if(play)play.addEventListener('click',clickLatestListen);var askVoice=q('#wi-ask-voice');if(askVoice)askVoice.addEventListener('click',clickVoice);
window.addEventListener('watchdog:contextual-analyst-response',function(){setTimeout(syncRail,180);});window.addEventListener('watchdog:intelligence-voice-ready',function(){setTimeout(syncRail,180);});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',open,{once:true});else open();
})();
