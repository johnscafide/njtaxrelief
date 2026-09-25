import fs from 'node:fs';
function read(path){return fs.readFileSync(new URL('../../'+path,import.meta.url),'utf8');}
function expect(v,m){if(!v)throw new Error(m)}
const page=read('property/account/index.html');
const refresh=read('property/js/account-refresh-20260925.js');
const css=read('property/css/account-refresh-20260925.css');
expect(page.includes('20260925e'),'cache e missing');
expect(!refresh.includes('data-theme-tab'),'theme tab controls still present');
expect(!refresh.includes('setThemeTab('),'theme tab JS still present');
expect(refresh.includes('ac-theme-groups'),'all-theme group container missing');
expect(refresh.includes('<b>Gradients</b><span>10</span>'),'gradient group missing');
expect(refresh.includes('<b>Photos</b><span>5</span>'),'photo group missing');
expect(!refresh.includes('data-theme-kind="image" hidden'),'photos are still hidden');
expect((refresh.match(/kind:'color'/g)||[]).length===10,'expected ten gradients');
expect((refresh.match(/kind:'image'/g)||[]).length===5,'expected five photos');
expect(css.includes('width:min(1120px,100%)!important'),'narrow account grid width missing');
expect(css.includes('grid-template-columns:repeat(2,minmax(0,1fr))!important'),'two-column compact account grid missing');
expect(css.includes('position:sticky!important')&&css.includes('bottom:-14px!important'),'modal actions are not protected at bottom');
console.log('NJW-420 account width/background grid contract passed');
