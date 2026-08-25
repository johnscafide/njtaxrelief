(function () {
  'use strict';

  if (!window.NJPTRSupabaseRuntime) return;
  var db = window.NJPTRSupabaseRuntime.createClient();
  var state = null;
  var profile = null;
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
    if (!row) return {label:'Not submitted', icon:'fa-id-card', note:'Submit your NJ real-estate license number for manual verification against the New Jersey Division of Consumer Affairs.'};
    if (row.verified_professional) return {label:'Verified professional', icon:'fa-circle-check', note:'Watchdog verified this license against the NJ Division of Consumer Affairs. Verification is separate from your subscription plan.'};
    if (row.verification_status === 'pending') return {label:'Verification pending', icon:'fa-clock', note:'Your license is queued for manual DCA verification. Paid access does not change while this review is pending.'};
    if (row.verification_status === 'expired') return {label:'Re-verification due', icon:'fa-rotate', note:'Watchdog requires professional verification at least annually. Resubmit the license below to refresh the review.'};
    if (row.verification_status === 'rejected') return {label:'Needs correction', icon:'fa-triangle-exclamation', note:'The submitted license could not be verified. Check the number against the DCA license lookup and resubmit it.'};
    return {label:'Not verified', icon:'fa-id-card', note:'Submit your NJ real-estate license number for manual verification.'};
  }

  function findAnchor() {
    return document.getElementById('ac-profile-editor') || document.querySelector('#ac-app .ac-section') || document.querySelector('#ac-app .ac-security');
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
    var license = row && row.license_number || '';
    var section = document.createElement('section');
    section.id = 'ac-professional-verification';
    section.className = 'ac-section acp-editor';
    section.innerHTML =
      '<header class="acp-header"><div><span>PROFESSIONAL VERIFICATION</span><h2>NJ real-estate license</h2><p>Verify professional identity without changing plan access or exposing owner/contact data.</p></div><div class="acp-source"><i class="fas ' + copy.icon + '"></i><span>' + esc(copy.label) + '</span></div></header>' +
      '<div class="acp-grid"><section class="acp-panel"><div class="acp-panel-head"><i class="fas fa-address-card"></i><div><b>License review</b><small>Manual verification against the official NJ DCA license system</small></div></div><div class="acp-fields">' +
        '<label class="acp-field"><span>NJ license number</span><input id="ac-license-number" type="text" value="' + esc(license) + '" placeholder="0562117" maxlength="14" autocomplete="off"><small>Letters, digits and an optional hyphen are accepted. Watchdog normalizes spaces before validation.</small></label>' +
        '<div class="acp-field"><span>Verification status</span><b>' + esc(copy.label) + '</b><small>' + esc(copy.note) + '</small></div>' +
        (row && row.verified_professional ? '<div class="acp-field"><span>Verified licensee</span><b>' + esc(row.licensee_name || 'Verified by Watchdog') + '</b><small>License expiration: ' + esc(dateLabel(row.license_expiration_date)) + '</small></div><div class="acp-field"><span>Watchdog re-verification due</span><b>' + esc(dateLabel(row.verification_due_at)) + '</b><small>Watchdog re-verifies at least annually, or sooner if the license expires first.</small></div>' : '') +
      '</div></section><section class="acp-panel"><div class="acp-panel-head"><i class="fas fa-shield-halved"></i><div><b>What verification does</b><small>A trust signal, not an entitlement</small></div></div><p>Verified professional status is server-owned and separate from Standard, Pro, Pro+ or Teams access. It can be used by future public agent portals and co-branded output to confirm professional identity. It does not unlock owner names, mailing addresses, or any contact-data exception.</p><p><a href="https://www.njconsumeraffairs.gov/Pages/verification.aspx" target="_blank" rel="noopener noreferrer">Open the official NJ DCA license verification system</a></p></section></div>' +
      '<div class="ac-save-row acp-save"><button id="ac-license-submit" type="button"><i class="fas fa-shield-halved"></i> ' + (row ? 'Submit for re-verification' : 'Submit for verification') + '</button><span id="ac-license-note" aria-live="polite"></span></div>';

    anchor.parentNode.insertBefore(section, anchor.nextSibling);
    var input = document.getElementById('ac-license-number');
    if (input) input.addEventListener('input', function () { input.value = normalizeLicense(input.value).slice(0,14); });
    var button = document.getElementById('ac-license-submit');
    if (button) button.addEventListener('click', submit);
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
    if (note) note.textContent = 'Submitting…';
    try {
      var result = await db.rpc('submit_my_professional_license_v1',{p_license_number:license});
      if (result.error) throw result.error;
      await load();
      var fresh = document.getElementById('ac-license-note');
      if (fresh) fresh.textContent = 'Submitted. Verification remains pending until Watchdog checks the official DCA record.';
    } catch (error) {
      if (note) note.textContent = error && error.message || 'Could not submit this license.';
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

    var profileResult = await db.from('watchdog_onboarding_profiles').select('primary_profession,status').eq('user_id',user.id).maybeSingle();
    if (profileResult.error) return;
    profile = profileResult.data || null;
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
    var app = document.getElementById('ac-app');
    if (!app) return;
    var observer = new MutationObserver(function () { window.setTimeout(render,0); });
    observer.observe(app,{childList:true,subtree:false,attributes:true,attributeFilter:['hidden']});
    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
