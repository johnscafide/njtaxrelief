(function () {
  'use strict';

  if (!window.NJPTRSupabaseRuntime) return;
  var client = window.NJPTRSupabaseRuntime.createClient();
  var user = null;
  var entitlement = {};
  var billingCadence = 'yearly';
  var counts = { properties: 0, cases: 0 };
  var $ = function (id) { return document.getElementById(id); };

  var plans = {
    agent: {
      internal: 'agent', name: 'Agent', monthly: 59, yearly: 590,
      audience: 'For agents who want sourced property intelligence, opportunity discovery and professional client workflows.',
      features: ['Opportunity Desk and sphere monitoring', 'Professional reports and exports', 'Agent-focused property signals']
    },
    pro: {
      internal: 'pro', name: 'Pro', monthly: 129, yearly: 1290, featured: true, badge: 'PROFESSIONAL WORKSPACE',
      audience: 'For professionals who need deeper property intelligence and repeatable research tools.',
      features: ['Expanded professional workbenches', 'Advanced research workflows', 'Professional research and governed exports']
    },
    pro_plus: {
      internal: 'pro_plus', name: 'Pro+', monthly: 399, yearly: 3990, badge: 'MAXIMUM DATA ACCESS',
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
    return String(value || 'none').replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }
  function planLabel(value) {
    return { standard:'Free', agent:'Agent', pro:'Pro', pro_plus:'Pro+', teams:'Teams', developer:'Developer' }[value] || 'Free';
  }
  function date(value) {
    if (!value) return '—';
    var d = new Date(value);
    return Number.isFinite(d.getTime()) ? d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '—';
  }
  function money(value, decimals) {
    return new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', minimumFractionDigits:decimals ? 2 : 0, maximumFractionDigits:decimals ? 2 : 0 }).format(Number(value || 0));
  }
  function profile() {
    return (user && user.user_metadata && user.user_metadata.watchdog_profile) || {};
  }
  function completion(data) {
    var keys = ['preferred_name','phone','home_zip','use_case','priority','timeframe','property_focus','counties'];
    return Math.round(keys.filter(function (key) { return data[key] && String(data[key]).trim(); }).length / keys.length * 100);
  }
  function currentInternalPlan(developer) {
    return developer ? 'developer' : String(entitlement.plan_tier || 'standard').replace('pro+','pro_plus');
  }
  function planRank(value) {
    return { standard:0, agent:1, pro:2, pro_plus:3, teams:4, developer:5 }[value] || 0;
  }
  function providerLabel(value) {
    value = String(value || '').toLowerCase();
    if (value === 'paddle') return 'Paddle';
    if (value === 'stripe') return 'Stripe';
    if (value === 'manual') return 'Watchdog';
    return value ? title(value) : 'Watchdog';
  }
  function avatarUrl() {
    var m = user && user.user_metadata || {};
    return m.avatar_url || m.picture || '';
  }
  function avatarMarkup(data) {
    var url = avatarUrl();
    var initial = (data.preferred_name || (user && user.user_metadata && user.user_metadata.full_name) || (user && user.email) || 'W').charAt(0).toUpperCase();
    return '<div class="ac-avatar-wrap"><div class="ac-avatar" id="ac-profile-avatar">' +
      (url ? '<img src="' + esc(url) + '" alt="Profile photo">' : esc(initial)) +
      '</div><button class="ac-avatar-edit" id="ac-avatar-edit" type="button" aria-label="Change profile photo"><i class="fas fa-camera"></i></button></div>';
  }
  function select(id, label, options, value) {
    return '<label>' + esc(label) + '<select id="' + id + '">' + options.map(function (option) {
      return '<option value="' + esc(option[0]) + '"' + (option[0] === value ? ' selected' : '') + '>' + esc(option[1]) + '</option>';
    }).join('') + '</select></label>';
  }
  function intelligenceOffer(planKey) {
    if (planKey === 'agent' || planKey === 'pro') {
      return '<div class="ac-intel-offer wd-intelligence-frame" aria-label="Watchdog Intelligence add-on"><span>WATCHDOG INTELLIGENCE</span><b>+$12/month</b><small>Optional Intelligence add-on for this plan. Voice and governed Intelligence use the same Watchdog context and evidence controls.</small></div>';
    }
    if (planKey === 'pro_plus' || planKey === 'teams') {
      return '<div class="ac-intel-offer wd-intelligence-frame included" aria-label="Watchdog Intelligence included"><span>WATCHDOG INTELLIGENCE</span><b>Included at no additional charge</b><small>Watchdog Intelligence and Voice are included with this plan.</small></div>';
    }
    return '';
  }
  function pricingCard(key, currentPlan, developer) {
    var item = plans[key];
    var active = !developer && currentPlan === item.internal;
    var annual = billingCadence === 'yearly';
    var total = annual ? item.yearly : item.monthly;
    var movingDown = planRank(currentPlan) > planRank(item.internal);
    var button = developer
      ? '<button type="button" disabled>Developer access includes this</button>'
      : active
        ? '<button type="button" disabled>Current plan</button>'
        : '<button type="button" data-billing-plan="' + item.internal + '" data-billing-cadence="' + billingCadence + '">' + (movingDown ? 'Move to ' : 'Choose ') + esc(item.name) + '</button>';
    return '<article class="ac-price-card' + (item.featured ? ' featured' : '') + (active ? ' current' : '') + '" data-plan="' + item.internal + '">' +
      (item.badge ? '<span class="ac-popular">' + esc(item.badge) + '</span>' : '') +
      '<div class="ac-price-head"><div><span>' + esc(item.name.toUpperCase()) + '</span><h3>' + esc(item.name) + '</h3></div>' + (active ? '<em>Current</em>' : '') + '</div>' +
      '<div class="ac-price"><b>' + money(total) + '</b><span>' + (annual ? '/year' : '/month') + '</span></div>' +
      '<small>' + (annual ? money(item.yearly / 12, true) + '/mo effective · save two months' : 'Billed monthly') + '</small>' +
      intelligenceOffer(item.internal) +
      '<p>' + esc(item.audience) + '</p><ul>' + item.features.map(function (feature) { return '<li><i class="fas fa-check"></i>' + esc(feature) + '</li>'; }).join('') + '</ul>' + button + '</article>';
  }
  function pricing(currentPlan, developer) {
    var freeCurrent = !developer && currentPlan === 'standard';
    return '<section class="ac-section ac-pricing" id="membership-options">' +
      '<header class="ac-pricing-header"><div><span>MEMBERSHIP OPTIONS</span><h2>Choose the workspace you need</h2><p>Annual billing is selected by default and includes two months at no additional cost.</p></div>' +
      '<div class="ac-cadence" role="group" aria-label="Billing cadence"><button type="button" data-cadence="yearly" aria-pressed="' + (billingCadence === 'yearly') + '">Yearly <em>Save 17%</em></button><button type="button" data-cadence="monthly" aria-pressed="' + (billingCadence === 'monthly') + '">Monthly</button></div></header>' +
      '<div class="ac-price-grid"><article class="ac-price-card' + (freeCurrent ? ' current' : '') + '" data-plan="standard">' +
      '<div class="ac-price-head"><div><span>FREE</span><h3>Free</h3></div>' + (freeCurrent ? '<em>Current</em>' : '') + '</div><div class="ac-price"><b>$0</b><span>/forever</span></div><small>No payment method required</small>' +
      '<p>For homeowners starting with their own property-tax record.</p><ul><li><i class="fas fa-check"></i>Property lookup and watchlist</li><li><i class="fas fa-check"></i>Core assessment and tax markers</li><li><i class="fas fa-check"></i>Standard alerts and history</li></ul>' +
      (freeCurrent ? '<button type="button" disabled>Current plan</button>' : '<button type="button" data-billing-portal>Manage current plan</button>') + '</article>' +
      pricingCard('agent', currentPlan, developer) + pricingCard('pro', currentPlan, developer) + pricingCard('pro_plus', currentPlan, developer) +
      '<article class="ac-price-card firm" data-plan="teams"><div class="ac-price-head"><div><span>TEAMS</span><h3>Teams</h3></div><em>Controlled access</em></div><div class="ac-price"><b>Custom</b></div><small>10+ seats · enrollment opens separately</small>' + intelligenceOffer('teams') +
      '<p>For organizations that need shared administration, API delivery and governed high-volume workflows.</p><ul><li><i class="fas fa-check"></i>Team administration and audit controls</li><li><i class="fas fa-check"></i>API and high-volume data delivery</li><li><i class="fas fa-check"></i>Implementation and support</li></ul><button type="button" disabled>Teams enrollment not open yet</button></article></div>' +
      '<div class="ac-pricing-note"><i class="fas fa-shield-halved"></i><span><b>Billing stays server-authoritative.</b> New subscriptions and plan changes use Stripe. Existing Paddle memberships continue to be managed in Paddle until they are migrated. Your current membership card always shows the provider actually attached to your account.</span></div>' +
      '</section>';
  }

  function render() {
    var data = profile();
    var developer = entitlement.account_role === 'developer';
    var plan = currentInternalPlan(developer);
    var percent = completion(data);
    var authProvider = (user.app_metadata && user.app_metadata.provider) || 'email';
    var billingProvider = providerLabel(entitlement.provider || (developer ? 'manual' : ''));
    var success = new URLSearchParams(location.search).get('checkout') === 'success';
    var pending = new URLSearchParams(location.search).get('plan_change') === 'pending';

    $('ac-gate').hidden = true;
    $('ac-app').hidden = false;
    $('ac-app').innerHTML =
      (success ? '<div class="ac-success"><i class="fas fa-circle-check"></i><div><b>Checkout completed.</b><span>Stripe is confirming your subscription. Access updates when the signed billing event arrives.</span></div></div>' : '') +
      (pending ? '<div class="ac-success pending"><i class="fas fa-clock"></i><div><b>Plan change requested.</b><span>Your account updates after the billing provider confirms the change.</span></div></div>' : '') +
      '<section class="ac-profile-hero">' + avatarMarkup(data) + '<div><span>PROFILE &amp; SETTINGS</span><h1>' + esc(data.preferred_name || user.user_metadata.full_name || 'Your Watchdog profile') + '</h1><p>' + esc(user.email || '') + ' · ' + planLabel(plan) + ' member</p></div>' +
      '<div class="ac-completion"><b>' + percent + '%</b><span>Profile complete</span><i><em style="width:' + percent + '%"></em></i></div></section>' +
      '<section class="ac-section"><header><div><span>YOUR WATCHDOG</span><h2>Activity at a glance</h2></div></header><div class="ac-stats"><article><i class="fas fa-house"></i><b>' + counts.properties + '</b><span>Saved properties</span></article><article><i class="fas fa-folder-tree"></i><b>' + counts.cases + '</b><span>Professional cases</span></article><article><i class="fas fa-calendar"></i><b>' + date(user.created_at) + '</b><span>Member since</span></article></div></section>' +
      '<section class="ac-section"><header><div><span>PERSONALIZATION</span><h2>Tell Watchdog what matters</h2><p>Your answers tune recommendations and defaults. They never change paid access.</p></div></header>' +
      '<details open><summary><i class="fas fa-user"></i><span><b>Profile details</b><small>Name, contact and home area</small></span><i class="fas fa-chevron-down"></i></summary><div class="ac-form-grid"><label>Preferred name<input id="ac-name" value="' + esc(data.preferred_name || '') + '" autocomplete="name"></label><label>Phone<input id="ac-phone" value="' + esc(data.phone || '') + '" autocomplete="tel"></label><label>Home ZIP<input id="ac-zip" value="' + esc(data.home_zip || '') + '" inputmode="numeric" maxlength="10"></label><label>Counties or towns<input id="ac-counties" value="' + esc(data.counties || '') + '" placeholder="Camden, Gloucester…"></label></div></details>' +
      '<details><summary><i class="fas fa-bullseye"></i><span><b>Property goals</b><small>Why you use Watchdog</small></span><i class="fas fa-chevron-down"></i></summary><div class="ac-form-grid">' +
      select('ac-use','I use Watchdog as',[['homeowner','Homeowner'],['professional','Professional'],['both','Both']],data.use_case || 'homeowner') + select('ac-priority','Current priority',[['tax','Understand or lower taxes'],['buy','Buy a property'],['sell','Sell a property'],['invest','Investment research'],['client','Client diligence']],data.priority || 'tax') + select('ac-timeframe','Timeframe',[['research','Just researching'],['0_3','Within 3 months'],['3_6','3–6 months'],['6_12','6–12 months'],['later','More than a year']],data.timeframe || 'research') + select('ac-focus','Property focus',[['residential','Residential'],['commercial','Commercial'],['mixed','Both']],data.property_focus || 'residential') + '</div></details>' +
      '<details><summary><i class="fas fa-briefcase"></i><span><b>Professional workflow</b><small>Role-specific defaults and tools</small></span><i class="fas fa-chevron-down"></i></summary><div class="ac-form-grid">' + select('ac-profession-select','Primary role',[['homeowner','Homeowner'],['real_estate','Real estate professional'],['attorney','Attorney'],['mortgage_lending','Mortgage / lending'],['investor','Investor'],['appraiser','Appraiser'],['contractor','Contractor'],['property_tax_professional','Property tax professional'],['title_closing','Title / closing'],['other','Other professional']],entitlement.profession || 'homeowner') + select('ac-notify','Update preference',[['important','Important changes only'],['weekly','Weekly digest'],['all','Every monitored change'],['none','No data alerts']],data.notification_preference || 'important') + '</div></details><div class="ac-save-row"><button id="ac-save-profile" type="button">Save profile</button><span id="ac-profile-note" aria-live="polite"></span></div></section>' +
      '<section class="ac-grid"><article class="ac-card ac-plan"><span>CURRENT MEMBERSHIP</span><h2>' + planLabel(plan) + '</h2><p>' + (developer ? 'Developer access is billing-independent.' : title(entitlement.subscription_status || 'none') + ' subscription status') + '</p><div class="ac-meta"><div><small>Renewal / period end</small><b>' + date(entitlement.current_period_end) + '</b></div><div><small>Billing provider</small><b>' + esc(billingProvider) + '</b></div><div><small>Profession</small><b>' + esc(title(entitlement.profession || 'not set')) + '</b></div><div><small>Sign-in provider</small><b>' + esc(title(authProvider)) + '</b></div></div>' +
      (!developer && entitlement.provider_customer_id ? '<button class="ac-primary" type="button" data-billing-portal><i class="fas fa-arrow-up-right-from-square"></i> Manage subscription &amp; invoices</button>' : '') + '</article>' +
      '<article class="ac-card"><span>ACCOUNT SECURITY</span><h2>Verified access</h2><p>Paid entitlements change only after Watchdog verifies a signed billing event. Presentation controls never change server authorization.</p><div class="ac-account-rows"><div><i class="fas fa-envelope"></i><span><small>ACCOUNT EMAIL</small><b>' + esc(user.email || '') + '</b></span></div><div><i class="fas fa-shield-halved"></i><span><small>ACCOUNT IDENTITY</small><b>' + esc(user.id) + '</b></span></div></div></article></section>' +
      pricing(plan, developer);

    bindRendered();
    document.dispatchEvent(new CustomEvent('watchdog:account-rendered', { detail: { userId:user.id, plan:plan, billingProvider:String(entitlement.provider || '') } }));
  }

  function value(id) { var node = $(id); return node ? String(node.value || '').trim() : ''; }
  function saveProfile() {
    var button = $('ac-save-profile');
    var note = $('ac-profile-note');
    if (!button) return;
    button.disabled = true;
    if (note) note.textContent = 'Saving…';
    var current = profile();
    var next = Object.assign({}, current, {
      preferred_name:value('ac-name'), phone:value('ac-phone'), home_zip:value('ac-zip'), counties:value('ac-counties'), use_case:value('ac-use'), priority:value('ac-priority'), timeframe:value('ac-timeframe'), property_focus:value('ac-focus'), notification_preference:value('ac-notify')
    });
    var profession = value('ac-profession-select') || entitlement.profession || 'homeowner';
    Promise.all([
      client.auth.updateUser({ data:{ watchdog_profile:next } }),
      client.from('professional_preferences').upsert({ user_id:user.id, profession:profession, preferences:{ notification_preference:next.notification_preference }, updated_at:new Date().toISOString() }, { onConflict:'user_id' })
    ]).then(function (results) {
      if (results[0].error) throw results[0].error;
      user = results[0].data.user || user;
      entitlement.profession = profession;
      if (note) note.textContent = 'Profile saved.';
      render();
    }).catch(function (error) {
      console.error('[Account] profile save failed', error);
      if (note) note.textContent = 'Could not save profile. Please try again.';
    }).finally(function () { button.disabled = false; });
  }
  function bindRendered() {
    var save = $('ac-save-profile'); if (save) save.addEventListener('click', saveProfile);
    document.querySelectorAll('[data-cadence]').forEach(function (button) {
      button.addEventListener('click', function () {
        billingCadence = button.dataset.cadence === 'monthly' ? 'monthly' : 'yearly';
        render();
      });
    });
  }
  function openSignIn() {
    if (window.NJPTRSupabaseRuntime && window.NJPTRSupabaseRuntime.openOnboarding) {
      window.NJPTRSupabaseRuntime.openOnboarding(location.pathname + location.search + location.hash);
    }
  }
  function showGate() {
    $('ac-app').hidden = true;
    $('ac-gate').hidden = false;
    var button = $('ac-signin');
    if (button && !button.dataset.bound) { button.dataset.bound = '1'; button.addEventListener('click', openSignIn); }
  }
  async function init() {
    try {
      var auth = await client.auth.getUser();
      user = auth.data && auth.data.user;
      if (!user) { showGate(); return; }
      var results = await Promise.allSettled([
        client.rpc('get_my_entitlement'),
        client.from('saved_properties').select('id', { count:'exact', head:true }).eq('user_id', user.id),
        client.from('professional_cases').select('id', { count:'exact', head:true }).eq('user_id', user.id)
      ]);
      var ent = results[0].status === 'fulfilled' ? results[0].value.data : null;
      entitlement = (Array.isArray(ent) ? ent[0] : ent) || {};
      counts.properties = results[1].status === 'fulfilled' ? Number(results[1].value.count || 0) : 0;
      counts.cases = results[2].status === 'fulfilled' ? Number(results[2].value.count || 0) : 0;
      render();
    } catch (error) {
      console.error('[Account] load failed', error);
      showGate();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
