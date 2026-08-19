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
      ? '<b>Preview environment.</b><br>The interactive form is connected to Watchdog staging. Sign in with a staging test account to submit a non-production request, or use the email option on this page.'
      : '<b>Sign in required for account-linked support.</b><br><a href="/property/signin">Sign in to Watchdog</a>, or use the email option on this page if you cannot access your account.';
  }).catch(function () {
    gate.textContent = 'The account session could not be checked. Use the email support option on this page.';
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
    client.functions.invoke('submit-support-request', { body: body }).then(function (result) {
      if (result.error) throw result.error;
      var request = result.data && result.data.request;
      setNote('Request submitted' + (request && request.id ? '. Reference ' + request.id.slice(0, 8).toUpperCase() + '.' : '.'), 'success');
      form.reset();
    }).catch(function () {
      setNote('The request could not be submitted. Please use hello@njpropertytaxrelief.com if the problem continues.', 'error');
    }).finally(function () { submit.disabled = false; });
  });
})();
