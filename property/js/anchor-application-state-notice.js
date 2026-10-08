(function () {
  'use strict';
  var notice = document.getElementById('wd-state-notice');
  if (!notice) return;
  var agree = document.getElementById('wd-state-notice-agree');
  var go = document.getElementById('wd-state-notice-continue');
  var locked = [];
  var watcher = null;

  function lock(n) {
    if (n === notice || n.nodeType !== 1 || n.tagName === 'SCRIPT' || n.hasAttribute('inert')) return;
    n.setAttribute('inert', '');
    locked.push(n);
  }
  function open() {
    document.documentElement.classList.add('wd-state-notice-open');
    Array.prototype.forEach.call(document.body.children, lock);
    if (window.MutationObserver) {
      watcher = new MutationObserver(function (list) {
        list.forEach(function (m) { Array.prototype.forEach.call(m.addedNodes, lock); });
      });
      watcher.observe(document.body, { childList: true });
    }
    try { agree.focus({ preventScroll: true }); } catch (_) { agree.focus(); }
  }
  function close() {
    if (!agree.checked) return;
    if (watcher) watcher.disconnect();
    var shell = document.querySelector('.wd-app-shell');
    if (shell) shell.removeAttribute('inert');
    locked.forEach(function (n) { n.removeAttribute('inert'); });
    locked = [];
    notice.hidden = true;
    document.documentElement.classList.remove('wd-state-notice-open');
    window.scrollTo(0, 0);
    var start = document.querySelector('.wd-step.is-active h2') || document.querySelector('.wd-app-card');
    if (start) {
      if (!start.hasAttribute('tabindex')) start.setAttribute('tabindex', '-1');
      try { start.focus({ preventScroll: true }); } catch (_) {}
    }
  }

  agree.addEventListener('change', function () { go.disabled = !agree.checked; });
  go.addEventListener('click', close);
  notice.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Tab') return;
    var items = [agree, notice.querySelector('.wd-state-notice-actions a'), go].filter(function (n) { return n && !n.disabled; });
    var first = items[0], last = items[items.length - 1];
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', open, { once: true });
  else open();
})();
