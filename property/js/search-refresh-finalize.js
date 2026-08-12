/* NJW-96 final production guard: keep result counts truthful and remove the
   temporary dead "Show all" affordance while the live map renders up to 60
   cards per map view for performance. */
(function () {
  'use strict';

  function reconcile() {
    var host = document.getElementById('hd-list');
    var count = document.getElementById('hd-countline');
    if (!host || !count) return;

    var cards = host.querySelectorAll('.hd-card').length;
    var match = count.textContent.match(/([\d,]+)\s+property assessment/i);
    var total = match ? parseInt(match[1].replace(/,/g, ''), 10) : cards;

    var more = document.getElementById('hd-show-all');
    if (more && more.parentNode) {
      var wrap = more.parentNode;
      wrap.innerHTML = '<span class="hd-page-note">Showing the first ' + cards.toLocaleString() +
        ' properties in this map view. Pan, zoom, search, or filter to refine the area.</span>';
    }

    if (total > cards && cards > 0) {
      count.textContent = 'Showing ' + cards.toLocaleString() + ' of ' + total.toLocaleString() +
        ' property assessments currently loaded in this map area.';
    } else if (cards > 0) {
      count.textContent = cards.toLocaleString() + ' property assessment' + (cards === 1 ? '' : 's') +
        ' currently shown in this map area.';
    }
  }

  function installStyle() {
    if (document.getElementById('njw96-final-style')) return;
    var style = document.createElement('style');
    style.id = 'njw96-final-style';
    style.textContent = '.hd-page-note{display:block;color:#68788f;font-size:12.5px;font-weight:700;text-align:center;line-height:1.5;max-width:620px;margin:0 auto}';
    document.head.appendChild(style);
  }

  installStyle();
  var observer = new MutationObserver(function () { requestAnimationFrame(reconcile); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('load', reconcile);
  reconcile();
})();
