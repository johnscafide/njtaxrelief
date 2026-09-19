import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const read=p=>fs.readFileSync(p,'utf8');
const pwa=read('property/js/pwa.js');
const tx=read('transaction/index.html');
const account=read('property/account/index.html');
const homeowner=read('property/account/profile/index.html');
const professional=read('property/account/professional-profile/index.html');
const profile=read('property/js/account-profile.js');
const reusable=read('property/js/account-reusable-profile.js');
const branding=read('property/js/agent-branding-profile.js');
const vanity=read('property/js/agent-vanity-profile.js');
const qr=read('property/js/agent-portal-qr.js');
const license=read('property/js/professional-license-verification.js');
const middleware=read('middleware.js');
const vercel=read('vercel.json');

for(const [name,source] of [
  ['pwa',pwa],['account-profile',profile],['reusable',reusable],['branding',branding],
  ['vanity',vanity],['qr',qr],['license',license]
]) new vm.Script(source,{filename:name+'.js'});

assert.match(pwa,/function show\(\)\{if\(!isiOS\(\)\|\|standalone\(\)/,'PWA install note must be iOS-only');
assert.match(pwa,/beforeinstallprompt[\s\S]{0,160}deferredPrompt=event;\}\);/,'desktop install event may be retained for future explicit UI');
assert.doesNotMatch(pwa,/beforeinstallprompt[\s\S]{0,180}show\(\)/,'desktop browser install events must not auto-render a banner');

assert.doesNotMatch(tx,/\\n\s*<(?:link|script)/,'Transaction HTML must not leak literal escaped newline text nodes');
assert.match(account,/data-account-profile-mode="hub"/,'Account must identify itself as the profile hub');

assert.match(homeowner,/data-account-profile-mode="homeowner"/,'Homeowner profile route must use homeowner mode');
assert.match(homeowner,/\/property\/js\/account-profile\.js/,'Homeowner profile must use the governed profile controller');
assert.match(homeowner,/\/property\/js\/account-reusable-profile\.js/,'Homeowner profile must own reusable personal/mailing fields');
assert.doesNotMatch(homeowner,/agent-branding-profile|agent-vanity-profile|professional-license-verification/,'Homeowner editor must not load Agent-only modules');

assert.match(professional,/data-account-profile-mode="professional"/,'Professional profile route must use professional mode');
for(const asset of ['agent-branding-profile.js','agent-vanity-profile.js','agent-portal-qr.js','professional-license-verification.js']){
  assert.ok(professional.includes(asset),'Professional profile missing '+asset);
}

assert.match(profile,/href="\/account\/profile"/,'Account hub must link to homeowner profile');
assert.match(profile,/href="\/account\/professional-profile"/,'Account hub must link to professional profile');
assert.match(profile,/primaryProfession:payload\.primary_profession/,'profile save must notify role-gated professional modules');
assert.match(profile,/mode === 'homeowner' \? \(row\.primary_profession \|\| null\)/,'homeowner edits must preserve professional identity rather than clearing it');
assert.match(profile,/mode !== 'homeowner' && professional/,'professional validation must not block homeowner edits');

assert.match(reusable,/mode&&mode!=='homeowner'/,'reusable homeowner data must not mount on the Account hub or professional editor');
for(const source of [branding,vanity]){
  assert.match(source,/primary_profession[^\n]{0,120}real_estate|real_estate[^\n]{0,120}primary_profession/,'Agent module must require a declared real-estate profession');
}
for(const source of [branding,vanity,qr,license]){
  assert.match(source,/data-account-profile-mode/,'Agent-only module must be confined to the professional profile route');
}
assert.match(license,/primary_profession !== 'real_estate'/,'NJ license verification must remain real-estate-specific');

assert.match(middleware,/['"]\/account\/profile['"]/,'middleware must allow the homeowner profile clean route');
assert.match(middleware,/['"]\/account\/professional-profile['"]/,'middleware must allow the professional profile clean route');
assert.match(vercel,/"source"\s*:\s*"\/account\/profile"[\s\S]{0,150}"destination"\s*:\s*"\/property\/account\/profile\/index\.html"/,'Vercel must route /account/profile');
assert.match(vercel,/"source"\s*:\s*"\/account\/professional-profile"[\s\S]{0,170}"destination"\s*:\s*"\/property\/account\/professional-profile\/index\.html"/,'Vercel must route /account/professional-profile');

console.log('NJW-386 desktop prompt, Transaction text, and split-profile contract passed.');
