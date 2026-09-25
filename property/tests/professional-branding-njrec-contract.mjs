import fs from 'node:fs';
function read(path){return fs.readFileSync(new URL('../../'+path,import.meta.url),'utf8')}
function expect(v,m){if(!v)throw new Error(m)}
const page=read('property/account/professional-profile/index.html');
const js=read('property/js/agent-branding-profile.js');
const css=read('property/css/agent-branding-profile.css');
const brandApi=read('api/brokerage-brand-discovery.js');
const njrecApi=read('api/njrec-license-search.js');
expect(page.includes('agent-branding-profile.css?v=20260925a'),'branding CSS not loaded');
expect(page.includes('agent-branding-profile.js?v=20260925a'),'branding JS cache key missing');
expect(js.includes('Choose brokerage'),'brokerage chooser missing');
expect(js.includes('Find branding'),'website brand discovery missing');
expect(js.includes('Search NJREC'),'NJREC lookup UI missing');
expect(js.includes('brokerage_primary_color')&&js.includes('brokerage_secondary_color')&&js.includes('brokerage_accent_color'),'broker colors not persisted');
expect(js.includes('brokerage_website'),'brokerage website not persisted');
expect(js.includes("Opus Elite Real Estate")&&js.includes("#00778B")&&js.includes("#E35205"),'Opus preset/colors missing');
expect(css.includes('.acb-brand-preview')&&css.includes('--broker-primary'),'branded business panel missing');
expect(css.includes('.acb-media-preview'),'imagery previews missing');
expect(brandApi.includes('validateUrl')&&brandApi.includes('Private network addresses are not allowed.'),'SSRF guard missing');
expect(brandApi.includes('logo_candidates')&&brandApi.includes('primary_color'),'brand extraction response missing');
expect(njrecApi.includes('recLicenseeSearchServlet'),'official NJDOBI endpoint missing');
expect(njrecApi.includes('LicenseeRefNum')&&njrecApi.includes('LicenseeName'),'NJREC query modes missing');
expect(njrecApi.includes('requireUser'),'NJREC endpoint must require auth');
console.log('NJW-423 professional branding and NJREC contract passed');
