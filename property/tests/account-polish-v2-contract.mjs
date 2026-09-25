import fs from 'node:fs';
function read(path){return fs.readFileSync(new URL('../../'+path,import.meta.url),'utf8');}
function expect(v,m){if(!v)throw new Error(m)}
const page=read('property/account/index.html');
const account=read('property/js/account.js');
const profile=read('property/js/account-profile.js');
const identities=read('property/js/account-identities.js');
const self=read('property/js/account-self-service.js');
const refresh=read('property/js/account-refresh-20260925.js');
const css=read('property/css/account-refresh-20260925.css');
const kit=read('property/assets/integrations/kit-logo.svg');
const bold=read('property/assets/integrations/boldtrail-logo.svg');
expect(page.includes('20260925b'),'account refresh cache version not bumped');
expect(css.includes('h1~span{display:none!important}'),'account heading subtitle hard-hide missing');
expect(css.includes('width:44px!important;height:44px!important'),'camera button fixed circle dimensions missing');
expect(refresh.includes("panel.id='ac-theme-popover'"),'fixed premium theme popover missing');
expect((refresh.match(/kind:'color'/g)||[]).length===10,'expected ten color themes');
expect((refresh.match(/kind:'image'/g)||[]).length===5,'expected five photo themes');
expect(css.includes('acp-profile-route-card.personal')&&css.includes('photo-1600585154340'),'personal photo card missing');
expect(css.includes('acp-profile-route-card.professional')&&css.includes('photo-1497366811353'),'professional photo card missing');
expect(account.includes('ac-account-signins')&&account.includes('data-copy-account-id'),'expanded account details missing');
expect(identities.includes('syncAccountSummary'),'sign-in summary sync missing');
expect(self.includes('/property/assets/integrations/boldtrail-logo.svg'),'BoldTrail asset not used');
expect(self.includes('/property/assets/integrations/kit-logo.svg'),'Kit asset not used');
expect(kit.includes('<svg')&&bold.includes('<svg'),'provider SVG assets invalid');
console.log('NJW-417 account polish contract passed');
