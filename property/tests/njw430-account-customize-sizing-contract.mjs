import fs from 'node:fs';

function read(path){return fs.readFileSync(path,'utf8')}
function must(v,m){if(!v)throw new Error(m)}

const css=read('property/css/account-refresh-20260925.css');
const page=read('property/account/index.html');
const refresh=read('property/js/account-refresh-20260925.js');

must(css.includes('width:min(1180px,calc(100vw - 56px))!important'),'Customize modal desktop width is not enlarged.');
must(css.includes('max-height:calc(100vh - 32px)!important'),'Customize modal viewport height guard missing.');
must(css.includes('overflow-y:auto!important'),'Customize modal internal scrolling missing.');
must(css.includes('.ac-theme-popover nav.ac-theme-tabs'),'Customize category tabs styling missing.');
must(css.includes('.ac-theme-section[hidden]')&&css.includes('display:none!important'),'Hidden Customize categories can leak into the active view.');
must(css.includes('.ac-theme-section:not([hidden])'),'Active Customize category rendering rule missing.');
must(css.includes('grid-template-columns:repeat(5,minmax(0,1fr))!important'),'Desktop Customize five-column grid missing.');
must(css.includes('grid-template-columns:repeat(2,minmax(0,1fr))!important'),'Mobile Customize grid missing.');
must(css.includes('border:5px solid transparent!important')||css.includes('border-width:5px!important'),'Brokerage avatar ring is not thick enough.');
must(css.includes('.ac-theme-live-avatar.has-broker-brand')&&css.includes('border-width:4px!important'),'Live preview brokerage ring is not strengthened.');
must(refresh.includes('data-theme-tab="color"')&&refresh.includes('data-theme-tab="image"')&&refresh.includes('data-theme-tab="motion"'),'Gradient/Photo/Motion tabs are not mounted.');
must(page.includes('account-refresh-20260925.css?v=20260925i'),'Account CSS cache version missing.');

console.log('NJW-430 Customize modal sizing contract passed');
