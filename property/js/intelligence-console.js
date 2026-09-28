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
function syncRail(){var message=latestAssistant(),copy=q('#wi-brief-copy'),play=q('#wi-play-brief'),badge=q('#wi-brief-badge');if(!copy||!play)return;if(!message){copy.textContent='Ask Watchdog a question. The latest governed written answer can be played here as a voice brief.';play.disabled=true;if(badge)badge.textContent='Waiting for a written brief';return;}var p=q(':scope > p',message),text=p&&p.textContent&&p.textContent.trim();copy.textContent=text||'A governed Watchdog answer is ready. Use the message controls to inspect evidence or listen.';var listen=q('[data-dwa-listen]',message);play.disabled=!listen;if(badge)badge.textContent=listen?'Brief ready':'Voice brief preparing';}
function prefill(panel){if(!requestedPrompt||!panel)return;var input=q('#dwa-input',panel);if(!input)return;input.value=requestedPrompt;input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();}
function mountPanel(panel){if(!panel||!mount)return;var backdrop=document.getElementById('dwa-backdrop');if(backdrop)backdrop.remove();panel.removeAttribute('aria-modal');panel.setAttribute('aria-label','Watchdog Intelligence conversation');panel.classList.add('wi-mounted-analyst');mount.innerHTML='';mount.appendChild(panel);var close=q('.dwa-close',panel);if(close)close.style.display='none';var chat=q('#dwa-chat',panel);if(chat&&window.MutationObserver)new MutationObserver(function(){setTimeout(syncRail,80);}).observe(chat,{childList:true,subtree:true});setTimeout(syncRail,250);setTimeout(function(){prefill(panel);},120);}
/* The analyst needs the properties it is asked about. Without a selected
   property, attach the signed-in user's saved properties (their own rows). */
async function savedPins(){try{var sb=window.NJPTRAccess&&typeof window.NJPTRAccess.client==='function'?window.NJPTRAccess.client():null;if(!sb)return[];var res=await sb.from('saved_properties').select('pams_pin').not('pams_pin','is',null).limit(100);if(res.error)return[];var seen={};return(res.data||[]).map(function(r){return String(r.pams_pin||'').trim();}).filter(function(p){if(!/^\d{4}_.+/.test(p)||seen[p])return false;seen[p]=1;return true;});}catch(_e){return[];}}
async function open(){try{await Promise.resolve(window.njptrAccessReady);}catch(_e){return;}if(!window.WatchdogContextualAnalyst)return;var context={context_key:requestedPin?'intelligence:dashboard-property':'intelligence:standalone',scope_type:requestedPin?'property':'saved_properties'};if(requestedFinding)context.finding_id=requestedFinding;var pins=requestedPin?[requestedPin]:await savedPins();var today=new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});var panel=window.WatchdogContextualAnalyst.open({surface:'intelligence_console',pams_pins:pins,context:context,title:requestedPin?'Ask about this property':'Your brief',kicker:'WATCHDOG INTELLIGENCE',subtitle:requestedPin?'This property is attached. Review your question before sending.':today+' · what deserves your attention, in plain English.',contextLabel:requestedPin?'the selected dashboard property':(pins.length?pins.length+' saved propert'+(pins.length===1?'y':'ies'):'your signed-in Watchdog workspace'),placeholder:requestedPin?'Ask about this property...':'Ask a follow-up, like \u201cwhy is the first one flagged?\u201d',chips:requestedPin?['What changed on this property?','Show me the strongest evidence.','What evidence is missing?','What should I review next?','Give me a professional brief.']:['What should I review first?','Which findings are missing important evidence?','Show me the top 10.']});mountPanel(panel);startBrief(pins);}
/* Briefing first: the workspace opens on today's written brief instead of an
   empty chat. It is a read-only question over the user's own saved
   properties, cached for 20 minutes in this tab so reopening is instant. */
var BRIEF_PROMPT='Give me a 30-second professional brief.',BRIEF_KEY='wd_intel_brief_v1',BRIEF_TTL=20*60*1000;
function readBrief(){try{var x=JSON.parse(sessionStorage.getItem(BRIEF_KEY)||'null');return x&&Date.now()-x.at<BRIEF_TTL&&typeof x.html==='string'?x:null;}catch(_e){return null;}}
function saveBrief(){try{var chat=q('#dwa-chat'),first=chat&&q('.dwa-msg.assistant',chat);if(first&&q('.dwa-brief-lead',first))sessionStorage.setItem(BRIEF_KEY,JSON.stringify({at:Date.now(),html:first.outerHTML}));}catch(_e){}}
function startBrief(pins){
  if(requestedPrompt||requestedPin||!pins.length||!window.WatchdogContextualAnalyst)return;
  var chat=q('#dwa-chat');if(!chat)return;
  var cached=readBrief();
  if(cached){chat.insertAdjacentHTML('beforeend',cached.html);setTimeout(syncRail,120);return;}
  // content-architecture: dynamic — loading line carries the live saved-property count.
  chat.insertAdjacentHTML('beforeend','<div class="dwa-msg assistant dwa-brief-loading" data-wi-brief-loading><p>Reading your '+pins.length+' saved propert'+(pins.length===1?'y':'ies')+' and writing today\u2019s brief\u2026</p></div>');
  var done=function(){var l=q('[data-wi-brief-loading]');if(l)l.remove();saveBrief();window.removeEventListener('watchdog:contextual-analyst-response',done);};
  window.addEventListener('watchdog:contextual-analyst-response',done);
  Promise.resolve(window.WatchdogContextualAnalyst.ask(BRIEF_PROMPT,{suppressUser:true})).finally(function(){var l=q('[data-wi-brief-loading]');if(l)l.remove();});
}
function clickLatestListen(){var message=latestAssistant(),button=message&&q('[data-dwa-listen]',message);if(button&&!button.disabled)button.click();}
function clickVoice(){var voice=q('#dwa-voice');if(voice&&!voice.disabled)voice.click();else{var input=q('#dwa-input');if(input)input.focus();}}
var play=q('#wi-play-brief');if(play)play.addEventListener('click',clickLatestListen);var askVoice=q('#wi-ask-voice');if(askVoice)askVoice.addEventListener('click',clickVoice);
window.addEventListener('watchdog:contextual-analyst-response',function(){setTimeout(syncRail,180);});window.addEventListener('watchdog:intelligence-voice-ready',function(){setTimeout(syncRail,180);});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',open,{once:true});else open();
})();
