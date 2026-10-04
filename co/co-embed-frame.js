// Runs inside the embedded CO lookup (/co/embed and /co/embed/<county>/<town>), which sits in an
// iframe on someone else's site (see co/embed.js). Tells the parent page how tall to make the
// frame, opens every link that leaves the embed in a new tab, and counts embed views by site.
(function () {
  'use strict';
  if (window.parent === window) return;

  var last = 0;
  function post() {
    // The content's own height (not the frame's), plus any open search suggestions.
    var h = document.body.getBoundingClientRect().height;
    Array.prototype.forEach.call(document.querySelectorAll('.search.open .suggest'), function (el) { h = Math.max(h, el.getBoundingClientRect().bottom + 8); });
    h = Math.ceil(h);
    if (Math.abs(h - last) < 2) return;
    last = h;
    try { window.parent.postMessage({ type: 'watchdog-co-height', height: h }, '*'); } catch (_) {}
  }
  if (window.ResizeObserver) new ResizeObserver(post).observe(document.body);
  window.addEventListener('load', post);
  setInterval(post, 1000);
  post();

  // Search suggestions open below the box; give the frame room while they show.
  document.addEventListener('focusin', function () { setTimeout(post, 50); });
  document.addEventListener('input', function () { setTimeout(post, 50); });

  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href]');
    if (!a) return;
    var u;
    try { u = new URL(a.getAttribute('href'), location.href); } catch (_) { return; }
    if (u.origin === location.origin && (u.pathname === '/co/embed' || u.pathname.indexOf('/co/embed/') === 0)) return;
    if (/^(sms|mailto|tel):/i.test(u.protocol)) return;
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener');
  }, true);

  var host = '';
  try { host = document.referrer ? new URL(document.referrer).hostname.slice(0, 100) : ''; } catch (_) {}
  window.addEventListener('load', function () {
    try { if (window.WatchdogAnalytics) window.WatchdogAnalytics.track('tool_open', { tool: 'co_lookup', action: 'embed_view', source: host || 'unknown', surface: 'embed' }); } catch (_) {}
  });
})();
