import fs from 'node:fs';

// Agent portal addresses are clean: https://www.watchdogindex.com/agent/<slug>.
// Real /agent/* pages must never be swallowed by a portal slug.
function read(p){ return fs.readFileSync(p,'utf8'); }
function must(v,m){ if(!v) throw new Error(m); }

const mw=read('middleware.js');
const vanity=read('property/js/agent-vanity-profile.js');
const qr=read('property/js/agent-portal-qr.js');

const setMatch=mw.match(/const AGENT_RESERVED_SEGMENTS = new Set\(\[([^\]]+)\]\)/);
must(setMatch,'middleware.js must define AGENT_RESERVED_SEGMENTS.');
const reserved=new Set([...setMatch[1].matchAll(/'([^']+)'/g)].map(m=>m[1]));

// Every real /agent/<segment> page in the repo, in ROOT_STATIC_PAGES, or linked in code.
const segments=new Set();
for(const dir of ['agent','property/agent']) for(const d of fs.readdirSync(dir,{withFileTypes:true})) if(d.isDirectory()) segments.add(d.name);
for(const m of mw.matchAll(/'\/agent\/([a-z0-9-]+)'/g)) segments.add(m[1]);
for(const s of segments) must(reserved.has(s),`/agent/${s} is a real page, so "${s}" must be in AGENT_RESERVED_SEGMENTS.`);
for(const s of reserved) must(vanity.includes(`'${s}'`),`Vanity slug validation must also reserve "${s}".`);

must(/AGENT_PORTAL_PATH = \/\^\\\/agent\\\//.test(mw),'The public portal route must be /agent/<slug>.');
must(/LEGACY_AGENT_PORTAL_PATH[\s\S]*redirectCanonical\(request,url,`\/agent\/\$\{legacyPortalMatch\[1\]\.toLowerCase\(\)\}`\)/.test(mw),'Old /property/agent/<slug> links must permanently redirect to /agent/<slug>.');
must(mw.indexOf('ROOT_STATIC_PAGES.has(publicPath))return next()')<mw.indexOf('const agentPortalMatch'),'Static /agent pages must be matched before portal slugs.');
must(vanity.includes("PORTAL_ROOT = 'https://www.watchdogindex.com/agent/'") && !vanity.includes('/property/agent/'),'The Professional Profile must show the clean portal address.');
must(qr.includes('watchdogindex\\.com\\/agent\\/') && !qr.includes('property\\/agent'),'QR codes and signs must encode the clean portal address.');

console.log(`Agent portal route contract passed (${reserved.size} reserved /agent segments).`);
