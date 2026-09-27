import fs from 'node:fs';

// Account & Billing and Town Compare in the board design (presentation only).
function read(p){ return fs.readFileSync(p,'utf8'); }
function must(v,m){ if(!v) throw new Error(m); }

const accountPage=read('property/account/index.html'), accountCss=read('property/css/account-board.css');
must(accountPage.indexOf('/property/css/account-board.css')>accountPage.search(/account-customizer-20260926\.css/), 'Account board styles must load after the customizer styles.');
must(!/\.ac-profile-hero[^{]*\{[^}]*background/.test(accountCss), 'Account board CSS must never set the profile banner background; members choose it in Customize.');
must(!/content:\s*"[^"]*[A-Za-z]{4,}/.test(accountCss), 'Account board CSS must not inject text.');
must(!/billing|checkout|stripe/i.test(accountCss.replace(/\/\*[\s\S]*?\*\//g,'')), 'Account board CSS must not target billing internals.');
must(accountCss.includes('@media print') && !accountCss.includes('border-left'), 'Account board CSS must print cleanly and avoid border-left accents.');

const tcPage=read('property/town-compare/index.html'), tcCss=read('property/css/town-compare-board.css');
must(tcPage.indexOf('/property/css/town-compare-board.css')>tcPage.indexOf('/property/css/secondary-pages-2027.css'), 'Town Compare board styles must load after the secondary page styles.');
must(tcCss.split('\n').filter(l=>/\.ti-report|\.bp-mini/.test(l)).every(l=>l.includes('[data-sidebar-page="town-compare"]')), 'Town card styles must stay scoped to Town Compare (the card also appears on Home and Fairness).');
must([1,2,3,4].every(n=>tcCss.includes('#tc-selected span:nth-child('+n+')') && tcCss.includes('.tc-cards>div:nth-child('+n+') .ti-report-head{')), 'Each compared town must keep one color across its chip and card.');
must(!/content:\s*"[^"]*[A-Za-z]{4,}/.test(tcCss) && !tcCss.includes('border-left'), 'Town Compare board CSS must not inject text or use border-left accents.');

console.log('Account and Town Compare board contract passed.');
