import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

function read(path){ return fs.readFileSync(path,'utf8'); }
function must(value,message){ if(!value) throw new Error(message); }
function syntax(path){ const r=spawnSync(process.execPath,['--check',path],{encoding:'utf8'}); if(r.status!==0) throw new Error(path+' syntax failed: '+(r.stderr||r.stdout)); }

const page=read('property/dashboard/index.html');
const css=read('property/css/dashboard/watchdog-dashboard-visuals.css');
const core=read('property/js/dashboard/wd-dashboard-visual-core.js');
const news=read('property/js/dashboard/wd-dashboard-news-visuals.js');
const imageApi=read('api/nj-news-image.js');

syntax('property/js/dashboard/wd-dashboard-visual-core.js');
syntax('property/js/dashboard/wd-dashboard-news-visuals.js');
syntax('api/nj-news-image.js');

must(page.includes('watchdog-dashboard-visuals.css'), 'Dashboard must load the visual intelligence stylesheet.');
must(page.includes('wd-dashboard-visual-core.js'), 'Dashboard must load the visual core.');
must(page.includes('wd-dashboard-news-visuals.js'), 'Dashboard must load news visuals.');
must(!css.includes('border-left'), 'New dashboard visual CSS must not use border-left.');
must(core.includes("a.href='/property/'"), 'Sidebar brand must route to property index.');
must(core.includes("from('profiles')") && core.includes("from('professional_preferences')"), 'Dashboard identity must use saved profile/profession data.');
must(core.includes('license_number') && core.includes('brokerage_name'), 'Agent identity must include license and brokerage when available.');
must(core.includes('wdd-dual-bars') && core.includes('wdd-gap-track') && core.includes('wdd-ring-viz'), 'KPI row must include real visual encodings.');
must(core.includes('wdd-adaptive') && core.includes('Portfolio readiness') && core.includes('Change velocity'), 'Dashboard must fill available space with adaptive live modules.');
must(core.includes('basemaps.cartocdn.com') && core.includes('wdd-feed-pin'), 'Property changes must use mapped property-pin visuals.');
must(news.includes('/api/nj-news-image?url='), 'News cards must resolve publisher hero images.');
must(imageApi.includes("redirect:'manual'") && imageApi.includes('allowedHost(next.hostname)'), 'Article image resolver must keep redirects inside approved publishers.');

console.log('Dashboard visual intelligence contract passed.');
