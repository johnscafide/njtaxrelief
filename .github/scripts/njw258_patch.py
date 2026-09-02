from pathlib import Path
import re

path = Path('property/js/lookup.js')
src = path.read_text()


def exact(old, new, label):
    global src
    n = src.count(old)
    if n != 1:
        raise SystemExit(f'{label}: expected 1 exact match, found {n}')
    src = src.replace(old, new, 1)


def rx(pattern, replacement, label):
    global src
    compiled = re.compile(pattern, re.S)
    matches = list(compiled.finditer(src))
    if len(matches) != 1:
        raise SystemExit(f'{label}: expected 1 regex match, found {len(matches)}')
    src = compiled.sub(lambda _m: replacement, src, count=1)


exact(
    "  var current = null, map = null, rateTable = null;\n",
    """  var current = null, map = null, rateTable = null;
  var lookupSeq = 0, activeLookupKey = '', activeLookupPending = false;
  var referenceWarmPromise = null;

  function lookupKey(value) {
    return String(value || '').toUpperCase().replace(/\\s+/g, ' ').trim();
  }

  function warmReferenceData() {
    if (referenceWarmPromise) return referenceWarmPromise;
    referenceWarmPromise = Promise.all([
      loadRates().catch(function () {}),
      loadListings().catch(function () {}),
      loadRatios().catch(function () {}),
      loadCalibration().catch(function () {}),
      loadSR1A().catch(function () {}),
      loadRevaluations().catch(function () {})
    ]).catch(function () {});
    return referenceWarmPromise;
  }

  function scheduleReferenceWarmup() {
    var run = function () { warmReferenceData(); };
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(run, { timeout: 1000 });
    } else {
      setTimeout(run, 0);
    }
  }

  function sectionLoading(title, detail) {
    return '<div class=\"pl-state\" role=\"status\" aria-live=\"polite\">' +
      '<div class=\"pl-spin\"></div>' +
      '<div class=\"pl-state-title\">' + esc(title) + '</div>' +
      '<div class=\"pl-state-sub\">' + esc(detail) + '</div></div>';
  }
""",
    'controller helpers'
)

rx(
    r"  function lookupAtPoint\(lat, lon, label\) \{.*?\n  \}\n\n  window\.plLocate = function",
    """  function lookupAtPoint(lat, lon, label) {
    var btn = el('pl-btn');
    var lookupId = ++lookupSeq;
    activeLookupKey = '@' + lat.toFixed(5) + ',' + lon.toFixed(5);
    activeLookupPending = true;
    if (btn) btn.disabled = true;
    el('pl-inline').innerHTML =
      '<div class=\"pl-state\"><div class=\"pl-spin\"></div>' +
      '<div class=\"pl-state-title\">Locating your property</div>' +
      '<div class=\"pl-state-sub\">Opening the parcel first. Property intelligence will fill in behind it.</div></div>';

    warmReferenceData();
    parcelAt(lat, lon)
      .then(function (f) {
        if (lookupId !== lookupSeq) throw new Error('stale');
        if (!f) throw new Error('noparcel');
        el('pl-inline').innerHTML = readyState();
        render(f, { lat: lat, lon: lon, matched: label }, label, lookupId);
      })
      .catch(function (e) {
        if ((e && e.message) === 'stale') return;
        console.error('[watchdog] point lookup failed:', e);
        el('pl-inline').innerHTML =
          '<div class=\"pl-state\"><i class=\"fas fa-circle-question\"></i>' +
          '<div class=\"pl-state-title\">No parcel found there</div>' +
          '<div class=\"pl-state-sub\">There is no New Jersey parcel record at that spot. ' +
          'If you are outside NJ that is expected. Type an address instead.</div></div>';
      })
      .then(function () {
        if (lookupId !== lookupSeq) return;
        activeLookupPending = false;
        activeLookupKey = '';
        if (btn) btn.disabled = false;
      });
  }

  window.plLocate = function""",
    'point lookup'
)

