// content-architecture: dynamic — authenticated professional invite panel on the Professional Profile page.
/* Invite your peers from the Professional Profile.
   Real estate agents see "Invite fellow co-op agents"; every other declared
   professional sees "Invite your professional sphere". Watchdog never sends
   anything here: the member copies their own invite and shares it by email,
   text or social media. The code and link match the shared invite modal
   (watchdog-invite.js), so referrals attribute the same way. */
(function () {
  'use strict';
  if (!window.NJPTRSupabaseRuntime) return;
  var db = window.NJPTRSupabaseRuntime.createClient();
  var state = null;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  function inviteFor(user) {
    var code = 'WD-' + String(user.id).replace(/-/g, '').slice(0, 10).toUpperCase();
    var prefix = String(window.NJPTRSupabaseRuntime.routePrefix || '');
    return { code: code, link: location.origin + prefix + '/?ref=' + encodeURIComponent(code) };
  }

  function copy(profile, invite) {
    if (profile === 'real_estate') {
      return {
        eyebrow: 'CO-OP AGENTS',
        title: 'Invite fellow co-op agents',
        lead: 'Know agents you co-op with? Copy your invite and send it however you like: email, text or social media.',
        message: 'I use Watchdog for New Jersey property and tax research on my deals. Here is my invite if you want to try it: ' + invite.link + ' (invite code ' + invite.code + ')'
      };
    }
    return {
      eyebrow: 'YOUR PROFESSIONAL SPHERE',
      title: 'Invite your professional sphere',
      lead: 'Know colleagues or partners who would use Watchdog? Copy your invite and send it however you like: email, text or social media.',
      message: 'I use Watchdog for New Jersey property and tax research in my work. Here is my invite if you want to try it: ' + invite.link + ' (invite code ' + invite.code + ')'
    };
  }

  function remove() {
    var old = document.getElementById('ac-professional-invite');
    if (old) old.remove();
  }

  function render() {
    remove();
    var app = document.getElementById('ac-app');
    if (!app || !state) return;
    var text = copy(state.profession, state.invite);
    var section = document.createElement('section');
    section.id = 'ac-professional-invite';
    section.className = 'ac-section acp-editor api-invite' + (state.profession === 'real_estate' ? ' is-agent' : '');
    section.innerHTML =
      '<div class="api-copy">' +
        '<span class="api-eyebrow">' + esc(text.eyebrow) + '</span>' +
        '<h2>' + esc(text.title) + '</h2>' +
        '<p>' + esc(text.lead) + '</p>' +
      '</div>' +
      '<div class="api-share">' +
        '<div class="api-code"><small>Your invite code</small><b id="api-code-value">' + esc(state.invite.code) + '</b></div>' +
        '<label class="api-link"><span>Your invite link</span><input id="api-link" readonly value="' + esc(state.invite.link) + '"></label>' +
        '<div class="api-actions">' +
          '<button type="button" class="api-primary" data-api-copy="message"><i class="far fa-copy" aria-hidden="true"></i><span>Copy invite</span></button>' +
          '<button type="button" data-api-copy="code"><i class="fas fa-hashtag" aria-hidden="true"></i><span>Copy code only</span></button>' +
        '</div>' +
        '<small class="api-note" id="api-note" aria-live="polite">"Copy invite" copies a short message with your link and code, ready to paste.</small>' +
      '</div>';
    app.appendChild(section);
  }

  function writeClipboard(value) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(value);
    return new Promise(function (resolve, reject) {
      var area = document.createElement('textarea');
      area.value = value;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (_) {}
      area.remove();
      if (ok) resolve(); else reject(new Error('copy failed'));
    });
  }

  document.addEventListener('click', function (event) {
    var button = event.target && event.target.closest ? event.target.closest('[data-api-copy]') : null;
    if (!button || !state) return;
    var kind = button.getAttribute('data-api-copy');
    var value = kind === 'code' ? state.invite.code : copy(state.profession, state.invite).message;
    var note = document.getElementById('api-note');
    writeClipboard(value).then(function () {
      if (note) note.textContent = kind === 'code' ? 'Invite code copied.' : 'Invite copied. Paste it into an email, text or post.';
      var label = button.querySelector('span');
      var original = label ? label.textContent : '';
      if (label) label.textContent = 'Copied';
      window.setTimeout(function () { if (label && document.body.contains(label)) label.textContent = original; }, 1800);
    }).catch(function () {
      if (note) note.textContent = 'Copy is blocked in this browser. Select the link above and copy it manually.';
      var input = document.getElementById('api-link');
      if (input) { input.focus(); input.select(); }
    });
  });

  async function load() {
    try {
      var session = await db.auth.getSession();
      var user = session && session.data && session.data.session && session.data.session.user;
      if (!user) { state = null; remove(); return; }
      var result = await db.from('watchdog_onboarding_profiles').select('persona,primary_profession').eq('user_id', user.id).maybeSingle();
      if (result.error) throw result.error;
      var row = result.data || {};
      var professional = (row.persona === 'professional' || row.persona === 'both') && !!row.primary_profession;
      if (!professional) { state = null; remove(); return; }
      state = { profession: row.primary_profession, invite: inviteFor(user) };
      render();
    } catch (error) {
      console.warn('professional invite', error);
    }
  }

  function start() {
    if (String(document.body && document.body.getAttribute('data-account-profile-mode') || '') !== 'professional') return;
    load();
    document.addEventListener('watchdog:profile-updated', load);
    var app = document.getElementById('ac-app');
    if (app) new MutationObserver(function () {
      if (state && !document.getElementById('ac-professional-invite')) window.setTimeout(render, 0);
    }).observe(app, { childList: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
