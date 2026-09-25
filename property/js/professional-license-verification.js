(function () {
  'use strict';

  if (!window.NJPTRSupabaseRuntime) return;
  var db = window.NJPTRSupabaseRuntime.createClient();
  var state = null;
  var profile = null;
  var savedLicense = '';
  var busy = false;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function dateLabel(value) {
    if (!value) return '—';
    var d = new Date(value);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});
  }

  function normalizeLicense(value) {
    return String(value || '').toUpperCase().replace(/\s+/g,'').trim();
  }

  function validLicense(value) {
    return /^[A-Z]{0,3}-?[0-9]{5,10}[A-Z]?$/.test(normalizeLicense(value));
  }

  function statusCopy(row) {
    if (!row) return {label:'Not verified', icon:'fa-id-card', note:'Enter your NJ real-estate license number and Watchdog will match it against the official NJDOBI Real Estate Commission search.'};
    if (row.verified_professional) return {label:'Verified professional', icon:'fa-circle-check', note:'Matched to an active record in the official NJDOBI Real Estate Commission search. Verification is separate from your subscription plan.'};
    if (row.verification_status === 'pending') return {label:'Verification pending', icon:'fa-clock', note:'The official lookup was unavailable when this was submitted, so the license is queued for review. You can try Verify now again at any time.'};
    if (row.verification_status === 'expired') return {label:'Re-verification due', icon:'fa-rotate', note:'Watchdog re-verifies professional status at least annually. Enter the license number and verify it again.'};
    if (row.verification_status === 'rejected') return {label:'Needs correction', icon:'fa-triangle-exclamation', note:'The submitted number could not be verified. Use the Agent branding license finder and search by last name, then select the correct record.'};
    return {label:'Not verified', icon:'fa-id-card', note:'Enter your license number to verify it against the official NJDOBI record.'};
  }

  function findAnchor() {
    return document.getElementById('ac-agent-branding') ||
      document.getElementById('ac-profile-editor') ||
      document.querySelector('#ac-app .ac-section') ||
      document.querySelector('#ac-app .ac-security');
  }

  function removeExisting() {
    var old = document.getElementById('ac-professional-verification');
    if (old) old.remove();
  }

  function render() {
    removeExisting();
    if (!profile || profile.primary_profession !== 'real_estate') return;
    var anchor = findAnchor();
    if (!anchor || !anchor.parentNode) return;

    var row = state;
    var copy = statusCopy(row);
    var license = row && row.license_number || savedLicense || '';
    var section = document.createElement('section');
    section.id = 'ac-professional-verification';
    section.className = 'ac-section acp-editor';
    section.innerHTML =
      '<header class="acp-header"><div><span>PROFESSIONAL VERIFICATION</span><h2>NJ real-estate license</h2><p>Confirm your professional identity against the official New Jersey Real Estate Commission record.</p></div><div class="acp-source"><i class="fas ' + copy.icon + '"></i><span>' + esc(copy.label) + '</span></div></header>' +
      '<div class="acp-grid"><section class="acp-panel"><div class="acp-panel-head"><i class="fas fa-address-card"></i><div><b>License verification</b><small>Automatic exact match against the official NJDOBI public search</small></div></div><div class="acp-fields">' +
        '<label class="acp-field"><span>NJ license number</span><input id="ac-license-number" type="text" value="' + esc(license) + '" placeholder="2079591" maxlength="14" autocomplete="off" inputmode="numeric"><small>Don\'t know the number? Use the license finder in Agent branding above and search by <b>last name</b>, then select your record.</small></label>' +
        '<div class="acp-field"><span>Verification status</span><b>' + esc(copy.label) + '</b><small>' + esc(copy.note) + '</small></div>' +
        (row && row.verified_professional ? '<div class="acp-field"><span>Verified licensee</span><b>' + esc(row.licensee_name || 'Verified by Watchdog') + '</b><small>Official NJDOBI match</small></div><div class="acp-field"><span>Watchdog re-verification due</span><b>' + esc(dateLabel(row.verification_due_at)) + '</b><small>Watchdog rechecks at least annually.</small></div>' : '') +
      '</div></section><section class="acp-panel"><div class="acp-panel-head"><i class="fas fa-shield-halved"></i><div><b>What verification does</b><small>A trust signal, not an entitlement</small></div></div><p>Verification confirms that the number matches an active NJDOBI Real Estate Commission record. It stays separate from Standard, Pro, Pro+ or Teams access and does not unlock private owner or contact data.</p><p><a href="https://www.nj.gov/dobi/division_rec/licensing/online_Instructions/licSearch.html" target="_blank" rel="noopener noreferrer">Open the official NJ Real Estate Licensee Search</a></p></section></div>' +
      '<div class="ac-save-row acp-save"><button id="ac-license-submit" type="button"><i class="fas fa-shield-halved"></i> ' + (row && row.verified_professional ? 'Re-verify license' : 'Verify license now') + '</button><span id="ac-license-note" aria-live="polite"></span></div>';

    anchor.parentNode.insertBefore(section, anchor.nextSibling);
    var input = document.getElementById('ac-license-number');
    if (input) input.addEventListener('input', function () { input.value = normalizeLicense(input.value).slice(0,14); });
    var button = document.getElementById('ac-license-submit');
    if (button) button.addEventListener('click', submit);
  }

  async function bearer() {
    var sessionResult = await db.auth.getSession();
    var session = sessionResult && sessionResult.data && sessionResult.data.session;
    if (!session || !session.access_token) throw new Error('Sign in again to verify your license.');
    return session.access_token;
  }

  async function queueManual(license) {
    var result = await db.rpc('submit_my_professional_license_v1',{p_license_number:license});
    if (result.error) throw result.error;
  }

  async function submit() {
    if (busy) return;
    var input = document.getElementById('ac-license-number');
    var note = document.getElementById('ac-license-note');
    var button = document.getElementById('ac-license-submit');
    var license = normalizeLicense(input && input.value);
    if (!validLicense(license)) {
      if (note) note.textContent = 'Enter a valid NJ real-estate license number.';
      return;
    }

    busy = true;
    if (button) button.disabled = true;
    if (note) note.textContent = 'Checking the official NJDOBI record…';

    try {
      var token = await bearer();
      var response = await fetch('/api/njrec-license-verify',{
        method:'POST',
        headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json'},
        body:JSON.stringify({license_number:license})
      });
      var body = await response.json().catch(function(){ return {}; });

      if (response.ok && body.verified) {
        savedLicense = license;
        var brandingInput = document.getElementById('acb-license');
        if (brandingInput) brandingInput.value = license;
        await load();
        var fresh = document.getElementById('ac-license-note');
        if (fresh) fresh.textContent = 'Verified against the official NJDOBI Real Estate Commission record.';
        return;
      }

      if (response.status === 503 || body.temporary === true) {
        await queueManual(license);
        await load();
        var queued = document.getElementById('ac-license-note');
        if (queued) queued.textContent = 'The NJDOBI lookup is temporarily unavailable. Your number was saved for review; you can retry automatic verification later.';
        return;
      }

      throw new Error(body.error || 'This license could not be verified.');
    } catch (error) {
      if (note) note.textContent = error && error.message || 'Could not verify this license.';
    } finally {
      busy = false;
      var freshButton = document.getElementById('ac-license-submit');
      if (freshButton) freshButton.disabled = false;
    }
  }

  async function load() {
    var sessionResult = await db.auth.getSession();
    var user = sessionResult && sessionResult.data && sessionResult.data.session && sessionResult.data.session.user;
    if (!user) return;

    var results = await Promise.all([
      db.from('watchdog_onboarding_profiles').select('primary_profession,status').eq('user_id',user.id).maybeSingle(),
      db.from('profiles').select('pro_agent').eq('id',user.id).maybeSingle()
    ]);
    var profileResult = results[0], brandingResult = results[1];
    if (profileResult.error) return;
    profile = profileResult.data || null;
    var pro = brandingResult && brandingResult.data && brandingResult.data.pro_agent;
    savedLicense = pro && typeof pro === 'object' ? String(pro.license_number || '') : savedLicense;
    if (!profile || profile.primary_profession !== 'real_estate') { render(); return; }

    var verificationResult = await db.rpc('my_professional_license_verification_v1');
    if (!verificationResult.error) state = verificationResult.data && verificationResult.data[0] || null;
    render();
  }

  async function isVerified() {
    var result = await db.rpc('is_verified_professional');
    if (result.error) return false;
    return result.data === true;
  }

  window.WatchdogProfessionalVerification = Object.freeze({
    isVerified:isVerified,
    requireVerified:async function () {
      var ok = await isVerified();
      if (!ok) throw new Error('Verified NJ professional status required');
      return true;
    }
  });

  function start() {
    if (String(document.body && document.body.getAttribute('data-account-profile-mode') || '') !== 'professional') return;
    var app = document.getElementById('ac-app');
    if (!app) return;

    var observer = new MutationObserver(function () {
      if (profile && !document.getElementById('ac-professional-verification')) window.setTimeout(render,0);
    });
    observer.observe(app,{childList:true,subtree:false});

    document.addEventListener('watchdog:profile-updated',load);
    document.addEventListener('watchdog:njrec-license-selected',function (event) {
      var selected = event && event.detail && event.detail.license_number || '';
      if (!selected) return;
      savedLicense = normalizeLicense(selected);
      var input = document.getElementById('ac-license-number');
      if (input) input.value = savedLicense;
    });
    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();