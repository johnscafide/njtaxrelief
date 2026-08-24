import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const guard = read('property/js/menu-interaction-guard.js');
const publicBrand = read('property/js/robust-public-brand.js');
const brandRuntime = read('property/js/brand-consistency-runtime.js');

new Function(guard);
new Function(publicBrand);
new Function(brandRuntime);

assert(guard.includes('#wd-main-sheet,#wd-profile-sheet{pointer-events:none!important}'), 'Closed public sheets must not capture taps');
assert(guard.includes('#wd-main-sheet.open,#wd-profile-sheet.open{pointer-events:auto!important'), 'Open public sheets must accept taps');
assert(guard.includes('#wd-public-backdrop.open{pointer-events:auto!important;z-index:12000!important}'), 'Open backdrop hit-testing contract is missing');
assert(guard.includes('z-index:12010!important'), 'Open sheets must stay above the backdrop and page overlays');
assert(guard.includes('touch-action:manipulation!important'), 'Menu controls need direct mobile tap semantics');
assert(guard.includes("closest('#wd-main-sheet.open a[href],#wd-profile-sheet.open a[href]')"), 'Menu links must close stale overlay state before navigation');
assert(guard.includes("closest('#wd-main-sheet.open .wd-public-close,#wd-profile-sheet.open .wd-public-close,#wd-profile-sheet.open [data-wd-universal=\"close\"]')"), 'Pointer fallback for close controls is missing');
assert(publicBrand.includes('/property/js/menu-interaction-guard.js?v=20260824a'), 'Public property shell does not load the menu interaction guard');
assert(brandRuntime.includes('/property/js/menu-interaction-guard.js?v=20260824a'), 'App shells do not load the menu interaction guard');

console.log('Menu interaction guard contract: PASS');
