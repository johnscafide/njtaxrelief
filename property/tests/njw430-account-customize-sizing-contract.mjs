import fs from 'node:fs';

function read(path){return fs.readFileSync(path,'utf8')}
function must(v,m){if(!v)throw new Error(m)}

const css=read('property/css/account-customizer-20260926.css');
const page=read('property/account/index.html');
const refresh=read('property/js/account-refresh-20260925.js');

must(css.includes('width:min(1180px,calc(100vw - 56px))'),'Customize modal desktop width is not enlarged.');
must(css.includes('max-height:calc(100vh - 40px)'),'Customize modal viewport height guard missing.');
must(css.includes('overflow-y:auto'),'Customize modal internal scrolling missing.');
must(css.includes('.acx-tabs'),'Customize category tabs styling missing.');
must(refresh.includes('id="ac-theme-browser-grid"'),'Single Customize browser grid missing.');
must(refresh.includes('renderThemeGrid(panel,kind)'),'Customize category renderer missing.');
must(css.includes('grid-template-columns:repeat(5,minmax(0,1fr))'),'Desktop Customize five-column grid missing.');
must(css.includes('grid-template-columns:repeat(2,minmax(0,1fr))'),'Mobile Customize grid missing.');
must(css.includes('border:5px solid transparent!important'),'Brokerage avatar ring is not thick enough.');
must(css.includes('.acx-preview-avatar.has-broker-brand')&&css.includes('border:4px solid transparent'),'Live preview brokerage ring is not strengthened.');
must(refresh.includes('data-theme-tab="color"')&&refresh.includes('data-theme-tab="image"')&&refresh.includes('data-theme-tab="motion"'),'Gradient/Photo/Motion tabs are not mounted.');
must(page.includes('account-customizer-20260926.css?v=20260926c'),'Account customizer CSS cache version missing.');

console.log('NJW-430 Customize modal sizing contract passed');
