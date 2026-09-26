import fs from 'node:fs';

function read(path){return fs.readFileSync(path,'utf8')}
function must(v,m){if(!v)throw new Error(m)}

const account=read('property/js/account.js');
const profile=read('property/js/account-profile.js');
const self=read('property/js/account-self-service.js');
const refresh=read('property/js/account-refresh-20260925.js');
const css=read('property/css/account-refresh-20260925.css');
const page=read('property/account/index.html');

must(account.includes('function formatOfficialLicenseName'),'Official NJ license name formatter missing.');
must(account.includes('professional.license.licensee_name'),'Verified licensee name is not used by the hero.');
must(account.includes('professional.license.verified_professional'),'Verified professional guard missing.');
must(account.includes("titleNamePart(String(given[0] || '').charAt(0))"),'Middle name is not normalized to an initial.');
must(account.includes('brokerageBrand()')&&account.includes('has-broker-brand'),'Brokerage branding is not attached to the profile avatar.');
must(account.includes('REALTOR®')&&account.includes('Licensed Agent'),'Professional badge hierarchy missing.');
must(account.indexOf('REALTOR®')<account.indexOf('Licensed Agent'),'REALTOR® badge must supersede the licensed-agent badge.');

must(!profile.includes('Separated by role'),'Separated-by-role chip still exists.');
must(self.includes('<h2>Sync Accounts</h2>'),'Sync Accounts heading missing.');
must(!self.includes('<span>CONNECTIONS</span>'),'Connections eyebrow still present.');
must(!self.includes('CRM &amp; newsletter accounts'),'Legacy CRM/newsletter heading still present.');
must(!self.includes('Provider connections are private to this Watchdog account'),'Legacy provider privacy strip still present.');

must(css.includes('.ac-sync-header'),'Sync Accounts image header styling missing.');
must(css.includes('photo-1497366811353-6870744d04b2'),'Sync Accounts curated workspace image missing.');
must(css.includes('.ac-avatar-wrap.has-broker-brand'),'Brokerage avatar styling missing.');
must(css.includes('.ac-page-top .top-eyebrow'),'Account header eyebrow cleanup missing.');
must(refresh.includes("['SPAN','P','SMALL']"),'Runtime header filler cleanup missing.');

must(page.includes('account.js?v=20260925c'),'Account identity JS cache version missing.');
must(page.includes('account-profile.js?v=20260925a'),'Profile chooser JS cache version missing.');
must(page.includes('account-self-service.js?v=20260925b'),'Sync Accounts JS cache version missing.');
must(page.includes('account-refresh-20260925.css?v=20260925i'),'Account polish CSS cache version missing.');
must(page.includes('account-refresh-20260925.js?v=20260925g'),'Account runtime cache version missing.');

console.log('NJW-428 account identity and Sync Accounts contract passed');
