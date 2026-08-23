(function () {
  'use strict';

  var isPreview = /\.vercel\.app$/i.test(location.hostname);
  // get-platform-health remains JWT-gated at the Supabase gateway. The public
  // status GET uses the project anon JWT; the privileged POST path still
  // requires a real signed-in user and developer role inside the function.
  var project = isPreview
    ? { url: 'https://pxossnwmrygxlpxtstnl.supabase.co', key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4b3NzbndtcnlneGxweHRzdG5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5MjEyMDgsImV4cCI6MjEwMjQ5NzIwOH0.4FfVH_ZIn26kB0jXhdeih1FKWpO2zoYaecFYxxBortE' }
    : { url: 'https://uvkvaxljhhngydvlrzom.supabase.co', key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2a3ZheGxqaGhuZ3lkdmxyem9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2Mzg0NjYsImV4cCI6MjA5NzIxNDQ2Nn0.5rTHWQk_4VXDChiU0wOW2BXmTNO-oYjBhUQzFtmA1Wg' };

  var labels = {
    operational: ['All systems operational', 'No active Watchdog incidents are currently recorded.'],
    degraded: ['Some services are degraded', 'Watchdog has an active service issue under investigation.'],
    major_outage: ['Service interruption', 'One or more Watchdog services are currently unavailable.'],
    unknown: ['Status unavailable', 'Watchdog could not complete the status check.']
  };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  function when(value) {
    var d = new Date(value);
    if (!Number.isFinite(d.getTime())) return 'Unknown time';
    return d.toLocaleString('en-US', { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' });
  }

  function paint(data) {
    var state = data && labels[data.status] ? data.status : 'unknown';
    var copy = labels[state];
    document.getElementById('status-title').textContent = copy[0];
    document.getElementById('status-copy').textContent = copy[1];
    document.getElementById('status-dot').style.background = state === 'operational' ? '#18a966' : state === 'degraded' ? '#df950d' : '#df5361';
    document.getElementById('status-updated').textContent = 'Updated ' + when(data && data.generated_at);

    var components = Array.isArray(data && data.components) ? data.components : [];
    document.getElementById('status-components').innerHTML = components.length ? components.map(function (item) {
      var status = labels[item.status] ? item.status : 'unknown';
      var statusLabel = status === 'major_outage' ? 'Outage' : status.charAt(0).toUpperCase() + status.slice(1);
      return '<div class="op-component"><b>' + esc(item.name) + '</b><span class="op-pill ' + status + '">' + esc(statusLabel) + '</span></div>';
    }).join('') : '<div class="op-empty">Service details are temporarily unavailable.</div>';

    var history = Array.isArray(data && data.recent_resolved) ? data.recent_resolved : [];
    document.getElementById('status-history').innerHTML = history.length ? history.map(function (item) {
      return '<div class="op-history-item"><b>' + esc(item.component) + '</b><br>Resolved ' + esc(when(item.resolved_at)) + '</div>';
    }).join('') : '<div class="op-empty">No recently resolved incidents to display.</div>';
  }

  fetch(project.url + '/functions/v1/get-platform-health', {
    method: 'GET',
    headers: { apikey: project.key, Authorization: 'Bearer ' + project.key }
  }).then(function (response) {
    if (!response.ok) throw new Error('status_' + response.status);
    return response.json();
  }).then(paint).catch(function () { paint({ status: 'unknown', generated_at: new Date().toISOString(), components: [], recent_resolved: [] }); });
})();
