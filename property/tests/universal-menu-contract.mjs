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
const teams = read('property/teams/index.html');
const homeMenu = read('property/js/dashboard/home/home-menu-sync.js');
const todayNav = read('property/js/watchdog-today-nav.js');
const sidemenu = read('property/js/sidemenu.js');
const css = read('property/css/watchdog-universal-menu.css');

// Syntax must remain valid before this can ship.
new Function(universal);
new Function(publicNav);
new Function(brandRuntime);
new Function(homeMenu);
new Function(todayNav);

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

// Developer shortcuts belong to the universal profile menu only and must be
// unlocked by the internal account_role, never by a paid customer plan tier.
const developerTools = [
  ['/developer', 'Developer Command Center'],
  ['/logs/recap', 'Daily Recaps'],
  ['/analytics', 'Analytics'],
  ['/logs', 'Build Logs'],
  ['/developer-data', 'Data Operations']
];
for (const [path, label] of developerTools) {
  assert(universal.includes(`route('${path}')`), `Developer profile menu is missing ${path}`);
  assert(universal.includes(`label:'${label}'`), `Developer profile menu is missing ${label}`);
}
assert(universal.includes('function hasDeveloperRole()'), 'Developer account-role helper is missing');
assert(universal.includes("plan(state.profile.account_role) === 'developer'"), 'Developer tools are not gated by profiles.account_role');
assert(universal.includes('function isDeveloper()'), 'Resolved developer-state helper is missing');
assert(universal.includes("if(!isDeveloper()) return '';"), 'Developer profile rows are not fail-closed for non-developers');
assert(universal.includes('developerToolsHtml() +'), 'Developer tools are not injected by the shared profile renderer');
assert(universal.includes('developerItems:developerItems'), 'Developer tool registry is not exposed from the universal menu');
assert(css.includes('.wd-universal-developer-label'), 'Developer profile section styling is missing');
assert(css.includes('.wd-universal-developer-tool'), 'Developer profile tool styling is missing');
assert(css.includes('max-height:calc(100vh - 96px)!important;overflow:auto!important'), 'App profile popovers cannot scroll when developer tools are present');

// Customer account menus get one contextual graphical promotion based on the
// resolved plan. Developer and Teams accounts must never be shown an upsell ad.
assert(universal.includes('function planPromo()'), 'Plan-aware account promo helper is missing');
assert(universal.includes("p === 'standard' || p === 'agent'"), 'Standard/Agent to Pro promo gate is missing');
assert(universal.includes("if(p === 'pro')"), 'Pro to Pro+ promo gate is missing');
assert(universal.includes("if(p === 'pro_plus')"), 'Pro+ to Teams promo gate is missing');
assert(universal.includes("if(!state.user || !state.ready || isDeveloper()) return null;"), 'Developer/signed-out promo suppression is missing');
assert(universal.includes("route('/teams')"), 'Pro+ Teams preview route is missing');
assert(universal.includes('data-wd-plan-promo'), 'Graphical plan promo markup is missing');
assert(universal.includes('planPromoHtml() +'), 'Plan promo is not injected by the shared profile renderer');
assert(universal.includes('planPromo:planPromo'), 'Plan promo registry is not exposed for verification');
assert(universal.includes('wd-universal-plan-promo-pro'), 'Pro promo visual treatment is missing');
assert(universal.includes('wd-universal-plan-promo-plus'), 'Pro+ promo visual treatment is missing');
assert(universal.includes('wd-universal-plan-promo-teams'), 'Teams promo visual treatment is missing');

// Teams is an honest preview page, not a false self-service sales surface.
assert(teams.includes('<title>Watchdog Teams | Shared Property Intelligence</title>'), 'Teams preview page title is missing');
assert(teams.includes('Watchdog Teams · Preview'), 'Teams page does not visibly identify itself as a preview');
assert(teams.includes('not a self-service plan for purchase today'), 'Teams page does not disclose current purchase status');
assert(teams.includes('Seats &amp; invitations'), 'Teams roadmap is missing seat/invite planning');
assert(teams.includes('Roles &amp; permissions'), 'Teams roadmap is missing role/permission planning');
assert(teams.includes('Organization integrations'), 'Teams roadmap is missing organization integrations');
assert(teams.includes('Future Watchdog capabilities'), 'Teams roadmap is missing future-capability positioning');
assert(teams.includes('/property/js/public-nav.js'), 'Teams page is not connected to the shared public/profile navigation runtime');
assert(teams.includes('https://www.watchdogindex.com/teams'), 'Teams canonical URL is not on watchdogindex.com');