rx(
    r"  window\.plLookup = function \(\) \{.*?\n  \};\n\n  function readyState\(\)",
    """  window.plLookup = function () {
    var addr = (el('pl-addr').value || '').trim();
    if (!addr) { el('pl-addr').focus(); return; }

    var key = lookupKey(addr);
    if (activeLookupPending && activeLookupKey === key) return;

    var lookupId = ++lookupSeq;
    activeLookupKey = key;
    activeLookupPending = true;

    var btn = el('pl-btn');
    btn.disabled = true;
    if (map) { try { map.remove(); } catch (e) {} map = null; }
    var hasInline = !!elReal('pl-inline');
    if (!hasInline) btn.innerHTML = '<i class=\"fas fa-spinner fa-spin\"></i>';

    el('pl-inline').innerHTML =
      '<div class=\"pl-state\"><div class=\"pl-spin\"></div>' +
      '<div class=\"pl-state-title\">Locating property</div>' +
      '<div class=\"pl-state-sub\">Matching ' + esc(addr) + ' to the New Jersey parcel map.</div></div>';
    if (typeof gtag === 'function') gtag('event', 'property_lookup');

    // Supporting datasets warm in parallel. They never block property identity.
    warmReferenceData();

    geocode(addr)
      .then(function (g) {
        if (lookupId !== lookupSeq) throw new Error('stale');
        if (!g) throw new Error('nogeo');
        el('pl-inline').innerHTML =
          '<div class=\"pl-state\"><div class=\"pl-spin\"></div>' +
          '<div class=\"pl-state-title\">Address matched</div>' +
          '<div class=\"pl-state-sub\">Opening the parcel record now. Intelligence sections will keep updating after it opens.</div></div>';
        return parcelAt(g.lat, g.lon).then(function (f) { return { g: g, f: f }; });
      })
      .then(function (res) {
        if (lookupId !== lookupSeq) throw new Error('stale');
        if (!res.f) throw new Error('noparcel');
        el('pl-inline').innerHTML = readyState();
        try {
          render(res.f, res.g, addr, lookupId);
        } catch (err) {
          console.error('[watchdog] render failed:', err);
          throw new Error('render:' + (err && err.message ? err.message : err));
        }
      })
      .catch(function (e) {
        var m = (e && e.message) || '';
        if (m === 'stale') return;
        console.error('[watchdog] lookup failed:', e);

        var title, msg, extra = '';
        if (m === 'nogeo') {
          title = 'We could not place that address';
          msg = 'Try adding the town and zip code, or drop the unit number. New construction and some condo units are not in the state file yet.';
        } else if (m === 'noparcel') {
          title = 'No parcel record matched';
          msg = 'We found the location but no parcel record there. That usually means a condo unit, a brand new build, or a property billed together with other lots.';
        } else if (m.indexOf('render:') === 0) {
          title = 'Something broke on our end';
          msg = 'We found the property but could not draw the report. That is our fault, not your address.';
          extra = '<div class=\"pl-src\" style=\"margin-top:14px;font-size:12px;\">Technical detail: ' + esc(m.slice(7)) + '</div>';
        } else if (m === 'timeout') {
          title = 'The state records service timed out';
          msg = 'New Jersey’s property server accepted the request and never answered. That happens now and then and usually clears within a few minutes. Try again shortly.';
        } else {
          title = 'That lookup did not go through';
          msg = 'The state property service did not answer. It goes down occasionally. Give it a minute and try again.';
          extra = '<div class=\"pl-src\" style=\"margin-top:14px;font-size:12px;\">Technical detail: ' + esc(m || 'unknown') + '</div>';
        }

        el('pl-inline').innerHTML =
          '<div class=\"pl-state\"><i class=\"fas fa-circle-question\"></i>' +
          '<div class=\"pl-state-title\">' + title + '</div>' +
          '<div class=\"pl-state-sub\">' + msg + '</div></div>' +
          '<div class=\"pl-src\" style=\"margin-top:20px;\">If you know your block and lot, your municipal tax assessor can pull the exact record. <a href=\"/index.html#contact\">Send me the address</a> and I will look it up by hand.</div>' + extra;
      })
      .then(function () {
        if (lookupId !== lookupSeq) return;
        activeLookupPending = false;
        activeLookupKey = '';
        btn.disabled = false;
        if (!hasInline) btn.innerHTML = '<i class=\"fas fa-magnifying-glass\"></i>';
      });
  };

  function readyState()""",
    'main lookup'
)

rx(
    r"      if \(!LEDGER_URL \|\| !LEDGER_KEY\) return;\n      xfetch\(LEDGER_URL\.replace\(/\\/\+\$/, ''\) \+ '/rest/v1/rpc/record_lookup', 8000, \{.*?\n      \}\)\.catch\(function \(\) \{\}\);",
    """      // Production record_lookup is authenticated-only by design. Anonymous
      // property searches keep the local ledger and do not generate a doomed 401.
      if (!plUser || !sb || typeof sb.rpc !== 'function') return;
      sb.rpc('record_lookup', { p: payload }).then(function () {}, function () {});""",
    'record lookup auth boundary'
)

