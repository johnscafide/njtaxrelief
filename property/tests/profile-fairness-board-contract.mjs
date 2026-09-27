import fs from 'node:fs';

// Profile edit pages, Fairness and the Home phone top bar in the board design.
function read(p){ return fs.readFileSync(p,'utf8'); }
function must(v,m){ if(!v) throw new Error(m); }

const profileJs=read('property/js/account-profile.js');
must(/replacement\.id = 'ac-profile-editor'/.test(profileJs), 'The profile placeholder must keep its id so the loaded profile can render into it.');

for (const page of ['property/account/profile/index.html','property/account/professional-profile/index.html']) {
  const html=read(page);
  must(html.indexOf('/property/css/profile-board.css')>html.indexOf('/property/css/account-board.css') && html.indexOf('/property/css/account-board.css')>html.indexOf('/property/css/plan-context.css'), page+' must load account-board.css then profile-board.css after the legacy account styles.');
}
const proPage=read('property/account/professional-profile/index.html');
must(proPage.includes('/property/js/professional-invite.js'), 'The Professional Profile page must load the invite panel.');

const invite=read('property/js/professional-invite.js');
must(invite.includes('Invite fellow co-op agents') && invite.includes('Invite your professional sphere'), 'Agents and other professionals must each get their own invite heading.');
// Every invite surface uses the tracked member referral link, so joins are credited.
const REFERRAL="https://www.watchdogindex.com/?utm_source=watchdog_referral&utm_medium=member&utm_campaign=";
for (const f of ['property/js/professional-invite.js','property/js/watchdog-invite.js','property/js/watchdog-universal-menu.js','property/js/app-shell-2027.js']) {
  const src=read(f);
  must(src.includes(REFERRAL) && src.includes("get_or_create_my_watchdog_referral_code"), f+' must use the tracked member referral link.');
  must(!/\?ref=/.test(src) && !/'WD-' ?\+/.test(src), f+' must not build the old untracked WD-/?ref= invite.');
}
must(invite.includes("from('watchdog_referral_conversions')"), 'The invite panel must show how many people joined with the invite.');
must(!/functions\.invoke|\.insert\(|\.update\(|\.upsert\(|fetch\(/.test(invite), 'The invite panel only copies text; it must not send or write anything.');

for (const f of ['property/js/professional-license-verification.js','property/js/onboarding-professional-license.js','property/js/realtor-verification.js','api/njrec-license-verify.js','property/agent/index.html']) {
  const src=read(f);
  must(!/NJ real-estate license|New Jersey real-estate license|NJ real estate license/.test(src), f+' must say "New Jersey Real Estate License".');
}

const profileCss=read('property/css/profile-board.css'), accountCss=read('property/css/account-board.css');
must(/\.acp-chips input\{[^}]*width:1px!important/.test(profileCss), 'Hidden chip checkboxes must not take layout width (they caused sideways scrolling).');
must(/\.acp-profile-route-card::after\{[^}]*background-color:transparent!important/.test(accountCss), 'The profile chooser decoration must not paint a square behind the icon.');
must(!/content:\s*"[^"]*[A-Za-z]{4,}/.test(profileCss) && !profileCss.includes('border-left'), 'Profile board CSS must not inject text or use border-left accents.');

const fairPage=read('property/fairness/index.html'), fairCss=read('property/css/fairness-board.css');
must(fairPage.includes('data-sidebar-page="fairness"') && fairPage.includes('/property/js/app-shell-2027.js'), 'Fairness must use the shared Watchdog top bar and menu.');
must(fairPage.indexOf('/property/css/fairness-board.css')>fairPage.indexOf('/property/css/secondary-pages-2027.css'), 'Fairness board styles must load after the secondary page styles.');
must(fairPage.includes('id="fb-cards"') && fairPage.includes('bandFilter'), 'Fairness must show the summary cards and band filter.');
must(fairCss.split('\n').filter(l=>/\.ti-report|\.bp-mini/.test(l)).every(l=>l.includes('[data-sidebar-page="fairness"]')), 'Town card styles must stay scoped to Fairness.');
must(read('property/js/watchdog-universal-menu.js').includes("page === 'robust' || page === 'fairness'"), 'The ROBUST menu item must stay active on Fairness.');

const homeCss=read('property/css/home/home-board.css');
must(/\.hm27-top-in\{flex-wrap:nowrap!important/.test(homeCss) && homeCss.includes('watchdog-mark.svg'), 'The Home phone top bar must stay on one row and use the square mark when narrow.');

console.log('Profile, Fairness and Home header board contract passed.');
