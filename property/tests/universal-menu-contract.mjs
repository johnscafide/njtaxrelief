import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const universal = read('property/js/watchdog-universal-menu.js');
const publicNav = read('property/js/public-nav.js');
const brandRuntime = read('property/js/brand-consistency-runtime.js');
const dashboard = read('property/dashboard/index.html');
const home = read('property/home/index.html');
const sidemenu = read('property/js/sidemenu.js');
const css = read('property/css/watchdog-universal-menu.css');

// Syntax must remain valid before this can ship.
new Function(universal);
new Function(publicNav);
new Function(brandRuntime);

const canonical = [
  ['dashboard', 'Dashboard'],
  ['home', 'Property Home'],
  ['town-compare', 'Town Compare'],
  ['robust', 'ROBUST Framework'],
  ['pulse', 'Change Intelligence'],
  ['agent-desk', 'Agent Control'],
  ['scan', 'Appeal Scanner'],
  ['data-workbench', 'Data Workbench'],
  ['data-center', 'Data Center'],
  ['pro', 'Professional Hub'],
  ['account', 'Account']
];

for (const [key, label] of canonical) {
  const token = `key:'${key}'`;
  assert(universal.includes(token), `Universal menu is missing canonical key ${key}`);
  assert(universal.includes(`label:'${label}'`), `Universal menu is missing label ${label}`);
}

assert(universal.includes("can('pro_plus')"), 'Pro+ menu gating is missing');
assert(universal.includes("can('agent')"), 'Agent+ menu gating is missing');
assert(universal.includes('isAgent()'), 'Agent Control role gating is missing');
assert(universal.includes("hostname === 'watchdogindex.com'") || universal.includes("hostname === 'www.watchdogindex.com'"), 'Clean watchdogindex.com route support is missing');
assert(universal.includes('Edit profile &amp; role'), 'Shared profile menu is missing Edit profile & role');
assert(universal.includes('Invite others'), 'Shared profile menu is missing Invite others');
assert(universal.includes('Account &amp; billing'), 'Shared profile menu is missing Account & billing');
assert(universal.includes('Your saved-home workspace'), 'Shared profile menu is missing Property Home context');

assert(publicNav.includes('/property/js/watchdog-universal-menu.js'), 'Public navigation does not load the universal menu');
assert(publicNav.includes('WatchdogUniversalMenu.setUser'), 'Public auth state is not handed to the universal menu');
assert(brandRuntime.includes('/property/js/watchdog-universal-menu.js'), 'App brand runtime does not load the universal menu');
assert(!brandRuntime.includes("var items=["), 'Brand runtime has reintroduced a second hardcoded navigation model');

assert(dashboard.includes('/property/js/brand-consistency-runtime.js'), 'Dashboard is not connected to shared menu runtime');
assert(home.includes('/property/js/brand-consistency-runtime.js'), 'Property Home is not connected to shared menu runtime');
assert(sidemenu.includes('loadBrandConsistency'), 'Secondary-page shell is not connected to shared menu runtime');

assert(css.includes('.wd-public-sheet.wd-universal-public-nav'), 'Public Dashboard-style drawer CSS is missing');
assert(css.includes('.wd-public-sheet.right.wd-universal-public-profile'), 'Public Dashboard-style profile CSS is missing');
assert(css.includes('.wd-universal-profile>nav'), 'Shared profile row styling is missing');

// Root styles.css contains a historical global `nav { ... }` selector. Universal
// semantic nav elements must fully reset container chrome so that global rule can
// never turn the drawer/profile navy, sticky, shadowed, or elevated again.
const drawerRule = css.match(/\.wd-universal-nav-links\{([^}]*)\}/)?.[1] || '';
const profileRule = css.match(/\.wd-universal-profile>nav\{([^}]*)\}/)?.[1] || '';
for (const [name, rule] of [['drawer', drawerRule], ['profile', profileRule]]) {
  assert(rule.includes('background:#fff!important'), `Universal ${name} nav must force a white background`);
  assert(rule.includes('position:static!important'), `Universal ${name} nav must reset global sticky positioning`);
  assert(rule.includes('z-index:auto!important'), `Universal ${name} nav must reset global nav z-index`);
  assert(rule.includes('box-shadow:none!important'), `Universal ${name} nav must reset global nav shadow`);
  assert(rule.includes('transform:none!important'), `Universal ${name} nav must reset inherited nav transforms`);
}

console.log('Universal Watchdog menu contract: PASS');
