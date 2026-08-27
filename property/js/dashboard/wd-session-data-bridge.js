/* Watchdog dashboard authenticated data fallback.
   Uses the active Supabase session JWT and the same RLS-protected REST API.
   This only runs when the primary dashboard loader unexpectedly returns no
   saved properties for an authenticated user. */
(function (w, d) {
  'use strict';

  function boot() {
    var WD = w.WD;
    var runtime = w.NJPTRSupabaseRuntime;
    if (!WD || !runtime || !WD.db || !WD.S) return;
    if (Array.isArray(WD.S.properties) && WD.S.properties.length) return;

    var client = WD.db();
    if (!client || !client.auth) return;

    function rest(session, table, params) {
      var qs = params instanceof URLSearchParams ? params : new URLSearchParams(params || {});
      var url = runtime.url + '/rest/v1/' + table + (qs.toString() ? '?' + qs.toString() : '');
      return w.fetch(url, {
        method: 'GET',
        headers: {
          'apikey': runtime.key,
          'authorization': 'Bearer ' + session.access_token,
          'accept': 'application/json'
        }
      }).then(function (res) {
        if (!res.ok) {
          return res.text().then(function (text) {
            var err = new Error('Dashboard data request failed (' + res.status + ')');
            err.detail = text;
            throw err;
          });
        }
        return res.json();
      });
    }

    function inFilter(values) {
      return 'in.(' + values.map(function (v) {
        return '"' + String(v == null ? '' : v).replace(/"/g, '\\"') + '"';
      }).join(',') + ')';
    }

    function loadAux(session, props) {
      var pins = Array.from(new Set(props.map(function (p) { return p.pams_pin; }).filter(Boolean)));
      if (!pins.length) return Promise.resolve();
      var pinFilter = inFilter(pins);
      var scoreParams = new URLSearchParams();
      scoreParams.set('select', 'pams_pin,watchdog_score,town,county,peer_count,peer_median,computed_at');
      scoreParams.set('pams_pin', pinFilter);
      var propertyScoreParams = new URLSearchParams();
      propertyScoreParams.set('select', 'pams_pin,watchdog_score,town,county,observed_on,observed_at');
      propertyScoreParams.set('pams_pin', pinFilter);
      propertyScoreParams.set('order', 'observed_at.desc');
      propertyScoreParams.set('limit', '1000');
      var changeParams = new URLSearchParams();
      changeParams.set('select', 'pams_pin,event_type,severity,title,summary,marker_id,delta_numeric,occurred_at,read_at');
      changeParams.set('pams_pin', pinFilter);
      changeParams.set('occurred_at', 'gte.' + new Date(Date.now() - 120 * 86400000).toISOString());
      changeParams.set('order', 'occurred_at.desc');
      changeParams.set('limit', '400');
      var findingParams = new URLSearchParams();
      findingParams.set('select', 'pams_pin,property_address,opportunity_type,score,confidence,evidence_coverage,why_now,recommended_actions,created_at');
      findingParams.set('pams_pin', pinFilter);
      findingParams.set('order', 'created_at.desc');
      findingParams.set('limit', '200');

      return Promise.allSettled([
        rest(session, 'public_watchdog_score_cache', scoreParams),
        rest(session, 'property_watchdog_scores', propertyScoreParams),
        rest(session, 'property_update_events', changeParams),
        rest(session, 'intelligence_findings', findingParams)
      ]).then(function (parts) {
        var scores = {};
        function rows(part) {
          return part && part.status === 'fulfilled' && Array.isArray(part.value) ? part.value : [];
        }
        rows(parts[1]).forEach(function (r) {
          if (!r.pams_pin || scores[r.pams_pin] || Number(r.watchdog_score) !== Number(r.watchdog_score)) return;
          scores[r.pams_pin] = { score: Number(r.watchdog_score), peer: null, peerCount: null, town: r.town || '' };
        });
        rows(parts[0]).forEach(function (r) {
          if (!r.pams_pin || Number(r.watchdog_score) !== Number(r.watchdog_score)) return;
          var peer = Number(r.peer_median);
          scores[r.pams_pin] = {
            score: Number(r.watchdog_score),
            peer: peer === peer ? peer : null,
            peerCount: Number(r.peer_count) || null,
            town: r.town || ''
          };
        });
        WD.S.scores = scores;
        WD.S.changes = rows(parts[2]);
        WD.S.findings = rows(parts[3]);
      });
    }

    client.auth.getSession().then(function (result) {
      var session = result && result.data && result.data.session;
      if (!session || !session.user || !session.access_token) return null;
      var params = new URLSearchParams();
      params.set('select', '*');
      params.set('user_id', 'eq.' + session.user.id);
      params.set('order', 'created_at.desc');
      return rest(session, 'saved_properties', params).then(function (props) {
        if (!Array.isArray(props) || !props.length) return null;
        WD.S.properties = props;
        return loadAux(session, props).catch(function (error) {
          console.warn('[Watchdog] auxiliary dashboard fallback partially failed:', error && error.message || error);
        }).then(function () {
          WD.repaint();
          d.dispatchEvent(new CustomEvent('wd:data-recovered', { detail: { propertyCount: props.length } }));
        });
      });
    }).catch(function (error) {
      console.warn('[Watchdog] authenticated dashboard fallback failed:', error && error.message || error);
      var ledger = d.getElementById('wdd-positions');
      if (ledger && (!WD.S.properties || !WD.S.properties.length)) {
        ledger.insertAdjacentHTML('afterbegin', '<div style="margin:0 0 12px;padding:10px 12px;border-radius:10px;background:#fff3f4;color:#9d3140;font-size:12px">Your saved properties could not be loaded. Refresh once more or sign out and back in so Watchdog can renew the session.</div>');
      }
    });
  }

  if (w.WD && w.WD.S && w.WD.S.user) boot();
  else d.addEventListener('wd:ready', boot, { once: true });
})(window, document);