exact("  function render(feat, geo, typed) {\n", "  function render(feat, geo, typed, lookupId) {\n", 'render signature')
exact(
    "      status: status ? status.label : 'Not known', acres: acres, sqft: sqft, yearBuilt: p.YR_CONSTR || ''\n    };\n",
    "      status: status ? status.label : 'Not known', acres: acres, sqft: sqft, yearBuilt: p.YR_CONSTR || '',\n      lookupId: lookupId || lookupSeq\n    };\n",
    'current lookup id'
)

repls = {
    "      '<div class=\"plm-sec\" id=\"plm-score-sec\"></div>' +\n": "      '<div class=\"plm-sec\" id=\"plm-score-sec\">' + sectionLoading('Checking appeal evidence', 'Comparing this assessment with verified market evidence and current state rules.') + '</div>' +\n",
    "      '<div class=\"plm-sec\" id=\"plm-timeline-sec\"></div>' +\n": "      '<div class=\"plm-sec\" id=\"plm-timeline-sec\">' + sectionLoading('Building ownership timeline', 'Connecting the recorded transfer with the current Watchdog value.') + '</div>' +\n",
    "      '<div class=\"plm-sec\" id=\"plm-drivers\"></div>' +\n": "      '<div class=\"plm-sec\" id=\"plm-drivers\">' + sectionLoading('Ranking the sales that matter', 'Scoring nearby recorded sales for similarity and recency.') + '</div>' +\n",
    "      '<div class=\"plm-sec\" id=\"plm-verified-sec\"></div>' +\n": "      '<div class=\"plm-sec\" id=\"plm-verified-sec\">' + sectionLoading('Loading verified sales', 'Checking New Jersey SR1A arm’s-length sales for this municipality.') + '</div>' +\n",
    "      '<div class=\"plm-sec\" id=\"plm-comps-sec\"></div>' +\n": "      '<div class=\"plm-sec\" id=\"plm-comps-sec\">' + sectionLoading('Loading nearby recorded sales', 'Finding recent transfers around this parcel.') + '</div>' +\n",
    "      '<div class=\"plm-sec\" id=\"plm-hood-sec\"></div>' +\n": "      '<div class=\"plm-sec\" id=\"plm-hood-sec\">' + sectionLoading('Comparing nearby assessments', 'Measuring the surrounding residential parcels for context.') + '</div>' +\n",
}
for old, new in repls.items():
    exact(old, new, old.strip())

rx(
    r"      '<div class=\"plm-sec\">' \+ gate\('tradeup',\n        'Compare tax across 168 towns',\n        'Pick where you are looking and see that town’s real effective rate, measured from its own parcels, against what you pay now\.',\n        buildTradeUp\(\)\) \+ '</div>' \+",
    "      '<div class=\"plm-sec\" id=\"plm-tradeup-sec\">' + sectionLoading('Loading town tax comparisons', 'Preparing current municipal ratio data for the trade-up calculator.') + '</div>' +",
    'trade-up loading shell'
)

