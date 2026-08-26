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
async function open(){try{await Promise.resolve(window.njptrAccessReady);}catch(_e){return;}if(!window.WatchdogContextualAnalyst)return;var context={context_key:requestedPin?'intelligence:dashboard-property':'intelligence:standalone',scope_type:requestedPin?'property':'saved_properties'};if(requestedPin)context.pams_pins=[requestedPin];if(requestedFinding)context.finding_id=requestedFinding;var panel=window.WatchdogContextualAnalyst.open({surface:'intelligence_console',context:context,title:'Watchdog Intelligence',kicker:'ANALYST · EVIDENCE-BACKED',subtitle:requestedPin?'Dashboard property context is attached. Review the question before sending.':'Full conversation, evidence review and governed Voice in one workspace.',contextLabel:requestedPin?'the selected dashboard property':'your signed-in Watchdog workspace',placeholder:'Ask Watchdog what changed, what matters, or what to review next...',chips:requestedPin?['What changed on this property?','Show me the strongest evidence.','What evidence is missing?','What should I review next?','Give me a professional brief.']:['What changed on my important properties?','What should I review first?','Show me the strongest evidence-backed opportunity.','Give me a 30-second professional brief.','Which findings are missing important evidence?']});mountPanel(panel);}
function clickLatestListen(){var message=latestAssistant(),button=message&&q('[data-dwa-listen]',message);if(button&&!button.disabled)button.click();}
function clickVoice(){var voice=q('#dwa-voice');if(voice&&!voice.disabled)voice.click();else{var input=q('#dwa-input');if(input)input.focus();}}
var play=q('#wi-play-brief');if(play)play.addEventListener('click',clickLatestListen);var askVoice=q('#wi-ask-voice');if(askVoice)askVoice.addEventListener('click',clickVoice);
window.addEventListener('watchdog:contextual-analyst-response',function(){setTimeout(syncRail,180);});window.addEventListener('watchdog:intelligence-voice-ready',function(){setTimeout(syncRail,180);});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',open,{once:true});else open();
})();
