/* Watchdog Dashboard observer settle guard
   Broad dashboard MutationObservers are allowed to see the initial render, but
   they are converted into a single post-settle callback. This lets enhancement
   layers mount the NJ map / data cards after the core dashboard finishes its
   initial weather re-render without allowing self-triggering observer loops. */
(function () {
  'use strict';

  if (window.__WD_OBSERVER_GUARD__) return;
  window.__WD_OBSERVER_GUARD__ = true;

  var NativeMutationObserver = window.MutationObserver;
  if (!NativeMutationObserver) return;

  function GuardedMutationObserver(callback) {
    var settleTimer = null;
    var firstSeenAt = 0;
    var observer = null;

    function runOnce(records) {
      if (!observer) return;
      try { observer.disconnect(); } catch (_) {}
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = null;
      try { callback(records || [], observer); } catch (err) { setTimeout(function(){ throw err; }, 0); }
    }

    function guardedCallback(records, nativeObserver) {
      if (!observer) observer = nativeObserver;
      var dashboardRoot = document.getElementById('wd4-root');
      var touchesDashboard = false;
      for (var i = 0; i < records.length; i++) {
        var t = records[i] && records[i].target;
        if (dashboardRoot && t && (t === dashboardRoot || dashboardRoot.contains(t))) {
          touchesDashboard = true;
          break;
        }
      }

      if (!touchesDashboard) {
        callback(records, nativeObserver);
        return;
      }

      if (!firstSeenAt) firstSeenAt = Date.now();
      if (settleTimer) clearTimeout(settleTimer);

      /* The core dashboard renders once with loading weather and once again when
         weather settles. Wait for that render burst to finish, then let each
         enhancement observer execute exactly once and disconnect before it mutates. */
      settleTimer = setTimeout(function waitForStableCore() {
        var root = document.getElementById('wd4-root');
        var mounted = !!(root && root.querySelector('#wd4-grid'));
        var weather = root && root.querySelector('[data-card-id="weather"]');
        var stillLoadingWeather = weather && /weather is loading/i.test(weather.textContent || '');
        var waited = Date.now() - firstSeenAt;

        if (mounted && (!stillLoadingWeather || waited >= 5000)) {
          runOnce(records);
          return;
        }
        settleTimer = setTimeout(waitForStableCore, 350);
      }, 650);
    }

    observer = new NativeMutationObserver(guardedCallback);
    var nativeObserve = observer.observe.bind(observer);

    observer.observe = function (target, options) {
      var dashboardRoot = document.getElementById('wd4-root');
      var isDashboardSubtree = dashboardRoot && target &&
        (target === dashboardRoot || dashboardRoot.contains(target));
      var isBroadDomWatch = options && options.childList === true && options.subtree === true;

      if (isDashboardSubtree && isBroadDomWatch) {
        /* Observe the initial render burst, then guardedCallback disconnects this
           observer after one settled enhancement pass. */
        return nativeObserve(target, options);
      }

      return nativeObserve(target, options);
    };

    return observer;
  }

  GuardedMutationObserver.prototype = NativeMutationObserver.prototype;
  try { Object.setPrototypeOf(GuardedMutationObserver, NativeMutationObserver); } catch (_) {}
  window.MutationObserver = GuardedMutationObserver;
})();
