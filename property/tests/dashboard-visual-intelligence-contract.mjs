import fs from 'node:fs';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

// Dashboard visual intelligence contract: every summary card on the board
// must carry a real data encoding, and the news image resolver keeps its
// redirect guard.

function read(path){ return fs.readFileSync(path,'utf8'); }
function must(value,message){ if(!value) throw new Error(message); }
function syntax(path){ const r=spawnSync(process.execPath,['--check',path],{encoding:'utf8'}); if(r.status!==0) throw new Error(path+' syntax failed: '+(r.stderr||r.stdout)); }

const page=read('property/dashboard/index.html');
const css=read('property/css/dashboard/watchdog-dashboard-board.css');
const render=read('property/js/dashboard/wd-render.js');
const imageApi=read('api/nj-news-image.js');

syntax('property/js/dashboard/wd-render.js');
syntax('api/nj-news-image.js');

must(page.includes('watchdog-dashboard-board.css') && page.includes('wd-render.js'), 'Dashboard must load the board stylesheet and renderer.');
must(!css.includes('border-left'), 'Dashboard visual CSS must not use border-left.');

// Real encodings, not decoration.
must(render.includes('wdd-bars') && render.includes('Watchdog Score by property') && render.includes("Math.max(6,Math.min(100,sc))"), 'Score card must plot one bar per property from its Watchdog Score.');
must(render.includes('is-empty') && render.includes('not scored yet'), 'Unscored properties must read as unscored, not as zero.');
must(render.includes('function weekly(changes)') && render.includes('wdd-line-path') && render.includes('wdd-line-drop'), 'Changes card must plot weekly change counts and mark the busiest week.');
must(render.includes("'Looks fair'") && render.includes("'Watch'") && render.includes("'Review'") && render.includes('not rated yet'), 'Status card must count fair, watch and review properties and call out unrated ones.');
must(render.includes("'Market est.'") && render.includes("'Assessed'") && render.includes("'Annual tax'"), 'Value card must show market estimate, assessed total and annual tax.');
must(render.includes('has-events') && render.includes('is-baseline'), 'Calendar must mark change days and county appeal baselines.');
must(render.includes('aria-hidden="true" focusable="false"'), 'Card decorations must be hidden from assistive technology.');
must(render.includes('role="img" aria-label="') , 'Charts must carry a text description.');

// The change curve must never dip below zero between weeks.
const smooth=render.match(/function smoothPath\(pts,top,base\)\{[\s\S]*?\n  \}/);
must(smooth, 'smoothPath helper must exist.');
const ctx={};vm.runInNewContext(smooth[0]+';this.smoothPath=smoothPath;',ctx);
const path=ctx.smoothPath([[0,108],[10,12],[20,108],[30,108]],12,108);
const ys=path.replace(/^M/,'').split(/[ C]+/).filter(Boolean).map(Number).filter((_,i)=>i%2===1);
must(ys.every(y=>y>=12&&y<=108), 'Change curve control points must stay inside the chart.');

// News image resolver (still used by the NJ news surfaces).
must(imageApi.includes("redirect:'manual'") && imageApi.includes('allowedHost(next.hostname)'), 'Article image resolver must keep redirects inside approved publishers.');

console.log('Dashboard visual intelligence contract passed.');
