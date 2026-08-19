import fs from 'node:fs';

const lookupPath = 'property/js/lookup.js';
const indexPath = 'property/index.html';
const workflowPath = '.github/workflows/one-time-auth-cleanup.yml';
const selfPath = 'property/scripts/one-time-auth-cleanup.mjs';

let lookup = fs.readFileSync(lookupPath, 'utf8');
let page = fs.readFileSync(indexPath, 'utf8');

const startMarker = '  // ══════════════════════════════════════════════\n  // ACCOUNTS  ·  Supabase auth, Google and Facebook';
const endMarker = '  // ── save / claim from the property panel ──';
const start = lookup.indexOf(startMarker);
const end = lookup.indexOf(endMarker, start);
if (start < 0 || end < 0 || end <= start) throw new Error('Legacy auth block markers were not found. Refusing a partial cleanup.');

const canonicalAuth = `  // ══════════════════════════════════════════════
  // ACCOUNTS · canonical Watchdog auth runtime
  //
  // The property lookup may observe a session and save member data, but it no
  // longer owns signup UI, magic links, provider buttons or Google One Tap.
  // Every sign-in entry goes through /property/onboarding/ and the shared
  // supabase-runtime.js provider configuration.
  // ══════════════════════════════════════════════
  var DASHBOARD_URL = '/property/dashboard';
  var sb = null, plUser = null;

  function authReady() {
    if (sb) return true;
    if (window.__njwSB) { sb = window.__njwSB; return true; }
    if (!window.NJPTRSupabaseRuntime || typeof window.NJPTRSupabaseRuntime.createClient !== 'function') return false;
    try {
      sb = window.NJPTRSupabaseRuntime.createClient();
      window.__njwSB = sb;
      return true;
    } catch (error) {
      console.warn('[watchdog] canonical auth runtime unavailable:', error && error.message || error);
      return false;
    }
  }

  function openCanonicalSignIn() {
    var next = location.pathname + location.search + location.hash;
    if (window.WatchdogAuth && typeof window.WatchdogAuth.openSignIn === 'function') {
      window.WatchdogAuth.openSignIn(next);
      return;
    }
    if (window.NJPTRSupabaseRuntime && typeof window.NJPTRSupabaseRuntime.openOnboarding === 'function') {
      window.NJPTRSupabaseRuntime.openOnboarding(next);
      return;
    }
    location.href = '/property/onboarding/?next=' + encodeURIComponent(next);
  }

  function plInitAuth() {
    if (!authReady()) { paintAuthBtn(); return; }
    sb.auth.getSession().then(function (res) {
      plUser = (res && res.data && res.data.session) ? res.data.session.user : null;
      paintAuthBtn();
      applyGates();
      if (location.hash.indexOf('access_token') > -1) history.replaceState(null, '', location.pathname + location.search);
    });
    sb.auth.onAuthStateChange(function (_event, session) {
      plUser = session ? session.user : null;
      paintAuthBtn();
      applyGates();
      if (current) refreshSaveState();
    });
  }

  function userName() {
    if (!plUser) return '';
    var meta = plUser.user_metadata || {};
    return meta.full_name || meta.name || (plUser.email || '').split('@')[0] || 'there';
  }

  function userAvatar() {
    var meta = (plUser && plUser.user_metadata) || {};
    return meta.avatar_url || meta.picture || '';
  }

  function paintHeroAuth() {
    var host = el('pl-heroauth');
    if (!host) return;
    if (plUser) {
      var avatar = userAvatar();
      host.innerHTML =
        '<a class="heroauth-btn" href="' + DASHBOARD_URL + '">' +
          (avatar ? '<img src="' + esc(avatar) + '" alt="">' : '<i class="fas fa-table-columns"></i>') +
          'My properties</a>' +
        '<a class="heroauth-link nav" href="' + DASHBOARD_URL + '#wishlist">Wishlist</a>' +
        '<a class="heroauth-link nav" href="' + DASHBOARD_URL + '#saved">Saved</a>' +
        '<a class="heroauth-link nav pro" href="/property/pro">Pro Hub</a>' +
        '<button class="heroauth-link" onclick="plSignOut()">Sign out</button>';
    } else {
      host.innerHTML = '<button class="heroauth-btn ghost" onclick="plSignInPrompt()"><i class="fas fa-right-to-bracket"></i>Sign in to save properties</button>';
    }
  }

  function paintNav() {
    if (window.WatchdogPublicNav && typeof window.WatchdogPublicNav.setUser === 'function') window.WatchdogPublicNav.setUser(plUser);
    var right = elReal('wd-right');
    if (!right) return;
    right.innerHTML = plUser
      ? '<a href="/property/pro#plans">Pricing</a><a href="/property/pro">Pro Hub</a><a href="/property/dashboard">My Properties</a><button onclick="plSignOut()">Sign out</button>'
      : '<a href="/property/pro#plans">Pricing</a><a href="/property/pro">Pro Hub</a><a href="/property/dashboard">My Properties</a><button onclick="plSignInPrompt()">Sign in</button>';
  }

  function paintAuthBtn() {
    paintNav();
    paintHeroAuth();
    var button = el('pl-authbtn');
    if (!button) return;
    if (plUser) {
      var avatar = userAvatar();
      button.innerHTML = (avatar ? '<img src="' + esc(avatar) + '" alt="" class="auth-av">' : '<i class="fas fa-user"></i>') + '<span>' + esc(userName().split(' ')[0]) + '</span>';
      button.onclick = plDashboard;
      button.title = 'Your saved properties';
    } else {
      button.innerHTML = '<i class="fas fa-right-to-bracket"></i><span>Sign in</span>';
      button.onclick = plSignInPrompt;
      button.title = 'Save properties to your account';
    }
  }

  window.plSignInPrompt = openCanonicalSignIn;

  window.plSignOut = function () {
    if (!authReady()) return;
    sb.auth.signOut().then(function () {
      plUser = null;
      paintAuthBtn();
      applyGates();
      plCloseNote();
    });
  };

  window.plDashboard = function () {
    if (!plUser) { openCanonicalSignIn(); return; }
    window.location.href = DASHBOARD_URL;
  };

`;

lookup = lookup.slice(0, start) + canonicalAuth + lookup.slice(end);
page = page.replace(/\n?<script src="https:\/\/accounts\.google\.com\/gsi\/client" async defer><\/script>/g, '');

const forbiddenLookup = ['Email me a sign in link','window.plMagicLink','window.plOAuth','GOOGLE_CLIENT_ID','initOneTap','signInWithOtp'];
for (const token of forbiddenLookup) {
  if (lookup.includes(token)) throw new Error('Legacy auth token still present after cleanup: ' + token);
}
if (page.includes('accounts.google.com/gsi/client')) throw new Error('Google One Tap loader still present after cleanup.');
if (!lookup.includes('window.plSignInPrompt = openCanonicalSignIn')) throw new Error('Canonical sign-in bridge was not written.');
if (!lookup.includes('plInitAuth()') && !lookup.includes('plInitAuth();')) throw new Error('Lookup no longer initializes session awareness.');

fs.writeFileSync(lookupPath, lookup);
fs.writeFileSync(indexPath, page);

// This codemod is intentionally one-time. Remove both the runner and the
// workflow in the same commit that applies the cleanup so they cannot rerun.
if (fs.existsSync(selfPath)) fs.rmSync(selfPath);
if (fs.existsSync(workflowPath)) fs.rmSync(workflowPath);

console.log('Legacy lookup authentication removed; canonical Watchdog auth retained.');
