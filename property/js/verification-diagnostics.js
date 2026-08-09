(function () {
  'use strict';
  var URL = 'https://uvkvaxljhhngydvlrzom.supabase.co';
  var KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
  var sb = window.supabase.createClient(URL, KEY, { auth: { persistSession: true, storageKey: 'sb-uvkvaxljhhngydvlrzom-auth-token' } });
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function card(icon, title, text, status, ok) { return '<article class="vd-card ' + (ok === true ? 'ok' : ok === false ? 'bad' : '') + '"><i class="fas ' + icon + '"></i><h3>' + esc(title) + '</h3><p>' + esc(text) + '</p><strong>' + esc(status) + '</strong></article>'; }
  async function platform() {
    var grid=document.getElementById('vd-platform-grid'),body=document.getElementById('vd-events-body'),incidents=document.getElementById('vd-incidents-body'),checks=document.getElementById('vd-billing-checks');
    grid.innerHTML=card('fa-spinner fa-spin','Loading telemetry','Reading sanitized customer-facing signals…','In progress');
    checks.innerHTML='<div class="vd-check"><i class="fas fa-spinner fa-spin"></i> Loading billing evidence…</div>';
    try {
      var session=await sb.auth.getSession(),token=session.data&&session.data.session&&session.data.session.access_token;
      var response=await fetch(URL+'/functions/v1/get-platform-health',{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}'}),result=await response.json();
      if(!response.ok)throw new Error(result.error||'Reliability service unavailable');
      var c=result.counts||{};
      grid.innerHTML=card('fa-triangle-exclamation','Open incidents','Aggregated customer-facing failures requiring review.',String(c.open_incidents||0),c.open_incidents===0)+card('fa-shield-halved','Critical incidents','Unhandled failures or repeated warning signals.',String(c.critical_incidents||0),c.critical_incidents===0)+card('fa-calendar-week','Signals · 7 days','Sanitized errors and slow-page samples retained for triage.',String(c.last_7d||0),null);
      document.getElementById('vd-generated').textContent='Release '+result.release+' · '+new Date(result.generated_at).toLocaleString();
      incidents.innerHTML=(result.incidents||[]).map(function(row){return '<tr><td>'+esc(new Date(row.last_seen_at).toLocaleString())+'</td><td><span class="vd-severity '+esc(row.severity)+'">'+esc(row.severity)+'</span></td><td>'+esc(row.status)+'</td><td><code>'+esc(row.route||'—')+'</code></td><td>'+esc(row.event_count)+'</td></tr>';}).join('')||'<tr><td colspan="5">No reliability incidents recorded.</td></tr>';
      body.innerHTML=(result.events||[]).map(function(row){var m=row.metadata||{};return '<tr><td>'+esc(new Date(row.created_at).toLocaleString())+'</td><td>'+esc(String(row.event_type||'').replace('platform.','').replaceAll('_',' '))+'</td><td><code>'+esc(row.resource_id||'')+'</code></td><td>'+esc(m.message||'')+'</td><td>'+esc(m.release||'—')+'</td></tr>';}).join('')||'<tr><td colspan="5">No customer-facing reliability events in the last seven days.</td></tr>';
      var billing=result.billing||{};document.getElementById('vd-billing-env').textContent=(billing.environment||'unknown').toUpperCase()+' evidence';
      checks.innerHTML=(billing.checks||[]).map(function(x){return '<div class="vd-check '+(x.passed?'passed':'')+'"><i class="fas '+(x.passed?'fa-circle-check':'fa-circle-minus')+'"></i><span>'+esc(x.label)+'</span></div>';}).join('');
    } catch(error) { grid.innerHTML=card('fa-circle-xmark','Reliability telemetry',error.message,'Unavailable',false);checks.innerHTML='<div class="vd-check"><i class="fas fa-circle-xmark"></i> Billing evidence unavailable</div>'; }
  }
  async function run() {
    var host=document.getElementById('vd-grid');host.innerHTML=card('fa-spinner fa-spin','Running checks','Contacting the verification service…','In progress');var health={};
    try{var response=await fetch(URL+'/functions/v1/request-verify-code',{headers:{apikey:KEY}});health=await response.json();}catch(error){health={ok:false,reason:'Edge Function did not respond'};}
    var session=await sb.auth.getSession(),signed=!!(session.data&&session.data.session),account=null;if(signed){var result=await sb.rpc('verification_delivery_status');account=result.error?{ok:false,reason:result.error.message}:result.data;}
    host.innerHTML=card('fa-code','Edge Function',health.ok?'The secure-code endpoint responded.':(health.reason||'No response.'),health.ok?'Online':'Unavailable',!!health.ok)+card('fa-database','Verification database',health.database_configured?'Service-role database access is configured.':'Service-role access is missing or the function is unavailable.',health.database_configured?'Configured':'Needs setup',!!health.database_configured)+card('fa-envelope-circle-check','Administrator email',health.admin_email_configured?'Verification email delivery is configured.':'Administrator-email delivery is not configured.',health.admin_email_configured?'Configured':'Needs setup',!!health.admin_email_configured)+card('fa-user-shield','Your account',signed?(account&&account.ok?((account.active||0)+' active, '+(account.verified||0)+' verified, '+(account.failed||0)+' failed'):(account&&account.reason||'Status RPC needs deployment')):'Sign in to see request totals.',signed&&account&&account.ok?'Connected':signed?'Needs migration':'Signed out',signed?!!(account&&account.ok):null);
  }
  document.getElementById('vd-refresh').addEventListener('click',function(){run();platform();});Promise.resolve(window.njptrSideMenuReady).then(function(){run();platform();});
})();