assert(publicNav.includes('/property/js/watchdog-universal-menu.js'), 'Public navigation does not load the universal menu');
assert(publicNav.includes('WatchdogUniversalMenu.setUser'), 'Public auth state is not handed to the universal menu');
assert(brandRuntime.includes('/property/js/watchdog-universal-menu.js'), 'App brand runtime does not load the universal menu');
assert(!brandRuntime.includes("var items=["), 'Brand runtime has reintroduced a second hardcoded navigation model');

assert(dashboard.includes('/property/js/brand-consistency-runtime.js'), 'Dashboard is not connected to shared menu runtime');
assert(home.includes('/property/js/brand-consistency-runtime.js'), 'Property Home is not connected to shared menu runtime');
assert(sidemenu.includes('loadBrandConsistency'), 'Secondary-page shell is not connected to shared menu runtime');

// Property Home used to fetch entitlement state and overwrite .hm27-nav-links with
// hardcoded /property routes after the universal menu had already rendered. It is
// now an Intelligence asset loader only.
assert(homeMenu.includes('Navigation is owned exclusively by /property/js/watchdog-universal-menu.js'), 'Property Home menu loader is not delegated to the universal menu');
assert(!homeMenu.includes("document.querySelector('.hm27-nav-links')"), 'Property Home reintroduced a second nav renderer');
assert(!homeMenu.includes('nav.innerHTML='), 'Property Home is rewriting universal nav markup');

// Today used to observe and mutate the same universal nav nodes, causing a
// remove/reinsert MutationObserver loop and visible flashing. It may enhance only
// legacy .db-side-primary navigation now.
assert(todayNav.includes("document.querySelectorAll('.db-side-primary')"), 'Today helper is not scoped to legacy navigation');
assert(!todayNav.includes("document.querySelectorAll('.wd4-nav-links"), 'Today helper is mutating Dashboard universal navigation');
assert(!todayNav.includes("document.querySelectorAll('.hm27-nav-links"), 'Today helper is mutating Property Home universal navigation');
assert(todayNav.includes("contract:'watchdog-today-nav-v3-universal-safe'"), 'Today helper universal-safe contract is missing');

assert(css.includes('.wd-public-sheet.wd-universal-public-nav'), 'Public Dashboard-style drawer CSS is missing');
assert(css.includes('.wd4-nav-panel,.hm27-nav-panel'), 'App drawers are not governed by universal CSS');
assert(css.includes('.wd-public-sheet.right.wd-universal-public-profile'), 'Public Dashboard-style profile CSS is missing');
assert(css.includes('.wd-universal-profile>nav'), 'Shared profile row styling is missing');

// One exact drawer density must win on public, Dashboard and Property Home.
assert(css.includes('.wd-universal-nav-links a,.wd4-nav-links a,.hm27-nav-links a{'), 'Universal row selector does not cover all menu surfaces');
assert(css.includes('min-height:48px!important'), 'Universal menu row height drifted from 48px');
assert(css.includes('font:700 14px/1.2 var(--wdum-font)!important'), 'Universal menu typography drifted from 14px');
assert(css.includes('width:min(355px,calc(100vw - 28px))!important'), 'Universal drawer width drifted');
assert(css.includes('Keep the exact same 14px / 48px menu density on phones and tablets.'), 'Mobile/tablet menu density is no longer explicitly locked');

// Root styles.css contains a historical global `nav { ... }` selector. Universal
// semantic nav elements must fully reset container chrome so it cannot turn the
// menu navy, sticky, shadowed or elevated again.
const drawerRule = css.match(/\.wd-universal-nav-links,.wd4-nav-links,.hm27-nav-links\{([^}]*)\}/)?.[1] || '';
const profileRule = css.match(/\.wd-universal-profile>nav\{([^}]*)\}/)?.[1] || '';
for (const [name, rule] of [['drawer', drawerRule], ['profile', profileRule]]) {
  assert(rule.includes('background:#fff!important'), `Universal ${name} nav must force a white background`);
  assert(rule.includes('position:static!important'), `Universal ${name} nav must reset global sticky positioning`);
  assert(rule.includes('z-index:auto!important'), `Universal ${name} nav must reset global nav z-index`);
  assert(rule.includes('box-shadow:none!important'), `Universal ${name} nav must reset global nav shadow`);
  assert(rule.includes('transform:none!important'), `Universal ${name} nav must reset inherited nav transforms`);
}

// Main-drawer Sign out is redundant with Profile/Account and must stay hidden;
// the profile's canonical sign-out action remains present.
assert(css.includes('.wd4-nav-foot,.hm27-nav-foot{display:none!important}'), 'App main drawers still expose duplicate Sign out');
assert(css.includes('.wd-universal-nav-foot:has([data-wd-universal="signout"]){display:none!important}'), 'Public main drawer still exposes duplicate Sign out');
assert(css.includes('.wd-universal-profile>.wd-universal-signout'), 'Profile Sign out was removed instead of the duplicate main-menu action');

console.log('Universal Watchdog menu contract: PASS');
