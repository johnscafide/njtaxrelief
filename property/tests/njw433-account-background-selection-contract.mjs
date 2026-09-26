import fs from 'node:fs';

function read(path){return fs.readFileSync(path,'utf8')}
function must(v,m){if(!v)throw new Error(m)}

const refresh=read('property/js/account-refresh-20260925.js');
const css=read('property/css/account-customizer-20260926.css');
const page=read('property/account/index.html');

must(refresh.includes("button.addEventListener('click',function(event)"),'Theme cards do not own their click interaction.');
must(refresh.includes('event.preventDefault();')&&refresh.includes('event.stopPropagation();'),'Theme card click is not isolated from surrounding handlers.');
must(refresh.includes('updateThemePreview(theme.key);'),'Theme card click does not update the live preview.');
must(refresh.includes('panel.dataset.pendingTheme=theme.key'),'Clicked theme is not persisted as modal pending state.');
must(refresh.includes('saveTheme(panel.dataset.pendingTheme||pendingThemeKey||pendingThemeOriginalKey)'),'Apply action is not bound to pending modal state.');
must(css.includes('.acx-card{')&&css.includes('pointer-events:auto!important'),'Theme card interaction surface is not explicitly enabled.');
must(css.includes('.acx-card-preview{')&&css.includes('pointer-events:none'),'Theme preview visual can intercept the card click.');
must(css.includes('.acx-card-name{')&&css.includes('pointer-events:none'),'Theme card label can intercept the card click.');
must(page.includes('account-customizer-20260926.css?v=20260926c'),'Fixed customizer CSS cache key missing.');
must(page.includes('account-refresh-20260925.js?v=20260926c'),'Fixed customizer JS cache key missing.');

console.log('NJW-433 Account background selection interaction contract passed');
