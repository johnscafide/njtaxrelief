(function () {
  'use strict';

  var path = (window.location.pathname || '').replace(/\/+$/, '');
  if (path !== '/property' && path !== '/property/index.html') return;
  if (window.__wdLandingPreviewSafetyInstalled) return;
  window.__wdLandingPreviewSafetyInstalled = true;

  /*
   * The public homepage already contains a demosafe representation of the
   * real Watchdog UI. The older showcase also tried to preload the actual
   * authenticated application pages into same-origin iframes. That is useful
   * in a private product demo, but on the public landing page it can trigger
   * property-data/API work before the visitor asks for it.
   *
   * Keep the visual product proof, and let the existing links take a visitor
   * into the real Dashboard / Property / Compare / Marketing Studio when they
   * choose to do so.
   */
  function isShowcaseFrame(frame) {
    if (!frame || frame.tagName !== 'IFRAME') return false;
    if (frame.closest && frame.closest('.wds-screen')) return true;
    return frame.getAttribute && /^\/property\//.test(frame.getAttribute('data-src') || '');
  }

  var proto = window.HTMLIFrameElement && window.HTMLIFrameElement.prototype;
  var srcDescriptor = proto && Object.getOwnPropertyDescriptor(proto, 'src');

  if (proto && srcDescriptor && srcDescriptor.get && srcDescriptor.set && srcDescriptor.configurable) {
    Object.defineProperty(proto, 'src', {
      configurable: true,
      enumerable: srcDescriptor.enumerable,
      get: srcDescriptor.get,
      set: function (value) {
        var requested = String(value || '');
        if (isShowcaseFrame(this) && requested && requested !== 'about:blank') {
          this.dataset.wdDemoOnly = '1';
          return srcDescriptor.set.call(this, 'about:blank');
        }
        return srcDescriptor.set.call(this, value);
      }
    });
  }

  /* Secondary guard for browsers where the prototype descriptor cannot be
     wrapped. It also aborts a navigation if another script changes the src
     attribute directly later in the session. */
  if ('MutationObserver' in window) {
    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        var nodes = [];
        if (mutation.type === 'childList') {
          Array.prototype.forEach.call(mutation.addedNodes || [], function (node) {
            if (!node || node.nodeType !== 1) return;
            if (node.tagName === 'IFRAME') nodes.push(node);
            if (node.querySelectorAll) {
              Array.prototype.push.apply(nodes, node.querySelectorAll('.wds-screen iframe'));
            }
          });
        } else if (mutation.type === 'attributes' && mutation.target) {
          nodes.push(mutation.target);
        }

        nodes.forEach(function (frame) {
          if (!isShowcaseFrame(frame)) return;
          var src = frame.getAttribute('src') || '';
          if (src && src !== 'about:blank') {
            frame.dataset.wdDemoOnly = '1';
            frame.setAttribute('src', 'about:blank');
          }
        });
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
  }

  var style = document.createElement('style');
  style.id = 'wd-landing-preview-safety-css';
  style.textContent = '.hood-on .wdg-tail-restored{display:none!important;}';
  document.head.appendChild(style);
})();
