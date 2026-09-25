import fs from 'node:fs';
function read(path){return fs.readFileSync(new URL('../../'+path,import.meta.url),'utf8');}
function expect(v,m){if(!v)throw new Error(m)}
const page=read('property/account/index.html');
const profile=read('property/js/account-profile.js');
const refresh=read('property/js/account-refresh-20260925.js');
const css=read('property/css/account-refresh-20260925.css');
expect(page.includes('20260925c'),'NJW-418 cache version missing');
expect(profile.includes('fa-people-roof'),'Agent profile real-estate team icon missing');
expect(css.includes('photo-1758518730151-cf64fddb4f0a'),'professional realtor/team image missing');
expect(refresh.includes('Live preview'),'background live preview missing');
expect(refresh.includes('Saved only when you apply'),'explicit staged-save copy missing');
expect(refresh.includes('data-apply-theme'),'Apply background action missing');
expect(refresh.includes('data-cancel-theme'),'Cancel background action missing');
expect(refresh.includes('pendingThemeKey'),'staged theme state missing');
expect(refresh.includes("db.auth.updateUser({data:{watchdog_account_hero_theme:theme.key}})"),'Supabase theme persistence changed unexpectedly');
expect(refresh.includes("setThemeTab(saved.kind)"),'theme tabs do not follow saved type');
expect(css.includes('Supabase-inspired utility action matrix'),'compact account controls missing');
expect(css.includes('border-radius:0!important;background:#fff!important'),'account actions are still rounded cards');
expect((refresh.match(/kind:'color'/g)||[]).length===10,'expected 10 gradient presets');
expect((refresh.match(/kind:'image'/g)||[]).length===5,'expected 5 image presets');
console.log('NJW-418 account profile preview contract passed');
