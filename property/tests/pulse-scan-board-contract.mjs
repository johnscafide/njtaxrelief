import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

// Property Pulse and Appeal Scanner in the board design.
function read(p){ return fs.readFileSync(p,'utf8'); }
function must(v,m){ if(!v) throw new Error(m); }
const r=spawnSync(process.execPath,['--check','property/js/pulse.js'],{encoding:'utf8'});
must(r.status===0,'pulse.js syntax failed: '+(r.stderr||r.stdout));

const pulsePage=read('property/pulse/index.html'), pulse=read('property/js/pulse.js'), pulseCss=read('property/css/pulse-board.css'), board=read('property/css/dashboard/watchdog-dashboard-board.css');
must(pulsePage.includes('data-access-require="standard"'), 'Pulse must stay behind the access guard.');
must(pulsePage.includes('/property/js/access-guard.js') && pulsePage.includes('/property/js/sidemenu.js'), 'Pulse must keep the access guard and shared navigation.');
must(pulsePage.includes('watchdog-dashboard-board.css') && pulsePage.includes('/property/css/pulse-board.css'), 'Pulse must use the shared board stylesheet.');
must(board.includes('html body[data-sidebar-page="pulse"]'), 'Board tokens must apply to Pulse.');
must(['id="pulse-app"','id="pulse-gate"','id="pulse-cards"','id="pulse-ledger"','id="pulse-detail"','id="pulse-side"'].every(x=>pulsePage.includes(x)), 'Pulse page must keep its app, gate and board regions.');
// Every original Pulse capability survives the redesign.
must(pulse.includes("from('score_observations')") && pulse.includes(".eq('marker_id', 'watchdog.score')"), 'Pulse must plot trusted Watchdog Score observations only.');
must(pulse.includes("from('property_update_events')") && pulse.includes("update({ read_at:"), 'Pulse must read events and support Mark all read.');
must(pulse.includes("from('property_alert_preferences').upsert(") && pulse.includes("onConflict: 'user_id,pams_pin'"), 'Pulse must save per-property alert preferences.');
must(['score_change','assessment_change','tax_change','permit_change','deed_change','source_refresh'].every(t=>pulse.includes("'"+t+"'")), 'Pulse must keep every change-type filter.');
must(['alert_score','alert_tax','alert_assessment','alert_deadline'].every(k=>pulse.includes("'"+k+"'")) && pulse.includes('data-pref="paused"'), 'Pulse must keep every alert switch and pause.');
must(pulse.includes('safeUrl(e.source_url)') && pulse.includes('rel="noopener noreferrer"'), 'Event sources must be sanitized and open safely.');
must(pulse.includes('function route(path)') && !/['"]\/property\/(home|marker|dashboard)/.test(pulse), 'Pulse links must use clean WatchdogIndex routes.');
must(pulseCss.includes('prefers-reduced-motion') && !pulseCss.includes('border-left'), 'Pulse CSS must respect reduced motion and avoid border-left accents.');

const scanPage=read('property/scan/index.html'), scanCss=read('property/css/scan-board.css');
must(scanPage.indexOf('/property/css/scan-board.css')>scanPage.indexOf('/property/css/scan.css'), 'Scanner board styles must load after scan.css.');
must(!/content:\s*"[^"]*[A-Za-z]{4,}/.test(scanCss), 'Scanner board CSS must not inject text; scan.js owns every word, including the legal caveats.');
must(scanCss.includes('@media print') && !scanCss.includes('border-left'), 'Scanner board CSS must print cleanly and avoid border-left accents.');

console.log('Pulse and Appeal Scanner board contract passed.');
