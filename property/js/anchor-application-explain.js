(function () {
  'use strict';
  var form = document.getElementById('wd-anchor-form');
  if (!form) return;
  var EXTRA = '.wd-step-copy, .wd-callout:not(.warning):not(.wd-readiness-callout), .wd-field-note, .wd-hero-proof, .wd-readiness-note, .wd-readiness-list small';
  var KEEP = { 'not-eligible': 1, complete: 1 };
  var queued = false;

  function keep(n) {
    if (n.matches('.wd-field-note') && n.querySelector('a')) return true;
    if (n.matches('.wd-callout') && n.querySelector('input, button, select, textarea')) return true;
    return false;
  }
  function tidy(step) {
    if (KEEP[step.dataset.step]) return;
    var found = false;
    Array.prototype.forEach.call(step.querySelectorAll('.wd-explain-extra'), function (n) {
      if (!n.matches(EXTRA) || keep(n)) n.classList.remove('wd-explain-extra');
    });
    Array.prototype.forEach.call(step.querySelectorAll(EXTRA), function (n) {
      if (n.closest('.wd-easy-head, .wd-easy-help, .wd-easy-nudge') || keep(n)) return;
      n.classList.add('wd-explain-extra');
      found = true;
    });
    var btn = step.querySelector(':scope > .wd-explain-btn');
    if (btn) { btn.hidden = !found; return; }
    if (!found) return;
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'wd-explain-btn';
    btn.setAttribute('aria-expanded', 'false');
    btn.textContent = 'Explain';
    btn.addEventListener('click', function () {
      var open = step.classList.toggle('is-explained');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.textContent = open ? 'Hide explanation' : 'Explain';
    });
    var h2 = step.querySelector(':scope > h2');
    step.insertBefore(btn, h2 ? h2.nextSibling : step.firstChild);
  }
  function run() {
    queued = false;
    Array.prototype.forEach.call(form.querySelectorAll('.wd-step'), tidy);
  }
  function later() {
    if (queued) return;
    queued = true;
    (window.requestAnimationFrame || setTimeout)(run);
  }
  run();
  if (window.MutationObserver) new MutationObserver(later).observe(form, { childList: true, subtree: true });
  window.addEventListener('load', later);
})();
