import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

// Property Home board contract: the analysis tools the sections call are
// shipped, current and loaded before the Home bundle, and the board layer
// only arranges what home.js rendered.

function read(path){ return fs.readFileSync(path,'utf8'); }
function must(value,message){ if(!value) throw new Error(message); }
function syntax(path){ const r=spawnSync(process.execPath,['--check',path],{encoding:'utf8'}); if(r.status!==0) throw new Error(path+' syntax failed: '+(r.stderr||r.stdout)); }

const page=read('property/home/index.html');
const home=read('property/js/home.js');
const tools=read('property/js/dashboard/home/home-tools.js');
const board=read('property/js/dashboard/home/home-board.js');
const css=read('property/css/home/home-board.css');

['property/js/home.js','property/js/dashboard/home/home-tools.js','property/js/dashboard/home/home-board.js'].forEach(syntax);

const check=spawnSync(process.execPath,['scripts/build-home-tools.mjs','--check'],{encoding:'utf8'});
must(check.status===0, (check.stderr||check.stdout||'').trim() || 'home-tools.js is stale.');
must(!/^\s*(import|export)\s/m.test(tools) && !/;\s*export\s*\{/.test(tools), 'home-tools.js must be a classic script (no import/export).');

const scripts=[...page.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/g)].map(m=>({src:m[1].split('?')[0],tag:m[0]}));
const idx=src=>scripts.findIndex(s=>s.src===src);
const toolsIdx=idx('/property/js/dashboard/home/home-tools.js'), homeIdx=idx('/property/js/home.js'), boardIdx=idx('/property/js/dashboard/home/home-board.js');
must(toolsIdx>=0 && homeIdx>toolsIdx && !/\b(defer|async)\b/.test(scripts[toolsIdx].tag), 'home-tools.js must load, synchronously, before property/js/home.js.');
must(boardIdx>homeIdx, 'home-board.js must load after property/js/home.js.');
must(page.indexOf('/property/css/home/home-board.css')>page.indexOf('/property/css/home.css'), 'Board stylesheet must load after home.css.');

// Every tool function a Home section calls must be published by home-tools.js.
const sectionsSrc=home.slice(home.indexOf('var SECTIONS'), home.indexOf('var HOME_SECTION_MODULES'));
must(sectionsSrc.length>200, 'Could not find the Home SECTIONS table.');
const called=[...new Set([...sectionsSrc.matchAll(/\b((?:tool|townIntelligence|budgetPressure)[A-Z]?\w*)\s*\(/g)].map(m=>m[1]))].filter(n=>!/^tool$/.test(n));
const missing=called.filter(n=>!new RegExp('\\b'+n+'\\b').test(tools) && !new RegExp('function '+n+'\\b').test(home));
must(!missing.length, 'Home sections call tools that are not shipped: '+missing.join(', '));

// Sections wait for tool reference data; the bundle never dynamically imports.
must(home.includes('function toolsReady() { return window.NJPropertyToolsReady || Promise.resolve(); }') && home.includes('loadHomeTools().then(function () { buildSectionReady(k, sec, host); });'), 'Home sections must wait for NJPropertyToolsReady before building.');
must(!/import\(\s*['"][^'"]*tools\//.test(home), 'Property Home must not dynamically import tool modules.');
must(tools.includes('window.NJPropertyToolsReady = Promise.all('), 'home-tools.js must publish NJPropertyToolsReady.');

// Board layer: presentation only, explanations preserved.
must(!/\bfetch\(|\.from\(|\.rpc\(/.test(board), 'home-board.js must not fetch or query data.');
must(board.includes("link.classList.add('hb-why')") && !board.includes('removeAttribute(\'data-marker-id\')') && !board.includes('link.href ='), '"Why this?" must keep the existing marker link and hover explanation.');
const moduleKeys=Object.keys(Function('return {'+home.match(/var HOME_SECTION_MODULES = \{([\s\S]*?)\n  \};/)[1]+'}')());
const grouped=[...board.matchAll(/keys: \[([^\]]*)\]/g)].flatMap(m=>m[1].match(/'([a-z]+)'/g).map(s=>s.replace(/'/g,'')));
const ungrouped=moduleKeys.filter(k=>!grouped.includes(k));
must(!ungrouped.length, 'Every Home section needs a board group: '+ungrouped.join(', '));
must(board.includes("id: 'more'"), 'Unknown future sections must fall into a "More analysis" group rather than disappear.');
must(css.includes('prefers-reduced-motion') && css.includes('@media print') && !css.includes('border-left'), 'Board CSS must respect reduced motion, print cleanly and avoid border-left accents.');

console.log('Property Home board contract passed ('+called.length+' section tools shipped).');
