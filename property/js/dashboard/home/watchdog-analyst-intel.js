/* Watchdog Analyst Intel for Property Home.
   Profession-aware, evidence-led property intelligence. */
(function () {
  'use strict';
  if (window.__WATCHDOG_HOME_ANALYST_INTEL__) return;
  window.__WATCHDOG_HOME_ANALYST_INTEL__ = true;

  var PROD_URL = 'https://uvkvaxljhhngydvlrzom.supabase.co';
  var PROD_KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
  var state = {
    client: null, user: null, entitlement: null, preference: null, property: null,
    suggestions: [], suggestionsPin: '', suggestionsResolved: false,
    timer: null, evidenceTimer: null, token: 0, loading: false, queued: false, lastPin: ''
  };
  var rank = { standard: 0, agent: 1, pro: 2, pro_plus: 3, teams: 4, developer: 5 };

  var PROFESSIONS = {
    real_estate: { label: 'Real Estate Agent', icon: 'fa-house-circle-check' },
    investor: { label: 'Real Estate Investor', icon: 'fa-chart-line' },
    attorney: { label: 'Attorney', icon: 'fa-scale-balanced' },
    mortgage_lending: { label: 'Mortgage / Lending Professional', icon: 'fa-building-columns' },
    appraiser: { label: 'Appraiser', icon: 'fa-ruler-combined' },
    contractor: { label: 'Contractor', icon: 'fa-hammer' },
    property_tax_professional: { label: 'Property Tax Professional', icon: 'fa-receipt' },
    title_closing: { label: 'Title / Closing Professional', icon: 'fa-file-signature' },
    homeowner: { label: 'Homeowner', icon: 'fa-house-user' },
    other: { label: 'Property Professional', icon: 'fa-briefcase' },
    general: { label: 'General Property User', icon: 'fa-compass' }
  };

  var PROFESSION_OPTIONS = [
    ['real_estate', 'Real estate agent / professional'],
    ['investor', 'Real estate investor'],
    ['attorney', 'Attorney'],
    ['mortgage_lending', 'Mortgage / lending'],
    ['appraiser', 'Appraiser'],
    ['contractor', 'Contractor'],
    ['property_tax_professional', 'Property tax professional'],
    ['title_closing', 'Title / closing'],
    ['homeowner', 'Homeowner'],
    ['other', 'Other professional']
  ];

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(value) { var n = Number(value); return Number.isFinite(n) ? n : null; }
  function money(value) {
    var n = num(value);
    return n == null ? 'Not available' : new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD', maximumFractionDigits: 0
    }).format(n);
  }
  function pct(value, digits) {
    var n = num(value);
    return n == null ? 'Not available' : n.toFixed(digits == null ? 1 : digits) + '%';
  }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, Number(value || 0))); }
  function client() {
    if (state.client) return state.client;
    if (window.NJPTRSupabaseRuntime && window.NJPTRSupabaseRuntime.createClient) {
      state.client = window.NJPTRSupabaseRuntime.createClient();
      return state.client;
    }
    if (!window.supabase || !window.supabase.createClient) return null;
    state.client = window.supabase.createClient(PROD_URL, PROD_KEY, { auth: {
      persistSession: true, autoRefreshToken: true, detectSessionInUrl: true,
      flowType: 'pkce', storageKey: 'sb-uvkvaxljhhngydvlrzom-auth-token'
    }});
    return state.client;
  }
  function currentPin() {
    var query = new URLSearchParams(location.search).get('pin');
    if (query) return query;
    var select = document.getElementById('hm-switch');
    return select && select.value ? select.value : '';
  }
  function normalizedPlan() {
    if (state.entitlement && state.entitlement.account_role === 'developer') return 'developer';
    var value = String(state.entitlement && state.entitlement.plan_tier || 'standard').toLowerCase();
    return rank[value] == null ? 'standard' : value;
  }
  function can(required) { return (rank[normalizedPlan()] || 0) >= (rank[required] || 0); }
  function explicitProfession() {
    var pref = state.preference;
    if (!pref || pref.onboarding_complete !== true) return '';
    var value = String(pref.profession || '').trim();
    return PROFESSIONS[value] && value !== 'general' ? value : '';
  }
  function profession() { return explicitProfession() || 'general'; }
  function professionDef() { return PROFESSIONS[profession()] || PROFESSIONS.general; }
  function propertyValue() {
    var property = state.property || {};
    return num(property.watchdog_value) || num(property.assessed);
  }
  function metrics() {
    var property = state.property || {};
    var value = propertyValue(), assessed = num(property.assessed), tax = num(property.last_year_tax);
    return {
      value: value,
      assessed: assessed,
      tax: tax,
      monthlyTax: tax != null ? tax / 12 : null,
      taxLoad: value && tax != null ? tax / value * 100 : null,
      assessedToValue: value && assessed != null ? assessed / value * 100 : null,
      onePercentValue: value ? value * 0.01 : null,
      appeal: property.has_appeal_case === true
    };
  }
  function topSuggestion() {
    return (state.suggestions || []).slice().sort(function (a, b) {
      if (!!a.limited_evidence !== !!b.limited_evidence) return a.limited_evidence ? 1 : -1;
      return Number(b.score || 0) - Number(a.score || 0);
    })[0] || null;
  }
  function urgencyCopy(m, suggestion) {
    if (suggestion) {
      var band = suggestion.attention_band === 'act_now' ? 'Act now' : suggestion.attention_band === 'this_week' ? 'This week' : 'Watch';
      return band + ' signal. Watchdog scored this review finding ' + Math.round(clamp(suggestion.score, 0, 100)) + '/100 with ' + Math.round(clamp(suggestion.evidence_coverage, 0, 100)) + '% evidence coverage. Review the evidence before acting.';
    }
    if (m.appeal) return 'This record already carries an appeal-case indicator. That is a reason to review the supporting assessment evidence, not a guarantee of a reduction.';
    if (m.taxLoad != null && m.taxLoad >= 2.5) return 'Property taxes equal about ' + pct(m.taxLoad) + ' of the current Watchdog value context each year. That carrying-cost load deserves attention in affordability, yield, or client strategy.';
    return 'No high-urgency governed finding is present for this property right now. Watchdog will keep monitoring rather than manufacture urgency.';
  }
  function financialCopy(role, m) {
    if (role === 'investor') return 'Annual property tax is ' + money(m.tax) + (m.monthlyTax != null ? ' (' + money(m.monthlyTax) + '/month)' : '') + (m.taxLoad != null ? ', about ' + pct(m.taxLoad) + ' of Watchdog value context. ' : '. ') + (m.onePercentValue != null ? 'A 1% change in property value is roughly ' + money(m.onePercentValue) + '. Use these as real carrying-cost and sensitivity inputs when you model purchase price, rehab, financing, rent, and exit ROI.' : 'Add a verified value before relying on return sensitivity.');
    if (role === 'real_estate') return 'The property carries ' + money(m.tax) + ' in annual tax' + (m.monthlyTax != null ? ', about ' + money(m.monthlyTax) + ' per month' : '') + '. ' + (m.onePercentValue != null ? 'A 1% pricing movement is roughly ' + money(m.onePercentValue) + ', giving you a concrete scale for pricing and negotiation conversations.' : 'Watchdog will add pricing sensitivity when a usable value context is available.');
    if (role === 'mortgage_lending') return 'Current annual property tax is ' + money(m.tax) + (m.monthlyTax != null ? ', about ' + money(m.monthlyTax) + ' per month before insurance and other escrow items.' : '.') + (m.taxLoad != null ? ' Tax load is about ' + pct(m.taxLoad) + ' of Watchdog value context.' : '') + ' Use the verified tax figure in affordability and escrow review rather than relying on a generic estimate.';
    if (role === 'attorney' || role === 'property_tax_professional') return 'Assessment is ' + money(m.assessed) + ' against a Watchdog value context of ' + money(m.value) + (m.assessedToValue != null ? ', an assessment-to-value relationship of about ' + pct(m.assessedToValue) + '.' : '.') + ' Annual tax is ' + money(m.tax) + '. Treat these as review inputs and inspect source lineage before forming a legal or appeal conclusion.';
    if (role === 'appraiser') return 'Assessment is ' + money(m.assessed) + ' and Watchdog value context is ' + money(m.value) + (m.assessedToValue != null ? ', placing assessment at about ' + pct(m.assessedToValue) + ' of that context.' : '.') + ' This is a screening relationship, not an appraisal or replacement for a supported opinion of value.';
    if (role === 'title_closing') return 'Annual tax is ' + money(m.tax) + (m.monthlyTax != null ? ', roughly ' + money(m.monthlyTax) + ' per month.' : '.') + ' Keep tax, assessment, and current change signals in the diligence file so settlement assumptions use the current property record.';
    if (role === 'contractor') return 'Watchdog value context is ' + money(m.value) + (m.onePercentValue != null ? '; 1% of that value is about ' + money(m.onePercentValue) + '.' : '.') + ' Use this only as project-scale context. Renovation ROI still depends on scope, cost, market response, permits, and verified post-work value.';
    if (role === 'homeowner') return 'Current property tax is ' + money(m.tax) + (m.monthlyTax != null ? ', about ' + money(m.monthlyTax) + ' per month.' : '.') + (m.taxLoad != null ? ' That equals about ' + pct(m.taxLoad) + ' of Watchdog value context per year.' : '') + ' Watchdog will flag meaningful assessment and property-record changes as the evidence changes.';
    return 'Current assessment is ' + money(m.assessed) + ', annual property tax is ' + money(m.tax) + ', and Watchdog value context is ' + money(m.value) + '. Set your profession to turn these same facts into a workflow-specific financial lens.';
  }
  function innovationCopy(role) {
    var map = {
      real_estate: 'Turn the property into a client conversation brief: tax carrying cost, assessment context, the current Watchdog finding, and one evidence-backed next question. Use the facts to create a reason to call, not a generic sales script.',
      investor: 'Use Watchdog as a pre-underwriting layer. Carry verified annual tax into purchase, rehab, rent, financing, and exit scenarios, then stress-test the deal before spending time on deeper diligence.',
      attorney: 'Build an evidence-first review packet from source facts, missing evidence, model lineage, and change history. Reduce fact collection time while keeping the professional conclusion human-controlled.',
      mortgage_lending: 'Use property-tax intelligence before final underwriting. Current tax, monthly escrow equivalent, change signals, and property-record inconsistencies can be reviewed before they become closing surprises.',
      appraiser: 'Use Watchdog as a research accelerator. Surface assessment/value divergence, change history, and source-backed anomalies before selecting the records that deserve deeper appraisal analysis.',
      contractor: 'Pair property context with permit and change intelligence to identify where project assumptions need verification. Watchdog should tell you what to investigate before you price the opportunity.',
      property_tax_professional: 'Create a repeatable triage queue from assessment relationships, evidence coverage, missing records, and current tax burden. Spend professional time on properties with the strongest review signal.',
      title_closing: 'Use Watchdog as a pre-closing exception screen. Bring tax, assessment, ownership context, permit/change signals, and missing evidence into one review trail before the file reaches the last mile.',
      homeowner: 'Use Watchdog as a property memory. Keep the current tax and assessment baseline, then let monitored changes tell you when there is something worth reviewing instead of repeatedly searching records.',
      other: 'Use the property as a governed decision file: financial context, current evidence-backed signals, missing evidence, and a documented next action.',
      general: 'Set your profession and Watchdog will rebuild this panel around the financial questions, risks, opportunities, and next actions that matter in your work.'
    };
    return map[role] || map.general;
  }
  function nextActionCopy(role, suggestion) {
    if (suggestion) return 'Inspect why Watchdog flagged this property, then decide whether the finding belongs in a case, report, watchlist action, client conversation, or no action at all.';
    var map = {
      real_estate: 'Review the tax and value story, then decide whether this creates a useful buyer, seller, sphere, or prospect conversation.',
      investor: 'Carry the verified tax into your deal assumptions and test whether the property still clears your required return before deeper underwriting.',
      attorney: 'Open the evidence trail and identify what is proven, what is derived, and what is still missing before creating a case position.',
      mortgage_lending: 'Carry current tax into escrow and affordability review, then monitor for assessment or municipal changes that can alter the payment story.',
      appraiser: 'Use the divergence screen to choose which records need source verification and comparable research.',
      contractor: 'Review property and permit context before estimating scope, timeline, or value impact.',
      property_tax_professional: 'Review assessment evidence and missing inputs before deciding whether this belongs in an appeal or advisory workflow.',
      title_closing: 'Check the current property record and change timeline before relying on tax or diligence assumptions.',
      homeowner: 'Keep monitoring. If Watchdog produces a stronger assessment or change signal, open the evidence before taking action.',
      other: 'Open Data Workbench to inspect the property record and evidence in detail.',
      general: 'Choose your profession first. Watchdog will then recommend the workflow-specific next action.'
    };
    return map[role] || map.general;
  }
  function evidenceCopy(suggestion) {
    if (!suggestion) return can('pro')
      ? 'No current governed model finding rose into the property queue. This is a valid result. Watchdog continues to monitor the evidence and will surface a finding when the facts justify one.'
      : 'Your account can use the profession-aware property brief. Governed model scoring and deeper evidence-backed findings begin with Pro.';
    return suggestion.why_now + ' Confidence ' + Math.round(clamp(suggestion.confidence, 0, 100)) + '%. Evidence coverage ' + Math.round(clamp(suggestion.evidence_coverage, 0, 100)) + '%.' + (suggestion.limited_evidence ? ' Evidence is limited, so Watchdog is intentionally reducing certainty.' : ' Required evidence coverage is adequate for this review finding.');
  }
  function card(icon, label, title, copy, className) {
    return '<article class="wdai-card ' + (className || '') + '"><div class="wdai-card-icon"><i class="fas ' + icon + '"></i></div><div><span>' + esc(label) + '</span><h3>' + esc(title) + '</h3><p>' + esc(copy) + '</p></div></article>';
  }
  function rolePrompt() {
    return '<section class="wdai-role-prompt"><div><span>PERSONALIZATION REQUIRED FOR EXACT INTEL</span><h3>What is your primary profession?</h3><p>Without a stated profession, Watchdog keeps this property brief generalized. Choose one and the same governed facts will be rebuilt around your financial, risk, opportunity, and workflow priorities.</p></div><div class="wdai-role-controls"><select id="wdai-profession" aria-label="Primary profession"><option value="">Choose profession</option>' + PROFESSION_OPTIONS.map(function (option) { return '<option value="' + esc(option[0]) + '">' + esc(option[1]) + '</option>'; }).join('') + '</select><button type="button" id="wdai-save-profession">Personalize my Intel</button></div><small id="wdai-role-note" aria-live="polite">Your profession personalizes recommendations. It does not change billing or authorization.</small></section>';
  }
  function render() {
    var panel = document.querySelector('#hm-body .ai');
    if (!panel || !state.user || !state.property) return;
    var role = profession(), def = professionDef(), m = metrics(), suggestion = topSuggestion(), exact = !!explicitProfession();
    var address = state.property.address || 'Current property';
    panel.classList.add('wdai');
    panel.setAttribute('data-watchdog-analyst-intel', role);
    panel.innerHTML =
      '<header class="wdai-head"><div class="wdai-mark"><i class="fas fa-dog"></i><i class="fas fa-wand-magic-sparkles"></i></div><div class="wdai-title"><span>WATCHDOG ANALYST INTEL</span><h2>' + esc(address) + '</h2><p>' + (exact ? 'Built for a ' + esc(def.label) + ' using this property’s governed records.' : 'Generalized property intelligence until you tell Watchdog how you work.') + '</p></div><div class="wdai-persona"><i class="fas ' + esc(def.icon) + '"></i><span><small>Perspective</small><b>' + esc(exact ? def.label : 'Generalized') + '</b></span></div></header>' +
      (exact ? '<div class="wdai-role-set"><i class="fas fa-circle-check"></i><span>Profession-aware Intel is active for <b>' + esc(def.label) + '</b>.</span><a href="/property/account">Change profession</a></div>' : rolePrompt()) +
      '<div class="wdai-grid">' +
        card('fa-coins', 'FINANCIAL LENS', 'What the numbers mean for you', financialCopy(role, m), 'money') +
        card('fa-bolt', 'MOTIVATION', 'Why this property deserves attention', urgencyCopy(m, suggestion), 'motivation') +
        card('fa-lightbulb', 'INNOVATION', 'A smarter way to use this property', innovationCopy(role), 'innovation') +
        card('fa-shield-halved', 'EVIDENCE', suggestion ? 'What Watchdog is seeing' : 'What Watchdog can prove now', evidenceCopy(suggestion), 'evidence') +
      '</div>' +
      '<section class="wdai-next"><div><span>NEXT BEST ACTION</span><h3>' + esc(nextActionCopy(role, suggestion)) + '</h3><p>Watchdog is decision support. Source facts, missing evidence, and professional judgment stay visible.</p></div><div class="wdai-actions">' +
        (suggestion ? '<button type="button" id="wdai-open-evidence"><i class="fas fa-magnifying-glass-chart"></i> Why Watchdog?</button>' : '') +
        '<a href="/property/data-workbench"><i class="fas fa-table-list"></i> Open Data Workbench</a>' +
        (can('pro') ? '<a class="primary" href="/property/intelligence"><i class="fas fa-wand-magic-sparkles"></i> Intelligence Hub</a>' : '<a class="primary" href="/property/pro#plans"><i class="fas fa-lock"></i> Unlock Pro Intelligence</a>') +
      '</div></section>';

    var save = document.getElementById('wdai-save-profession');
    if (save) save.addEventListener('click', saveProfession);
    var evidence = document.getElementById('wdai-open-evidence');
    if (evidence && suggestion) evidence.addEventListener('click', function () {
      if (window.WatchdogContextIntelligence && window.WatchdogContextIntelligence.open) window.WatchdogContextIntelligence.open(suggestion);
    });
  }
  async function saveProfession() {
    var select = document.getElementById('wdai-profession'), note = document.getElementById('wdai-role-note');
    var value = select && String(select.value || '').trim();
    if (!value || !PROFESSIONS[value] || value === 'general') {
      if (note) note.textContent = 'Choose the profession that best matches how you use Watchdog.';
      return;
    }
    var sb = client();
    if (!sb || !state.user) return;
    if (note) note.textContent = 'Personalizing this property…';
    if (select) select.disabled = true;
    var button = document.getElementById('wdai-save-profession');
    if (button) button.disabled = true;
    var result = await sb.from('professional_preferences').upsert({
      user_id: state.user.id, profession: value, onboarding_complete: true, updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' }).select('profession,onboarding_complete,updated_at').single();
    if (result.error) {
      if (note) note.textContent = 'Watchdog could not save your profession. Use Account to update it.';
      if (select) select.disabled = false;
      if (button) button.disabled = false;
      return;
    }
    state.preference = result.data;
    render();
    window.dispatchEvent(new CustomEvent('watchdog:profession-updated', { detail: { profession: value } }));
  }
  async function fallbackSuggestions(pinValue) {
    if (!can('pro') || state.suggestionsResolved || state.suggestionsPin !== pinValue || !state.user) return;
    var sb = client();
    if (!sb) return;
    try {
      var result = await sb.functions.invoke('intelligence-context-suggestions', { body: {
        surface: 'home', scope_type: 'property', pams_pins: [pinValue], context_key: 'home-analyst-intel:' + pinValue, limit: 6
      }});
      if (state.lastPin !== pinValue) return;
      state.suggestionsResolved = true;
      state.suggestions = !result.error && result.data && Array.isArray(result.data.suggestions) ? result.data.suggestions : [];
      render();
    } catch (_error) {
      state.suggestionsResolved = true;
    }
  }
  function scheduleEvidenceFallback(pinValue) {
    clearTimeout(state.evidenceTimer);
    if (!can('pro')) return;
    state.evidenceTimer = setTimeout(function () { fallbackSuggestions(pinValue); }, 1800);
  }
  async function refresh(force) {
    var pinValue = currentPin(), panel = document.querySelector('#hm-body .ai');
    if (!pinValue) return;
    if (!force && state.lastPin === pinValue && state.property && panel && panel.hasAttribute('data-watchdog-analyst-intel')) return;
    if (state.loading) { state.queued = true; return; }
    var sb = client();
    if (!sb) return;
    state.loading = true;
    var token = ++state.token;
    try {
      var auth = await sb.auth.getUser();
      if (token !== state.token) return;
      state.user = auth && auth.data && auth.data.user;
      if (!state.user) return;
      var parts = await Promise.all([
        sb.rpc('get_my_entitlement'),
        sb.from('professional_preferences').select('profession,onboarding_complete,updated_at').eq('user_id', state.user.id).maybeSingle(),
        sb.from('saved_properties').select('pams_pin,kind,address,town,county,zip,assessed,last_year_tax,effective_rate,watchdog_value,has_appeal_case,verify_level,verified,updated_at').eq('user_id', state.user.id).eq('pams_pin', pinValue).limit(1).maybeSingle()
      ]);
      if (token !== state.token) return;
      var ent = parts[0] && parts[0].data || [];
      state.entitlement = Array.isArray(ent) ? ent[0] : ent;
      state.preference = parts[1] && !parts[1].error ? parts[1].data : null;
      state.property = parts[2] && !parts[2].error ? parts[2].data : null;
      if (!state.property) return;
      if (state.lastPin !== pinValue) {
        state.suggestions = [];
        state.suggestionsPin = pinValue;
        state.suggestionsResolved = false;
      }
      state.lastPin = pinValue;
      render();
      scheduleEvidenceFallback(pinValue);
    } catch (error) {
      console.warn('Watchdog Analyst Intel unavailable:', error && error.message || error);
    } finally {
      state.loading = false;
      if (state.queued) { state.queued = false; schedule(120, true); }
    }
  }
  function schedule(delay, force) {
    clearTimeout(state.timer);
    state.timer = setTimeout(function () { refresh(!!force); }, delay == null ? 180 : delay);
  }
  function installMobileIntel() {
    var attempts = 0;
    var timer = setInterval(function () {
      attempts++;
      if (typeof window.hmIntelClose === 'function') {
        clearInterval(timer);
        window.hmAgentIntel = function () {
          var panel = document.querySelector('#hm-body .ai'), mobile = window.matchMedia && window.matchMedia('(max-width: 760px)').matches;
          if (mobile && panel) {
            var overlay = document.getElementById('hm-mobile-intel-overlay'), content = document.getElementById('hm-mobile-intel-content');
            if (!overlay || !content) return;
            content.innerHTML = panel.outerHTML;
            var cloned = content.querySelector('.ai'); if (cloned) cloned.classList.add('ai-mobile');
            var heading = content.querySelector('.wdai-title span'); if (heading) heading.id = 'hm-mobile-intel-title';
            overlay.classList.add('open'); overlay.setAttribute('aria-hidden', 'false');
            document.body.classList.add('mobile-intel-open');
            var close = overlay.querySelector('.mobile-intel-close'); if (close) close.focus();
            return;
          }
          if (panel && panel.scrollIntoView) panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        };
      }
      if (attempts > 80) clearInterval(timer);
    }, 100);
  }
  function boot() {
    var body = document.getElementById('hm-body');
    if (body) new MutationObserver(function (records) {
      var external = records.some(function (record) {
        var target = record.target && record.target.nodeType === 1 ? record.target : record.target && record.target.parentElement;
        return !target || !target.closest || !target.closest('[data-watchdog-analyst-intel]');
      });
      if (external) schedule(260, false);
    }).observe(body, { childList: true, subtree: true });
    document.addEventListener('change', function (event) {
      if (event.target && event.target.id === 'hm-switch') {
        state.lastPin = '';
        state.suggestionsResolved = false;
        schedule(100, true);
      }
    });
    window.addEventListener('watchdog:context-suggestions', function (event) {
      var detail = event && event.detail || {}, ctx = detail.context || {}, data = detail.data || {}, pins = ctx.pams_pins || [];
      if (ctx.surface !== 'home' || pins.indexOf(currentPin()) < 0 || !Array.isArray(data.suggestions)) return;
      state.suggestionsPin = currentPin();
      state.suggestionsResolved = true;
      state.suggestions = data.suggestions;
      clearTimeout(state.evidenceTimer);
      render();
    });
    installMobileIntel();
    schedule(400, true);
  }
  window.WatchdogHomeAnalystIntel = {
    refresh: function () { return refresh(true); },
    profession: profession,
    state: function () { return state; }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
