/* Watchdog Appeal Prospect Scanner client.
 * Proprietary ranking and Chapter 123 screening are computed by the
 * server-authoritative appeal-prospect-scan Edge Function. The browser only
 * requests an entitled result, renders it and performs customer actions.
 */
(function () {
  'use strict';

  var preview = /\.vercel\.app$/i.test(location.hostname);
  var config = preview
    ? { url: 'https://pxossnwmrygxlpxtstnl.supabase.co', key: 'sb_publishable_2knfdj4MRsPEtQpPbQ54ew_S5KngOcl', storage: 'sb-pxossnwmrygxlpxtstnl-auth-token' }
    : { url: 'https://uvkvaxljhhngydvlrzom.supabase.co', key: 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa', storage: 'sb-uvkvaxljhhngydvlrzom-auth-token' };

  var sb = null, plUser = null, profile = {}, catalogPromise = null, catalog = null, lastRun = null;
  var scanSortKey = 'opportunity', scanSortDir = -1;
  var savedPins = Object.create(null), savingPins = Object.create(null), reasonHideTimer = null;

  function el(id) { return document.getElementById(id); }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }
  function money(value) { return '$' + Math.round(Number(value) || 0).toLocaleString(); }
  function pct(value, digits) {
    var number = Number(value);
    return Number.isFinite(number) ? (number * 100).toFixed(digits == null ? 1 : digits) + '%' : '—';
  }
  function toast(message) {
    var node = el('pl-toast');
    if (!node) return;
    node.textContent = message;
    node.style.display = 'block';
    clearTimeout(window._t);
    window._t = setTimeout(function () { node.style.display = 'none'; }, 2600);
  }

  function scanner(body) {
    return sb.functions.invoke('appeal-prospect-scan', { body: body }).then(function (result) {
      if (!result.error) return result.data || {};
      var error = result.error;
      var context = error && error.context;
      if (!context || typeof context.clone !== 'function') throw error;
      return context.clone().json().then(function (payload) {
        if (payload && payload.result) return payload;
        throw error;
      }, function () {
        throw error;
      });
    });
  }

  window.plCloseNote = function () {
    var node = el('plm-note-overlay');
    if (node) node.classList.remove('open');
  };
  window.plModalNote = function (title, html) {
    var node = el('plm-note-overlay');
    if (!node) return;
    node.innerHTML = '<div class="plm-note-box"><button class="plm-note-x" onclick="plCloseNote()"><i class="fas fa-xmark"></i></button><h3>' + esc(title) + '</h3>' + html + '</div>';
    node.classList.add('open');
  };
  window.plSignInPrompt = function () { window.location.href = '/property/dashboard'; };

  function loadCatalog() {
    if (catalogPromise) return catalogPromise;
    catalogPromise = scanner({ action: 'catalog' }).then(function (data) {
      catalog = Array.isArray(data.counties) ? data.counties : [];
      buildPickers();
      return catalog;
    }).catch(function (error) {
      catalogPromise = null;
      console.error('Scanner catalog failed', error);
      var county = el('sc-county');
      if (county) county.innerHTML = '<option value="">Scanner data temporarily unavailable</option>';
      toast('Scanner data is temporarily unavailable');
      throw error;
    });
    return catalogPromise;
  }

  function buildPickers() {
    var county = el('sc-county');
    if (!county) return;
    county.innerHTML = '<option value="">Choose a county</option>' + catalog.map(function (item) {
      return '<option value="' + esc(item.code) + '">' + esc(item.name) + ' County  (' + (item.towns || []).length + ' towns)</option>';
    }).join('');
  }

  window.scCounty = function (code) {
    var town = el('sc-town');
    if (!town) return;
    if (!code) {
      town.innerHTML = '<option value="">Choose a county first</option>';
      town.disabled = true;
      return;
    }
    var county = (catalog || []).find(function (item) { return item.code === code; });
    var towns = county && Array.isArray(county.towns) ? county.towns : [];
    town.innerHTML = '<option value="">Choose a municipality</option>' + towns.map(function (item) {
      var sourceYear = item.certified_year ? ' · CLR ' + esc(item.certified_year) : '';
      return '<option value="' + esc(item.district) + '">' + esc(item.name) + '  (' + Number(item.verified_sales || 0).toLocaleString() + ' verified sales' + sourceYear + ')</option>';
    }).join('');
    town.disabled = false;
  };

  function sortedHits() {
    if (!lastRun) return [];
    var value = {
      opportunity: function (h) { return h.opportunity && h.opportunity.score; },
      address: function (h) { return h.a; },
      block: function (h) { return String(h.b || '') + '/' + String(h.l || ''); },
      year: function (h) { return h.y; }, sale: function (h) { return h.p; },
      assessed: function (h) { return h.av; }, limit: function (h) { return h.limit; },
      over: function (h) { return h.over; }, saving: function (h) { return h.saving; },
      evidence: function (h) { return h.g && h.g.k; }
    }[scanSortKey] || function (h) { return h.opportunity && h.opportunity.score; };
    return lastRun.hits.slice().sort(function (a, b) {
      var av = value(a), bv = value(b);
      if (typeof av === 'string') return scanSortDir * av.localeCompare(String(bv || ''), undefined, { numeric: true });
      return scanSortDir * ((av == null ? -Infinity : av) - (bv == null ? -Infinity : bv));
    });
  }

  window.scSort = function (key) {
    if (scanSortKey === key) scanSortDir *= -1;
    else { scanSortKey = key; scanSortDir = /address|block|evidence/.test(key) ? 1 : -1; }
    paint();
  };

  function sortHead(key, label, numeric) {
    var active = scanSortKey === key;
    return '<th' + (numeric ? ' class="n"' : '') + ' aria-sort="' + (active ? (scanSortDir > 0 ? 'ascending' : 'descending') : 'none') + '"><button type="button" onclick="scSort(\'' + key + '\')">' + label + '<i class="fas fa-sort' + (active ? (scanSortDir > 0 ? '-up' : '-down') : '') + '"></i></button></th>';
  }

  function prospectPin(hit) { return lastRun.d + '_' + String(hit.b || '').trim() + '_' + String(hit.l || '').trim(); }
  function prospectUrl(hit) {
    return '/property/?address=' + encodeURIComponent(hit.a + ', ' + lastRun.name + ', ' + lastRun.county + ' County, NJ');
  }

  function reasonContent(hit) {
    var parts = ((hit.opportunity && hit.opportunity.parts) || []).map(function (part) {
      return '<li><b>' + esc(part.label) + '</b><span>' + Math.round(part.value) + '/100 &middot; ' + part.weight + '% weight</span></li>';
    }).join('');
    var valuationLabel = lastRun && lastRun.valuationDate ? 'Market at ' + esc(lastRun.valuationDate) : 'Valuation-date market';
    return '<strong>Why this scored ' + Number(hit.opportunity && hit.opportunity.score || 0) + '</strong>' +
      '<p>The assessment is <b>' + money(hit.over) + '</b> above the certified Chapter 123 screening threshold after this NJ-verified sale is carried to the pretax valuation date.</p>' +
      '<dl><div><dt>Verified sale</dt><dd>' + money(hit.p) + '</dd></div><div><dt>' + valuationLabel + '</dt><dd>' + money(hit.market) + '</dd></div><div><dt>Supported assessment</dt><dd>' + money(hit.fair) + '</dd></div><div><dt>Ch. 123 threshold</dt><dd>' + money(hit.limit) + '</dd></div></dl>' +
      '<ul>' + parts + '</ul><p class="sc-caution"><b>Screening signal, not certainty.</b> Condition, renovations, record errors, exemptions, later evidence and reassessment activity can change the result. Confirm the current record and comparable evidence before filing.</p>' +
      '<p class="sc-sources">Calculated server-side from governed NJ evidence, including the certified Director/common-level range, General Tax Rate and verified-sale inputs.</p>';
  }

  function reasonTip() {
    var tip = el('sc-reason-float');
    if (tip) return tip;
    tip = document.createElement('div');
    tip.id = 'sc-reason-float';
    tip.className = 'sc-reason';
    tip.setAttribute('role', 'tooltip');
    tip.addEventListener('mouseenter', function () { clearTimeout(reasonHideTimer); });
    tip.addEventListener('mouseleave', function () { window.scHideReason(); });
    document.body.appendChild(tip);
    return tip;
  }

  window.scShowReason = function (index, anchor) {
    clearTimeout(reasonHideTimer);
    var hit = sortedHits()[index];
    if (!hit || !anchor) return;
    var tip = reasonTip(), rect = anchor.getBoundingClientRect();
    tip.innerHTML = reasonContent(hit);
    tip.classList.add('open');
    tip.style.left = '12px';
    tip.style.top = '12px';
    var box = tip.getBoundingClientRect(), gap = 10;
    var left = Math.max(12, Math.min(rect.left, window.innerWidth - box.width - 12));
    var top = rect.bottom + gap;
    if (top + box.height > window.innerHeight - 12) top = Math.max(12, rect.top - box.height - gap);
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  };

  window.scHideReason = function () {
    clearTimeout(reasonHideTimer);
    reasonHideTimer = setTimeout(function () {
      var tip = el('sc-reason-float');
      if (tip) tip.classList.remove('open');
    }, 140);
  };

  function quickButton(pin, index) {
    var added = !!savedPins[pin], saving = !!savingPins[pin];
    return '<button class="sc-quick' + (added ? ' added' : '') + '" type="button" data-pin="' + esc(pin) + '" onclick="scQuickAdd(' + index + ',event)" ' + (added || saving ? 'disabled ' : '') + 'title="' + (added ? 'Already in your Watchlist' : 'Add this parcel to your Watchlist') + '"><i class="fas ' + (added ? 'fa-check' : saving ? 'fa-spinner fa-spin' : 'fa-plus') + '"></i><span>' + (added ? 'Added' : saving ? 'Adding...' : 'Quick add') + '</span></button>';
  }

  function refreshQuickButtons(pin) {
    document.querySelectorAll('.sc-quick[data-pin]').forEach(function (button) {
      if (button.getAttribute('data-pin') !== pin) return;
      var added = !!savedPins[pin], saving = !!savingPins[pin];
      button.classList.toggle('added', added);
      button.disabled = added || saving;
      button.title = added ? 'Already in your Watchlist' : 'Add this parcel to your Watchlist';
      button.innerHTML = '<i class="fas ' + (added ? 'fa-check' : saving ? 'fa-spinner fa-spin' : 'fa-plus') + '"></i><span>' + (added ? 'Added' : saving ? 'Adding...' : 'Quick add') + '</span>';
    });
  }

  function reasonMarkup(hit, index) {
    var pin = prospectPin(hit);
    return '<span class="sc-address-wrap"><a class="sc-address" href="' + prospectUrl(hit) + '" aria-describedby="sc-reason-float" onmouseenter="scShowReason(' + index + ',this)" onmouseleave="scHideReason()" onfocus="scShowReason(' + index + ',this)" onblur="scHideReason()">' + esc(hit.a) + '</a></span>' + quickButton(pin, index);
  }

  window.scQuickAdd = function (index, event) {
    if (event) event.stopPropagation();
    if (!plUser) { window.location.href = '/property/dashboard'; return; }
    var hit = sortedHits()[index];
    if (!hit) return;
    var pin = prospectPin(hit);
    if (savedPins[pin] || savingPins[pin]) { refreshQuickButtons(pin); return; }
    savingPins[pin] = true;
    refreshQuickButtons(pin);
    sb.rpc('save_property', { p: {
      kind: 'watch', pams_pin: pin, address: hit.a, town: lastRun.name, county: lastRun.county,
      block: hit.b, lot: hit.l, assessed: hit.av || null,
      last_year_tax: hit.av ? Math.round(hit.av * lastRun.rate) : null,
      effective_rate: +(lastRun.rate * 100).toFixed(3)
    } }).then(function (result) {
      delete savingPins[pin];
      if (result.error) { console.error('Scanner quick add failed', result.error); refreshQuickButtons(pin); toast('Could not add this property'); return; }
      savedPins[pin] = true;
      refreshQuickButtons(pin);
      toast('Added ' + hit.a + ' to your Watchlist');
    }).catch(function (error) {
      delete savingPins[pin];
      refreshQuickButtons(pin);
      console.error('Scanner quick add failed', error);
      toast('Could not add this property');
    });
  };

  function stateMarkup(data) {
    var result = data && data.result;
    if (result === 'insufficient_sales') {
      return '<div class="sc-none"><b>Not enough governed sale evidence</b><p>Only ' + Number(data.pool || 0) + ' eligible arm&rsquo;s-length sales remain inside the selected pretax valuation window and assessment threshold. Widen the window, lower the assessment threshold, or pick another municipality.</p></div>';
    }
    if (result === 'manual_review_required') {
      return '<div class="sc-none"><b><i class="fas fa-scale-balanced"></i> Manual review required</b><p>' + esc(data.message || 'Automated Chapter 123 screening is disabled for this municipality under the current governed evidence.') + '</p></div>';
    }
    if (result === 'certified_ratio_unavailable' || result === 'tax_rate_unavailable' || result === 'market_adjustment_unavailable') {
      return '<div class="sc-err"><b><i class="fas fa-triangle-exclamation"></i> Governed evidence unavailable</b><p>' + esc(data.message || 'A required governed source is unavailable, so no substitute estimate was used.') + '</p></div>';
    }
    return '';
  }

  window.scRun = function () {
    var district = el('sc-town').value;
    if (!district) { toast('Pick a municipality'); return; }
    var maxYears = Number(el('sc-years').value);
    var minSaving = Number(el('sc-min').value);
    var assessmentNode = el('sc-assessment');
    var minAssessment = assessmentNode ? Number(assessmentNode.value || 0) : 0;
    var townOption = el('sc-town').options[el('sc-town').selectedIndex];
    var townName = townOption ? townOption.textContent.replace(/\s+\(.*$/, '') : district;
    el('sc-out').innerHTML = '<div class="sc-load"><div class="pl-spin"></div><div>Running the governed Pro+ screen for ' + esc(townName) + '...</div></div>';

    scanner({
      action: 'scan',
      district: district,
      max_years: maxYears,
      min_saving: minSaving,
      min_assessment: minAssessment
    }).then(function (data) {
      var state = stateMarkup(data);
      if (state) {
        lastRun = null;
        el('sc-out').innerHTML = state;
        return;
      }
      if (data.result !== 'ok' || !data.run || !Array.isArray(data.run.hits)) throw new Error('invalid_scan_response');
      lastRun = data.run;
      lastRun.formulaVersion = data.formula_version || '';
      lastRun.source = data.source || null;
      scanSortKey = 'opportunity';
      scanSortDir = -1;
      paint();
    }).catch(function (error) {
      console.error('Server scanner failed', error);
      lastRun = null;
      el('sc-out').innerHTML = '<div class="sc-err"><b><i class="fas fa-triangle-exclamation"></i> Scanner temporarily unavailable</b><p>The governed server-side scan could not complete. Your browser did not fall back to a client-side ranking calculation. Try again in a moment or check System Status.</p><p><a href="/property/status">Open System Status</a></p></div>';
    });
  };

  function paint() {
    var run = lastRun;
    if (!run) return;
    var uniformity = run.uniformity, countyAppeal = run.countyAppeal;
    var totalSaving = run.hits.reduce(function (sum, hit) { return sum + Number(hit.saving || 0); }, 0);
    var priority = run.hits.filter(function (hit) { return hit.opportunity && hit.opportunity.score >= 75; }).length;
    var displayHits = sortedHits();
    var coefficientCopy = uniformity && uniformity.coefficient != null
      ? 'The town assessment-dispersion coefficient in the governed source context is <b>' + esc(uniformity.coefficient) + '</b>. '
      : '';
    var appealCopy = countyAppeal && countyAppeal.latest
      ? esc(run.county) + ' County reduced <b>' + esc(countyAppeal.latest.win_rate_filed) + '%</b> of the appeals filed in the latest loaded context.'
      : '';
    var certified = run.certified || {};
    var thresholdCopy = Number(run.minAssessment || 0) > 0
      ? ' The working set is limited to assessments of at least <b>' + money(run.minAssessment) + '</b>.'
      : '';

    el('sc-out').innerHTML = '<div class="sc-res">' +
      '<div class="sc-sum"><div><b>' + run.hits.length.toLocaleString() + '</b><span>properties above the screen</span></div><div><b>' + Math.round(run.hits.length / Math.max(1, run.pool) * 100) + '%</b><span>of the ' + run.pool + ' eligible sales screened</span></div><div><b>' + priority.toLocaleString() + '</b><span>high-priority opportunity files</span></div><div><b>' + money(totalSaving) + '</b><span>annual tax at stake, combined</span></div></div>' +
      '<p class="sc-lede">In <b>' + esc(run.name) + '</b>, <b>' + run.hits.length + '</b> of the <b>' + run.pool + '</b> eligible Class 2 residential sales fall above the certified Chapter 123 screen as of the <b>' + esc(run.valuationDate || 'applicable pretax valuation date') + '</b>.' + thresholdCopy + ' ' + coefficientCopy + appealCopy + '</p>' +
      '<div class="sc-acts"><button class="sc-exp" onclick="scCSV()"><i class="fas fa-file-csv"></i> Export CSV</button><button class="sc-exp ghost" onclick="scPrint()"><i class="fas fa-print"></i> Printable list</button><span class="sc-count">' + run.hits.length + ' rows</span></div>' +
      '<div class="sc-tablewrap"><table class="sc-t"><thead><tr>' + sortHead('opportunity','Opportunity') + sortHead('address','Address') + sortHead('block','Blk/Lot') + sortHead('year','Sold') + sortHead('sale','Sale price',true) + sortHead('assessed','Assessed',true) + sortHead('limit','Ch123 threshold',true) + sortHead('over','Over by',true) + sortHead('saving','Tax at stake/yr',true) + sortHead('evidence','Evidence') + '</tr></thead><tbody>' +
      displayHits.slice(0, 300).map(function (hit, index) {
        var score = Number(hit.opportunity && hit.opportunity.score || 0);
        return '<tr><td><span class="sc-op op' + (score >= 75 ? 'hi' : score >= 55 ? 'md' : 'lo') + '"><b>' + score + '</b><small>' + esc(hit.opportunity && hit.opportunity.band || '') + '</small></span></td><td class="a">' + reasonMarkup(hit, index) + '</td><td class="q">' + esc(hit.b) + '/' + esc(hit.l) + '</td><td class="q">' + hit.y + '</td><td class="n">' + money(hit.p) + '</td><td class="n">' + money(hit.av) + '</td><td class="n">' + money(hit.limit) + '</td><td class="n over">' + money(hit.over) + '</td><td class="n save">' + money(hit.saving) + '</td><td><span class="gr g' + esc(hit.g && hit.g.k || '') + '" title="' + esc(hit.g && hit.g.w || '') + '">' + esc(hit.g && hit.g.k || '') + '  ' + esc(hit.g && hit.g.t || '') + '</span></td></tr>';
      }).join('') + '</tbody></table></div>' +
      (run.hits.length > 300 ? '<p class="sc-more">Showing the top 300 in the table. The export contains all ' + run.hits.length + ' entitled result rows.</p>' : '') +
      '<div class="sc-method"><h4>How this was calculated, and what it is not</h4><p>The Pro+ ranking is computed <b>server-side</b>. The browser sends the municipality and bounded screening options; it does not download the county sales file or calculate the opportunity score.</p><p>Each row uses a governed Class 2 residential sale that can be shown to precede the <b>' + esc(run.valuationDate || 'pretax valuation date') + '</b>. The sale is adjusted to that date at <b>' + (run.drift * 100).toFixed(1) + '% a year</b>. The Chapter 123 screen then uses the certified Director average ratio of <b>' + pct(certified.ratio != null ? certified.ratio : run.ratio, 1) + '</b> and the applicable upper common-level bound of <b>' + pct(certified.upper_applied, 1) + '</b>. Annual tax at stake uses the governed General Tax Rate of <b>' + (run.rate * 100).toFixed(3) + '%</b>' + (run.rateYear ? ' from <b>' + esc(run.rateYear) + '</b>' : '') + '.</p><p class="sc-warn"><b>This is a screening list, not a filing list.</b> It does not predict an appeal outcome or supply a filing deadline. Public records cannot see condition, renovations or other facts that can explain an assessment gap. Every row needs human review before action. It is not a consumer report and may not be used for tenant screening, employment or credit decisions.</p><p class="sc-sources">Formula: ' + esc(run.formulaVersion || 'governed server version') + '. Sale cutoff: ' + esc(run.saleCutoff || 'governed pretax cutoff') + '.</p></div></div>';

    if (typeof gtag === 'function') gtag('event', 'pro_scan', { town: run.name, hits: run.hits.length });
  }

  function rowsOut() {
    return sortedHits().map(function (hit) {
      return {
        Address: hit.a,
        Block: hit.b,
        Lot: hit.l,
        Town: lastRun.name,
        Property_Class: hit.c || '2',
        Sale_Year: hit.y,
        Sale_Price: hit.p,
        Assessed: hit.av,
        Living_SqFt: hit.sf || '',
        Year_Built: hit.yb || '',
        Market_At_Valuation_Date: Math.round(hit.market),
        Valuation_Date: lastRun.valuationDate || '',
        Sale_Cutoff: lastRun.saleCutoff || '',
        Supported_Assessment: Math.round(hit.fair),
        Ch123_Threshold: Math.round(hit.limit),
        Over_Threshold_By: Math.round(hit.over),
        Est_Annual_Tax_At_Stake: Math.round(hit.saving),
        Assessed_Pct_Of_Valuation_Market: (Number(hit.implied || 0) * 100).toFixed(1),
        Certified_Director_Ratio: lastRun.certified && lastRun.certified.ratio != null ? (lastRun.certified.ratio * 100).toFixed(2) : '',
        Certified_CLR_Upper: lastRun.certified && lastRun.certified.upper_applied != null ? (lastRun.certified.upper_applied * 100).toFixed(2) : '',
        General_Tax_Rate: Number.isFinite(Number(lastRun.rate)) ? (lastRun.rate * 100).toFixed(3) : '',
        General_Tax_Rate_Year: lastRun.rateYear || '',
        Minimum_Assessment_Filter: lastRun.minAssessment || 0,
        Opportunity_Index: hit.opportunity && hit.opportunity.score,
        Opportunity_Band: hit.opportunity && hit.opportunity.band,
        Evidence_Grade: hit.g && hit.g.k,
        Evidence_Note: hit.g && hit.g.t,
        Formula_Version: lastRun.formulaVersion || ''
      };
    });
  }

  window.scCSV = function () {
    var rows = rowsOut();
    if (!rows.length) return;
    var head = Object.keys(rows[0]);
    var csv = [head.join(',')].concat(rows.map(function (row) {
      return head.map(function (key) {
        var value = row[key] == null ? '' : String(row[key]);
        return /[",\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value;
      }).join(',');
    })).join('\n');
    var blob = new Blob([csv], { type: 'text/csv' }), url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url;
    link.download = 'appeal-prospects-' + lastRun.name.toLowerCase().replace(/\s+/g, '-') + '-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    if (typeof gtag === 'function') gtag('event', 'pro_export', { kind: 'csv' });
  };

  window.scPrint = function () {
    var win = window.open('', '_blank');
    if (!win) { toast('Allow popups to print'); return; }
    var run = lastRun;
    win.document.write('<html><head><title>Appeal prospects, ' + esc(run.name) + '</title><style>body{font-family:system-ui,sans-serif;padding:26px;color:#10182b}h1{font-size:19px;margin:0 0 4px}.s{font-size:12px;color:#666;margin-bottom:16px}table{width:100%;border-collapse:collapse;font-size:10.5px}th{background:#14346e;color:#fff;padding:6px;text-align:left}td{padding:5px 6px;border-bottom:1px solid #ddd}tr:nth-child(even) td{background:#f7f9fc}.n{text-align:right}.f{margin-top:16px;font-size:10px;color:#666;line-height:1.6}</style></head><body><h1>Appeal prospects, ' + esc(run.name) + '</h1><div class="s">' + run.hits.length + ' properties above the governed Chapter 123 screen at the ' + esc(run.valuationDate || 'pretax valuation date') + '. Prepared ' + new Date().toLocaleDateString() + '.</div><table><thead><tr><th>Opportunity</th><th>Address</th><th>Blk/Lot</th><th>Sold</th><th class="n">Price</th><th class="n">Assessed</th><th class="n">Threshold</th><th class="n">Over</th><th class="n">Tax at stake/yr</th><th>Grade</th></tr></thead><tbody>' + run.hits.map(function (hit) { return '<tr><td>' + Number(hit.opportunity && hit.opportunity.score || 0) + '</td><td>' + esc(hit.a) + '</td><td>' + esc(hit.b) + '/' + esc(hit.l) + '</td><td>' + hit.y + '</td><td class="n">' + money(hit.p) + '</td><td class="n">' + money(hit.av) + '</td><td class="n">' + money(hit.limit) + '</td><td class="n">' + money(hit.over) + '</td><td class="n">' + money(hit.saving) + '</td><td>' + esc(hit.g && hit.g.k || '') + '</td></tr>'; }).join('') + '</tbody></table><div class="f">Screening only. Result calculated by ' + esc(run.formulaVersion || 'governed server formula') + ' using governed NJ evidence and the pretax valuation date. No filing deadline or appeal outcome is supplied. Public records cannot see condition or renovation. Not a consumer report; not for tenant screening, employment or credit decisions. Prepared via njpropertytaxrelief.com.</div></body></html>');
    win.document.close();
    setTimeout(function () { win.print(); }, 400);
  };

  function showAccess() {
    el('sc-main').style.display = '';
    var allowed = window.NJPTRPlan ? window.NJPTRPlan.can('pro_plus') : false;
    el('sc-plan-gate').style.display = allowed ? 'none' : '';
    el('sc-tool').style.display = allowed ? '' : 'none';
    if (allowed) loadCatalog().catch(function () {});
  }

  function settleEntitlement() {
    var entitlement = sb.rpc('get_my_entitlement').then(function (result) {
      var rows = result && result.data || [], ent = Array.isArray(rows) ? rows[0] : rows;
      if (ent) profile = { account_role: ent.account_role, plan_tier: ent.plan_tier, subscription_status: ent.subscription_status, current_period_end: ent.current_period_end };
      return profile;
    }).catch(function () { return profile; });
    var saved = sb.from('saved_properties').select('pams_pin').then(function (result) {
      (result.data || []).forEach(function (row) { if (row.pams_pin) savedPins[String(row.pams_pin)] = true; });
    }).catch(function () {});
    return Promise.all([entitlement, saved]).then(function () {
      if (window.NJPTRPlan) window.NJPTRPlan.init(plUser, profile);
      showAccess();
    });
  }

  function ready() {
    if (typeof supabase === 'undefined') { setTimeout(ready, 120); return; }
    sb = supabase.createClient(config.url, config.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: config.storage } });
    sb.auth.getSession().then(function (result) {
      plUser = result && result.data && result.data.session ? result.data.session.user : null;
      if (!plUser) { el('sc-gate').style.display = ''; return; }
      settleEntitlement();
    });
  }

  document.addEventListener('njptr:plan-change', function () { if (plUser) showAccess(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();
