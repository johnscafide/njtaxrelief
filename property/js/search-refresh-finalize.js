/* NJW-96 final production guard. The later polish layer owns the compact
   result count; this guard only removes the temporary dead "Show all" control. */
(function () {
  'use strict';

  function reconcile() {
    var host = document.getElementById('hd-list');
    if (!host) return;
    var more = document.getElementById('hd-show-all');
    if (!more || !more.parentNode || more.parentNode.dataset.njwFinalized === '1') return;
    var cards = host.querySelectorAll('.hd-card').length;
    var wrap = more.parentNode;
    wrap.dataset.njwFinalized = '1';
    wrap.innerHTML = '<span class="hd-page-note">Showing the first ' + cards.toLocaleString() +
      ' properties in this map view. Pan, zoom, search, or filter to refine the area.</span>';
  }

  function installStyle() {
    if (document.getElementById('njw96-final-style')) return;
    var style = document.createElement('style');
    style.id = 'njw96-final-style';
    style.textContent = '.hd-page-note{display:block;color:#68788f;font-size:12.5px;font-weight:700;text-align:center;line-height:1.5;max-width:620px;margin:0 auto}';
    document.head.appendChild(style);
  }

  installStyle();
  var observer = new MutationObserver(function () {
    if (document.getElementById('hd-show-all')) requestAnimationFrame(reconcile);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('load', reconcile);
  reconcile();
})();
