(function () {
  'use strict';

  var path = (window.location.pathname || '').replace(/\/+$/, '');
  if (path !== '/property' && path !== '/property/index.html') return;

  function appendScript(src, id, onload) {
    if (document.getElementById(id)) {
      if (onload) onload();
      return;
    }
    var script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = false;
    if (onload) script.addEventListener('load', onload, { once: true });
    document.head.appendChild(script);
  }

  appendScript('/property/js/landing-showcase-core.js', 'wd-showcase-core-script', function () {
    appendScript('/property/js/landing-polish.js', 'wd-landing-polish-script', function () {
      appendScript('/property/js/landing-compare-table.js', 'wd-landing-compare-table-script');
    });
  });
})();
