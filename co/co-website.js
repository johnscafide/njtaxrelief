// /co/website: builds the copy-paste embed code for the picked town (or the whole lookup) and
// keeps the preview in step. The embed itself is co/embed.js plus the /co/embed pages.
(function () {
  'use strict';
  var ORIGIN = 'https://www.watchdogindex.com';
  var pick = document.querySelector('[data-embed-town]');
  var code = document.querySelector('[data-embed-code]');
  var iframeCode = document.querySelector('[data-embed-iframe]');
  var preview = document.querySelector('[data-embed-preview]');
  if (!pick || !code) return;

  function update() {
    var town = pick.value;
    var label = town ? pick.options[pick.selectedIndex].text + ' CO requirements by Watchdog' : 'NJ resale CO requirements by Watchdog';
    var page = ORIGIN + (town ? '/co/' + town : '/co');
    code.value = '<div data-watchdog-co' + (town ? ' data-town="' + town + '"' : '') + '><a href="' + page + '">' + label + '</a></div>\n' +
      '<script src="' + ORIGIN + '/co/embed.js" async></' + 'script>';
    iframeCode.value = '<iframe src="' + ORIGIN + '/co/embed' + (town ? '/' + town : '') + '" title="New Jersey resale CO requirements by Watchdog" style="width:100%;height:' + (town ? 900 : 520) + 'px;border:1px solid #e3e7ec;border-radius:12px" loading="lazy"></iframe>\n' +
      '<a href="' + page + '">' + label + '</a>';
    preview.src = '/co/embed' + (town ? '/' + town : '');
  }
  pick.addEventListener('change', update);
  update();

  window.addEventListener('message', function (e) {
    if (e.origin !== location.origin || !e.data || e.data.type !== 'watchdog-co-height' || e.source !== preview.contentWindow) return;
    var h = Number(e.data.height);
    if (h > 100 && h < 20000) preview.style.height = h + 'px';
  });

  var toastEl = document.querySelector('[data-toast]'), timer = null;
  function toast(msg) { if (!toastEl) return; toastEl.textContent = msg; toastEl.hidden = false; clearTimeout(timer); timer = setTimeout(function () { toastEl.hidden = true; }, 2200); }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-copy-code]');
    if (!b) return;
    var box = document.getElementById(b.getAttribute('data-copy-code'));
    box.select();
    var done = function () { toast('Code copied'); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(box.value).then(done, function () { document.execCommand('copy'); done(); });
    else { document.execCommand('copy'); done(); }
    try { if (typeof window.gtag === 'function') window.gtag('event', 'co_embed_code_copied', { town: pick.value || 'all' }); } catch (_) {}
    try { if (window.WatchdogAnalytics) window.WatchdogAnalytics.track('tool_open', { tool: 'co_lookup', action: 'embed_code_copied', scope: pick.value ? pick.value.slice(0, 100) : 'all' }); } catch (_) {}
  });
})();
