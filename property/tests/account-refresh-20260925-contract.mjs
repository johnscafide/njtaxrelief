import fs from 'node:fs';

function read(path){return fs.readFileSync(new URL('../../'+path,import.meta.url),'utf8');}
function expect(value,message){if(!value)throw new Error(message);}

const page=read('property/account/index.html');
const account=read('property/js/account.js');
const profile=read('property/js/account-profile.js');
const identities=read('property/partials/account-identity-security.html');
const selfService=read('property/js/account-self-service.js');
const refresh=read('property/js/account-refresh-20260925.js');
const refreshCss=read('property/css/account-refresh-20260925.css');

expect(page.includes('Account &amp; Billing'),'Account & Billing heading missing');
expect(page.includes('account-refresh-20260925.css'),'account refresh CSS not loaded');
expect(page.includes('account-refresh-20260925.js'),'account refresh JS not loaded');
expect(!page.includes('<span class="top-eyebrow">ACCOUNT</span>'),'account eyebrow returned');
expect(account.includes('ac-hero-stats'),'hero stats missing');
expect(!account.includes('Activity at a glance'),'standalone activity card returned');
expect(profile.includes('acp-header-clean'),'profile hub clean header missing');
expect(!identities.includes('<span>SIGN-IN &amp; SECURITY</span>'),'sign-in eyebrow returned');
expect(selfService.includes('Watchdog Account'),'Watchdog Account self-service heading missing');
expect(selfService.includes('ac-provider-boldtrail')&&selfService.includes('ac-provider-kit'),'provider branding marks missing');

const colorCount=(refresh.match(/kind:'color'/g)||[]).length;
const imageCount=(refresh.match(/kind:'image'/g)||[]).length;
expect(colorCount===10,'expected 10 color/gradient hero themes');
expect(imageCount===10,'expected 10 image hero themes');
expect((refresh.match(/images\.unsplash\.com/g)||[]).length===10,'Unsplash image presets missing');
expect(refresh.includes("watchdog_account_hero_theme"),'hero theme persistence missing');
expect(refresh.includes("agent:{label:'Agent',value:'$1,499'"),'Agent Lifetime price missing');
expect(refresh.includes("pro:{label:'Pro',value:'$3,499'"),'Pro Lifetime price missing');
expect(refresh.includes("pro_plus:{label:'Pro+',value:'$9,999'"),'Pro+ Lifetime price missing');
expect(refresh.includes("create-lifetime-checkout"),'governed Lifetime checkout wiring missing');
expect(refreshCss.includes('border-radius:50%!important'),'circular avatar contract missing');

console.log('account refresh 2026-09-25 contract passed');