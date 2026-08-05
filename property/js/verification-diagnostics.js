(function () {
  'use strict';
  var URL = 'https://uvkvaxljhhngydvlrzom.supabase.co';
  var KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
  var sb = window.supabase.createClient(URL, KEY, { auth: { persistSession: true, storageKey: 'sb-uvkvaxljhhngydvlrzom-auth-token' } });
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function card(icon, title, text, status, ok) {
    return '<article class="vd-card ' + (ok === true ? 'ok' : ok === false ? 'bad' : '') + '"><i class="fas ' + icon + '"></i><h3>' + esc(title) + '</h3><p>' + esc(text) + '</p><strong>' + esc(status) + '</strong></article>';
  }
  async function run() {
    var host = document.getElementById('vd-grid');
    host.innerHTML = card('fa-spinner fa-spin', 'Running checks', 'Contacting the verification service...', 'In progress');
    var health = {};
    try {
      var response = await fetch(URL + '/functions/v1/request-verify-code', { headers: { apikey: KEY } });
      health = await response.json();
    } catch (error) { health = { ok: false, reason: 'Edge Function did not respond' }; }
    var session = await sb.auth.getSession();
    var signed = !!(session.data && session.data.session), account = null;
    if (signed) {
      var result = await sb.rpc('verification_delivery_status');
      account = result.error ? { ok: false, reason: result.error.message } : result.data;
    }
    host.innerHTML =
      card('fa-code', 'Edge Function', health.ok ? 'The secure-code endpoint responded.' : (health.reason || 'No response.'), health.ok ? 'Online' : 'Unavailable', !!health.ok) +
      card('fa-database', 'Verification database', health.database_configured ? 'Service-role database access is configured.' : 'Service-role access is missing or the function is unavailable.', health.database_configured ? 'Configured' : 'Needs setup', !!health.database_configured) +
      card('fa-envelope-circle-check', 'Administrator email', health.admin_email_configured ? 'Codes and property addresses will be sent to the configured administrator inbox for manual postcard mailing.' : 'Resend or administrator-email settings are not configured.', health.admin_email_configured ? 'Configured' : 'Needs setup', !!health.admin_email_configured) +
      card('fa-user-shield', 'Your account', signed ? (account && account.ok ? ((account.active || 0) + ' active, ' + (account.verified || 0) + ' verified, ' + (account.failed || 0) + ' failed') : (account && account.reason || 'Status RPC needs deployment')) : 'Sign in to see request totals.', signed && account && account.ok ? 'Connected' : signed ? 'Needs migration' : 'Signed out', signed ? !!(account && account.ok) : null);
  }
  document.getElementById('vd-refresh').addEventListener('click', run);
  Promise.resolve(window.njptrSideMenuReady).then(run);
})();
