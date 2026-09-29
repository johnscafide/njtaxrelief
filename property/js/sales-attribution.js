/* Sales consultant attribution.
   A consultant shares links with ?sc=SCXXXXXXXX. This stores the code for 180
   days and, once the visitor has a signed-in account, claims the attribution
   through claim_my_sales_attribution (server-side rules: active code, account
   under 30 days old, never the consultant's own account, one attribution per
   account). Nothing is sent until there is a session. */
(function () {
  'use strict';
  var KEY = 'watchdog:sales_code';
  var DONE = 'watchdog:sales_code:claimed';
  var TTL = 180 * 24 * 60 * 60 * 1000;

  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var v = JSON.parse(raw);
      if (!v || !v.code || (Date.now() - Number(v.at || 0)) > TTL) { localStorage.removeItem(KEY); return null; }
      return v;
    } catch (_) { return null; }
  }

  function capture() {
    var q = new URLSearchParams(location.search || '');
    var code = String(q.get('sc') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!/^SC[A-Z0-9]{6,12}$/.test(code)) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ code: code, at: Date.now(), path: location.pathname.slice(0, 240) }));
      localStorage.removeItem(DONE);
    } catch (_) {}
  }

  function client() {
    try {
      if (window.NJPTRSupabaseRuntime && typeof window.NJPTRSupabaseRuntime.createClient === 'function') return window.NJPTRSupabaseRuntime.createClient();
      if (window.WatchdogBilling && typeof window.WatchdogBilling.client === 'function') return window.WatchdogBilling.client();
    } catch (_) {}
    return null;
  }

  function claim() {
    var stored = read();
    if (!stored) return;
    try { if (localStorage.getItem(DONE) === stored.code) return; } catch (_) {}
    var c = client();
    if (!c) return;
    c.auth.getSession().then(function (r) {
      var s = r && r.data && r.data.session;
      if (!s) return;
      return c.rpc('claim_my_sales_attribution', { p_code: stored.code, p_landing_path: stored.path || null }).then(function (res) {
        /* A false result is final (already attributed, too old, or own code);
           an error is transient and is retried on the next page. */
        if (!res.error) { try { localStorage.setItem(DONE, stored.code); } catch (_) {} }
      });
    }).catch(function () {});
  }

  capture();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', claim, { once: true });
  else claim();
})();
