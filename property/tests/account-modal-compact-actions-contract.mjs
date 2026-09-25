import fs from 'node:fs';
function read(path){return fs.readFileSync(new URL('../../'+path,import.meta.url),'utf8');}
function expect(v,m){if(!v)throw new Error(m)}
const page=read('property/account/index.html');
const profile=read('property/js/account-profile.js');
const refresh=read('property/js/account-refresh-20260925.js');
const css=read('property/css/account-refresh-20260925.css');
expect(page.includes('20260925d'),'cache version d missing');
expect(!refresh.includes('PROFILE CANVAS'),'Profile Canvas label returned');
expect(!refresh.includes('Preview a Watchdog gradient or curated photo before you apply it.'),'modal helper copy returned');
expect(!refresh.includes('ac-theme-accent"></div>'),'modal top accent returned');
expect(css.includes('nav.ac-theme-tabs')&&css.includes('background:transparent!important'),'theme tab global-style reset missing');
expect(css.includes('footer.ac-theme-actions')&&css.includes('background:#fff!important'),'modal footer reset missing');
expect(profile.includes('fa-regular fa-user'),'new personal profile icon missing');
expect(profile.includes('fa-regular fa-address-card'),'new professional profile icon missing');
expect(css.includes('width:30px!important;height:30px!important'),'smaller profile icon treatment missing');
expect(css.includes('min-height:50px!important'),'smaller account action matrix missing');
expect(css.includes('Danger zone adopts the same compact matrix language'),'compact danger action matrix missing');
expect(css.includes('min-height:52px!important'),'danger action sizing missing');
console.log('NJW-419 Account modal and compact actions contract passed');
