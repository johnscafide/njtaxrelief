(function () {
  'use strict';

  var URL = 'https://uvkvaxljhhngydvlrzom.supabase.co';
  var KEY = 'sb_publishable_MYX59qCbK3d-21zDfJqkNw_fvmfnexa';
  var client;
  var user;
  var entitlement;
  var billingCadence = 'yearly';
  var counts = { properties: 0, cases: 0 };
  var $ = function (id) { return document.getElementById(id); };

  // Keep this presentation catalog aligned with the active Stripe Live catalog.
  // Checkout remains server-authoritative; these values are display-only.
  var plans = {
    agent: {
      internal: 'agent',
      name: 'Agent',
      monthly: 59,
      yearly: 590,
      audience: 'For agents who want sourced property intelligence, opportunity discovery and professional client workflows.',
      features: ['Opportunity Desk and sphere monitoring', 'Professional reports and exports', 'Agent-focused property signals']
    },
    pro: {
      internal: 'pro',
      name: 'Pro',
      monthly: 129,
      yearly: 1290,
      featured: true,
      badge: 'PROFESSIONAL WORKSPACE',
      audience: 'For professionals who need deeper property intelligence and repeatable research tools.',
      features: ['Expanded professional workbenches', 'Advanced Watchdog intelligence', 'Professional research and governed exports']
    },
    pro_plus: {
      internal: 'pro_plus',
      name: 'Pro+',
      monthly: 399,
      yearly: 3990,
      badge: 'MAXIMUM DATA ACCESS',
      audience: 'For power users who need Watchdog’s deepest data, bulk intelligence and highest-volume professional workflows.',
      features: ['1,000+ data points and proprietary markers', 'Population and scheduled intelligence', 'Bulk research and advanced governed exports']
    }
  };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function title(value) {
    return String(value || 'standard').replace(/_/g, ' ').replace(/\b\w/g, function (character) {
      return character.toUpperCase();
    });
  }

  function planLabel(value) {
    if (value === 'agent') return 'Agent';
    if (value === 'pro') return 'Pro';
    if (value === 'pro_plus') return 'Pro+';
    if (value === 'teams') return 'Teams';
    if (value === 'developer') return 'Developer';
    return 'Free';
  }

  function date(value) {
    if (!value) return '—';
    return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function money(value, decimals) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: decimals ? 2 : 0,
      maximumFractionDigits: decimals ? 2 : 0
    }).format(value);
  }

  function sb() {
    if (!client) {
      client = window.supabase.createClient(URL, KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'pkce',
          storageKey: 'sb-uvkvaxljhhngydvlrzom-auth-token'
        }
      });
    }
    return client;
  }

  function profile() {
    return (user.user_metadata && user.user_metadata.watchdog_profile) || {};
  }

  function completion(data) {
    var keys = ['preferred_name', 'phone', 'home_zip', 'use_case', 'priority', 'timeframe', 'property_focus', 'counties'];
    var completed = keys.filter(function (key) { return data[key] && String(data[key]).trim(); }).length;
    return Math.round(completed / keys.length * 100);
  }

  function select(id, label, options, value) {
    return '<label>' + label + '<select id="' + id + '">' + options.map(function (option) {
      return '<option value="' + option[0] + '"' + (option[0] === value ? ' selected' : '') + '>' + option[1] + '</option>';
    }).join('') + '</select></label>';
  }

  function currentInternalPlan(developer) {
    return developer ? 'developer' : (entitlement.plan_tier || 'standard');
  }

  function planRank(value) {
    return { standard: 0, agent: 1, pro: 2, pro_plus: 3, teams: 4, developer: 5 }[value] || 0;
  }

  function pricingCard(key, currentPlan, developer) {
    var item = plans[key];
    var active = !developer && currentPlan === item.internal;
    var annual = billingCadence === 'yearly';
    var total = annual ? item.yearly : item.monthly;
    var suffix = annual ? '/year' : '/month';
    var equivalent = annual ? money(item.yearly / 12, true) + '/mo effective' : 'Billed monthly';
    var movingDown = planRank(currentPlan) > planRank(item.internal);
    var button = developer
      ? '<button type="button" disabled>Developer access includes this</button>'
      : active
        ? '<button type="button" disabled>Current plan</button>'
        : '<button type="button" data-billing-plan="' + item.internal + '" data-billing-cadence="' + billingCadence + '">' +
          (movingDown ? 'Move to ' + item.name : 'Choose ' + item.name) + '</button>';
    return '<article class="ac-price-card' + (item.featured ? ' featured' : '') + (active ? ' current' : '') + '">' +
      (item.badge ? '<span class="ac-popular">' + item.badge + '</span>' : '') +
      '<div class="ac-price-head"><div><span>' + item.name.toUpperCase() + '</span><h3>' + item.name + '</h3></div>' +
      (active ? '<em>Current</em>' : '') + '</div>' +
      '<div class="ac-price"><b>' + money(total) + '</b><span>' + suffix + '</span></div>' +
      '<small>' + equivalent + (annual ? ' · save two months' : '') + '</small>' +
      '<p>' + item.audience + '</p><ul>' + item.features.map(function (feature) {
        return '<li><i class="fas fa-check"></i>' + feature + '</li>';
      }).join('') + '</ul>' + button + '</article>';
  }

  function pricing(currentPlan, developer) {
    var freeCurrent = !developer && currentPlan === 'standard';
    return '<section class="ac-section ac-pricing" id="membership-options">' +
      '<header class="ac-pricing-header"><div><span>MEMBERSHIP OPTIONS</span><h2>Choose the workspace you need</h2>' +
      '<p>Annual billing is selected by default and includes two months at no additional cost.</p></div>' +
      '<div class="ac-cadence" role="group" aria-label="Billing cadence">' +
      '<button type="button" data-cadence="yearly" aria-pressed="' + (billingCadence === 'yearly') + '">Yearly <em>Save 17%</em></button>' +
      '<button type="button" data-cadence="monthly" aria-pressed="' + (billingCadence === 'monthly') + '">Monthly</button></div></header>' +
      '<div class="ac-price-grid"><article class="ac-price-card' + (freeCurrent ? ' current' : '') + '">' +
      '<div class="ac-price-head"><div><span>FREE</span><h3>Free</h3></div>' + (freeCurrent ? '<em>Current</em>' : '') + '</div>' +
      '<div class="ac-price"><b>$0</b><span>/forever</span></div><small>No payment method required</small>' +
      '<p>For homeowners starting with their own property-tax record.</p><ul>' +
      '<li><i class="fas fa-check"></i>Property lookup and watchlist</li>' +
      '<li><i class="fas fa-check"></i>Core assessment and tax markers</li>' +
      '<li><i class="fas fa-check"></i>Standard alerts and history</li></ul>' +
      (freeCurrent ? '<button type="button" disabled>Current plan</button>' : '<button type="button" data-billing-portal>Manage current plan</button>') +
      '</article>' + pricingCard('agent', currentPlan, developer) + pricingCard('pro', currentPlan, developer) + pricingCard('pro_plus', currentPlan, developer) +
      '<article class="ac-price-card firm"><div class="ac-price-head"><div><span>TEAMS</span><h3>Teams</h3></div><em>Controlled access</em></div>' +
      '<div class="ac-price"><b>Custom</b></div><small>10+ seats · enrollment opens separately</small>' +
      '<p>For organizations that need shared administration, API delivery and governed high-volume workflows.</p><ul>' +
      '<li><i class="fas fa-check"></i>Team administration and audit controls</li>' +
      '<li><i class="fas fa-check"></i>API and high-volume data delivery</li>' +
      '<li><i class="fas fa-check"></i>Implementation and support</li></ul>' +
      '<button type="button" disabled>Teams enrollment not open yet</button></article></div>' +
      '<p class="ac-pricing-note"><i class="fas fa-shield-halved"></i> Paid access changes only after Stripe sends a verified subscription event. Teams enrollment remains gated until its separate launch review is complete.</p>' +
      '</section>';
  }

  function render() {
    var data = profile();
    var developer = entitlement.account_role === 'developer';
    var plan = currentInternalPlan(developer);
    var percent = completion(data);
    var provider = (user.app_metadata && user.app_metadata.provider) || 'email';
    var success = new URLSearchParams(location.search).get('checkout') === 'success';
    var pending = new URLSearchParams(location.search).get('plan_change') === 'pending';

    $('ac-gate').hidden = true;
    $('ac-app').hidden = false;
    $('ac-app').innerHTML =
      (success ? '<div class="ac-success"><i class="fas fa-circle-check"></i><div><b>Checkout completed.</b><span>Stripe is confirming your subscription. Access updates when the signed webhook arrives.</span></div></div>' : '') +
      (pending ? '<div class="ac-success pending"><i class="fas fa-clock"></i><div><b>Plan change requested.</b><span>Your account updates after Stripe confirms the change.</span></div></div>' : '') +
      '<section class="ac-profile-hero"><div class="ac-avatar">' + esc((data.preferred_name || user.email || 'W').charAt(0).toUpperCase()) + '</div>' +
      '<div><span>PROFILE &amp; SETTINGS</span><h1>' + esc(data.preferred_name || user.user_metadata.full_name || 'Your Watchdog profile') + '</h1>' +
      '<p>' + esc(user.email || '') + ' · ' + planLabel(plan) + ' member</p></div>' +
      '<div class="ac-completion"><b>' + percent + '%</b><span>Profile complete</span><i><em style="width:' + percent + '%"></em></i></div></section>' +
      '<section class="ac-section"><header><div><span>YOUR WATCHDOG</span><h2>Activity at a glance</h2></div></header>' +
      '<div class="ac-stats"><article><i class="fas fa-house"></i><b>' + counts.properties + '</b><span>Saved properties</span></article>' +
      '<article><i class="fas fa-folder-tree"></i><b>' + counts.cases + '</b><span>Professional cases</span></article>' +
      '<article><i class="fas fa-calendar"></i><b>' + date(user.created_at) + '</b><span>Member since</span></article></div></section>' +
      '<section class="ac-section"><header><div><span>PERSONALIZATION</span><h2>Tell Watchdog what matters</h2>' +
      '<p>Your answers tune recommendations and defaults. They never change paid access.</p></div></header>' +
      '<details open><summary><i class="fas fa-user"></i><span><b>Profile details</b><small>Name, contact and home area</small></span><i class="fas fa-chevron-down"></i></summary>' +
      '<div class="ac-form-grid"><label>Preferred name<input id="ac-name" value="' + esc(data.preferred_name || '') + '" autocomplete="name"></label>' +
      '<label>Phone<input id="ac-phone" value="' + esc(data.phone || '') + '" autocomplete="tel"></label>' +
      '<label>Home ZIP<input id="ac-zip" value="' + esc(data.home_zip || '') + '" inputmode="numeric" maxlength="10"></label>' +
      '<label>Counties or towns<input id="ac-counties" value="' + esc(data.counties || '') + '" placeholder="Camden, Gloucester…"></label></div></details>' +
      '<details><summary><i class="fas fa-bullseye"></i><span><b>Property goals</b><small>Why you use Watchdog</small></span><i class="fas fa-chevron-down"></i></summary><div class="ac-form-grid">' +
      select('ac-use', 'I use Watchdog as', [['homeowner', 'Homeowner'], ['professional', 'Professional'], ['both', 'Both']], data.use_case || 'homeowner') +
      select('ac-priority', 'Current priority', [['tax', 'Understand or lower taxes'], ['buy', 'Buy a property'], ['sell', 'Sell a property'], ['invest', 'Investment research'], ['client', 'Client diligence']], data.priority || 'tax') +
      select('ac-timeframe', 'Timeframe', [['research', 'Just researching'], ['0_3', 'Within 3 months'], ['3_6', '3–6 months'], ['6_12', '6–12 months'], ['later', 'More than a year']], data.timeframe || 'research') +
      select('ac-focus', 'Property focus', [['residential', 'Residential'], ['commercial', 'Commercial'], ['mixed', 'Both']], data.property_focus || 'residential') + '</div></details>' +
      '<details><summary><i class="fas fa-briefcase"></i><span><b>Professional workflow</b><small>Role-specific defaults and tools</small></span><i class="fas fa-chevron-down"></i></summary><div class="ac-form-grid">' +
      select('ac-profession-select', 'Primary role', [['homeowner', 'Homeowner'], ['real_estate', 'Real estate professional'], ['attorney', 'Attorney'], ['mortgage_lending', 'Mortgage / lending'], ['investor', 'Investor'], ['appraiser', 'Appraiser'], ['contractor', 'Contractor'], ['property_tax_professional', 'Property tax professional'], ['title_closing', 'Title / closing'], ['other', 'Other professional']], entitlement.profession || 'homeowner') +
      select('ac-notify', 'Update preference', [['important', 'Important changes only'], ['weekly', 'Weekly digest'], ['all', 'Every monitored change'], ['none', 'No data alerts']], data.notification_preference || 'important') +
      '</div></details><div class="ac-save-row"><button id="ac-save-profile" type="button">Save profile</button><span id="ac-profile-note" aria-live="polite"></span></div></section>' +
      '<section class="ac-grid"><article class="ac-card ac-plan"><span>CURRENT MEMBERSHIP</span><h2>' + planLabel(plan) + '</h2>' +
      '<p>' + (developer ? 'Developer access is billing-independent.' : title(entitlement.subscription_status || 'none') + ' subscription status') + '</p>' +
      '<div class="ac-meta"><div><small>Renewal / period end</small><b>' + date(entitlement.current_period_end) + '</b></div>' +
      '<div><small>Primary role</small><b>' + title(entitlement.profession || 'homeowner') + '</b></div></div>' +
      (!developer && ['active', 'trialing', 'past_due'].indexOf(entitlement.subscription_status) >= 0
        ? '<a class="ac-primary" href="#" data-billing-portal><i class="fas fa-arrow-up-right-from-square"></i> Manage membership</a>' : '') +
      '</article><article class="ac-card"><span>ACCOUNT &amp; SECURITY</span><h2>Sign-in details</h2><div class="ac-account-rows">' +
      '<div><i class="fas fa-envelope"></i><span><b>' + esc(user.email || '') + '</b><small>Email</small></span><i class="fas fa-lock"></i></div>' +
      '<div><i class="' + (provider === 'google' ? 'fab fa-google' : 'fas fa-key') + '"></i><span><b>' + title(provider) + '</b><small>Sign-in provider</small></span><i class="fas fa-circle-check"></i></div>' +
      '<div><i class="fas fa-clock"></i><span><b>' + date(user.last_sign_in_at) + '</b><small>Last sign-in</small></span></div></div></article></section>' +
      pricing(plan, developer);

    var save = $('ac-save-profile');
    if (save) save.onclick = saveProfile;
    document.querySelectorAll('[data-cadence]').forEach(function (button) {
      button.onclick = function () {
        billingCadence = button.dataset.cadence === 'monthly' ? 'monthly' : 'yearly';
        render();
        var pricingSection = $('membership-options');
        if (pricingSection) pricingSection.scrollIntoView({ block: 'start' });
      };
    });
  }

  function saveProfile() {
    var note = $('ac-profile-note');
    var role = $('ac-profession-select').value;
    var data = {
      preferred_name: $('ac-name').value.trim(),
      phone: $('ac-phone').value.trim(),
      home_zip: $('ac-zip').value.trim(),
      counties: $('ac-counties').value.trim(),
      use_case: $('ac-use').value,
      priority: $('ac-priority').value,
      timeframe: $('ac-timeframe').value,
      property_focus: $('ac-focus').value,
      notification_preference: $('ac-notify').value,
      updated_at: new Date().toISOString()
    };
    note.textContent = 'Saving…';
    Promise.all([
      sb().auth.updateUser({ data: Object.assign({}, user.user_metadata, { watchdog_profile: data }) }),
      sb().from('professional_preferences').upsert({
        user_id: user.id,
        profession: role,
        onboarding_complete: true,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })
    ]).then(function (results) {
      if (results[0].error) throw results[0].error;
      if (results[1].error) throw results[1].error;
      user = results[0].data.user;
      entitlement.profession = role;
      render();
      $('ac-profile-note').textContent = 'Saved. Your recommendations will use these preferences.';
    }).catch(function (error) {
      note.textContent = error.message || 'Could not save your profile.';
    });
  }

  function init() {
    if (!window.supabase) return;
    sb().auth.getSession().then(function (result) {
      user = result.data && result.data.session && result.data.session.user;
      if (!user) throw new Error('signed out');
      return Promise.all([
        sb().rpc('get_my_entitlement'),
        sb().from('saved_properties').select('id', { count: 'exact', head: true }),
        sb().from('professional_cases').select('id', { count: 'exact', head: true })
      ]);
    }).then(function (results) {
      var rows = results[0].data || [];
      entitlement = Array.isArray(rows) ? rows[0] : rows;
      if (results[0].error || !entitlement) throw results[0].error || new Error('No entitlement');
      counts.properties = results[1].count || 0;
      counts.cases = results[2].count || 0;
      if (window.NJPTRPlan) window.NJPTRPlan.init(user, entitlement);
      render();
    }).catch(function () {});
  }

  init();
})();