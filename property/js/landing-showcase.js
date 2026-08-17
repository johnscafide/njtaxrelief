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

  function appendStyle(href, id) {
    if (document.getElementById(id)) return;
    var link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  appendStyle('/property/css/landing-guided.css', 'wd-landing-guided-css');

  appendScript('/property/js/landing-preview-safety.js', 'wd-landing-preview-safety-script', function () {
    appendScript('/property/js/landing-showcase-core.js', 'wd-showcase-core-script', function () {
      appendScript('/property/js/landing-guided.js', 'wd-landing-guided-script', function () {
        appendScript('/property/js/landing-polish.js', 'wd-landing-polish-script', function () {
          appendScript('/property/js/landing-compare-table.js', 'wd-landing-compare-table-script');
        });
      });
    });
  });
})();
