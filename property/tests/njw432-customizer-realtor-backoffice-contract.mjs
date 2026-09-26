import fs from 'node:fs';

function read(path){return fs.readFileSync(path,'utf8')}
function must(v,m){if(!v)throw new Error(m)}

const page=read('property/account/index.html');
const refresh=read('property/js/account-refresh-20260925.js');
const customizer=read('property/css/account-customizer-20260926.css');
const api=read('api/watchdog-backoffice-professional.js');

must(page.includes('account-customizer-20260926.css?v=20260926d'),'Isolated customizer stylesheet is not loaded after legacy Account CSS.');
must(page.includes('account-refresh-20260925.js?v=20260926d'),'Account customizer runtime cache key not bumped.');
must(refresh.includes("panel.className='acx-picker'"),'Customizer still uses legacy popup class.');
must(refresh.includes("backdrop.className='acx-backdrop'"),'Customizer backdrop is not isolated.');
must(refresh.includes("button.className='acx-card '"),'Customizer cards still use legacy card class.');
must(refresh.includes("button.addEventListener('click',function(event)")&&refresh.includes('updateThemePreview(theme.key)'),'Theme cards need a direct click handler.');
must(refresh.includes('panel.dataset.pendingTheme=theme.key'),'Pending background choice is not persisted on the modal.');
must(refresh.includes('saveTheme(panel.dataset.pendingTheme||pendingThemeKey||pendingThemeOriginalKey)'),'Apply action is not bound to the clicked background.');
must(customizer.includes('pointer-events:auto!important')&&customizer.includes('touch-action:manipulation'),'Theme card interaction surface is not hardened.');
must(refresh.includes('class="acx-tabs"'),'Customizer tabs are not isolated.');
must(refresh.includes('class="acx-grid" id="ac-theme-browser-grid"'),'Customizer grid is not isolated.');
must(customizer.includes('.acx-card-preview{')&&customizer.includes('position:relative'),'Theme preview tiles are not in normal document flow.');
must(customizer.includes('.acx-tabs{')&&customizer.includes('.acx-browser{'),'Tabs/browser layout missing.');
must(customizer.includes('@keyframes acBrokerRingSpin'),'Brokerage ring spin animation missing.');
must(customizer.includes('has-broker-brand:hover .ac-avatar')&&customizer.includes('animation:acBrokerRingSpin 1.35s linear infinite!important'),'Brokerage ring does not spin only on hover.');

must(api.includes("headCount('professional_realtor_verifications',{verification_status:'eq.pending'},'user_id')"),'REALTOR count must use user_id primary key.');
must(api.includes("headCount('professional_provider_connections',{connection_status:'eq.requested'},'id')"),'Connection count must keep id key.');
must(!api.includes("u.searchParams.set('select','id')"),'Backoffice count helper still hardcodes id.');

console.log('NJW-432 isolated customizer and REALTOR Backoffice contract passed');
