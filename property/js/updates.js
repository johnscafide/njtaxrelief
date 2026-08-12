(function () {
  'use strict';
  var data = null;
  var registry = null;
  var $ = function (id) { return document.getElementById(id); };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  var AREAS = [
    ['Customer experience', /dashboard|home\.html|mobile|navigation|sidebar|profile|account|lookup|town/i],
    ['Professional workflows', /agent|workbench|scanner|appeal|professional|case|evidence|export/i],
    ['Data & intelligence', /marker|data|modiv|sr1a|municip|source|permit|warehouse|town/i],
    ['Security & reliability', /security|rls|auth|incident|reliability|diagnostic|monitor|access|privacy/i],
    ['Revenue & billing', /billing|paddle|stripe|checkout|portal|pricing|revenue|entitlement|plan/i],
    ['Platform & architecture', /platform|architecture|migration|edge function|supabase|ci|workflow|module/i]
  ];
  var FAMILIES = [
    ['Product experience', /ux|mobile|customer|profile|navigation|growth/i],
    ['Professional tools', /professional|agent|appeal|workbench|evidence|tool/i],
    ['Data platform', /data|intelligence|marker|source|modiv|retention/i],
    ['Security & reliability', /security|reliability|operations|quality|incident/i],
    ['Revenue & growth', /revenue|billing|pricing|saas|growth/i],
    ['Platform', /platform|architecture|backend/i]
  ];

  function normalizedCounts(rules, source) {
    return rules.map(function (rule) {
      return [rule[0], source.filter(function (release) {
        var haystack = [release.category, release.title, release.summary].concat(release.files || []).join(' ');
        return rule[1].test(haystack);
      }).length];
    }).filter(function (item) { return item[1] > 0; }).sort(function (a, b) { return b[1] - a[1]; });
  }

  function bars(host, items, suffix) {
    var max = Math.max.apply(null, items.map(function (item) { return item[1]; }).concat([1]));
    host.innerHTML = items.map(function (item) {
      return '<div class="uv-bar-row"><span>' + esc(item[0]) + '</span><div class="uv-bar"><i style="width:' +
        ((item[1] / max) * 100).toFixed(1) + '%"></i></div><b>' + item[1] + esc(suffix || '') + '</b></div>';
    }).join('');
  }

  function releasePulse() {
    var now = new Date(data.updated_at || Date.now());
    var recent = data.releases.filter(function (release) {
      return (now - new Date(release.timestamp || release.date)) / 86400000 <= 30;
    });
    var shipped = data.releases.filter(function (release) { return /complete|active|passed|shipped|deployed|live/i.test(release.status || ''); }).length;
    var areas = normalizedCounts(AREAS, recent).slice(0, 3);
    $('uv-pulse').innerHTML = '<article><span>LAST 30 DAYS</span><b>' + recent.length + '</b><small>documented releases</small></article>' +
      '<article><span>DELIVERY CONFIDENCE</span><b>' + Math.round((shipped / Math.max(data.releases.length, 1)) * 100) + '%</b><small>marked shipped, active or passed</small></article>' +
      '<article class="uv-pulse-wide"><span>MOST ACTIVE PRODUCT AREAS</span><div>' + areas.map(function (item) {
        return '<em>' + esc(item[0]) + ' <b>' + item[1] + '</b></em>';
      }).join('') + '</div></article>';
  }

  function renderCharts() {
    bars($('uv-impact'), normalizedCounts(AREAS, data.releases), '');
    bars($('uv-categories'), normalizedCounts(FAMILIES, data.releases), '');
    var latest = data.releases[0];
    $('uv-summary').innerHTML = [
      ['Releases', data.releases.length],
      ['Active roadmap', data.roadmap.length],
      ['Governed markers', registry ? registry.summary.total : '—'],
      ['Current release', 'v' + latest.version]
    ].map(function (item) { return '<div class="uv-stat"><b>' + item[1] + '</b><span>' + item[0] + '</span></div>'; }).join('');
    releasePulse();
    var filter = $('uv-filter');
    var seen = {};
    data.releases.forEach(function (release) {
      if (!seen[release.category]) {
        seen[release.category] = 1;
        filter.insertAdjacentHTML('beforeend', '<option>' + esc(release.category) + '</option>');
      }
    });
  }

  function formatDate(release) {
    if (!release.timestamp) return new Date(release.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return new Date(release.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  }

  function renderHistory() {
    var q = $('uv-search').value.toLowerCase();
    var category = $('uv-filter').value;
    var rows = data.releases.filter(function (release) {
      return (!category || release.category === category) && (!q || JSON.stringify(release).toLowerCase().indexOf(q) >= 0);
    });
    $('uv-timeline').innerHTML = rows.map(function (release, index) {
      var statusClass = /complete|active|passed|shipped|deployed|live/i.test(release.status || '') ? 'shipped' : 'pending';
      return '<article class="uv-release"><div class="uv-release-head"><span class="uv-version">v' + esc(release.version) + '</span>' +
        '<div class="uv-release-title"><h2>' + esc(release.title) + '</h2><p>' + esc(release.summary) + '</p></div>' +
        '<div class="uv-meta"><b class="' + statusClass + '">' + esc(release.status) + '</b><span>' + esc(formatDate(release)) + '</span><small>' + esc(release.category) + '</small></div></div>' +
        '<details class="uv-release-detail"' + (index === 0 ? ' open' : '') + '><summary>Deployment record <i class="fas fa-chevron-down"></i></summary>' +
        '<div class="uv-release-body"><div><h3>Product links affected</h3><div class="uv-links">' + (release.links || []).map(function (link) { return '<a href="' + esc(link) + '">' + esc(link) + '</a>'; }).join('') + '</div></div>' +
        '<div><h3>Files and systems changed</h3><div class="uv-files">' + (release.files || []).map(function (file) { return '<code>' + esc(file) + '</code>'; }).join('') + '</div></div></div></details></article>';
    }).join('') || '<div class="blank"><h3>No releases match</h3><p>Try a broader term or clear the category filter.</p></div>';
    $('uv-result-count').textContent = rows.length + ' release' + (rows.length === 1 ? '' : 's');
  }

  function renderRoadmap() {
    var summary = registry && registry.summary;
    $('uv-roadmap-summary').innerHTML = (summary ? [
      ['Governed markers', summary.total], ['1,000-marker goal', summary.percent_of_goal + '%'],
      ['Public-source', summary.public_source], ['Watchdog-derived', summary.proprietary_derived]
    ] : [['Roadmap projects', data.roadmap.length]]).map(function (item) {
      return '<div class="uv-stat"><b>' + item[1] + '</b><span>' + item[0] + '</span></div>';
    }).join('') + (summary ? '<a class="uv-marker-link" href="/property/data-center.html">Open marker catalog <i class="fas fa-arrow-right"></i></a>' : '');
    $('uv-projects').innerHTML = data.roadmap.map(function (project) {
      return '<article class="uv-project"><div class="uv-priority"><b>' + project.priority + '</b><span>priority</span></div><div><h2>' + esc(project.title) + '</h2><p>' + esc(project.why) + '</p><div class="uv-deliverables">' +
        project.deliverables.map(function (item) { return '<span>' + esc(item) + '</span>'; }).join('') + '</div></div><div class="uv-badges"><span class="uv-ready">' + esc(project.readiness) + '</span><span class="uv-effort">' + esc(project.effort) + ' effort</span><span class="uv-effort">' + esc(project.category) + '</span></div></article>';
    }).join('');
  }

  function currentRelease(item) {
    if (!item || !item.release) return null;
    return {
      version: item.release,
      date: item.date || String(item.updated_at || '').slice(0, 10),
      timestamp: item.timestamp || item.updated_at,
      title: item.title || 'Current production release',
      category: item.category || 'Production release',
      status: item.status || 'Production deployed',
      summary: item.summary || '',
      links: item.links || [],
      files: item.files || [],
      impact: item.impact || {}
    };
  }

  Promise.all([
    fetch('/property/data/versions.json?v=20260809f').then(function (response) { return response.json(); }),
    fetch('/property/data/marker-registry.json?v=20260807c').then(function (response) { return response.json(); }).catch(function () { return null; }),
    fetch('/property/data/current-update.json?v=20260811c').then(function (response) { return response.json(); }).catch(function () { return null; })
  ]).then(function (result) {
    data = result[0];
    var current = currentRelease(result[2]);
    if (current && !data.releases.some(function (release) { return release.version === current.version; })) data.releases.unshift(current);
    data.updated_at = current && current.timestamp ? current.timestamp : data.updated_at;
    data.roadmap = data.active_roadmap || data.roadmap;
    registry = result[1];
    renderCharts(); renderHistory(); renderRoadmap();
  }).catch(function (error) {
    $('uv-history').innerHTML = '<div class="db-error-panel"><h3>Version history could not load</h3><p>Check the release registry and try again.</p></div>';
    console.error(error);
  });

  document.addEventListener('click', function (event) {
    var button = event.target.closest('[data-tab]');
    if (!button) return;
    document.querySelectorAll('[data-tab]').forEach(function (item) { item.classList.toggle('on', item === button); });
    $('uv-history').style.display = button.dataset.tab === 'history' ? '' : 'none';
    $('uv-roadmap').style.display = button.dataset.tab === 'roadmap' ? '' : 'none';
  });
  $('uv-search').addEventListener('input', function () { if (data) renderHistory(); });
  $('uv-filter').addEventListener('change', function () { if (data) renderHistory(); });
})();