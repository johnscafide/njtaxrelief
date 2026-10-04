/* Watchdog free NJ CO lookup, embedded on your site.
   Paste where you want it:
     <div data-watchdog-co><a href="https://www.watchdogindex.com/co">NJ resale CO requirements by Watchdog</a></div>
     <script src="https://www.watchdogindex.com/co/embed.js" async></script>
   Optional: data-town="essex/montclair-township" shows one town (county/town, as in the town
   page's URL). The link inside the div stays under the lookup as credit.
   Setup help: https://www.watchdogindex.com/co/website */
(function () {
  'use strict';
  var ORIGIN = 'https://www.watchdogindex.com';
  var SLUG = /^[a-z0-9-]{1,80}\/[a-z0-9-]{1,80}$/;
  var frames = [];

  function mount(el) {
    if (el.getAttribute('data-watchdog-co-ready')) return;
    el.setAttribute('data-watchdog-co-ready', '1');
    var town = String(el.getAttribute('data-town') || '').trim().toLowerCase().replace(/^\/+|\/+$/g, '');
    var src = ORIGIN + '/co/embed' + (SLUG.test(town) ? '/' + town : '');
    var f = document.createElement('iframe');
    f.src = src;
    f.title = 'New Jersey resale CO requirements by Watchdog';
    f.loading = 'lazy';
    f.setAttribute('scrolling', 'no');
    f.style.cssText = 'display:block;width:100%;height:' + (SLUG.test(town) ? 900 : 420) + 'px;border:1px solid #e3e7ec;border-radius:12px;background:#fff;color-scheme:light';
    el.insertBefore(f, el.firstChild);
    var credit = el.querySelector('a[href^="' + ORIGIN + '"]');
    if (credit) credit.style.cssText += ';display:inline-block;margin-top:6px;font-size:13px';
    frames.push(f);
  }

  function scan() { Array.prototype.forEach.call(document.querySelectorAll('[data-watchdog-co]'), mount); }

  window.addEventListener('message', function (e) {
    if (e.origin !== ORIGIN || !e.data || e.data.type !== 'watchdog-co-height') return;
    var h = Number(e.data.height);
    if (!(h > 100 && h < 20000)) return;
    frames.forEach(function (f) { if (f.contentWindow === e.source) f.style.height = h + 'px'; });
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan); else scan();
})();
