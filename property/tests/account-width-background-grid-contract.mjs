import fs from 'node:fs';
function read(path){return fs.readFileSync(new URL('../../'+path,import.meta.url),'utf8');}
function expect(v,m){if(!v)throw new Error(m)}
const page=read('property/account/index.html');
const refresh=read('property/js/account-refresh-20260925.js');
const css=read('property/css/account-refresh-20260925.css');
expect(page.includes('20260925e'),'cache e missing');
expect(refresh.includes('data-theme-tab="color"')&&refresh.includes('data-theme-tab="image"')&&refresh.includes('data-theme-tab="motion"'),'theme tabs missing');
expect(refresh.includes('setThemeTab(panel,kind)'),'theme tab JS missing');
expect(refresh.includes('ac-theme-browser')&&refresh.includes('ac-theme-browser-grid'),'single theme browser missing');
expect(refresh.includes('Gradients <em>')&&refresh.includes('Photos <em>')&&refresh.includes('Motion <em>'),'theme category labels missing');

expect(refresh.includes('renderThemeGrid(panel,kind)'),'dynamic theme rendering missing');
expect((refresh.match(/kind:'color'/g)||[]).length===10,'expected ten gradients');
expect((refresh.match(/kind:'image'/g)||[]).length===10,'expected ten photos');
expect(css.includes('width:min(1120px,100%)!important'),'narrow account grid width missing');
expect(css.includes('grid-template-columns:repeat(2,minmax(0,1fr))!important'),'two-column compact account grid missing');
expect(css.includes('.ac-theme-browser')&&css.includes('position:static!important'),'modal flow reset missing');
console.log('NJW-420 account width/background grid contract passed');
