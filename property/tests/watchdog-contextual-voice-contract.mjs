import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const dashboardLoader = read('property/js/watchdog-dashboard-v2-intelligence.js');
const dashboardVoice = read('property/js/watchdog-dashboard-voice.js');
const todayPage = read('property/intelligence/daily/index.html');
const todayVoice = read('property/js/watchdog-today-voice.js');
const contextual = read('property/js/watchdog-contextual-analyst.js');
const voiceBrowser = read('property/js/watchdog-intelligence-voice-browser.js');

function must(condition, message) {
  if (!condition) throw new Error(message);
}

must(dashboardLoader.includes('/property/js/watchdog-contextual-analyst.js'), 'Dashboard must load the shared contextual Analyst.');
must(dashboardLoader.includes('/property/js/watchdog-intelligence-voice-browser.js'), 'Dashboard must load the browser Voice layer.');
must(dashboardLoader.includes('/property/js/watchdog-dashboard-voice.js'), 'Dashboard must load its contextual Voice bridge.');
must(dashboardLoader.includes('/property/css/watchdog-contextual-voice.css'), 'Dashboard must load contextual Voice styling.');

must(dashboardVoice.includes('WatchdogContextIntelligence.context'), 'Dashboard Voice must inherit the governed Dashboard Intelligence context.');
must(dashboardVoice.includes("surface:'dashboard'"), 'Dashboard Voice must identify its surface.');
must(dashboardVoice.includes('What changed on my important properties today?'), 'Dashboard must offer the Today-style contextual prompt.');
must(!dashboardVoice.includes('getUserMedia'), 'Dashboard bridge must not implement a second microphone stack.');

must(todayPage.includes('/property/js/watchdog-contextual-analyst.js'), 'Today must load the shared contextual Analyst.');
must(todayPage.includes('/property/js/watchdog-intelligence-voice.js'), 'Today must load the server Voice fallback.');
must(todayPage.includes('/property/js/watchdog-intelligence-voice-browser.js'), 'Today must load browser Voice.');
must(todayPage.includes('/property/js/watchdog-today-voice.js'), 'Today must load its contextual Voice bridge.');
must(todayPage.includes('/property/css/data-workbench-analyst.css'), 'Today must reuse the governed Analyst panel CSS.');

must(todayVoice.includes("scope_type:'today_queue'"), 'Today must support whole-queue context.');
must(todayVoice.includes("scope_type:'today_item'"), 'Today must support item-level context.');
must(todayVoice.includes("surface:'daily_intelligence_today'"), 'Today Voice must identify its governed surface.');
must(todayVoice.includes('today_digest_id'), 'Today item Voice must preserve digest lineage.');
must(todayVoice.includes('today_model_key'), 'Today item Voice must preserve model lineage.');
must(todayVoice.includes('data-today-voice-item'), 'Today rows must receive contextual Ask controls.');
must(!todayVoice.includes('getUserMedia'), 'Today bridge must not implement a second microphone stack.');

must(contextual.includes("client.functions.invoke('intelligence-analyst'"), 'Contextual Voice must route through the existing governed Analyst Edge Function.');
must(contextual.includes('session_id:state.sessionId'), 'Contextual follow-up must preserve Analyst session lineage.');
must(contextual.includes("interaction_surface:'contextual_voice'"), 'Contextual Analyst must identify the interaction surface.');
must(contextual.includes("panel.id='dwa-panel'"), 'Contextual Analyst must reuse the existing Voice panel contract.');
must(contextual.includes('id="dwa-input"'), 'Contextual Analyst must expose the existing Voice transcript input contract.');
must(contextual.includes("appendMessage('assistant'"), 'Contextual Analyst must render governed written answers before narration.');
must(contextual.includes('if(options.seed)input.value=String(options.seed);'), 'Seed questions may populate the input.');
must(!contextual.includes('ask(options.seed'), 'Seed questions must never auto-submit.');
must(!contextual.includes('service_role'), 'Contextual browser code must not contain a service-role credential path.');
must(!contextual.includes('raw_audio'), 'Contextual Analyst shell must not persist raw audio.');

must(voiceBrowser.includes('SpeechRecognition') || voiceBrowser.includes('webkitSpeechRecognition'), 'Existing browser Voice must remain the speech-recognition implementation.');
must(voiceBrowser.includes('speechSynthesis'), 'Existing browser Voice must remain the narration implementation.');

console.log('Watchdog contextual Dashboard + Today Voice contract passed.');
