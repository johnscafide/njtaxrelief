/* NJW-246 Run 018: mobile-only modal behavior for /property/home. */
(function () {
  'use strict';

  var MOBILE = '(max-width: 820px)';
  var lastFocus = null;

  function isMobile() {
    return !!(window.matchMedia && window.matchMedia(MOBILE).matches);
  }

  function overlay() {
    return document.getElementById('plm-note-overlay');
  }

  function dialog() {
    var root = overlay();
    return root ? root.querySelector('.plm-note-box') : null;
  }

  function focusables(root) {
    if (!root) return [];
    return Array.prototype.slice.call(root.querySelectorAll(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
    )).filter(function (node) {
      return node.offsetParent !== null;
    });
  }

  function applyMobileDialogSemantics(title) {
    if (!isMobile()) return;
    var root = overlay();
    var box = dialog();
    if (!root || !box) return;

    root.setAttribute('aria-hidden', 'false');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('tabindex', '-1');

    var heading = box.querySelector('h3');
    if (heading) {
      heading.id = 'plm-note-title';
      box.setAttribute('aria-labelledby', heading.id);
    } else if (title) {
      box.setAttribute('aria-label', title);
    }

    document.body.classList.add('note-modal-open');

    window.requestAnimationFrame(function () {
      var close = box.querySelector('.plm-note-x');
      (close || box).focus({ preventScroll: true });
    });
  }

  function clearMobileDialogSemantics() {
    var root = overlay();
    document.body.classList.remove('note-modal-open');
    if (root) root.setAttribute('aria-hidden', 'true');
    if (lastFocus && typeof lastFocus.focus === 'function' && document.contains(lastFocus)) {
      try { lastFocus.focus({ preventScroll: true }); } catch (e) { lastFocus.focus(); }
    }
    lastFocus = null;
  }

  function enhance() {
    if (!isMobile()) return;
    if (typeof window.plModalNote !== 'function' || typeof window.plCloseNote !== 'function') return;
    if (window.plModalNote.__watchdogMobileAudit) return;

    var baseOpen = window.plModalNote;
    var baseClose = window.plCloseNote;

    function mobileOpen(title, html) {
      if (isMobile()) lastFocus = document.activeElement;
      var result = baseOpen.apply(this, arguments);
      applyMobileDialogSemantics(title);
      return result;
    }

    function mobileClose() {
      var result = baseClose.apply(this, arguments);
      if (isMobile()) clearMobileDialogSemantics();
      return result;
    }

    mobileOpen.__watchdogMobileAudit = true;
    window.plModalNote = mobileOpen;
    window.plCloseNote = mobileClose;

    document.addEventListener('keydown', function (event) {
      if (!isMobile()) return;
      var root = overlay();
      var box = dialog();
      if (!root || !box || !root.classList.contains('open')) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        window.plCloseNote();
        return;
      }

      if (event.key !== 'Tab') return;
      var items = focusables(box);
      if (!items.length) {
        event.preventDefault();
        box.focus();
        return;
      }

      var first = items[0];
      var last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  if (document.readyState === 'complete') {
    enhance();
  } else {
    window.addEventListener('load', enhance, { once: true });
  }
})();