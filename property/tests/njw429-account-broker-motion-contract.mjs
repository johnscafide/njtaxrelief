import fs from 'node:fs';

function read(path){return fs.readFileSync(path,'utf8')}
function must(v,m){if(!v)throw new Error(m)}

const account=read('property/js/account.js');
const refresh=read('property/js/account-refresh-20260925.js');
const css=read('property/css/account-refresh-20260925.css');
const customizerCss=read('property/css/account-customizer-20260926.css');
const page=read('property/account/index.html');

must(account.includes('function brokerageBrand()'),'Brokerage avatar brand resolver missing.');
must(account.includes('ac-avatar-broker-logo'),'Brokerage logo is not used on the profile-photo edit control.');
must(read('property/js/account-self-service.js').includes('ac-avatar-change-broker-logo'),'Brokerage logo is not reused on the Change photo action.');
must(account.includes('has-broker-brand'),'Brokerage-branded avatar state missing.');
must(!account.includes('function brokerageMarkup()'),'Obsolete brokerage hero pill renderer still exists.');
must(!account.includes('PROFILE &amp; SETTINGS'),'Profile & Settings eyebrow still exists in hero markup.');

must(account.includes('professionalVerificationTitle'),'Verification hover text helper missing.');
must(account.includes("'Verified Licensed Agent'"),'Licensed-agent hover label missing.');
must(account.includes('ac-pro-badge social-verify'),'Social-style verification mark missing.');
must(account.includes('title="')||account.includes(" title=\""),'Verified name/check hover affordance missing.');

must(refresh.includes('<span>Customize</span>'),'Customize control label missing.');
must(!refresh.includes('<span>Background</span>'),'Legacy Background bubble label still exists.');
must(refresh.includes("key:'aurora-motion'"),'Aurora motion theme missing.');
must(refresh.includes("key:'signal-grid'"),'Signal Grid motion theme missing.');
must(refresh.includes("key:'tidal-motion'"),'Tidal motion theme missing.');
must(refresh.includes("key:'spectrum-motion'"),'Spectrum motion theme missing.');
must(refresh.includes("key:'orbit-motion'"),'Orbit motion theme missing.');
must(refresh.includes('data-theme-tab="motion"'),'Motion category tab missing.');
must(refresh.includes('setThemeTab(panel,saved.kind)'),'Saved theme category is not restored.');
must(refresh.includes('applyThemeVisual'),'Motion/static theme visual helper missing.');
must(!refresh.includes('PROFILE &amp; SETTINGS'),'Preview still contains removed eyebrow text.');

must(css.includes('.ac-avatar-wrap.has-broker-brand .ac-avatar'),'Brokerage color ring styling missing.');
must(customizerCss.includes('@keyframes acBrokerRingSpin'),'Brokerage hover ring animation missing.');
must(customizerCss.includes('animation:acBrokerRingSpin 1.35s linear infinite!important'),'Brokerage ring must rotate continuously only on hover.');
must(css.includes('.ac-pro-badge.social-verify'),'Social verification styling missing.');
must(css.includes('.ac-hero-style-toggle')&&css.includes('background:transparent!important'),'Customize text-control styling missing.');
must(css.includes('@keyframes acMotionAurora'),'Aurora animation missing.');
must(css.includes('@keyframes acMotionGrid'),'Signal Grid animation missing.');
must(css.includes('@keyframes acMotionTidal'),'Tidal animation missing.');
must(css.includes('@keyframes acMotionSpectrum'),'Spectrum animation missing.');
must(css.includes('@keyframes acMotionOrbit'),'Orbit animation missing.');
must(css.includes('@media(prefers-reduced-motion:reduce)'),'Reduced-motion fallback missing.');
must(refresh.includes('id="ac-theme-browser-grid"')&&refresh.includes('renderThemeGrid'),'Single-grid theme browser missing.');

must(page.includes('account.js?v=20260925c'),'Account hero JS cache version missing.');
must(page.includes('account-refresh-20260925.css?v=20260926a'),'Account motion CSS cache version missing.');
must(page.includes('account-refresh-20260925.js?v=20260926b'),'Account customizer JS cache version missing.');
must(page.includes('account-customizer-20260926.css?v=20260926b'),'Isolated Account customizer CSS missing.');

console.log('NJW-429 brokerage avatar and motion background contract passed');
