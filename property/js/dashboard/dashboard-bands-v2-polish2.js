/* dashboard-bands-v2-polish2.js
   Round two. Load LAST, after dashboard-bands-v2-polish.js.

   Covers:
   1. Greentree ad restyled to match the .hd-ad unit on /property/
   2. Free-tier sticky bar switched to fixed so it is visible without scrolling
   3. Recent Activity de-duplicated
   4. County filter: re-apply everything after the core re-render, and
      recover when buildBands() bails out
*/
(function () {
  'use strict';

  var GREENTREE_URL = 'https://www.greentreemortgage.com/';

  function q(s, r) { return (r || document).querySelector(s); }
  function qa(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  /* ---------------------------------------------------------------------
     1. Greentree ad — same treatment as the /property/ search results unit
     --------------------------------------------------------------------- */
  function styleSponsor() {
    qa('.wd5-sponsor').forEach(function (card) {
      if (card.dataset.wdv2Green === '1') return;

      var link = q('.wd5-sponsor-link', card) || q('a', card);
      var href = (link && link.getAttribute('href')) || GREENTREE_URL;
      var photo = q('.wd5-sponsor-photo', card);
      var img = '/johnvarano.jpg';
      if (photo) {
        var bg = getComputedStyle(photo).backgroundImage || '';
        var m = bg.match(/url\(["']?([^"')]+)["']?\)/);
        if (m) img = m[1];
        var innerImg = q('img', photo);
        if (innerImg && innerImg.src) img = innerImg.getAttribute('src');
      }

      card.classList.add('wdv2-gt');
      card.dataset.wdv2Green = '1';
      card.innerHTML =
        '<a class="wdv2-gt-link" href="' + href + '" target="_blank" rel="noopener sponsored">' +
          '<span class="wdv2-gt-tag">Advertisement</span>' +
          '<img src="' + img + '" alt="John Varano, Greentree Mortgage" loading="lazy" ' +
            'onerror="this.style.display=\'none\'">' +
          '<div class="wdv2-gt-body">' +
            '<b>Know the payment before you fall in love with the house.</b>' +
            '<span>John Varano, Branch Manager at Greentree Mortgage, an HMA Company, will tell you ' +
            'the real monthly number, escrow included.</span>' +
            '<em>Get a rate <i class="fas fa-arrow-right" aria-hidden="true"></i></em>' +
            '<small>NMLS #142739 &middot; Greentree Mortgage, an HMA Company, is a separate company and is ' +
            'not affiliated with Opus Elite Real Estate.</small>' +
          '</div>' +
        '</a>';
    });
  }

  /* ---------------------------------------------------------------------
     2. Free tier bar: sticky inside a scrolling ancestor never pinned to
        the viewport. Use fixed and pad the page instead.
     --------------------------------------------------------------------- */
  function fixSponsorBar() {
    var bar = q('.wdv2-sponsor-bar');
    if (!bar) return;
    bar.classList.add('wdv2-sponsor-bar-fixed');
    document.body.classList.add('wdv2-has-sponsor-bar');
    var canvas = q('.wd4-canvas');
    if (canvas) canvas.classList.add('wdv2-free-pad');
  }

  /* ---------------------------------------------------------------------
     3. Recent Activity: collapse repeats of the same property + type + date
        into one row with a count. With one saved property the feed was
        showing the same address six times.
     --------------------------------------------------------------------- */
  function dedupeActivity() {
    var card = q('[data-card-id="activity"]');
    if (!card) return;
    var list = q('.wd4-activity-list', card);
    if (!list) return;

    var seen = {};
    qa('.wd4-activity-row', list).forEach(function (row) {
      if (row.classList.contains('head')) return;
      var cells = Array.prototype.slice.call(row.children).map(function (c) {
        return (c.textContent || '').trim();
      });
      var key = cells.join('|');
      if (seen[key]) {
        var badge = q('.wdv2-dupe-count', seen[key]);
        if (!badge) {
          badge = document.createElement('b');
          badge.className = 'wdv2-dupe-count';
          badge.dataset.n = '1';
          var host = q('.wd4-activity-property', seen[key]) || seen[key];
          host.appendChild(badge);
        }
        var n = parseInt(badge.dataset.n, 10) + 1;
        badge.dataset.n = String(n);
        badge.textContent = '\u00d7' + n;
        badge.title = n + ' identical updates on this date';
        row.remove();
      } else {
        seen[key] = row;
      }
    });

    if (!list.querySelector('.wd4-activity-row:not(.head)')) {
      card.classList.add('is-empty');
      list.innerHTML = '<div class="wdv2-empty-line"><i class="fas fa-clock-rotate-left"></i>' +
        'No recent changes on your saved properties.</div>';
    }
  }

  /* ---------------------------------------------------------------------
     4. County filter recovery.
        buildBands() bails when a filtered view drops any of its five
        required cards, leaving body.wdv2-mounted set but the bands gone.
        Detect that state and rebuild what we can.
     --------------------------------------------------------------------- */
  function bandsHealthy() {
    return !!q('.wdv2-dash') && q('.wdv2-dash').children.length > 0;
  }

  function safeMode(on) {
    document.body.classList.toggle('wdv2-safe-mode', !!on);
  }

  function watchFilter() {
    var select = document.getElementById('wd4-county');

    function afterRender() {
      var tries = 0;
      var t = setInterval(function () {
        tries++;
        if (bandsHealthy()) {
          clearInterval(t);
          safeMode(false);
          reapply();
        } else if (tries > 30) {
          // bands never came back — make the legacy grid readable instead
          clearInterval(t);
          safeMode(true);
        }
      }, 150);
    }

    document.addEventListener('change', function (ev) {
      if (ev.target && ev.target.id === 'wd4-county') setTimeout(afterRender, 250);
    }, true);

    if (select) select.addEventListener('change', function () { setTimeout(afterRender, 250); });

    // Any wholesale replacement of the dashboard root triggers the same path.
    var root = document.getElementById('wd4-root') || document.body;
    var pending = null;
    new MutationObserver(function () {
      if (pending) return;
      pending = setTimeout(function () {
        pending = null;
        if (!bandsHealthy()) { safeMode(true); afterRender(); }
      }, 400);
    }).observe(root, { childList: true });
  }

  /* ---------------------------------------------------------------------
     Re-apply everything that the round-one patch does per mount.
     --------------------------------------------------------------------- */
  function reapply() {
    styleSponsor();
    fixSponsorBar();
    dedupeActivity();
    try { sessionStorage.removeItem('wdv2PartnerDismissed'); } catch (_) {}
    qa('.wdv2-partner-close').forEach(function (b) { b.remove(); });
    // Round-one patch exposes nothing global, so nudge it by re-dispatching
    // the events it listens for where possible; its observers handle the rest.
    var props = q('[data-card-id="properties"]');
    if (props) { props.removeAttribute('data-wdv2-sort'); }
    var county = q('[data-card-id="county-extra"]');
    if (county) { county.removeAttribute('data-wdv2-donut'); }
    document.dispatchEvent(new CustomEvent('wdv2:remounted'));
  }

  function ready(fn) {
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      if (document.body && (document.body.classList.contains('wdv2-mounted') || bandsHealthy())) {
        clearInterval(t); fn();
      } else if (tries > 200) { clearInterval(t); fn(); }
    }, 100);
  }

  ready(function () {
    reapply();
    watchFilter();
    // Sponsor markup can be re-rendered by the core; keep it green.
    setInterval(function () {
      if (q('.wd5-sponsor:not([data-wdv2-green="1"])')) styleSponsor();
      if (q('.wdv2-sponsor-bar:not(.wdv2-sponsor-bar-fixed)')) fixSponsorBar();
    }, 1500);
  });
})();
