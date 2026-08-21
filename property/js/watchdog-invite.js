/* Universal Watchdog invite/share experience.
   Any authenticated Watchdog surface using the shared brand runtime gets the
   same branded invite modal. Native OS sharing is only invoked from the Share
   action inside the modal, never directly from the profile menu. */
(function () {
  'use strict';
  if (window.__WATCHDOG_INVITE_RUNTIME__) return;
  window.__WATCHDOG_INVITE_RUNTIME__ = true;

  var URL = 'https://uvkvaxljhhngydvlrzom.supabase.co';
  var KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
  var INVITE_SELECTOR = '[data-wd-stable="invite"],[data-dash-shell="invite"],[data-hm27="invite"],[data-watchdog-invite]';
  var db = null;
  var user = null;
  var lastFocus = null;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function client() {
    if (db || !window.supabase) return db;
    db = window.supabase.createClient(URL, KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        storageKey: 'sb-uvkvaxljhhngydvlrzom-auth-token'
      }
    });
    return db;
  }

  function getUser() {
    if (user) return Promise.resolve(user);
    var c = client();
    if (!c) return Promise.resolve(null);
    return c.auth.getSession().then(function (result) {
      user = result && result.data && result.data.session && result.data.session.user || null;
      return user;
    }).catch(function () { return null; });
  }

  function inviteData(currentUser) {
    var code = 'WD-' + String(currentUser.id).replace(/-/g, '').slice(0, 10).toUpperCase();
    var link = location.origin + '/property/?ref=' + encodeURIComponent(code);
    return { code: code, link: link };
  }

  function ensureShell() {
    var modal = document.getElementById('wd-invite-modal');
    if (modal) return modal;

    var shade = document.createElement('button');
    shade.id = 'wd-invite-shade';
    shade.className = 'wd-invite-shade';
    shade.type = 'button';
    shade.setAttribute('aria-label', 'Close invite dialog');

    modal = document.createElement('section');
    modal.id = 'wd-invite-modal';
    modal.className = 'wd-invite-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'wd-invite-title');

    document.body.appendChild(shade);
    document.body.appendChild(modal);

    shade.addEventListener('click', function () { close(); });
    return modal;
  }

  function render(currentUser) {
    var modal = ensureShell();
    var data = inviteData(currentUser);
    var subject = 'Try Watchdog Property Intelligence';
    var body = 'I thought you might find Watchdog useful: ' + data.link;

    modal.innerHTML =
      '<button class="wd-invite-close" type="button" data-watchdog-invite-action="close" aria-label="Close invite dialog"><i class="fas fa-xmark" aria-hidden="true"></i></button>' +
      '<div class="wd-invite-hero">' +
        '<small>INVITE TO WATCHDOG</small>' +
        '<h2 id="wd-invite-title">Share better property intelligence.</h2>' +
        '<p>Send your personal Watchdog invite link to a friend, client or colleague.</p>' +
      '</div>' +
      '<div class="wd-invite-body">' +
        '<label for="wd-invite-link">Your invite link</label>' +
        '<div class="wd-invite-link-row">' +
          '<input id="wd-invite-link" readonly value="' + esc(data.link) + '">' +
          '<button type="button" data-watchdog-invite-action="copy"><i class="far fa-copy" aria-hidden="true"></i><span>Copy</span></button>' +
        '</div>' +
        '<div class="wd-invite-actions">' +
          '<a href="mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body) + '"><i class="fas fa-envelope" aria-hidden="true"></i><span>Email invite</span></a>' +
          '<button type="button" data-watchdog-invite-action="share"><i class="fas fa-share-nodes" aria-hidden="true"></i><span>Share</span></button>' +
        '</div>' +
        '<em>Invite code: ' + esc(data.code) + '</em>' +
      '</div>';
    modal.dataset.inviteLink = data.link;
  }

  function open() {
    lastFocus = document.activeElement;
    getUser().then(function (currentUser) {
      if (!currentUser) return;
      render(currentUser);
      var modal = document.getElementById('wd-invite-modal');
      var shade = document.getElementById('wd-invite-shade');
      if (modal) modal.classList.add('open');
      if (shade) shade.classList.add('open');
      document.body.classList.add('wd-invite-open');
      var closeButton = modal && modal.querySelector('.wd-invite-close');
      if (closeButton) closeButton.focus({ preventScroll: true });
    });
  }

  function close() {
    var modal = document.getElementById('wd-invite-modal');
    var shade = document.getElementById('wd-invite-shade');
    if (modal) modal.classList.remove('open');
    if (shade) shade.classList.remove('open');
    document.body.classList.remove('wd-invite-open');
    if (lastFocus && typeof lastFocus.focus === 'function') {
      try { lastFocus.focus({ preventScroll: true }); } catch (_) { try { lastFocus.focus(); } catch (_) {} }
    }
  }

  function copyLink(button) {
    var modal = document.getElementById('wd-invite-modal');
    var input = document.getElementById('wd-invite-link');
    var link = modal && modal.dataset.inviteLink || input && input.value || '';
    if (!link) return;

    function done() {
      if (!button) return;
      button.innerHTML = '<i class="fas fa-check" aria-hidden="true"></i><span>Copied</span>';
      window.setTimeout(function () {
        if (button && document.body.contains(button)) button.innerHTML = '<i class="far fa-copy" aria-hidden="true"></i><span>Copy</span>';
      }, 1800);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(done).catch(function () {});
      return;
    }
    if (input) {
      input.removeAttribute('readonly');
      input.select();
      try { document.execCommand('copy'); done(); } catch (_) {}
      input.setAttribute('readonly', 'readonly');
      input.setSelectionRange(0, 0);
    }
  }

  function shareLink() {
    var modal = document.getElementById('wd-invite-modal');
    var link = modal && modal.dataset.inviteLink || '';
    if (!link) return;
    if (navigator.share) {
      navigator.share({
        title: 'Watchdog Property Intelligence',
        text: 'Take a look at Watchdog Property Intelligence.',
        url: link
      }).catch(function () {});
      return;
    }
    copyLink(modal && modal.querySelector('[data-watchdog-invite-action="copy"]'));
  }

  /* Window capture intentionally runs before page-level document capture
     handlers. This normalizes legacy Dashboard, Property Home and app-shell
     implementations without requiring each page to own invite behavior. */
  window.addEventListener('click', function (event) {
    var target = event.target && event.target.closest ? event.target.closest(INVITE_SELECTOR) : null;
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    open();
  }, true);

  document.addEventListener('click', function (event) {
    var action = event.target && event.target.closest ? event.target.closest('[data-watchdog-invite-action]') : null;
    if (!action) return;
    var kind = action.getAttribute('data-watchdog-invite-action');
    if (kind === 'close') close();
    else if (kind === 'copy') copyLink(action);
    else if (kind === 'share') shareLink();
    event.preventDefault();
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && document.body.classList.contains('wd-invite-open')) close();
  });

  window.WatchdogInvite = { open: open, close: close };
})();
