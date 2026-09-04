(function () {
  'use strict';

  if (!window.WatchdogSignupAnalytics && !document.querySelector('script[src="/property/js/signup-attribution.js"]')) {
    var analyticsScript = document.createElement('script');
    analyticsScript.src = '/property/js/signup-attribution.js';
    analyticsScript.defer = true;
    analyticsScript.setAttribute('data-watchdog-signup-attribution','1');
    (document.head || document.documentElement).appendChild(analyticsScript);
  }

  var root = document.getElementById('wd-onboarding-root');
  if (!root || !window.NJPTRSupabaseRuntime) return;

  var db = window.NJPTRSupabaseRuntime.createClient();
  var email = '';
  var busy = false;
  var resendAt = 0;
  var resendTimer = null;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>\"]/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;' }[c];
    });
  }

  function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function validEmail(value) {
    var normalized = normalizeEmail(value);
    return normalized.length >= 3 && normalized.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
  }

  function friendlyError(error) {
    var message = String(error && error.message || '').trim();
    if (/rate limit|seconds|too many/i.test(message)) return 'Please wait a moment before requesting another code.';
    if (/not authorized|unauthorized email/i.test(message)) return 'Email delivery is not available for this address yet.';
    if (/expired|invalid.*token|token.*invalid|otp/i.test(message)) return 'That code is invalid or expired. Request a new code and try again.';
    return message || 'We could not complete email sign-in. Please try again.';
  }

  function setError(message) {
    var box = root.querySelector('[data-email-error]');
    if (!box) return;
    box.textContent = message || '';
    box.classList.toggle('is-visible', !!message);
  }

  function clearResendTimer() {
    if (resendTimer) window.clearInterval(resendTimer);
    resendTimer = null;
  }

  function updateResendButton() {
    var button = root.querySelector('[data-email-resend]');
    if (!button) {
      clearResendTimer();
      return;
    }
    var seconds = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000));
    button.disabled = busy || seconds > 0;
    button.textContent = seconds > 0 ? 'Resend code in ' + seconds + 's' : 'Resend code';
    if (seconds <= 0) clearResendTimer();
  }

  function startResendCooldown() {
    resendAt = Date.now() + 60000;
    clearResendTimer();
    updateResendButton();
    resendTimer = window.setInterval(updateResendButton, 1000);
  }

  function closeEmailMode() {
    clearResendTimer();
    root.classList.remove('wd-email-mode');
    var flow = root.querySelector('.wd-email-auth-flow');
    if (flow) flow.remove();
    var emailButton = root.querySelector('[data-email-start]');
    if (emailButton) emailButton.focus();
  }

  function emailEntryHtml() {
    return '<div class="wd-email-auth-flow" aria-live="polite">' +
      '<button type="button" class="wd-email-back" data-email-back><i class="fas fa-arrow-left" aria-hidden="true"></i> Other sign-in options</button>' +
      '<p class="wd-onboarding-step">EMAIL SIGN IN</p>' +
      '<h2>Continue with email.</h2>' +
      '<p class="wd-email-copy">We’ll send a six-digit sign-in code. No password to create or remember.</p>' +
      '<form class="wd-email-form" data-email-form novalidate>' +
        '<label for="wd-email-address">Email address</label>' +
        '<input id="wd-email-address" class="wd-email-input" type="email" inputmode="email" autocomplete="email" maxlength="254" placeholder="you@example.com" value="' + esc(email) + '">' +
        '<div class="wd-email-error" data-email-error role="alert"></div>' +
        '<button class="wd-email-primary" type="submit" data-email-send>Send me a code</button>' +
      '</form>' +
      '<p class="wd-email-footnote">New here? Verifying your code creates your free Watchdog account automatically.</p>' +
    '</div>';
  }

  function codeEntryHtml() {
    return '<div class="wd-email-auth-flow" aria-live="polite">' +
      '<button type="button" class="wd-email-back" data-email-change><i class="fas fa-arrow-left" aria-hidden="true"></i> Change email</button>' +
      '<p class="wd-onboarding-step">CHECK YOUR EMAIL</p>' +
      '<h2>Enter your code.</h2>' +
      '<p class="wd-email-copy">We sent a six-digit code to <strong>' + esc(email) + '</strong>.</p>' +
      '<form class="wd-email-form" data-code-form novalidate>' +
        '<label for="wd-email-code">Six-digit code</label>' +
        '<input id="wd-email-code" class="wd-email-input wd-email-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*" placeholder="000000" aria-describedby="wd-code-help">' +
        '<div class="wd-email-error" data-email-error role="alert"></div>' +
        '<button class="wd-email-primary" type="submit" data-email-verify disabled>Verify and continue</button>' +
      '</form>' +
      '<div class="wd-email-code-help" id="wd-code-help"><span>Code not there? Check spam or junk.</span><button type="button" data-email-resend>Resend code</button></div>' +
    '</div>';
  }

  function mountEntry() {
    clearResendTimer();
    var old = root.querySelector('.wd-email-auth-flow');
    if (old) old.remove();
    root.insertAdjacentHTML('beforeend', emailEntryHtml());
    root.classList.add('wd-email-mode');

    var back = root.querySelector('[data-email-back]');
    var form = root.querySelector('[data-email-form]');
    var input = root.querySelector('#wd-email-address');
    if (back) back.addEventListener('click', closeEmailMode);
    if (form) form.addEventListener('submit', function (event) {
      event.preventDefault();
      sendCode(input && input.value);
    });
    if (input) {
      input.focus();
      input.select();
    }
  }

  function mountCode() {
    clearResendTimer();
    var old = root.querySelector('.wd-email-auth-flow');
    if (old) old.remove();
    root.insertAdjacentHTML('beforeend', codeEntryHtml());
    root.classList.add('wd-email-mode');

    var change = root.querySelector('[data-email-change]');
    var form = root.querySelector('[data-code-form]');
    var input = root.querySelector('#wd-email-code');
    var verify = root.querySelector('[data-email-verify]');
    var resend = root.querySelector('[data-email-resend]');

    if (change) change.addEventListener('click', mountEntry);
    if (input) {
      input.addEventListener('input', function () {
        input.value = input.value.replace(/\D/g, '').slice(0, 6);
        if (verify) verify.disabled = busy || input.value.length !== 6;
      });
      input.focus();
    }
    if (form) form.addEventListener('submit', function (event) {
      event.preventDefault();
      verifyCode(input && input.value);
    });
    if (resend) resend.addEventListener('click', function () { resendCode(); });
    startResendCooldown();
  }

  async function sendCode(value) {
    if (busy) return;
    var normalized = normalizeEmail(value);
    if (!validEmail(normalized)) {
      setError('Enter a valid email address.');
      return;
    }

    email = normalized;
    busy = true;
    setError('');
    var button = root.querySelector('[data-email-send]');
    if (button) {
      button.disabled = true;
      button.textContent = 'Sending code…';
    }

    try {
      var result = await db.auth.signInWithOtp({
        email: email,
        options: { shouldCreateUser: true }
      });
      if (result.error) throw result.error;
      busy = false;
      mountCode();
    } catch (error) {
      busy = false;
      if (button) {
        button.disabled = false;
        button.textContent = 'Send me a code';
      }
      setError(friendlyError(error));
    }
  }

  async function resendCode() {
    if (busy || Date.now() < resendAt) return;
    busy = true;
    setError('');
    updateResendButton();
    try {
      var result = await db.auth.signInWithOtp({
        email: email,
        options: { shouldCreateUser: true }
      });
      if (result.error) throw result.error;
      busy = false;
      startResendCooldown();
    } catch (error) {
      busy = false;
      setError(friendlyError(error));
      updateResendButton();
    }
  }

  async function verifyCode(value) {
    if (busy) return;
    var token = String(value || '').replace(/\D/g, '').slice(0, 6);
    if (token.length !== 6) {
      setError('Enter the six-digit code from your email.');
      return;
    }

    busy = true;
    setError('');
    var button = root.querySelector('[data-email-verify]');
    if (button) {
      button.disabled = true;
      button.textContent = 'Verifying…';
    }

    try {
      var result = await db.auth.verifyOtp({
        email: email,
        token: token,
        type: 'email'
      });
      if (result.error) throw result.error;
      if (!result.data || !result.data.session || !result.data.user) throw new Error('A session was not created. Please request a new code.');
      clearResendTimer();
      window.location.reload();
    } catch (error) {
      busy = false;
      if (button) {
        button.disabled = false;
        button.textContent = 'Verify and continue';
      }
      setError(friendlyError(error));
    }
  }

  function enhance() {
    if (!document.body.classList.contains('wd-auth-view')) return;
    var panel = root.querySelector('.wd-auth-panel');
    if (!panel || root.querySelector('[data-email-start]')) return;

    panel.insertAdjacentHTML('afterend',
      '<div class="wd-auth-divider" aria-hidden="true"><span>or</span></div>' +
      '<button type="button" class="wd-auth-email-button" data-email-start><i class="far fa-envelope" aria-hidden="true"></i><span>Continue with email</span></button>'
    );
    var button = root.querySelector('[data-email-start]');
    if (button) button.addEventListener('click', mountEntry);
  }

  var observer = new MutationObserver(function () { window.setTimeout(enhance, 0); });
  observer.observe(root, { childList:true, subtree:true });
  window.setTimeout(enhance, 0);
})();
