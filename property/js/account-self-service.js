(function () {
  'use strict';

  var preview = /\.vercel\.app$/i.test(location.hostname);
  var config = preview
    ? { url: 'https://pxossnwmrygxlpxtstnl.supabase.co', key: 'sb_publishable_2knfdj4MRsPEtQpPbQ54ew_S5KngOcl', storage: 'sb-pxossnwmrygxlpxtstnl-auth-token' }
    : { url: 'https://uvkvaxljhhngydvlrzom.supabase.co', key: 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa', storage: 'sb-uvkvaxljhhngydvlrzom-auth-token' };
  var client = window.supabase && window.supabase.createClient(config.url, config.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: config.storage }
  });

  function providerNeutralCopy(root) {
    if (!root) return;
    root.querySelectorAll('p,span,small,b').forEach(function (node) {
      if (node.children.length) return;
      if (/Paddle/i.test(node.textContent || '')) node.textContent = (node.textContent || '').replace(/Paddle/gi, 'the payment provider');
    });
  }

  function insert() {
    var app = document.getElementById('ac-app');
    if (!app || app.hidden || document.getElementById('ac-self-service')) return;
    providerNeutralCopy(app);
    var section = document.createElement('article');
    section.className = 'ac-card ac-self-service';
    section.id = 'ac-self-service';
    section.innerHTML = '<span>ACCOUNT DATA & SUPPORT</span><h2>Your Watchdog, portable and supported</h2><p>Download a copy of the account and workspace data associated with your sign-in, open a support request, or check current service health.</p><div class="ac-self-grid"><button class="ac-self-action" type="button" id="ac-export-data"><i class="fas fa-file-arrow-down"></i><span><b>Download my data</b><small>JSON export of your profile, saved work, professional workspace and Intelligence history when available.</small></span></button><a class="ac-self-action" href="/property/support"><i class="fas fa-life-ring"></i><span><b>Get support</b><small>Account-linked support requests plus an email fallback if you cannot sign in.</small></span></a><a class="ac-self-action" href="/property/status"><i class="fas fa-signal"></i><span><b>Platform status</b><small>Privacy-safe operational health and recently resolved service incidents.</small></span></a></div><div class="ac-self-note" id="ac-self-note" aria-live="polite"></div>';
    app.appendChild(section);
    document.getElementById('ac-export-data').addEventListener('click', exportData);
  }

  function note(text, type) {
    var el = document.getElementById('ac-self-note');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'ac-self-note' + (type ? ' ' + type : '');
  }

  function exportData() {
    var button = document.getElementById('ac-export-data');
    if (!client || !button) return;
    button.disabled = true;
    note('Preparing your export…');
    client.auth.getUser().then(function (result) {
      if (!result.data || !result.data.user) throw new Error('sign_in_required');
      return client.functions.invoke('export-my-data', { body: {} });
    }).then(function (result) {
      if (result.error) throw result.error;
      var payload = result.data;
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = 'watchdog-data-export-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      note('Your Watchdog data export was downloaded.', 'success');
    }).catch(function (error) {
      var text = preview ? 'The Vercel preview export uses the staging account session. Sign in with a staging test account to exercise it.' : 'Your export could not be prepared. Please try again or contact support.';
      if (String(error && error.message || '').indexOf('sign_in_required') >= 0) text = preview ? 'Sign in with a staging test account to use export in this preview.' : 'Sign in to Watchdog before downloading your data.';
      note(text, 'error');
    }).finally(function () { button.disabled = false; });
  }

  var observer = new MutationObserver(function () { insert(); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', insert);
  setTimeout(insert, 250);
})();
