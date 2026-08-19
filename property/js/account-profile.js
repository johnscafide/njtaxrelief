(function () {
  'use strict';

  if (!window.NJPTRSupabaseRuntime) return;
  var db = window.NJPTRSupabaseRuntime.createClient();
  var currentUser = null;
  var profile = null;
  var loading = false;
  var saving = false;
  var observer = null;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  function title(value) {
    return String(value || '').replace(/_/g,' ').replace(/\b\w/g,function(c){ return c.toUpperCase(); });
  }

  function selected(value, expected) { return value === expected ? ' selected' : ''; }
  function checked(list, value) { return Array.isArray(list) && list.indexOf(value) >= 0 ? ' checked' : ''; }

  function option(value, label, current) {
    return '<option value="' + esc(value) + '"' + selected(current,value) + '>' + esc(label) + '</option>';
  }

  function selectField(id, label, value, options, note) {
    return '<label class="acp-field"><span>' + esc(label) + '</span><select id="' + id + '">' +
      options.map(function (item) { return option(item[0],item[1],value); }).join('') +
      '</select>' + (note ? '<small>' + esc(note) + '</small>' : '') + '</label>';
  }

  function inputField(id, label, value, type, placeholder, note, attrs) {
    return '<label class="acp-field"><span>' + esc(label) + '</span><input id="' + id + '" type="' + esc(type || 'text') + '" value="' + esc(value || '') + '" placeholder="' + esc(placeholder || '') + '" ' + (attrs || '') + '>' +
      (note ? '<small>' + esc(note) + '</small>' : '') + '</label>';
  }

  function chips(group, values, options) {
    return '<div class="acp-chips">' + options.map(function (item) {
      return '<label><input type="checkbox" data-acp-list="' + group + '" value="' + esc(item[0]) + '"' + checked(values,item[0]) + '><span>' + esc(item[1]) + '</span></label>';
    }).join('') + '</div>';
  }

  function metadataProfile() {
    return currentUser && currentUser.user_metadata && currentUser.user_metadata.watchdog_profile || {};
  }

  function needsProfession() {
    var persona = document.getElementById('acp-persona');
    return persona && (persona.value === 'professional' || persona.value === 'both');
  }

  function syncConditionalFields() {
    var professional = needsProfession();
    document.querySelectorAll('[data-acp-professional]').forEach(function (node) { node.hidden = !professional; });
    var housing = document.querySelector('[data-acp-housing]');
    if (housing) housing.hidden = !!(document.getElementById('acp-persona') && document.getElementById('acp-persona').value === 'professional');
  }

  function completionPercent(row) {
    if (!row) return 0;
    var checks = [
      !!row.contact_email,
      !!row.persona,
      !!row.location_zip,
      Array.isArray(row.goals) && row.goals.length > 0,
      Array.isArray(row.property_types) && row.property_types.length > 0,
      !!row.time_horizon
    ];
    if (row.persona === 'professional' || row.persona === 'both') {
      checks.push(!!row.primary_profession);
      checks.push(Array.isArray(row.markets) && row.markets.length > 0);
      checks.push(Array.isArray(row.professional_priorities) && row.professional_priorities.length > 0);
    }
    return Math.round(checks.filter(Boolean).length / checks.length * 100);
  }

  function refreshHero() {
    var completion = document.querySelector('.ac-completion');
    if (!completion || !profile) return;
    var pct = completionPercent(profile);
    var number = completion.querySelector('b');
    var label = completion.querySelector('span');
    var bar = completion.querySelector('em');
    if (number) number.textContent = pct + '%';
    if (label) label.textContent = 'Watchdog profile complete';
    if (bar) bar.style.width = pct + '%';
  }

  function renderEditor(host) {
    var row = profile || {};
    var meta = metadataProfile();
    var persona = row.persona || 'homeowner';
    var email = row.contact_email || (currentUser && currentUser.email) || '';
    var marketsText = Array.isArray(row.markets) ? row.markets.join(', ') : '';
    var isProfessional = persona === 'professional' || persona === 'both';

    host.className = 'ac-section acp-editor';
    host.id = 'ac-profile-editor';
    host.innerHTML =
      '<header class="acp-header"><div><span>ABOUT YOU</span><h2>Your Watchdog profile</h2><p>Keep the context Watchdog uses to personalize your workspace current. Property facts and paid access remain governed separately.</p></div><div class="acp-source"><i class="fas fa-user-check"></i><span>User-confirmed</span></div></header>' +
      '<div class="acp-grid">' +
        '<section class="acp-panel"><div class="acp-panel-head"><i class="fas fa-address-card"></i><div><b>Account &amp; contact</b><small>How Watchdog knows and contacts you</small></div></div><div class="acp-fields">' +
          inputField('acp-name','Preferred name',meta.preferred_name || (currentUser && currentUser.user_metadata && currentUser.user_metadata.full_name) || '','text','Your name','Display preference only.','autocomplete="name" maxlength="80"') +
          inputField('acp-contact-email','Contact email',email,'email','you@example.com','Separate from your social sign-in identity and from marketing consent.','autocomplete="email" maxlength="254"') +
          inputField('acp-phone','Phone',meta.phone || '','tel','(555) 555-5555','Optional profile contact detail.','autocomplete="tel" maxlength="40"') +
          inputField('acp-zip','Main NJ ZIP',row.location_zip || '','text','08081','Sets your geographic starting point.','inputmode="numeric" maxlength="5"') +
        '</div></section>' +
        '<section class="acp-panel"><div class="acp-panel-head"><i class="fas fa-compass"></i><div><b>How you use Watchdog</b><small>Your default workspace and property focus</small></div></div><div class="acp-fields">' +
          selectField('acp-persona','Account use',persona,[['homeowner','Homeowner'],['renter','Renter'],['professional','Professional'],['both','Personal + professional'],['investor','Investor'],['planning_to_buy','Planning to buy']]) +
          '<div data-acp-housing>' + selectField('acp-home-status','Housing situation',row.home_status || '',[['','Not specified'],['own','Own my home'],['rent','Rent'],['own_and_invest','Own + invest'],['rent_and_invest','Rent + own investments'],['planning_to_buy','Planning to buy'],['other','Other']]) + '</div>' +
          selectField('acp-time','Time horizon',row.time_horizon || 'researching',[['now','Right now'],['0_3_months','Next 3 months'],['3_6_months','3–6 months'],['6_12_months','6–12 months'],['12_plus_months','More than a year'],['researching','Exploring / researching']]) +
          '<label class="acp-field acp-wide"><span>Markets, towns or counties</span><input id="acp-markets" value="' + esc(marketsText) + '" placeholder="Camden County, Gloucester County"><small>Separate multiple markets with commas.</small></label>' +
        '</div></section>' +
      '</div>' +
      '<section class="acp-choice-panel"><div class="acp-panel-head"><i class="fas fa-bullseye"></i><div><b>What matters most</b><small>Watchdog uses these choices to organize recommendations and defaults</small></div></div><div class="acp-choice-group"><span>Goals</span>' +
        chips('goals',row.goals || [],[['monitor_property','Monitor property changes'],['lower_property_tax','Understand property taxes'],['buy','Buy smarter'],['sell','Prepare to sell'],['invest','Find opportunities'],['client_research','Research for clients'],['prospecting','Prospecting / farming'],['due_diligence','Property due diligence'],['appeals','Assessment / appeal work']]) +
        '</div><div class="acp-choice-group"><span>Property focus</span>' +
        chips('property_types',row.property_types || [],[['single_family','Single-family'],['condo_townhome','Condo / townhome'],['multifamily','Multi-family'],['commercial','Commercial'],['land','Land'],['mixed','A mix of property types']]) + '</div></section>' +
      '<section class="acp-panel acp-professional" data-acp-professional' + (isProfessional ? '' : ' hidden') + '><div class="acp-panel-head"><i class="fas fa-briefcase"></i><div><b>Professional Intelligence</b><small>Role and workflow context used by Watchdog Intelligence</small></div></div><div class="acp-fields">' +
        selectField('acp-profession','Primary profession',row.primary_profession || 'real_estate',[['real_estate','Real estate agent / broker'],['mortgage_lending','Mortgage lender / broker'],['attorney','Attorney'],['appraiser','Appraiser'],['property_tax_professional','Property tax professional'],['title_closing','Title / closing'],['contractor','Contractor / developer'],['accountant','Accountant / CPA'],['insurance','Insurance professional'],['property_manager','Property manager'],['investor','Real estate investor'],['other','Other professional']]) +
        selectField('acp-years','Experience',row.professional_years_band || 'new',[['new','Less than 1 year'],['1_3','1–3 years'],['4_7','4–7 years'],['8_15','8–15 years'],['16_plus','16+ years']]) +
        selectField('acp-volume','Monthly workflow volume',row.professional_volume_band || 'not_applicable',[['under_5','Under 5'],['5_14','5–14'],['15_29','15–29'],['30_59','30–59'],['60_plus','60+'],['not_applicable','Not measured this way']]) +
        '<div class="acp-field acp-wide"><span>Where should Intelligence help first?</span>' + chips('professional_priorities',row.professional_priorities || [],[['lead_prioritization','Prioritize opportunities'],['client_briefs','Build client briefs'],['property_change','Catch property changes'],['tax_assessment','Assessment / tax analysis'],['listing_prep','Listing preparation'],['buyer_diligence','Buyer due diligence'],['portfolio_monitoring','Portfolio monitoring'],['workflow_automation','Reduce repetitive research']]) + '</div>' +
      '</div></section>' +
      '<details class="acp-private"><summary><div><i class="fas fa-lock"></i><span><b>Private household context</b><small>Optional-to-disclose ranges from onboarding</small></span></div><i class="fas fa-chevron-down"></i></summary><div class="acp-private-note"><i class="fas fa-shield-halved"></i><p>Age, income and household size stay in your first-party profile. Watchdog does not copy these fields into housing-targeting or professional Intelligence assumptions.</p></div><div class="acp-fields">' +
        selectField('acp-age','Age range',row.age_band || 'prefer_not',[['18_24','18–24'],['25_34','25–34'],['35_44','35–44'],['45_54','45–54'],['55_64','55–64'],['65_74','65–74'],['75_plus','75+'],['prefer_not','Prefer not to say']]) +
        selectField('acp-income','Household income range',row.household_income_band || 'prefer_not',[['under_50k','Under $50k'],['50_99k','$50k–$99k'],['100_149k','$100k–$149k'],['150_249k','$150k–$249k'],['250k_plus','$250k+'],['prefer_not','Prefer not to say']]) +
        selectField('acp-household','Household size',row.household_size ? String(row.household_size) : '',[['','Prefer not to say'],['1','1'],['2','2'],['3','3'],['4','4'],['5','5'],['6','6+']]) +
      '</div></details>' +
      '<div class="acp-intel"><label><input id="acp-intel" type="checkbox"' + (row.intelligence_personalization !== false ? ' checked' : '') + '><span><b>Personalize Watchdog Intelligence with my approved profile context</b><small>Only operational context such as role, markets, goals and workflow priorities is used. This never changes source facts or plan access.</small></span></label></div>' +
      '<div class="ac-save-row acp-save"><button id="acp-save" type="button"><i class="fas fa-check"></i> Save Watchdog profile</button><span id="acp-note" aria-live="polite"></span></div>';

    var personaSelect = document.getElementById('acp-persona');
    if (personaSelect) personaSelect.addEventListener('change',syncConditionalFields);
    var zip = document.getElementById('acp-zip');
    if (zip) zip.addEventListener('input',function(){ zip.value = zip.value.replace(/\D/g,'').slice(0,5); });
    var save = document.getElementById('acp-save');
    if (save) save.addEventListener('click',saveProfile);
    syncConditionalFields();
    refreshHero();
  }

  function findLegacySection() {
    var app = document.getElementById('ac-app');
    if (!app || app.hidden) return null;
    var current = document.getElementById('ac-profile-editor');
    if (current) return current;
    var sections = app.querySelectorAll('.ac-section');
    for (var i=0;i<sections.length;i++) {
      var header = sections[i].querySelector('header span');
      if (header && String(header.textContent || '').trim() === 'PERSONALIZATION') return sections[i];
    }
    return null;
  }

  function mount() {
    var legacy = findLegacySection();
    if (!legacy) return;
    if (legacy.id !== 'ac-profile-editor') {
      var replacement = document.createElement('section');
      legacy.replaceWith(replacement);
      legacy = replacement;
    }
    if (profile && currentUser) renderEditor(legacy);
    else legacy.innerHTML = '<header><div><span>ABOUT YOU</span><h2>Your Watchdog profile</h2><p>Loading your confirmed onboarding context…</p></div></header>';
  }

  function valuesFor(group) {
    return Array.from(document.querySelectorAll('[data-acp-list="' + group + '"]:checked')).map(function (node) { return node.value; });
  }

  function value(id) {
    var node = document.getElementById(id);
    return node ? String(node.value || '').trim() : '';
  }

  function validEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }

  async function saveProfile() {
    if (saving) return;
    var note = document.getElementById('acp-note');
    var button = document.getElementById('acp-save');
    var contactEmail = value('acp-contact-email').toLowerCase();
    var zip = value('acp-zip');
    if (!validEmail(contactEmail)) { if (note) note.textContent = 'Enter a valid contact email.'; return; }
    if (zip && !/^\d{5}$/.test(zip)) { if (note) note.textContent = 'Enter a five digit ZIP code.'; return; }

    var persona = value('acp-persona');
    var professional = persona === 'professional' || persona === 'both';
    var markets = value('acp-markets').split(',').map(function(v){ return v.trim(); }).filter(Boolean).slice(0,20);
    if (!markets.length && zip) markets = [zip];
    var household = value('acp-household');
    var payload = {
      contact_email: contactEmail,
      persona: persona,
      primary_profession: professional ? value('acp-profession') : null,
      home_status: persona === 'professional' ? null : (value('acp-home-status') || null),
      age_band: value('acp-age') || 'prefer_not',
      household_income_band: value('acp-income') || 'prefer_not',
      household_size: household ? Number(household) : null,
      location_zip: zip || null,
      markets: markets,
      goals: valuesFor('goals'),
      property_types: valuesFor('property_types'),
      time_horizon: value('acp-time') || null,
      professional_years_band: professional ? value('acp-years') : null,
      professional_volume_band: professional ? value('acp-volume') : null,
      professional_priorities: professional ? valuesFor('professional_priorities') : [],
      intelligence_personalization: !!(document.getElementById('acp-intel') && document.getElementById('acp-intel').checked)
    };
    if (!payload.goals.length) { if (note) note.textContent = 'Choose at least one goal.'; return; }
    if (!payload.property_types.length) { if (note) note.textContent = 'Choose at least one property type.'; return; }
    if (professional && !payload.professional_priorities.length) { if (note) note.textContent = 'Choose at least one professional Intelligence priority.'; return; }

    saving = true;
    if (button) button.disabled = true;
    if (note) note.textContent = 'Saving…';
    try {
      var rpc = await db.rpc('update_my_watchdog_profile_v1',{ payload:payload });
      if (rpc.error) throw rpc.error;

      var existingMeta = currentUser.user_metadata || {};
      var existingWatchdog = existingMeta.watchdog_profile || {};
      var metadata = Object.assign({},existingMeta,{
        watchdog_profile:Object.assign({},existingWatchdog,{
          preferred_name:value('acp-name'),
          phone:value('acp-phone'),
          home_zip:zip,
          updated_at:new Date().toISOString()
        })
      });
      var authUpdate = await db.auth.updateUser({ data:metadata });
      if (authUpdate.error) throw authUpdate.error;
      currentUser = authUpdate.data.user || currentUser;
      await loadProfile(true);
      var freshNote = document.getElementById('acp-note');
      if (freshNote) freshNote.textContent = 'Saved. Watchdog Intelligence has refreshed your approved context.';
    } catch (error) {
      if (note) note.textContent = error && error.message || 'Could not save your Watchdog profile.';
    } finally {
      saving = false;
      if (button) button.disabled = false;
    }
  }

  async function loadProfile(force) {
    if (loading && !force) return;
    loading = true;
    try {
      var sessionResult = await db.auth.getSession();
      currentUser = sessionResult && sessionResult.data && sessionResult.data.session && sessionResult.data.session.user;
      if (!currentUser) return;
      var result = await db.from('watchdog_onboarding_profiles')
        .select('contact_email,contact_email_confirmed_at,persona,primary_profession,home_status,age_band,household_income_band,household_size,location_zip,markets,goals,property_types,time_horizon,professional_years_band,professional_volume_band,professional_priorities,intelligence_personalization,grandfathered,updated_at')
        .eq('user_id',currentUser.id)
        .maybeSingle();
      if (result.error) throw result.error;
      profile = result.data || {
        contact_email:currentUser.email || '', persona:'homeowner', age_band:'prefer_not', household_income_band:'prefer_not',
        markets:[], goals:['monitor_property'], property_types:['single_family'], time_horizon:'researching', professional_priorities:[], intelligence_personalization:true
      };
      mount();
    } catch (error) {
      var host = findLegacySection();
      if (host) host.innerHTML = '<header><div><span>ABOUT YOU</span><h2>Your Watchdog profile</h2><p>We could not load your profile right now.</p></div></header><div class="acp-error">' + esc(error && error.message || 'Profile unavailable') + '</div>';
    } finally {
      loading = false;
    }
  }

  function start() {
    var app = document.getElementById('ac-app');
    if (!app) return;
    observer = new MutationObserver(function () {
      if (!document.getElementById('ac-profile-editor')) window.setTimeout(mount,0);
    });
    observer.observe(app,{ childList:true,subtree:false });
    mount();
    loadProfile(false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
