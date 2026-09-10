(function () {
  'use strict';

  var form = document.getElementById('wd-anchor-form');
  var complete = document.querySelector('.wd-step[data-step="complete"]');
  if (!form || !complete || !window.NJPTRSupabaseRuntime) return;

  var db;
  try { db = window.NJPTRSupabaseRuntime.createClient(); } catch (_) { return; }

  var APP_KEY = 'wd_anchor_2025_application_id';
  var steps = Array.prototype.slice.call(form.querySelectorAll('.wd-step'));
  var panelReady = false;
  var revealReady = false;
  var referralLink = '';

  function q(selector, root) { return (root || document).querySelector(selector); }
  function appId() {
    var id = '';
    try { id = String(sessionStorage.getItem(APP_KEY) || ''); } catch (_) {}
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? id : '';
  }
  function setStatus(text, error) {
    var el = q('#wd-growth-status');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'wd-growth-status' + (text ? ' is-visible' : '') + (error ? ' error' : '');
  }
  async function record(name) {
    var id = appId();
    if (!id) return false;
    try {
      var result = await db.rpc('record_my_anchor_funnel_event', { p_application_id:id, p_event_name:name });
      return !result.error;
    } catch (_) { return false; }
  }
  async function loadPoints() {
    try {
      var result = await db.rpc('get_my_watchdog_points');
      if (result.error || !result.data) return;
      var data = result.data;
      var balance = q('#wd-growth-points-balance');
      var level = q('#wd-growth-points-level');
      var next = q('#wd-growth-points-next');
      if (balance) balance.textContent = String(Number(data.balance || 0));
      if (level) level.textContent = String(data.level || 'Scout');
      if (next) {
        next.textContent = data.next_level_at == null ? 'Top level reached' : (String(Math.max(0, Number(data.next_level_at) - Number(data.balance || 0))) + ' points to the next level');
      }
    } catch (_) {}
  }
  async function loadReferral() {
    try {
      var result = await db.rpc('get_or_create_my_watchdog_referral_code');
      if (result.error || !result.data) return;
      referralLink = 'https://www.watchdogindex.com/?utm_source=watchdog_referral&utm_medium=member&utm_campaign=' + encodeURIComponent(String(result.data));
      var link = q('#wd-growth-referral-link');
      if (link) link.value = referralLink;
    } catch (_) {}
  }

  function injectPanel() {
    if (panelReady) return;
    panelReady = true;
    var wrap = document.createElement('section');
    wrap.id = 'wd-anchor-growth';
    wrap.className = 'wd-growth-panel';
    wrap.setAttribute('aria-label', 'Keep using Watchdog');
    wrap.innerHTML = [
      '<div class="wd-growth-head">',
        '<div><span class="wd-growth-kicker">ONE LAST QUESTION</span><h3>Where did you find Watchdog?</h3><p>This helps us understand which outreach is actually helping New Jersey residents.</p></div>',
        '<div class="wd-growth-earned"><strong>+10</strong><span>points earned</span></div>',
      '</div>',
      '<div class="wd-growth-source">',
        '<label for="wd-growth-source">Where did you find Watchdog? <span aria-hidden="true">*</span></label>',
        '<select id="wd-growth-source" required aria-required="true">',
          '<option value="">Choose one</option>',
          '<option value="google_search">Google or another search engine</option>',
          '<option value="facebook">Facebook</option>',
          '<option value="threads">Threads</option>',
          '<option value="instagram">Instagram</option>',
          '<option value="tiktok">TikTok</option>',
          '<option value="friend_family">Friend or family member</option>',
          '<option value="real_estate_professional">Realtor or other real estate professional</option>',
          '<option value="njpropertytaxrelief">NJPropertyTaxRelief.com</option>',
          '<option value="email_newsletter">Email or newsletter</option>',
          '<option value="other">Other</option>',
        '</select>',
        '<div id="wd-growth-other-wrap" hidden><label for="wd-growth-other">Tell us where</label><input id="wd-growth-other" maxlength="240" autocomplete="off" placeholder="Website, organization, person, event, etc."></div>',
        '<label class="wd-growth-optin"><input id="wd-growth-optin" type="checkbox"><span><strong>Keep me updated.</strong> Email me occasional Watchdog property and New Jersey tax updates. I can unsubscribe anytime.</span></label>',
        '<button id="wd-growth-save" type="button" class="wd-btn primary">Save &amp; continue in Watchdog</button>',
        '<p id="wd-growth-status" class="wd-growth-status" role="status" aria-live="polite"></p>',
      '</div>',
      '<div id="wd-growth-next" class="wd-growth-next" hidden>',
        '<div class="wd-growth-points-card">',
          '<div><span>YOUR WATCHDOG POINTS</span><strong id="wd-growth-points-balance">0</strong><small id="wd-growth-points-level">Scout</small></div>',
          '<p id="wd-growth-points-next">Keep going to reach the next level.</p>',
        '</div>',
        '<div class="wd-growth-actions">',
          '<a href="/" data-growth-action="search"><strong>Search a property</strong><span>+1 point per search, up to 5/day</span></a>',
          '<a href="/" data-growth-action="save"><strong>Save your first property</strong><span>+5 points</span></a>',
          '<a href="/onboarding/" data-growth-action="onboarding"><strong>Finish your Watchdog setup</strong><span>+10 points</span></a>',
          '<a href="/home/" data-growth-action="alerts"><strong>Turn on property alerts</strong><span>+10 points for your first alert</span></a>',
        '</div>',
        '<div class="wd-growth-referral">',
          '<span class="wd-growth-kicker">RECOMMEND WATCHDOG</span>',
          '<h3>Know someone else who could use this?</h3>',
          '<p>Share Watchdog with a friend. You earn <strong>5 points after they verify their Watchdog account</strong>. No points are awarded just for entering an email address.</p>',
          '<div class="wd-growth-referral-link"><input id="wd-growth-referral-link" readonly aria-label="Your Watchdog referral link"><button id="wd-growth-copy" type="button" class="wd-btn secondary small">Copy link</button></div>',
          '<label for="wd-growth-referral-email">Email it to someone</label>',
          '<div class="wd-growth-referral-email"><input id="wd-growth-referral-email" type="email" autocomplete="off" placeholder="friend@example.com"><button id="wd-growth-email" type="button" class="wd-btn secondary">Open email</button></div>',
          '<p class="wd-growth-privacy">The address you type here is not uploaded to Watchdog. Your email app opens with your referral link so you stay in control of the message.</p>',
        '</div>',
        '<a class="wd-growth-primary-cta" href="/" data-growth-action="continue"><span><strong>Keep protecting your property with Watchdog</strong><small>Search, save, monitor and understand any New Jersey property.</small></span><b aria-hidden="true">→</b></a>',
      '</div>'
    ].join('');

    var support = q('.wd-support-card', complete);
    if (support) complete.insertBefore(wrap, support);
    else complete.appendChild(wrap);

    q('#wd-growth-source').addEventListener('change', function () {
      var other = q('#wd-growth-other-wrap');
      other.hidden = this.value !== 'other';
      if (!other.hidden) q('#wd-growth-other').focus();
    });
    q('#wd-growth-save').addEventListener('click', saveFeedback);
    q('#wd-growth-copy').addEventListener('click', copyReferral);
    q('#wd-growth-email').addEventListener('click', emailReferral);
    wrap.addEventListener('click', function (event) {
      if (event.target.closest('[data-growth-action]')) record('watchdog_cta_clicked');
    });
  }

  async function revealNext() {
    if (!revealReady) {
      revealReady = true;
      var next = q('#wd-growth-next');
      if (next) next.hidden = false;
    }
    await Promise.all([loadPoints(), loadReferral()]);
  }

  async function loadExistingFeedback() {
    var id = appId();
    if (!id) return;
    try {
      var result = await db.from('anchor_completion_feedback').select('source_category,source_detail,marketing_opt_in_requested').eq('application_id', id).maybeSingle();
      if (result.error || !result.data) return;
      q('#wd-growth-source').value = result.data.source_category || '';
      if (result.data.source_category === 'other') {
        q('#wd-growth-other-wrap').hidden = false;
        q('#wd-growth-other').value = result.data.source_detail || '';
      }
      q('#wd-growth-optin').checked = !!result.data.marketing_opt_in_requested;
      q('#wd-growth-save').textContent = 'Update answer';
      await revealNext();
    } catch (_) {}
  }

  async function saveFeedback() {
    var id = appId();
    var source = String(q('#wd-growth-source').value || '');
    var detail = String(q('#wd-growth-other').value || '').trim();
    var optIn = !!q('#wd-growth-optin').checked;
    if (!id) return setStatus('Your saved application could not be identified. Open My applications and try again.', true);
    if (!source) return setStatus('Choose where you found Watchdog.', true);
    if (source === 'other' && detail.length < 2) return setStatus('Tell us where you found Watchdog.', true);
    var button = q('#wd-growth-save');
    button.disabled = true;
    setStatus('Saving...');
    try {
      var result = await db.rpc('record_my_anchor_completion_feedback', {
        p_application_id:id,
        p_source_category:source,
        p_source_detail:detail || null,
        p_marketing_opt_in:optIn
      });
      if (result.error) throw result.error;
      setStatus('Saved. Your application and PDF remain private in your Watchdog Vault.');
      button.textContent = 'Update answer';
      await revealNext();
    } catch (_) {
      setStatus('We could not save that answer. Your application and PDF are still safe. Try again.', true);
    } finally { button.disabled = false; }
  }

  async function copyReferral() {
    if (!referralLink) await loadReferral();
    if (!referralLink) return setStatus('Your referral link is temporarily unavailable.', true);
    try {
      await navigator.clipboard.writeText(referralLink);
      setStatus('Referral link copied.');
      record('referral_share_opened');
    } catch (_) {
      var input = q('#wd-growth-referral-link');
      input.focus(); input.select();
      setStatus('Referral link selected. Copy it from the field above.');
    }
  }

  async function emailReferral() {
    var email = String(q('#wd-growth-referral-email').value || '').trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return setStatus('Enter a valid email address to open your email app.', true);
    if (!referralLink) await loadReferral();
    if (!referralLink) return setStatus('Your referral link is temporarily unavailable.', true);
    var subject = 'A free New Jersey property tool I thought you might like';
    var body = 'I used Watchdog for New Jersey property information and property tax relief help. Here is my link if you want to try it: ' + referralLink;
    record('referral_share_opened');
    window.location.href = 'mailto:' + encodeURIComponent(email) + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  }

  function progressEvent() {
    var active = q('.wd-step.is-active', form);
    if (!active) return;
    var index = steps.indexOf(active);
    if (index < 0) return;
    var fraction = steps.length > 1 ? index / (steps.length - 1) : 0;
    if (fraction >= .25) record('progress_quarter');
    if (fraction >= .5) record('progress_half');
    if (fraction >= .75) record('progress_three_quarters');
    if (active.dataset.step === 'review') record('review_reached');
    if (active.dataset.step === 'complete') {
      injectPanel();
      record('pdf_generated');
      record('pdf_saved_to_vault');
      loadExistingFeedback();
      loadPoints();
    }
  }

  function bindExistingActions() {
    var download = q('#wd-download-pdf');
    var print = q('#wd-print-pdf');
    var property = q('.wd-property-cta', complete);
    if (download) download.addEventListener('click', function () { record('download_clicked'); }, true);
    if (print) print.addEventListener('click', function () { record('print_clicked'); }, true);
    if (property) property.addEventListener('click', function () { record('watchdog_cta_clicked'); }, true);
  }

  function init() {
    bindExistingActions();
    var firstId = appId();
    if (firstId) record('application_started');
    new MutationObserver(progressEvent).observe(form, { subtree:true, attributes:true, attributeFilter:['class'] });
    setInterval(function () {
      if (appId()) record('application_started');
    }, 5000);
    progressEvent();
  }

  init();
})();
