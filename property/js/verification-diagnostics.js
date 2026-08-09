(function () {
  'use strict';
  var URL = 'https://uvkvaxljhhngydvlrzom.supabase.co';
  var KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
  var sb = window.supabase.createClient(URL, KEY, { auth: { persistSession: true, storageKey: 'sb-uvkvaxljhhngydvlrzom-auth-token' } });
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function card(icon, title, text, status, ok) {
    return '<article class="vd-card ' + (ok === true ? 'ok' : ok === false ? 'bad' : '') + '"><i class="fas ' + icon + '"></i><h3>' + esc(title) + '</h3><p>' + esc(text) + '</p><strong>' + esc(status) + '</strong></article>';
  }
  async function platform() {
    var grid=document.getElementById('vd-platform-grid'),body=document.getElementById('vd-events-body');
    grid.innerHTML=card('fa-spinner fa-spin','Loading telemetry','Reading sanitized customer-facing signals…','In progress');
    try{var session=await sb.auth.getSession(),token=session.data&&session.data.session&&session.data.session.access_token;var response=await fetch(URL+'/functions/v1/get-platform-health',{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}'});var result=await response.json();if(!response.ok)throw new Error(result.error||'Reliability service unavailable');var c=result.counts||{};grid.innerHTML=card('fa-triangle-exclamation','Last 24 hours','All customer-facing signals recorded in the last day.',String(c.last_24h||0),c.last_24h===0)+card('fa-calendar-week','Last 7 days','Errors and slow-page signals retained for triage.',String(c.last_7d||0),null)+card('fa-gauge-high','Slow pages','Signed-in page loads exceeding eight seconds.',String(c.slow_pages||0),c.slow_pages===0);document.getElementById('vd-generated').textContent='Updated '+new Date(result.generated_at).toLocaleString();body.innerHTML=(result.events||[]).map(function(row){var m=row.metadata||{};return '<tr><td>'+esc(new Date(row.created_at).toLocaleString())+'</td><td>'+esc(String(row.event_type||'').replace('platform.','').replaceAll('_',' '))+'</td><td><code>'+esc(row.resource_id||'')+'</code></td><td>'+esc(m.message||'')+'</td><td>'+esc(m.release||'—')+'</td></tr>';}).join('')||'<tr><td colspan="5">No customer-facing reliability events in the last seven days.</td></tr>';}catch(error){grid.innerHTML=card('fa-circle-xmark','Reliability telemetry',error.message,'Unavailable',false);}
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
      card('fa-envelope-circle-check', 'Administrator email', health.admin_email_configured ? 'EmailJS will send codes and property addresses to the configured administrator inbox for manual postcard mailing.' : 'EmailJS private-key or administrator-email settings are not configured.', health.admin_email_configured ? 'EmailJS configured' : 'Needs setup', !!health.admin_email_configured) +
      card('fa-user-shield', 'Your account', signed ? (account && account.ok ? ((account.active || 0) + ' active, ' + (account.verified || 0) + ' verified, ' + (account.failed || 0) + ' failed') : (account && account.reason || 'Status RPC needs deployment')) : 'Sign in to see request totals.', signed && account && account.ok ? 'Connected' : signed ? 'Needs migration' : 'Signed out', signed ? !!(account && account.ok) : null);
  }
  document.getElementById('vd-refresh').addEventListener('click',function(){run();platform();});
  Promise.resolve(window.njptrSideMenuReady).then(function(){run();platform();});
})();
