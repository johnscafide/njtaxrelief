// ANCHOR estimator ↔ Watchdog bridge.
// Keeps legacy calculator usage on the primary Watchdog project, mirrors verified
// leads to Backoffice, reuses the Watchdog NJ-only property search, and renders a
// governed Watchdog Score / ROBUST property card without inventing missing scores.

(function () {
  'use strict';
  if (window.__watchdogAnchorUsageConsolidated || typeof window.fetch !== 'function') return;
  window.__watchdogAnchorUsageConsolidated = true;

  var LEGACY_USAGE = 'https://afagpnyjxomuvpfviycm.supabase.co/rest/v1/calculator_uses';
  var PRIMARY_USAGE = 'https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/anchor-usage';
  var KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
  var originalFetch = window.fetch.bind(window);

  function usage(action) {
    return originalFetch(PRIMARY_USAGE, {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'apikey':KEY,
        'Authorization':'Bearer ' + KEY
      },
      body:JSON.stringify({action:action})
    });
  }

  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (String(url).indexOf(LEGACY_USAGE) !== 0) return originalFetch(input,init);
    var method = String((init && init.method) || 'GET').toUpperCase();
    if (method === 'HEAD' || method === 'GET') {
      return usage('count').then(function (response) {
        if (!response.ok) return response;
        return response.json().then(function (body) {
          var n = Math.max(0,Number(body && body.count) || 0);
          return new Response(null,{
            status:200,
            headers:{'content-range':'*/' + n,'cache-control':'no-store'}
          });
        });
      });
    }
    if (method === 'POST') return usage('record');
    return Promise.resolve(new Response(null,{status:405}));
  };
})();

(function () {
  'use strict';

  var CAPTURE_URL = 'https://uvkvaxljhhngydvlrzom.supabase.co/functions/v1/verify-email';
  var CAPTURE_KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';

  function funnelTrack(name,params) {
    try {
      if (window.AnchorFunnel && typeof window.AnchorFunnel.track === 'function') {
        var data = params || {};
        data.source = 'anchor-estimator';
        window.AnchorFunnel.track(name,data);
      }
    } catch (_) {}
  }

  function isVerifiedAnchorLead(params) {
    var topic = String((params || {}).topic || '');
    return /\[VERIFIED\]/i.test(topic) && /ANCHOR Estimator/i.test(topic);
  }

  function capture(params) {
    if (!params || !params.email) return;
    var context = {};
    try {
      if (window.AnchorFunnel && typeof window.AnchorFunnel.leadContext === 'function') {
        context = window.AnchorFunnel.leadContext() || {};
      }
    } catch (_) {}

    var addressEl = document.getElementById('est-address');
    var googleSelected = context.googleAddressSelected === true ||
      !!(addressEl && addressEl.dataset && addressEl.dataset.googleAddress === '1');
    var googlePlaceId = String(
      context.googlePlaceId ||
      (addressEl && addressEl.dataset ? addressEl.dataset.googlePlaceId : '') ||
      ''
    ).trim();

    var lead = {
      name:params.name || '',
      email:params.email || '',
      phone:params.phone || '',
      address:params.address || params.town || '',
      tenure:params.tenure || params.lead_type || '',
      household_income:params.income_bracket || params.finance || '',
      program:'ANCHOR Estimator',
      summary:params.topic || '',
      notes:params.message || '',
      referral_source:context.selfReportedSource || '',
      referral_source_detail:context.selfReportedSourceDetail || '',
      google_address_selected:googleSelected,
      google_place_id:googlePlaceId,
      anchor_session_id:context.sessionId || '',
      first_touch:context.firstTouch || null,
      last_touch:context.lastTouch || null
    };

    fetch(CAPTURE_URL,{
      method:'POST',
      keepalive:true,
      headers:{
        'Content-Type':'application/json',
        'apikey':CAPTURE_KEY,
        'Authorization':'Bearer ' + CAPTURE_KEY
      },
      body:JSON.stringify({action:'capture_verified_lead',email:lead.email,lead:lead})
    }).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          throw new Error(body.error || ('Backoffice capture failed (' + res.status + ')'));
        });
      }
      return res.json();
    }).then(function () {
      funnelTrack('anchor_backoffice_captured',{
        referral_source:lead.referral_source || '',
        google_address:googleSelected
      });
    }).catch(function (err) {
      console.warn('Watchdog Backoffice capture:',err && err.message ? err.message : err);
      funnelTrack('anchor_backoffice_capture_failed');
    });
  }

  function install() {
    if (!window.emailjs || typeof window.emailjs.send !== 'function') return false;
    if (window.emailjs.__watchdogBackofficeWrapped) return true;
    var originalSend = window.emailjs.send.bind(window.emailjs);
    window.emailjs.send = function (serviceId,templateId,templateParams,options) {
      if (isVerifiedAnchorLead(templateParams)) capture(templateParams);
      return originalSend(serviceId,templateId,templateParams,options);
    };
    window.emailjs.__watchdogBackofficeWrapped = true;
    return true;
  }

  if (!install()) {
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      if (install() || tries >= 40) clearInterval(timer);
    },250);
  }
})();

