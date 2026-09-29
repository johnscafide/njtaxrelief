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
  function showGate(templateId) {
    var template = document.getElementById(templateId);
    if (template) gate.replaceChildren(template.content.cloneNode(true));
  }

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
    showGate(preview ? 'support-gate-preview' : 'support-gate-signed-out');
  }).catch(function () {
    showGate('support-gate-error');
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
