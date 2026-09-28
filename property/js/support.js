(function () {
  'use strict';

  var preview = /\.vercel\.app$/i.test(location.hostname);
  var config = preview
    ? { url: 'https://pxossnwmrygxlpxtstnl.supabase.co', key: 'sb_publishable_2knfdj4MRsPEtQpPbQ54ew_S5KngOcl', storage: 'sb-pxossnwmrygxlpxtstnl-auth-token' }
    : { url: 'https://uvkvaxljhhngydvlrzom.supabase.co', key: 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa', storage: 'sb-uvkvaxljhhngydvlrzom-auth-token' };

  var client = window.supabase.createClient(config.url, config.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: config.storage }
  });
  var form = document.getElementById('support-form');
  var gate = document.getElementById('support-gate');
  var note = document.getElementById('support-note');
  var submit = document.getElementById('support-submit');
  var contactFallback = '<a href="/contact?topic=account-access">Contact Watchdog</a>';

  function setNote(text, type) {
    note.textContent = text || '';
    note.className = 'op-note' + (type ? ' ' + type : '');
  }

  client.auth.getUser().then(function (result) {
    if (result.data && result.data.user) {
      gate.hidden = true;
      form.hidden = false;
      return;
    }
    gate.innerHTML = preview
      ? '<b>Preview environment.</b><br>The interactive form is connected to Watchdog staging. Sign in with a staging test account to submit a non-production request, or ' + contactFallback + '.'
      : '<b>Sign in required for account-linked support.</b><br><a href="/signin">Sign in to Watchdog</a>, or ' + contactFallback + ' if you cannot access your account.';
  }).catch(function () {
    gate.innerHTML = 'The account session could not be checked. Please ' + contactFallback + '.';
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    submit.disabled = true;
    setNote('Submitting…');
    var body = {
      category: document.getElementById('support-category').value,
      priority: document.getElementById('support-priority').value,
      subject: document.getElementById('support-subject').value,
      message: document.getElementById('support-message').value
    };
    client.rpc('submit_support_request', {
      p_category: body.category,
      p_priority: body.priority,
      p_subject: body.subject,
      p_message: body.message
    }).then(function (result) {
      if (result.error) throw result.error;
      var request = result.data;
      setNote('Request submitted' + (request && request.id ? '. Reference ' + String(request.id).slice(0, 8).toUpperCase() + '.' : '.'), 'success');
      form.reset();
    }).catch(function (error) {
      var message = error && error.message || '';
      if (/subject and enough detail|too many support requests/i.test(message)) {
        setNote(message, 'error');
        return;
      }
      note.innerHTML = 'The request could not be submitted. Please <a href="/contact?topic=support-fallback">Contact Watchdog</a> if the problem continues.';
      note.className = 'op-note error';
    }).finally(function () { submit.disabled = false; });
  });
})();