(function () {
  'use strict';

  var SCORE_RPC = 'https://uvkvaxljhhngydvlrzom.supabase.co/rest/v1/rpc/get_public_realtime_watchdog_scores';
  var SCORE_KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
  var NJ_BOUNDS = {west:-75.62,north:41.38,east:-73.85,south:38.88};
  var countyMapPromise = null;
  var requestSeq = 0;
  var searchBound = false;
  var submitGuardBound = false;
  var statusPolishBound = false;
  var sessionToken = null;

  var ROBUST = [
    {letter:'R',name:'Recourse',copy:'Paths and evidence for review.'},
    {letter:'O',name:'Overassessment Position',copy:'Assessment versus supported value.'},
    {letter:'B',name:'Burden',copy:'Taxes relative to property value.'},
    {letter:'U',name:'Uniformity',copy:'Consistency across the assessment system.'},
    {letter:'S',name:'Stability',copy:'Pressure for reassessment or structural change.'},
    {letter:'T',name:'Trajectory',copy:"Direction of the property's tax position."}
  ];

  var PROPERTY_TYPES = {
    '1':'Vacant land','2':'Residential','3A':'Farm','3B':'Qualified farm',
    '4A':'Commercial','4B':'Industrial','4C':'Apartment 5+ units',
    '15A':'Public property','15B':'Exempt','15C':'Cemetery',
    '15D':'Exempt','15E':'Exempt','15F':'Exempt'
  };

  function input() { return document.getElementById('est-address'); }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g,function (c) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function text(value) {
    try { return String(value && value.toString ? value.toString() : value || '').trim(); }
    catch (_) { return ''; }
  }
  function money(value) {
    var n = Number(value);
    return Number.isFinite(n) && n > 0 ? '$' + Math.round(n).toLocaleString() : 'Not on file';
  }
  function pct(value) {
    if (value === null || value === undefined || value === '') return 'Not on file';
    var n = Number(value);
    return Number.isFinite(n) ? n.toFixed(2) + '%' : 'Not on file';
  }
  function localityKey(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  }
  function track(name,params) {
    try { if (window.AnchorFunnel) window.AnchorFunnel.track(name,params || {}); } catch (_) {}
  }

  function ensureStyles() {
    if (document.getElementById('anchor-watchdog-intelligence-styles')) return;
    var style = document.createElement('style');
    style.id = 'anchor-watchdog-intelligence-styles';
    style.textContent = [
      '.awd-search-host{position:relative!important}',
      '.awd-search-box{position:absolute;left:0;right:0;top:calc(100% + 9px);z-index:8000;display:none;max-height:min(540px,64vh);overflow:auto;background:#fff;border:1px solid #dfe7ec;border-radius:18px;box-shadow:0 24px 60px rgba(10,34,64,.22);text-align:left}',
      '.awd-search-box.open{display:block}',
      '.awd-search-county{display:flex;align-items:center;justify-content:space-between;padding:10px 14px 7px;background:#f5f9f8;color:#087f82;border-top:1px solid #e8eeee;font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}',
      '.awd-search-county:first-child{border-top:0}',
      '.awd-search-county small{color:#849199;font-size:10px;font-weight:700;letter-spacing:0;text-transform:none}',
      '.awd-search-option{appearance:none;border:0;border-top:1px solid #edf1f3;background:#fff;width:100%;padding:12px 13px;display:grid;grid-template-columns:34px minmax(0,1fr) auto;gap:10px;align-items:start;text-align:left;cursor:pointer;color:#112b4c}',
      '.awd-search-county+.awd-search-option{border-top:0}',
      '.awd-search-option:hover,.awd-search-option.active,.awd-search-option:focus-visible{background:#f1f7f6;outline:none}',
      '.awd-search-pin{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;background:#eaf5f4;color:#087f82}',
      '.awd-search-main{display:block;font-size:14px;font-weight:850;line-height:1.25;color:#10294b}',
      '.awd-search-main mark{background:transparent;color:#087f82;font:inherit}',
      '.awd-search-secondary{display:block;margin-top:3px;font-size:11px;font-weight:600;color:#738194;line-height:1.35}',
      '.awd-search-intel{display:flex;flex-wrap:wrap;gap:4px 8px;margin-top:6px;min-height:15px;font-size:10px;font-weight:700;color:#687781;line-height:1.35}',
      '.awd-search-record{color:#087f82;font-weight:850}',
      '.awd-search-score{min-width:62px;padding:7px 8px;border-radius:13px;background:#10294b;color:#fff;text-align:center;align-self:center}',
      '.awd-search-score b{display:block;font-size:18px;line-height:1}',
      '.awd-search-score span{display:block;margin-top:3px;font-size:7px;font-weight:900;line-height:1.1;text-transform:uppercase;letter-spacing:.04em}',
      '.awd-search-credit{height:28px;border-top:1px solid #edf1f3;background:#fff url("https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3.png") no-repeat right 10px center;background-size:112px auto}',
      '.awd-search-empty{padding:14px;color:#6f7d8d;font-size:12px;font-weight:650}',
      'body.est-page .pac-container{display:none!important}',
      '.awdx-shell{margin:20px 0;border-radius:20px;overflow:hidden;background:#fff;border:1px solid #dfe7ec;box-shadow:0 18px 42px rgba(14,34,72,.12);text-align:left}',
      '.awdx-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:18px 20px;background:linear-gradient(135deg,#0e2248,#173d6d);color:#fff}',
      '.awdx-brand{display:flex;align-items:center;gap:11px;min-width:0}',
      '.awdx-mark{width:40px;height:40px;flex:0 0 40px;border-radius:12px;display:grid;place-items:center;background:#0a9598;color:#fff;font-size:18px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}',
      '.awdx-kicker{font-size:9px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:#75ddd6}',
      '.awdx-title{font-family:"Mozilla Text",sans-serif;font-size:18px;font-weight:800;line-height:1.2;margin-top:2px}',
      '.awdx-address{font-size:11px;color:#c3d1e1;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:430px}',
      '.awdx-public{font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#b9c9dc;white-space:nowrap;margin-top:4px}',
      '.awdx-body{padding:18px 20px 20px}',
      '.awdx-intro{font-size:13px;line-height:1.5;color:#405068;margin:0 0 14px}',
      '.awdx-score-card{display:grid;grid-template-columns:110px minmax(0,1fr);gap:16px;align-items:center;padding:16px;border-radius:16px;background:linear-gradient(135deg,#10294b,#173d6d);color:#fff;margin-bottom:13px}',
      '.awdx-score{display:grid;place-items:center;width:96px;height:96px;border-radius:50%;border:7px solid rgba(117,221,214,.8);background:rgba(255,255,255,.04);text-align:center}',
      '.awdx-score b{font-size:34px;line-height:.95}.awdx-score small{display:block;font-size:9px;margin-top:3px;color:#c4d3e5;font-weight:800}',
      '.awdx-score-label{font-size:9px;font-weight:900;letter-spacing:.13em;text-transform:uppercase;color:#75ddd6}',
      '.awdx-score-copy strong{display:block;font-size:17px;line-height:1.25;margin:4px 0 5px}',
      '.awdx-score-copy p{margin:0;color:#cedbea;font-size:11.5px;line-height:1.45}',
      '.awdx-score-source{display:inline-flex;margin-top:8px;padding:4px 8px;border-radius:999px;background:rgba(255,255,255,.1);font-size:9px;font-weight:800;color:#d8e4f0}',
      '.awdx-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}',
      '.awdx-stat{background:#f5f8fb;border-radius:12px;padding:12px;min-width:0}',
      '.awdx-value{font-size:17px;font-weight:850;color:#0e2248;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.awdx-label{font-size:9px;font-weight:850;letter-spacing:.05em;text-transform:uppercase;color:#748397;margin-top:3px}',
      '.awdx-robust{margin-top:13px;padding:15px;border-radius:15px;background:#f5f9f8;border:1px solid #dcebe9}',
      '.awdx-robust-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:11px}',
      '.awdx-robust-title{font-size:14px;font-weight:850;color:#10294b}',
      '.awdx-robust-sub{font-size:10px;color:#647785;line-height:1.4;margin-top:2px}',
      '.awdx-robust-link{font-size:10px;font-weight:850;color:#087f82;text-decoration:none;white-space:nowrap}',
      '.awdx-robust-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}',
      '.awdx-dim{display:grid;grid-template-columns:28px minmax(0,1fr);gap:8px;align-items:start;background:#fff;border-radius:10px;padding:9px}',
      '.awdx-letter{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;background:#10294b;color:#fff;font-size:13px;font-weight:900}',
      '.awdx-dim b{display:block;font-size:10.5px;line-height:1.2;color:#10294b}',
      '.awdx-dim span{display:block;margin-top:2px;font-size:8.5px;line-height:1.3;color:#73808d}',
      '.awdx-note{margin-top:11px;font-size:9.5px;line-height:1.45;color:#748397}',
      '.awdx-actions{display:flex;align-items:center;gap:10px;margin-top:14px}',
      '.awdx-cta{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:11px 15px;border-radius:10px;background:#0a9598;color:#fff!important;text-decoration:none;font-size:12px;font-weight:850}',
      '.awdx-cta:hover{background:#087f82}',
      '.awdx-loading{padding:24px 20px;display:flex;gap:10px;align-items:center;color:#5f6f82;font-size:12px}',
      '.awdx-spinner{width:17px;height:17px;border:2px solid #dfe8ef;border-top-color:#0a9598;border-radius:50%;animation:awdxspin .7s linear infinite}',
      '@keyframes awdxspin{to{transform:rotate(360deg)}}',
      '@media(max-width:600px){.awd-search-box{border-radius:15px;max-height:58vh}.awd-search-option{grid-template-columns:32px minmax(0,1fr) auto;padding:11px}.awd-search-score{min-width:54px}.awd-search-score b{font-size:16px}.awdx-head{padding:16px}.awdx-public{display:none}.awdx-body{padding:15px}.awdx-score-card{grid-template-columns:84px minmax(0,1fr);padding:13px;gap:12px}.awdx-score{width:78px;height:78px;border-width:6px}.awdx-score b{font-size:28px}.awdx-stats{grid-template-columns:1fr 1fr}.awdx-robust-grid{grid-template-columns:1fr 1fr}.awdx-robust-head{flex-direction:column}.awdx-actions{align-items:stretch;flex-direction:column}.awdx-cta{width:100%}}'
    ].join('');
    document.head.appendChild(style);
  }

  function status(kind,message) {
    var field = input();
    var el = document.getElementById('est-address-google-status');
    if (!el) return;
    el.className = 'anchor-google-status' + (kind === 'valid' ? ' is-valid' : kind === 'error' ? ' is-error' : '');
    if (field) field.classList.toggle('anchor-field-error',kind === 'error');
    var icon = kind === 'valid' ? 'fa-circle-check' : kind === 'error' ? 'fa-circle-exclamation' : 'fa-dog';
    el.innerHTML = '<i class="fas ' + icon + '"></i><span>' + esc(message) + '</span>';
  }

  function installStatusPolish() {
    var field = input();
    if (!field || statusPolishBound) return;
    statusPolishBound = true;
    function refresh() {
      setTimeout(function () {
        if (field.dataset.googleAddress === '1' && field.dataset.googlePlaceId) {
          status('valid','Watchdog property selected and verified.');
        } else {
          status('idle','Start typing to search New Jersey properties with Watchdog.');
        }
      },0);
    }
    field.addEventListener('input',refresh);
    field.addEventListener('focus',refresh);
  }

  function highlight(value,needle) {
    var raw = String(value || ''), n = String(needle || '').trim();
    if (!n) return esc(raw);
    var idx = raw.toLowerCase().indexOf(n.toLowerCase());
    if (idx < 0) return esc(raw);
    return esc(raw.slice(0,idx)) + '<mark>' + esc(raw.slice(idx,idx+n.length)) + '</mark>' + esc(raw.slice(idx+n.length));
  }

  function getBox() {
    var field = input();
    if (!field) return null;
    var box = document.getElementById('est-address-awd-search');
    if (box) return box;
    var host = field.parentElement || field;
    if (host.classList) host.classList.add('awd-search-host');
    box = document.createElement('div');
    box.id = 'est-address-awd-search';
    box.className = 'awd-search-box';
    box.setAttribute('role','listbox');
    box.setAttribute('aria-label','Watchdog New Jersey property results');
    host.appendChild(box);
    field.setAttribute('role','combobox');
    field.setAttribute('aria-autocomplete','list');
    field.setAttribute('aria-controls',box.id);
    field.setAttribute('aria-expanded','false');
    return box;
  }

  function closeBox() {
    var field = input(), box = document.getElementById('est-address-awd-search');
    if (box) { box.classList.remove('open'); box.innerHTML = ''; }
    if (field) field.setAttribute('aria-expanded','false');
  }

  function loadCountyMap() {
    if (countyMapPromise) return countyMapPromise;
    countyMapPromise = fetch('/towns/').then(function (r) { return r.text(); }).then(function (html) {
      var buckets = {}, map = {}, doc = new DOMParser().parseFromString(html,'text/html');
      Array.prototype.slice.call(doc.querySelectorAll('.tp-county-group')).forEach(function (group) {
        var h = group.querySelector('h2 a');
        var county = h ? String(h.textContent || '').replace(/\s+County\s*$/i,'').trim() : '';
        if (!county) return;
        Array.prototype.slice.call(group.querySelectorAll('.tp-town-card')).forEach(function (card) {
          var label = card.querySelector('span');
          var key = localityKey(label ? label.textContent : card.textContent || '');
          if (!key) return;
          if (!buckets[key]) buckets[key] = {};
          buckets[key][county] = 1;
        });
      });
      Object.keys(buckets).forEach(function (key) {
        var counties = Object.keys(buckets[key]);
        if (counties.length === 1) map[key] = counties[0];
      });
      return map;
    }).catch(function () { return {}; });
    return countyMapPromise;
  }

  function explicitState(prediction) {
    var source = text(prediction && prediction.text) + ' ' + text(prediction && prediction.secondaryText);
    var match = source.match(/(?:^|,|\s)(NJ|NY|PA|DE)(?:,|\s|$)/i);
    if (match) return String(match[1] || '').toUpperCase();
    if (/\bNEW JERSEY\b/i.test(source)) return 'NJ';
    if (/\bNEW YORK\b/i.test(source)) return 'NY';
    if (/\bPENNSYLVANIA\b/i.test(source)) return 'PA';
    if (/\bDELAWARE\b/i.test(source)) return 'DE';
    return '';
  }

  function countyForPrediction(prediction,map) {
    var source = text(prediction && prediction.secondaryText) || text(prediction && prediction.text);
    var parts = source.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    for (var i=0;i<parts.length;i++) {
      var key = localityKey(parts[i]);
      if (key && map[key]) return map[key];
    }
    return '';
  }

  function isNjPrediction(prediction,map) {
    var state = explicitState(prediction);
    if (state) return state === 'NJ';
    return !!countyForPrediction(prediction,map);
  }

  function scoreSubjects(subjects) {
    var rows = (subjects || []).filter(function (subject) {
      return subject && subject.pamsPin;
    }).map(function (subject) {
      return {
        pams_pin:subject.pamsPin,
        assessment:Number(subject.assessedValue) || null,
        tax:Number(subject.lastYearTax) || null,
        town:subject.municipality || '',
        county:subject.county || ''
      };
    });
    if (!rows.length) return Promise.resolve({});

    return fetch(SCORE_RPC,{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'apikey':SCORE_KEY,
        'Authorization':'Bearer ' + SCORE_KEY
      },
      body:JSON.stringify({p_rows:rows})
    }).then(function (response) {
      if (!response.ok) throw new Error('Watchdog score lookup failed');
      return response.json();
    }).then(function (data) {
      var out = {};
      (Array.isArray(data) ? data : []).forEach(function (row) {
        if (!row || !row.pams_pin) return;
        var raw = row.watchdog_score;
        var n = Number(raw);
        out[row.pams_pin] = {
          score:raw !== null && raw !== undefined && raw !== '' && Number.isFinite(n) ? n : null,
          source:String(row.score_source || '')
        };
      });
      return out;
    }).catch(function () { return {}; });
  }

  function enrichSearchRows(predictions,seq) {
    if (typeof window.enrichLead !== 'function') return;
    var work = (predictions || []).slice(0,6).map(function (prediction) {
      return window.enrichLead(text(prediction.text)).catch(function () { return null; });
    });
    Promise.all(work).then(function (subjects) {
      if (seq !== requestSeq) return null;
      return scoreSubjects(subjects).then(function (scores) {
        if (seq !== requestSeq) return;
        var box = document.getElementById('est-address-awd-search');
        subjects.forEach(function (subject,index) {
          if (!box || !subject || subject.status !== 'ok') return;
          var button = box.querySelector('[data-awd-index="' + index + '"]');
          if (!button) return;
          var intel = button.querySelector('.awd-search-intel');
          var scoreEl = button.querySelector('.awd-search-score');
          var scoreInfo = scores[subject.pamsPin] || {score:null,source:'insufficient_canonical_evidence'};
          var bits = ['<span class="awd-search-record"><i class="fas fa-circle-check"></i> Watchdog record</span>'];
          if (Number(subject.assessedValue) > 0) bits.push('<span>' + esc(money(subject.assessedValue)) + ' assessed</span>');
          if (Number(subject.lastYearTax) > 0) bits.push('<span>' + esc(money(subject.lastYearTax)) + ' tax</span>');
          var type = PROPERTY_TYPES[String(subject.propertyClass || '').toUpperCase()] || '';
          if (type) bits.push('<span>' + esc(type) + '</span>');
          if (intel) intel.innerHTML = bits.join('<span aria-hidden="true">·</span>');
          if (scoreEl) {
            scoreEl.hidden = false;
            var hasScore = Number.isFinite(scoreInfo.score);
            scoreEl.querySelector('b').textContent = hasScore ? String(Math.round(scoreInfo.score)) : '—';
            scoreEl.querySelector('span').textContent = hasScore ? 'Watchdog score' : 'Score pending';
          }
        });
      });
    });
  }

  function renderSearch(predictions,map,needle,seq) {
    var box = getBox(), rows = [], html = '', groups = [], grouped = {};
    if (!box) return;
    (predictions || []).forEach(function (prediction) {
      var county = countyForPrediction(prediction,map);
      var label = county ? county + ' County' : 'New Jersey';
      if (!grouped[label]) { grouped[label] = []; groups.push(label); }
      grouped[label].push(prediction);
    });

    if (!groups.length) {
      box.innerHTML = '<div class="awd-search-empty">No matching New Jersey properties yet. Keep typing.</div><div class="awd-search-credit" aria-label="Powered by Google"></div>';
      box.classList.add('open');
      input().setAttribute('aria-expanded','true');
      return;
    }

    groups.forEach(function (label) {
      html += '<div class="awd-search-county"><span>' + esc(label) + '</span><small>' + grouped[label].length + ' match' + (grouped[label].length === 1 ? '' : 'es') + '</small></div>';
      grouped[label].forEach(function (prediction) {
        var idx = rows.length;
        rows.push(prediction);
        html += '<button type="button" class="awd-search-option" role="option" aria-selected="false" data-awd-index="' + idx + '">'
          + '<span class="awd-search-pin"><i class="fas fa-location-dot"></i></span>'
          + '<span><span class="awd-search-main">' + highlight(text(prediction.mainText) || text(prediction.text),needle) + '</span>'
          + '<span class="awd-search-secondary">' + esc(text(prediction.secondaryText)) + '</span>'
          + '<span class="awd-search-intel">Checking NJ public record…</span></span>'
          + '<span class="awd-search-score" hidden><b>—</b><span>Score pending</span></span></button>';
      });
    });
    html += '<div class="awd-search-credit" aria-label="Powered by Google"></div>';
    box.innerHTML = html;
    box.classList.add('open');
    input().setAttribute('aria-expanded','true');

    box.querySelectorAll('.awd-search-option').forEach(function (button) {
      button.addEventListener('mousedown',function (event) { event.preventDefault(); });
      button.addEventListener('click',function () {
        var idx = Number(button.getAttribute('data-awd-index'));
        if (rows[idx]) selectPrediction(rows[idx]);
      });
    });
    enrichSearchRows(rows,seq);
  }

  function stateFromPlace(place) {
    var components = place && place.addressComponents || [];
    for (var i=0;i<components.length;i++) {
      if ((components[i].types || []).indexOf('administrative_area_level_1') !== -1) {
        return String(components[i].shortText || components[i].longText || '').toUpperCase();
      }
    }
    return '';
  }

  function selectPrediction(prediction) {
    var field = input();
    closeBox();
    if (!field) return;
    var place;
    try { place = prediction.toPlace(); } catch (_) { return; }

    Promise.resolve(place.fetchFields({fields:['formattedAddress','addressComponents']})).then(function () {
      var formatted = String(place.formattedAddress || text(prediction.text) || '').trim();
      if (!formatted || stateFromPlace(place) !== 'NJ') {
        field.dataset.googleAddress = '0';
        delete field.dataset.googlePlaceId;
        status('error','Please choose a New Jersey property from the Watchdog results.');
        return;
      }
      var placeId = String(prediction.placeId || '');
      field.value = formatted;
      field.dataset.googleAddress = '1';
      field.dataset.googlePlaceId = placeId;
      sessionToken = null;
      status('valid','Watchdog property selected and verified.');
      try {
        field.dispatchEvent(new CustomEvent('watchdog:address-selected',{
          bubbles:true,
          detail:{formattedAddress:formatted,placeId:placeId,state:'NJ',source:'watchdog_custom_search'}
        }));
      } catch (_) {}
      track('anchor_watchdog_address_selected',{watchdog_search:true,google_place_id:placeId});
      field.focus();
    }).catch(function () {
      status('error','That property could not be verified. Please choose another Watchdog result.');
    });
  }

  function bindSearch(lib) {
    var field = input();
    var Suggestion = lib && lib.AutocompleteSuggestion;
    var SessionToken = lib && lib.AutocompleteSessionToken;
    if (!field || !Suggestion || !SessionToken || searchBound) return false;

    searchBound = true;
    field.dataset.anchorPlacesBound = '1';
    field.dataset.wdAnchorSearch = '1';
    field.setAttribute('autocomplete','off');
    getBox();
    var timer = null;

    function request() {
      var value = String(field.value || '').trim();
      if (value.length < 3) { closeBox(); return; }
      if (!sessionToken) sessionToken = new SessionToken();
      var seq = ++requestSeq;

      Promise.all([
        Suggestion.fetchAutocompleteSuggestions({
          input:value,
          sessionToken:sessionToken,
          includedRegionCodes:['us'],
          includedPrimaryTypes:['street_address','premise','subpremise'],
          locationRestriction:NJ_BOUNDS,
          language:'en-US',
          region:'us'
        }),
        loadCountyMap()
      ]).then(function (results) {
        if (seq !== requestSeq || String(field.value || '').trim() !== value) return;
        var suggestions = results[0] && results[0].suggestions || [];
        var map = results[1] || {};
        var predictions = suggestions.map(function (item) {
          return item && item.placePrediction;
        }).filter(function (prediction) {
          return prediction && isNjPrediction(prediction,map);
        }).slice(0,8);
        renderSearch(predictions,map,value,seq);
      }).catch(function () {
        closeBox();
        status('error','Watchdog property search could not load. Please try again.');
      });
    }

    field.addEventListener('input',function () {
      field.dataset.googleAddress = '0';
      delete field.dataset.googlePlaceId;
      clearTimeout(timer);
      timer = setTimeout(request,180);
    });
    field.addEventListener('focus',function () {
      var value = String(field.value || '').trim();
      if (value.length >= 3 && field.dataset.googleAddress !== '1') {
        clearTimeout(timer);
        timer = setTimeout(request,80);
      }
    });
    field.addEventListener('blur',function () { setTimeout(closeBox,170); });
    field.addEventListener('keydown',function (event) {
      var box = document.getElementById('est-address-awd-search');
      var buttons = box ? Array.prototype.slice.call(box.querySelectorAll('.awd-search-option')) : [];
      if (!buttons.length) return;
      var active = buttons.findIndex(function (button) { return button.classList.contains('active'); });
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        var next = event.key === 'ArrowDown' ? active + 1 : active - 1;
        if (next < 0) next = buttons.length - 1;
        if (next >= buttons.length) next = 0;
        buttons.forEach(function (button,index) {
          var on = index === next;
          button.classList.toggle('active',on);
          button.setAttribute('aria-selected',on ? 'true' : 'false');
        });
        buttons[next].scrollIntoView({block:'nearest'});
      } else if (event.key === 'Enter' && active >= 0) {
        event.preventDefault();
        buttons[active].click();
      } else if (event.key === 'Escape') {
        closeBox();
      }
    },true);
    return true;
  }

  function initSearch() {
    ensureStyles();
    var field = input();
    if (!field || !window.google || !google.maps || typeof google.maps.importLibrary !== 'function') return false;
    field.dataset.anchorPlacesBound = '1';
    google.maps.importLibrary('places').then(function (lib) {
      if (!bindSearch(lib) && !searchBound) {
        status('error','Watchdog property search could not initialize. Please refresh and try again.');
      }
    }).catch(function () {
      status('error','Watchdog property search could not load. Please refresh and try again.');
    });
    return true;
  }

  // anchor-estimator.html already loads Google Places and calls this name. Repoint
  // that callback to the custom Watchdog dropdown instead of Google's stock UI.
  window.initAddressAutocomplete = function () { initSearch(); };

  function wrapSubmitGuard() {
    if (submitGuardBound || typeof window.estSubmit !== 'function') return false;
    var original = window.estSubmit;
    if (!original.__anchorStrictAddressWrapped) return false;
    window.estSubmit = function () {
      var field = input();
      if (!field || field.dataset.googleAddress !== '1' || !field.dataset.googlePlaceId) {
        if (field) field.focus();
        status('error','Select your property from the Watchdog results before continuing.');
        alert('Please select your property address from the Watchdog results before continuing.');
        track('anchor_watchdog_address_blocked',{
          reason:field && field.value ? 'typed_without_watchdog_selection' : 'missing_address'
        });
        return;
      }
      return original.apply(this,arguments);
    };
    window.estSubmit.__watchdogSearchGuard = true;
    submitGuardBound = true;
    return true;
  }

  function sourceLabel(info) {
    if (!info || !Number.isFinite(info.score)) return 'Canonical score pending';
    if (info.source === 'robust_observation') return 'Canonical ROBUST-v1 observation';
    if (info.source === 'robust_cache') return 'Canonical ROBUST-v1 cache';
    return 'Canonical ROBUST-v1';
  }

  function robustHtml() {
    return ROBUST.map(function (dimension) {
      return '<div class="awdx-dim"><span class="awdx-letter">' + dimension.letter + '</span><span><b>' + esc(dimension.name) + '</b><span>' + esc(dimension.copy) + '</span></span></div>';
    }).join('');
  }

  function statHtml(value,label) {
    return '<div class="awdx-stat"><div class="awdx-value">' + esc(value) + '</div><div class="awdx-label">' + esc(label) + '</div></div>';
  }

  function renderPropertyCard(el,subject,scoreInfo,tenure,address) {
    var hasScore = !!(scoreInfo && Number.isFinite(scoreInfo.score));
    var scoreValue = hasScore ? String(Math.round(scoreInfo.score)) : '—';
    var type = PROPERTY_TYPES[String(subject.propertyClass || '').toUpperCase()] ||
      (subject.propertyClass ? 'Class ' + subject.propertyClass : 'Not on file');
    var place = [
      subject.propertyLocation || address,
      subject.municipality || '',
      subject.county ? subject.county + ' County' : ''
    ].filter(Boolean).join(' · ');
    var intro = tenure === 'rent'
      ? 'This is the public property record for the residence address you entered. It does not imply that you own the property. Watchdog keeps the residence record separate from your ANCHOR renter status.'
      : 'This is the residence you entered, matched to New Jersey public property records. Your benefit estimate stays separate from Watchdog property intelligence.';
    var scoreCopy = hasScore
      ? 'The Watchdog Score is powered by the ROBUST Framework. Watchdog tells you where you stand. ROBUST tells you why.'
      : 'A Watchdog Score is shown only when sufficient canonical ROBUST-v1 evidence exists. This property is matched, but an unqualified score is not being invented.';
    var title = tenure === 'rent' ? 'Residence property record' : 'Your residence in Watchdog';

    el.innerHTML = '<section class="awdx-shell">'
      + '<div class="awdx-head"><div class="awdx-brand"><div class="awdx-mark"><i class="fas fa-dog"></i></div><div><div class="awdx-kicker">Watchdog property intelligence</div><div class="awdx-title">' + esc(title) + '</div><div class="awdx-address">' + esc(place || address) + '</div></div></div><div class="awdx-public">NJ public record</div></div>'
      + '<div class="awdx-body"><p class="awdx-intro">' + esc(intro) + '</p>'
      + '<div class="awdx-score-card"><div class="awdx-score"><span><b>' + scoreValue + '</b><small>' + (hasScore ? '/ 100' : 'PENDING') + '</small></span></div><div class="awdx-score-copy"><div class="awdx-score-label">Watchdog Score</div><strong>' + (hasScore ? 'Canonical property score' : 'Canonical score not yet available') + '</strong><p>' + esc(scoreCopy) + '</p><span class="awdx-score-source">' + esc(sourceLabel(scoreInfo)) + '</span></div></div>'
      + '<div class="awdx-stats">'
      + statHtml(money(subject.assessedValue),'Assessed value')
      + statHtml(money(subject.lastYearTax),'Prior-year tax')
      + statHtml(pct(subject.effectiveTaxRatePct),'Effective tax rate')
      + statHtml(subject.yearBuilt ? String(subject.yearBuilt) : 'Not on file','Year built')
      + statHtml(Number(subject.lastSalePrice) > 0 ? money(subject.lastSalePrice) : 'Not on file','Recorded sale')
      + statHtml(type,'Property class')
      + '</div>'
      + '<div class="awdx-robust"><div class="awdx-robust-head"><div><div class="awdx-robust-title">ROBUST foundation</div><div class="awdx-robust-sub">One score. Six dimensions. ROBUST.</div></div><a class="awdx-robust-link" href="/property/robust/">How ROBUST works →</a></div><div class="awdx-robust-grid">' + robustHtml() + '</div></div>'
      + '<div class="awdx-note">Public assessment and deed data can lag real-world changes. The Watchdog Score is not a legal conclusion, appraisal, tax-appeal determination or financial recommendation. Source context remains attached to the full Watchdog record.</div>'
      + '<div class="awdx-actions"><a class="awdx-cta" data-awdx-cta href="/property/?address=' + encodeURIComponent(address) + '"><i class="fas fa-dog"></i> Open full Watchdog property report</a></div>'
      + '</div></section>';

    var cta = el.querySelector('[data-awdx-cta]');
    if (cta) cta.addEventListener('click',function () {
      track('anchor_watchdog_cta_click',{tenure:tenure,cta:'property_report'});
    });
  }

  function enhancedHydrate(options) {
    options = options || {};
    var el = document.getElementById(options.targetId || 'est-watchdog-bridge');
    var address = String(options.address || '').trim();
    var tenure = options.tenure === 'rent' ? 'rent' : 'own';
    if (!el || !address || typeof window.enrichLead !== 'function') return;

    el.innerHTML = '<section class="awdx-shell"><div class="awdx-head"><div class="awdx-brand"><div class="awdx-mark"><i class="fas fa-dog"></i></div><div><div class="awdx-kicker">Watchdog property intelligence</div><div class="awdx-title">Matching your residence</div><div class="awdx-address">' + esc(address) + '</div></div></div></div><div class="awdx-loading"><span class="awdx-spinner"></span><span>Matching the verified address to NJ public records and canonical ROBUST evidence…</span></div></section>';
    track('anchor_watchdog_preview_started',{tenure:tenure,experience:'robust_property_card'});

    window.enrichLead(address).then(function (subject) {
      if (!subject || subject.status !== 'ok' || !subject.pamsPin) {
        el.innerHTML = '<section class="awdx-shell"><div class="awdx-head"><div class="awdx-brand"><div class="awdx-mark"><i class="fas fa-dog"></i></div><div><div class="awdx-kicker">Watchdog property intelligence</div><div class="awdx-title">Residence record not confidently matched</div><div class="awdx-address">' + esc(address) + '</div></div></div></div><div class="awdx-body"><p class="awdx-intro">Your ANCHOR result is unaffected. Watchdog did not find enough state parcel evidence to attach a property score or ROBUST foundation to this address without guessing.</p><div class="awdx-actions"><a class="awdx-cta" href="/property/?address=' + encodeURIComponent(address) + '">Try the full Watchdog lookup</a></div></div></section>';
        return;
      }
      return scoreSubjects([subject]).then(function (scores) {
        var info = scores[subject.pamsPin] || {score:null,source:'insufficient_canonical_evidence'};
        renderPropertyCard(el,subject,info,tenure,address);
        track('anchor_watchdog_property_card_loaded',{
          tenure:tenure,
          town:subject.municipality || '',
          parcel_matched:true,
          watchdog_score:Number.isFinite(info.score) ? Math.round(info.score) : undefined,
          score_source:info.source || 'insufficient_canonical_evidence'
        });
      });
    }).catch(function () {
      el.innerHTML = '<section class="awdx-shell"><div class="awdx-body"><p class="awdx-intro">Watchdog property intelligence could not load right now. Your ANCHOR estimate is unaffected.</p></div></section>';
    });
  }

  function boot() {
    ensureStyles();
    var field = input();
    if (field) {
      // anchor-funnel.js sees this flag and does not construct its legacy stock
      // Google autocomplete. The data attributes are retained for lead-contract compatibility.
      field.dataset.anchorPlacesBound = '1';
      field.setAttribute('placeholder','Search your NJ property with Watchdog');
    }
    installStatusPolish();
    status('idle','Start typing to search New Jersey properties with Watchdog.');
    if (window.google && google.maps) initSearch();
    window.AnchorWatchdog = window.AnchorWatchdog || {};
    window.AnchorWatchdog.hydrate = enhancedHydrate;

    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      var liveField = input();
      if (liveField) liveField.dataset.anchorPlacesBound = '1';
      installStatusPolish();
      if (!searchBound && window.google && google.maps) initSearch();
      wrapSubmitGuard();
      window.AnchorWatchdog = window.AnchorWatchdog || {};
      window.AnchorWatchdog.hydrate = enhancedHydrate;
      if ((searchBound && submitGuardBound) || tries >= 80) clearInterval(timer);
    },250);
  }

  // Suppress the legacy dropdown immediately. This script is loaded before the
  // async Google Maps script's callback fires and before anchor-funnel's retries.
  var earlyField = input();
  if (earlyField) earlyField.dataset.anchorPlacesBound = '1';

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
