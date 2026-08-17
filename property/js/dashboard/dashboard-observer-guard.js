/* Watchdog Dashboard observer guard
   Prevents dashboard enhancement layers from continuously observing and mutating
   the entire rendered grid. The core dashboard renders from explicit state/events,
   so subtree MutationObservers on #wd4-root are unnecessary and can create
   self-triggering repaint/reflow loops. */
(function () {
  'use strict';

  if (window.__WD_OBSERVER_GUARD__) return;
  window.__WD_OBSERVER_GUARD__ = true;

  var NativeMutationObserver = window.MutationObserver;
  if (!NativeMutationObserver) return;

  function GuardedMutationObserver(callback) {
    var observer = new NativeMutationObserver(callback);
    var nativeObserve = observer.observe.bind(observer);

    observer.observe = function (target, options) {
      var dashboardRoot = document.getElementById('wd4-root');
      var isDashboardSubtree = dashboardRoot && target &&
        (target === dashboardRoot || dashboardRoot.contains(target));
      var isBroadDomWatch = options && options.childList === true && options.subtree === true;

      if (isDashboardSubtree && isBroadDomWatch) {
        /* Intentionally ignore broad dashboard subtree observation. */
        return;
      }

      return nativeObserve(target, options);
    };

    return observer;
  }

  GuardedMutationObserver.prototype = NativeMutationObserver.prototype;
  try { Object.setPrototypeOf(GuardedMutationObserver, NativeMutationObserver); } catch (_) {}
  window.MutationObserver = GuardedMutationObserver;
})();