rx(
    r"    // everything below runs after the panel is already on screen.*?\n    neighborhoodStats\(geo\.lat, geo\.lon, 500\)\.then\(function \(h\) \{\n      paintHood\(h, assessed, tax\);\n    \}\);",
    """    // Everything below runs after the panel is already on screen. Static
    // reference files may still be warming; each dependent section says so and
    // repaints itself as soon as its data is ready.
    var renderId = current.lookupId;
    var subject = { assessed: assessed, built: +p.YR_CONSTR || 0, acres: acres };

    warmReferenceData().then(function () {
      if (!current || current.lookupId !== renderId) return null;

      chartTaxHistory();
      var tradeHost = elReal('plm-tradeup-sec');
      if (tradeHost) {
        tradeHost.innerHTML = gate('tradeup',
          'Compare tax across 168 towns',
          'Pick where you are looking and see that town’s real effective rate, measured from its own parcels, against what you pay now.',
          buildTradeUp());
      }

      var staticOffR = officialRatio(current.town, current.county);
      var sr1a = sr1aRatio(p);
      return Promise.all([
        gatherComps(geo.lat, geo.lon, current.town),
        verifiedComps(p, subject),
        subjectFromSR1A(p),
        certifiedChapter123Ratio(p)
      ]).then(function (res) {
        if (!current || current.lookupId !== renderId) return;
        var comps = res[0] || [], verified = res[1] || [], own = res[2], certified = res[3] || null;
        current.certifiedRatio = certified;
        var offR = certified || staticOffR;
        if (own) {
          if (own.sf) {
            subject.sqft = own.sf; current.livingSpace = own.sf;
            var lq = el('plm-q-living');
            if (lq) lq.innerHTML = '<i class=\"fas fa-house\"></i><div><b>' + own.sf.toLocaleString() + '</b><span>Living sq ft</span></div>';
          }
          if (own.p > 1000) { current.verifiedSale = own.p; current.verifiedSaleYear = own.y; }
        }
        var ratio = sr1a || offR;
        paintVerified(verified, subject);
        if (sr1a && sr1a.drift != null) subject.townDrift = sr1a.drift;

        current.comps = comps;
        paintComps(comps);
        var val = watchdogValuation(subject, comps, new Date().getFullYear(), current.town, current.county,
                                    sr1a || offR, sr1a && sr1a.drift != null ? sr1a.drift : null);
        current.valuation = val;
        paintValuation(current.valuation, assessed, tax, ratio);
        if (!val) el('plm-score-sec').innerHTML = '';
        if (!val || !val.drivers || !val.drivers.length) el('plm-drivers').innerHTML = '';
        paintTimeline(current.valuation);
        paintDiag(subject, comps, current.valuation, current.town);
      });
    }).catch(function (e) {
      if (!current || current.lookupId !== renderId) return;
      console.warn('[watchdog] enrichment failed after property open:', e);
      ['plm-score-sec','plm-timeline-sec','plm-drivers','plm-verified-sec','plm-comps-sec','plm-tradeup-sec'].forEach(function (id) {
        var node = elReal(id); if (node) node.innerHTML = '';
      });
    });

    neighborhoodStats(geo.lat, geo.lon, 500).then(function (h) {
      if (!current || current.lookupId !== renderId) return;
      paintHood(h, assessed, tax);
    });""",
    'post-open enrichment'
)

rx(
    r"    if \(!rates \|\| !current\.assessed\) \{\n      sub\.textContent = 'Year by year bills for this town are not loaded yet\.';.*?\n      return;\n    \}",
    """    if (rateTable === null) {
      sub.textContent = 'Loading published town tax-rate history…';
      host.innerHTML = sectionLoading('Loading tax history', 'Pulling the municipality’s published general tax rates.');
      return;
    }
    if (!rates || !current.assessed) {
      sub.textContent = 'Year by year bills are not available for this town.';
      host.innerHTML = '<div class=\"pl-nodata\">' +
        'New Jersey does not publish a per property tax history in the free statewide feed, so this chart is built from your town\\'s published general tax rate for each year.' +
        (current.tax ? '<br><br><strong style=\"color:#0e2248\">Most recent billed amount: ' + money(current.tax) + '</strong>' : '') +
        '</div>';
      return;
    }""",
    'tax history loading'
)

exact("  plInitAuth();\n", "  plInitAuth();\n  scheduleReferenceWarmup();\n", 'reference warmup schedule')

path.write_text(src)

test = Path('property/tests/property-lookup-performance-contract.mjs')
test.parent.mkdir(parents=True, exist_ok=True)
test.write_text("""import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../js/lookup.js', import.meta.url), 'utf8');
const lookupStart = source.indexOf('window.plLookup = function ()');
const lookupEnd = source.indexOf('function readyState()', lookupStart);
assert.ok(lookupStart > -1 && lookupEnd > lookupStart, 'main lookup function should exist');
const lookup = source.slice(lookupStart, lookupEnd);
assert.ok(!lookup.includes('Promise.race'), 'property identity must not wait on the old preload race');
assert.ok(!lookup.includes('loadRates().catch'), 'static enrichment files must not sit on the lookup critical path');
assert.ok(lookup.includes('warmReferenceData();'), 'lookup should warm enrichment without awaiting it');
assert.ok(lookup.includes('geocode(addr)'), 'geocode remains the first awaited identity request');
assert.ok(lookup.includes('render(res.f, res.g, addr, lookupId)'), 'render should carry a lookup id');
assert.ok(source.includes('activeLookupPending && activeLookupKey === key'), 'same-property duplicate submissions should be suppressed');
assert.ok(source.includes('current.lookupId !== renderId'), 'late enrichment must not repaint a newer property');
assert.ok(source.includes("sectionLoading('Loading verified sales'"), 'verified sales should expose loading state');
assert.ok(source.includes("sectionLoading('Comparing nearby assessments'"), 'neighborhood context should expose loading state');
assert.ok(source.includes("if (!plUser || !sb || typeof sb.rpc !== 'function') return;"), 'anonymous lookup must not call record_lookup');
assert.ok(source.includes('scheduleReferenceWarmup();'), 'reference datasets should warm before first search');
console.log('property lookup performance contract: ok');
""")
