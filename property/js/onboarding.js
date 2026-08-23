(function () {
  'use strict';

  var root = document.getElementById('wd-onboarding-root');
  var progress = document.getElementById('wd-onboarding-progress');
  var footer = document.getElementById('wd-onboarding-footer');
  if (!root || !window.NJPTRSupabaseRuntime) return;

  var runtime = window.NJPTRSupabaseRuntime;
  var db = runtime.createClient();
  var answers = {};
  var visibleSteps = [];
  var stepIndex = 0;
  var saving = false;
  var planCadence = 'yearly';
  var planCatalog = null;
  var planCatalogError = '';
  var planCheckoutBusy = false;
  var planCheckoutError = '';

  function ensurePlanStyles() {
    if (document.getElementById('wd-onboarding-plan-styles')) return;
    var link = document.createElement('link');
    link.id = 'wd-onboarding-plan-styles';
    link.rel = 'stylesheet';
    link.href = '/property/css/onboarding-plans.css';
    document.head.appendChild(link);
  }
  ensurePlanStyles();

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>\"]/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;' }[c];
    });
  }

  function setMode(mode) {
    var authMode = mode === 'auth';
    var planMode = mode === 'plans';
    document.body.classList.toggle('wd-auth-view', authMode);
    document.body.classList.toggle('wd-plan-view', planMode);
    if (footer) {
      footer.textContent = authMode
        ? 'We only use your sign-in to secure your account and save your Watchdog properties.'
        : planMode
          ? 'Paid plans use secure Stripe Checkout. Free requires no payment method and can be upgraded anytime.'
          : 'Your answers are saved to your Watchdog profile and kept separate from governed property-source facts.';
    }
  }

  function dashboardPath() {
    return String(runtime.routePrefix || '') + '/dashboard/';
  }

  function nextPath() {
    var fallback = dashboardPath();
    var raw = new URLSearchParams(location.search).get('next') || fallback;
    try {
      var parsed = new URL(raw, location.origin);
      if (parsed.origin !== location.origin) return fallback;

      var path = parsed.pathname || fallback;
      if (runtime.cleanRoutes) {
        if (path === '/property') path = '/';
        else if (path.indexOf('/property/') === 0) path = path.slice('/property'.length) || '/';
        if (path === '/onboarding' || path.indexOf('/onboarding/') === 0 || path.indexOf('/api/') === 0) return fallback;
        return path + parsed.search + parsed.hash;
      }

      if (path.indexOf('/property/') !== 0 || path.indexOf('/property/onboarding') === 0) return fallback;
      return path + parsed.search + parsed.hash;
    } catch (_) {
      return fallback;
    }
  }

  function choice(value, label, note, icon) {
    return { value:value, label:label, note:note || '', icon:icon || '' };
  }

  function validEmail(value) {
    var email = String(value || '').trim();
    return email.length >= 3 && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  var steps = [
    { id:'intro', kind:'intro', eyebrow:'WELCOME TO WATCHDOG', title:'Make Watchdog yours.', copy:'A few quick answers help Watchdog prioritize the property signals, workflows and intelligence that matter most to you.' },
    {
      id:'persona', kind:'single', eyebrow:'START HERE', title:'How will you use Watchdog?', required:true,
      options:[
        choice('homeowner','Homeowner','Understand and monitor my home','⌂'),
        choice('renter','Renter','I rent now and may buy later','↗'),
        choice('professional','Professional','Use Watchdog for clients or work','◆'),
        choice('both','Both','Personal property plus professional work','◎'),
        choice('investor','Investor','Find and evaluate property opportunities','◫'),
        choice('planning_to_buy','Planning to buy','Research before I make a move','⌕')
      ]
    },
    {
      id:'contact_email', kind:'input', eyebrow:'YOUR ACCOUNT', title:'What email should Watchdog use for you?', required:true,
      placeholder:'you@example.com', inputType:'email', inputMode:'email', autocomplete:'email', maxLength:254,
      note:'We save this as your Watchdog contact email. It can be different from the account you used to sign in. Marketing permission is always separate.'
    },
    {
      id:'primary_profession', kind:'single', eyebrow:'YOUR WORK', title:'What best describes your role?', required:true,
      when:function(){ return answers.persona === 'professional' || answers.persona === 'both'; },
      options:[
        choice('real_estate','Real estate agent / broker','Sales, listings, buyers and farms','RE'),
        choice('mortgage_lending','Mortgage lender / broker','Borrower and collateral intelligence','ML'),
        choice('attorney','Attorney','Property, tax, closing or legal review','JD'),
        choice('appraiser','Appraiser','Valuation and property evidence','AV'),
        choice('property_tax_professional','Property tax professional','Assessment and appeal work','TX'),
        choice('title_closing','Title / closing','Transaction and property review','CL'),
        choice('contractor','Contractor / developer','Permits, projects and opportunity','BU'),
        choice('accountant','Accountant / CPA','Tax and client advisory','CPA'),
        choice('insurance','Insurance professional','Property and client risk context','IN'),
        choice('property_manager','Property manager','Portfolio operations and monitoring','PM'),
        choice('investor','Real estate investor','Acquisition and portfolio decisions','$'),
        choice('other','Other professional','A different property-related workflow','…')
      ]
    },
    {
      id:'home_status', kind:'single', eyebrow:'YOUR HOUSEHOLD', title:'What is your current housing situation?', required:true,
      when:function(){ return answers.persona !== 'professional'; },
      options:[
        choice('own','I own my home','','⌂'), choice('rent','I rent','','□'), choice('own_and_invest','I own + invest','','◫'),
        choice('rent_and_invest','I rent + own investments','','◇'), choice('planning_to_buy','Planning to buy','','↗'), choice('other','Something else','','…')
      ]
    },
    { id:'location_zip', kind:'input', eyebrow:'YOUR MARKET', title:'What is your main New Jersey ZIP code?', required:true, placeholder:'08081', inputMode:'numeric', maxLength:5, note:'This sets the geographic starting point for your Watchdog experience.' },
    { id:'markets_text', kind:'input', eyebrow:'YOUR MARKET', title:'Where do you work most often?', required:true, when:function(){ return answers.persona === 'professional' || answers.persona === 'both'; }, placeholder:'Camden County, Gloucester County', maxLength:240, note:'Use towns, counties or ZIP codes. Separate multiple areas with commas.' },
    {
      id:'goals', kind:'multi', eyebrow:'YOUR PRIORITIES', title:'What do you want Watchdog to help with?', required:true,
      options:[choice('monitor_property','Monitor property changes'),choice('lower_property_tax','Understand property taxes'),choice('buy','Buy smarter'),choice('sell','Prepare to sell'),choice('invest','Find opportunities'),choice('client_research','Research for clients'),choice('prospecting','Prospecting / farming'),choice('due_diligence','Property due diligence'),choice('appeals','Assessment / appeal work')]
    },
    {
      id:'age_band', kind:'single', eyebrow:'ABOUT YOU', title:'What age range are you in?', required:true,
      note:'We use ranges for product insights. This is never a housing-targeting filter.',
      options:[choice('18_24','18–24'),choice('25_34','25–34'),choice('35_44','35–44'),choice('45_54','45–54'),choice('55_64','55–64'),choice('65_74','65–74'),choice('75_plus','75+'),choice('prefer_not','Prefer not to say')]
    },
    {
      id:'household_income_band', kind:'single', eyebrow:'ABOUT YOU', title:'What is your household income range?', required:true,
      note:'A range is enough. Prefer not to say is always an option.',
      options:[choice('under_50k','Under $50k'),choice('50_99k','$50k–$99k'),choice('100_149k','$100k–$149k'),choice('150_249k','$150k–$249k'),choice('250k_plus','$250k+'),choice('prefer_not','Prefer not to say')]
    },
    { id:'household_size_answer', kind:'single', eyebrow:'ABOUT YOU', title:'How many people are in your household?', required:true, note:'This stays first-party profile context and is not used for housing audience targeting.', options:[choice('1','1'),choice('2','2'),choice('3','3'),choice('4','4'),choice('5','5'),choice('6','6+'),choice('prefer_not','Prefer not to say')] },
    { id:'property_types', kind:'multi', eyebrow:'PROPERTY FOCUS', title:'Which properties matter most to you?', required:true, options:[choice('single_family','Single-family'),choice('condo_townhome','Condo / townhome'),choice('multifamily','Multi-family'),choice('commercial','Commercial'),choice('land','Land'),choice('mixed','A mix of property types')] },
    { id:'professional_years_band', kind:'single', eyebrow:'YOUR WORK', title:'How long have you worked in your field?', required:true, when:function(){ return answers.persona === 'professional' || answers.persona === 'both'; }, options:[choice('new','Less than 1 year'),choice('1_3','1–3 years'),choice('4_7','4–7 years'),choice('8_15','8–15 years'),choice('16_plus','16+ years')] },
    { id:'professional_volume_band', kind:'single', eyebrow:'YOUR WORK', title:'About how many clients or transactions touch your workflow each month?', required:true, when:function(){ return answers.persona === 'professional' || answers.persona === 'both'; }, options:[choice('under_5','Under 5'),choice('5_14','5–14'),choice('15_29','15–29'),choice('30_59','30–59'),choice('60_plus','60+'),choice('not_applicable','Not measured this way')] },
    {
      id:'professional_priorities', kind:'multi', eyebrow:'WATCHDOG INTELLIGENCE', title:'Where should Intelligence help you first?', required:true,
      when:function(){ return answers.persona === 'professional' || answers.persona === 'both'; },
      options:[choice('lead_prioritization','Prioritize opportunities'),choice('client_briefs','Build client briefs'),choice('property_change','Catch meaningful property changes'),choice('tax_assessment','Assessment / tax analysis'),choice('listing_prep','Listing preparation'),choice('buyer_diligence','Buyer due diligence'),choice('portfolio_monitoring','Portfolio monitoring'),choice('workflow_automation','Reduce repetitive research')]
    },
    { id:'time_horizon', kind:'single', eyebrow:'TIMING', title:'When do you expect Watchdog to be most useful?', required:true, options:[choice('now','Right now'),choice('0_3_months','Next 3 months'),choice('3_6_months','3–6 months'),choice('6_12_months','6–12 months'),choice('12_plus_months','More than a year'),choice('researching','I’m exploring')] },
    { id:'finish', kind:'finish', eyebrow:'READY', title:'Your Watchdog is ready.', copy:'We’ll use the context you confirmed to organize your experience. Property facts and Watchdog scores still come only from governed data and evidence.' }
  ];

  function activeSteps() {
    return steps.filter(function (step) { return !step.when || step.when(); });
  }

  function optionHtml(step, opt) {
    var selected = step.kind === 'multi' ? ((answers[step.id] || []).indexOf(opt.value) >= 0) : answers[step.id] === opt.value;
    return '<button type="button" class="wd-onboarding-option' + (selected ? ' is-selected' : '') + '" data-choice="' + esc(opt.value) + '">' +
      (opt.icon ? '<i>' + esc(opt.icon) + '</i>' : '') + '<span>' + esc(opt.label) + (opt.note ? '<small>' + esc(opt.note) + '</small>' : '') + '</span></button>';
  }

  function tagHtml(step, opt) {
    var selected = (answers[step.id] || []).indexOf(opt.value) >= 0;
    return '<button type="button" class="wd-onboarding-tag' + (selected ? ' is-selected' : '') + '" data-choice="' + esc(opt.value) + '">' + esc(opt.label) + '</button>';
  }

  function canContinue(step) {
    if (!step.required) return true;
    var value = answers[step.id];
    if (step.kind === 'multi') return Array.isArray(value) && value.length > 0;
    if (step.kind === 'input') {
      if (!String(value || '').trim()) return false;
      if (step.id === 'location_zip') return /^\d{5}$/.test(String(value || '').trim());
      if (step.id === 'contact_email') return validEmail(value);
      return true;
    }
    return value !== undefined && value !== null && value !== '';
  }

  function commonTop(step) {
    return '<p class="wd-onboarding-step">' + esc(step.eyebrow || 'WATCHDOG') + '</p>' +
      (step.kind === 'intro' ? '<h1>' + esc(step.title) + '</h1>' : '<h2>' + esc(step.title) + '</h2>') +
      (step.copy ? '<p class="wd-onboarding-copy">' + esc(step.copy) + '</p>' : '') +
      (step.note ? '<p class="wd-onboarding-note">' + esc(step.note) + '</p>' : '');
  }

  function render() {
    setMode('onboarding');
    visibleSteps = activeSteps();
    if (stepIndex >= visibleSteps.length) stepIndex = visibleSteps.length - 1;
    var step = visibleSteps[stepIndex];
    progress.style.width = Math.max(4, Math.round((stepIndex / Math.max(1, visibleSteps.length - 1)) * 100)) + '%';
    root.className = 'wd-onboarding-stage';
    root.setAttribute('aria-busy','false');

    var html = commonTop(step);
    if (step.kind === 'intro') {
      html += '<div class="wd-onboarding-finish"><div class="wd-onboarding-summary"><span>About 60 seconds</span><span>One question at a time</span><span>You can edit later</span></div></div>';
    } else if (step.kind === 'single') {
      html += '<div class="wd-onboarding-options compact">' + step.options.map(function (opt) { return optionHtml(step,opt); }).join('') + '</div>';
    } else if (step.kind === 'multi') {
      html += '<div class="wd-onboarding-tags">' + step.options.map(function (opt) { return tagHtml(step,opt); }).join('') + '</div>';
    } else if (step.kind === 'input') {
      html += '<div class="wd-onboarding-field"><input id="wd-onboarding-input" class="wd-onboarding-input" type="' + esc(step.inputType || 'text') + '" autocomplete="' + esc(step.autocomplete || 'off') + '" ' +
        'inputmode="' + esc(step.inputMode || 'text') + '" maxlength="' + esc(step.maxLength || 240) + '" placeholder="' + esc(step.placeholder || '') + '" value="' + esc(answers[step.id] || '') + '"></div>';
    } else if (step.kind === 'finish') {
      var chips = [];
      if (answers.persona) chips.push(answers.persona.replace(/_/g,' '));
      if (answers.primary_profession) chips.push(answers.primary_profession.replace(/_/g,' '));
      if (answers.location_zip) chips.push(answers.location_zip);
      (answers.goals || []).slice(0,3).forEach(function (g) { chips.push(g.replace(/_/g,' ')); });
      html += '<div class="wd-onboarding-finish"><div class="wd-onboarding-summary">' + chips.map(function(c){return '<span>'+esc(c)+'</span>';}).join('') + '</div><div id="wd-onboarding-error" class="wd-onboarding-error"></div></div>';
    }

    html += '<div class="wd-onboarding-actions">' +
      (stepIndex > 0 ? '<button type="button" class="wd-onboarding-back" data-back>Back</button>' : '<span></span>') +
      '<button type="button" class="wd-onboarding-next" data-next ' + ((!canContinue(step) || saving) && step.kind !== 'intro' ? 'disabled' : '') + '>' +
      (step.kind === 'finish' ? (saving ? 'Saving your setup…' : 'See membership options') : step.kind === 'intro' ? 'Start' : 'Continue') + '</button></div>';

    root.innerHTML = html;
    wire(step);
  }

  function wire(step) {
    root.querySelectorAll('[data-choice]').forEach(function (button) {
      button.addEventListener('click', function () {
        var value = button.getAttribute('data-choice');
        if (step.kind === 'multi') {
          var arr = (answers[step.id] || []).slice();
          var at = arr.indexOf(value);
          if (at >= 0) arr.splice(at,1); else arr.push(value);
          answers[step.id] = arr;
          render();
          return;
        }
        answers[step.id] = value;
        render();
        window.setTimeout(function () {
          if (stepIndex < activeSteps().length - 1) { stepIndex += 1; render(); }
        }, 170);
      });
    });

    var input = document.getElementById('wd-onboarding-input');
    if (input) {
      input.focus();
      input.addEventListener('input', function () {
        if (step.id === 'location_zip') input.value = input.value.replace(/\D/g,'').slice(0,5);
        answers[step.id] = input.value;
        var next = root.querySelector('[data-next]');
        if (next) next.disabled = !canContinue(step);
      });
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && canContinue(step)) { event.preventDefault(); advance(step); }
      });
    }

    var back = root.querySelector('[data-back]');
    if (back) back.addEventListener('click', function () { if (stepIndex > 0) { stepIndex -= 1; render(); } });
    var next = root.querySelector('[data-next]');
    if (next) next.addEventListener('click', function () { advance(step); });
  }

  function advance(step) {
    if (saving || (!canContinue(step) && step.kind !== 'intro')) return;
    if (step.kind === 'finish') { complete(); return; }
    stepIndex = Math.min(stepIndex + 1, activeSteps().length - 1);
    render();
  }

  function payload() {
    var markets = String(answers.markets_text || '').split(',').map(function(v){return v.trim();}).filter(Boolean).slice(0,20);
    if (!markets.length && answers.location_zip) markets = [String(answers.location_zip)];
    var household = answers.household_size_answer;
    return {
      contact_email: String(answers.contact_email || '').trim().toLowerCase(),
      persona: answers.persona,
      primary_profession: answers.primary_profession || null,
      home_status: answers.home_status || (answers.persona === 'renter' ? 'rent' : null),
      age_band: answers.age_band || 'prefer_not',
      household_income_band: answers.household_income_band || 'prefer_not',
      household_size: household && household !== 'prefer_not' ? (household === '6' ? 6 : Number(household)) : null,
      location_zip: answers.location_zip || null,
      markets: markets,
      goals: answers.goals || [],
      property_types: answers.property_types || [],
      time_horizon: answers.time_horizon || null,
      professional_years_band: answers.professional_years_band || null,
      professional_volume_band: answers.professional_volume_band || null,
      professional_priorities: answers.professional_priorities || [],
      intelligence_personalization: true
    };
  }

  function money(value, decimals) {
    var amount = Number(value || 0);
    return new Intl.NumberFormat('en-US', {
      style:'currency', currency:'USD',
      minimumFractionDigits:decimals ? 2 : 0,
      maximumFractionDigits:decimals ? 2 : 0
    }).format(amount);
  }

  function planDefinition(key) {
    var definitions = {
      agent: {
        label:'Agent', kicker:'FOR AGENTS & SOLO PROFESSIONALS',
        description:'A focused professional workspace for opportunity discovery, monitoring and client-ready property research.',
        features:['Monitor up to 25 properties','Agent Opportunity Desk','Professional reports and exports']
      },
      pro: {
        label:'Pro', kicker:'PROFESSIONAL WORKSPACE', featured:true, badge:'Most popular',
        description:'Deeper property intelligence and repeatable research workflows for professionals handling active client work.',
        features:['Monitor up to 250 properties','Expanded professional workbenches','Advanced research workflows']
      },
      pro_plus: {
        label:'Pro+', kicker:'MAXIMUM DATA ACCESS',
        description:'Watchdog’s deepest data, bulk intelligence and high-volume workflows for power users.',
        features:['Monitor up to 2,500 properties','1,000+ data points and proprietary markers','Bulk and scheduled intelligence']
      }
    };
    return definitions[key] || null;
  }

  function intelligenceCopy(key) {
    var intelligence = planCatalog && planCatalog.intelligence || {};
    var promotion = intelligence.promotion || {};
    var promoEligible = promotion.active === true && Array.isArray(promotion.eligible_plans) && promotion.eligible_plans.indexOf(key) >= 0;
    var included = Array.isArray(intelligence.included_plans) && intelligence.included_plans.indexOf(key) >= 0;
    var regular = Number(intelligence.regular_add_on_monthly || 12);
    var brand = 'Watchdog <span class="wd-intelligence-brand-word">Intelligence</span>';

    if (promoEligible) {
      return '<p class="wd-plan-intelligence"><i class="fas fa-sparkles" aria-hidden="true"></i><span>' + brand + ' included for a limited time <small>Normally +' + esc(money(regular, false)) + '/month</small></span></p>';
    }
    if (included) {
      return '<p class="wd-plan-intelligence"><i class="fas fa-sparkles" aria-hidden="true"></i><span>' + brand + ' included at no additional charge</span></p>';
    }
    if (Array.isArray(promotion.eligible_plans) && promotion.eligible_plans.indexOf(key) >= 0) {
      return '<p class="wd-plan-intelligence"><i class="fas fa-sparkles" aria-hidden="true"></i><span>' + brand + ' available for +' + esc(money(regular, false)) + '/month</span></p>';
    }
    return '';
  }

  function planCard(key) {
    var definition = planDefinition(key);
    var plan = planCatalog && planCatalog.plans && planCatalog.plans[key];
    if (!definition || !plan) return '';
    var pricing = plan[planCadence];
    if (!pricing || !Number.isFinite(Number(pricing.amount))) return '';
    var amount = Number(pricing.amount);
    var yearly = planCadence === 'yearly';
    var primary = yearly ? amount / 12 : amount;
    var priceText = money(primary, yearly && primary % 1 !== 0);
    var note = yearly
      ? money(amount, false) + ' billed yearly · two months included'
      : 'Billed monthly';

    return '<article class="wd-plan-card wd-plan-' + esc(key) + (definition.featured ? ' is-featured' : '') + '" data-plan-card="' + esc(key) + '">' +
      (definition.badge ? '<span class="wd-plan-badge">' + esc(definition.badge) + '</span>' : '') +
      '<div class="wd-plan-card-head"><span>' + esc(definition.kicker) + '</span><h3>' + esc(definition.label) + '</h3></div>' +
      '<p class="wd-plan-description">' + esc(definition.description) + '</p>' +
      '<div class="wd-plan-price"><b>' + esc(priceText) + '</b><span>/month</span></div>' +
      '<p class="wd-plan-billing-note">' + esc(note) + '</p>' +
      '<ul class="wd-plan-features">' + definition.features.map(function (feature) {
        return '<li><i class="fas fa-check" aria-hidden="true"></i><span>' + esc(feature) + '</span></li>';
      }).join('') + '</ul>' +
      intelligenceCopy(key) +
      '<button type="button" class="wd-plan-choose" data-plan-tier="' + esc(key) + '"' + (planCheckoutBusy ? ' disabled' : '') + '>Choose ' + esc(definition.label) + '<i class="fas fa-arrow-right" aria-hidden="true"></i></button>' +
      '</article>';
  }

  function renderPlanSelection() {
    setMode('plans');
    progress.style.width = '100%';
    root.className = 'wd-onboarding-stage wd-plan-stage';
    root.setAttribute('aria-busy','false');

    if (!planCatalog && !planCatalogError) {
      root.innerHTML = '<div class="wd-plan-loading"><div class="wd-onboarding-spinner"></div><b>Loading membership options…</b><span>Your Watchdog setup is already saved.</span></div>';
      return;
    }

    var paidCards = planCatalog
      ? ['agent','pro','pro_plus'].map(planCard).filter(Boolean).join('')
      : '';
    var catalogNotice = planCatalogError
      ? '<div class="wd-plan-notice"><i class="fas fa-circle-info" aria-hidden="true"></i><span>Paid plan details are temporarily unavailable. Your account is ready, and you can continue with Free now and upgrade from Account later.</span></div>'
      : '';
    var checkoutNotice = planCheckoutError
      ? '<div class="wd-plan-notice wd-plan-checkout-notice" role="status"><i class="fas fa-shield-halved" aria-hidden="true"></i><span>' + esc(planCheckoutError) + '</span></div>'
      : '';

    root.innerHTML =
      '<div class="wd-plan-header"><div><p class="wd-onboarding-step">CHOOSE YOUR MEMBERSHIP</p><h2>Your account is ready. Choose your plan.</h2><p class="wd-onboarding-copy">Paid workspaces unlock more Watchdog from day one. Free stays available below with no card required, and you can upgrade anytime.</p></div>' +
      (planCatalog ? '<div class="wd-plan-controls"><span>Billing</span><div class="wd-plan-cadence" role="group" aria-label="Billing cadence"><button type="button" data-plan-cadence="yearly" aria-pressed="' + (planCadence === 'yearly') + '">Yearly <em>Save 17%</em></button><button type="button" data-plan-cadence="monthly" aria-pressed="' + (planCadence === 'monthly') + '">Monthly</button></div></div>' : '') +
      '</div>' +
      catalogNotice + checkoutNotice +
      (paidCards ? '<div class="wd-plan-grid">' + paidCards + '</div>' : '') +
      '<section class="wd-plan-free" aria-label="Free membership"><div><span>FREE FOREVER</span><h3>Continue with Free</h3><p>Property lookup, watchlist, core assessment and tax markers, standard alerts and history. No payment method required.</p></div><button type="button" data-plan-free' + (planCheckoutBusy ? ' disabled' : '') + '>Continue with Free <i class="fas fa-arrow-right" aria-hidden="true"></i></button></section>' +
      '<p class="wd-plan-secure"><i class="fas fa-lock" aria-hidden="true"></i> Paid plans use secure Stripe Checkout. Watchdog never stores card details.</p>';

    wirePlanSelection();
  }

  function planCheckoutMessage(code, fallback) {
    if (code === 'BILLING_ENROLLMENT_CLOSED') return 'Paid enrollment is completing final billing checks. Continue with Free now and upgrade from Account when enrollment opens.';
    if (code === 'BILLING_CONTROLLED_ONLY') return 'Paid enrollment is currently limited to controlled launch accounts. Continue with Free now and upgrade when enrollment opens for your account.';
    if (code === 'BILLING_GATE_NOT_PASSED') return 'Paid enrollment is awaiting final Live billing acceptance. Continue with Free now and upgrade from Account once that acceptance is complete.';
    if (code === 'PRICE_NOT_CONFIGURED') return 'That paid plan is temporarily unavailable for checkout. Continue with Free or try again later.';
    if (code === 'LEGACY_SUBSCRIPTION_MIGRATION_REQUIRED') return fallback || 'This account needs billing support before starting a new subscription.';
    return fallback || 'Paid checkout could not be started. You can continue with Free and upgrade later.';
  }

  async function checkoutErrorPayload(error) {
    if (error && error.context && typeof error.context.json === 'function') {
      try { return await error.context.json(); } catch (_) {}
    }
    return { error: error && error.message ? error.message : '', code: '' };
  }

  async function startPaidCheckout(tier) {
    if (planCheckoutBusy || !planCatalog) return;
    planCheckoutBusy = true;
    planCheckoutError = '';
    renderPlanSelection();
    try {
      var result = await db.functions.invoke('create-checkout-session', {
        body: { tier:tier, cadence:planCadence }
      });
      if (result.error) {
        var payloadError = await checkoutErrorPayload(result.error);
        throw { watchdogBilling:true, payload:payloadError, original:result.error };
      }
      var data = result.data || {};
      if (!data.url) throw new Error('Secure checkout did not return a destination.');
      location.assign(data.url);
    } catch (error) {
      var detail = error && error.watchdogBilling ? error.payload : null;
      planCheckoutError = planCheckoutMessage(detail && detail.code, detail && detail.error || error && error.message || '');
      planCheckoutBusy = false;
      renderPlanSelection();
      var notice = root.querySelector('.wd-plan-checkout-notice');
      if (notice) notice.scrollIntoView({ behavior:'smooth', block:'center' });
    }
  }

  function wirePlanSelection() {
    root.querySelectorAll('[data-plan-cadence]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (planCheckoutBusy) return;
        planCadence = button.getAttribute('data-plan-cadence') === 'monthly' ? 'monthly' : 'yearly';
        planCheckoutError = '';
        renderPlanSelection();
      });
    });
    root.querySelectorAll('[data-plan-tier]').forEach(function (button) {
      button.addEventListener('click', function () {
        startPaidCheckout(button.getAttribute('data-plan-tier'));
      });
    });
    var free = root.querySelector('[data-plan-free]');
    if (free) free.addEventListener('click', function () { location.replace(nextPath()); });
  }

  async function loadPlanCatalog() {
    planCatalogError = '';
    try {
      var response = await fetch(String(runtime.url || '').replace(/\/$/, '') + '/functions/v1/billing-price-catalog', {
        method:'GET', headers:{ Accept:'application/json' }, cache:'no-store'
      });
      if (!response.ok) throw new Error('Billing catalog unavailable');
      var catalog = await response.json();
      if (!catalog || catalog.provider !== 'stripe' || !catalog.plans || !catalog.plans.agent || !catalog.plans.pro || !catalog.plans.pro_plus) {
        throw new Error('Billing catalog invalid');
      }
      planCatalog = catalog;
      window.WatchdogBillingCatalog = catalog;
    } catch (_) {
      planCatalog = null;
      planCatalogError = 'unavailable';
    }
    renderPlanSelection();
  }

  async function showPlanSelection() {
    saving = false;
    planCheckoutBusy = false;
    planCheckoutError = '';
    planCatalogError = '';
    setMode('plans');
    renderPlanSelection();
    await loadPlanCatalog();
  }

  async function complete() {
    saving = true;
    render();
    try {
      var result = await db.rpc('complete_my_watchdog_onboarding_v2', { payload: payload() });
      if (result.error) throw result.error;
      await showPlanSelection();
    } catch (error) {
      saving = false;
      render();
      var box = document.getElementById('wd-onboarding-error');
      if (box) {
        box.textContent = (error && error.message) ? error.message : 'We could not save your setup. Please try again.';
        box.classList.add('is-visible');
      }
    }
  }

  function providerIcon(provider) {
    var icon = 'fa-circle-user';
    var family = 'fas';
    if (provider === 'google') { family = 'fab'; icon = 'fa-google'; }
    else if (provider === 'facebook') { family = 'fab'; icon = 'fa-facebook-f'; }
    else if (provider === 'linkedin_oidc') { family = 'fab'; icon = 'fa-linkedin-in'; }
    else if (provider === 'apple') { family = 'fab'; icon = 'fa-apple'; }
    return '<span class="wd-auth-icon ' + esc(provider) + '" aria-hidden="true"><i class="' + family + ' ' + icon + '"></i></span>';
  }

  function providerScreen() {
    setMode('auth');
    var auth = window.WatchdogAuth;
    var providers = auth && auth.providers ? auth.providers : { google:{ label:'Google', enabled:true } };
    var buttons = Object.keys(providers).filter(function (key) { return providers[key] && providers[key].enabled; }).map(function (key) {
      var p = providers[key];
      return '<button class="wd-auth-provider" type="button" data-provider="' + esc(key) + '">' +
        providerIcon(key) + '<span class="wd-auth-provider-label">Continue with ' + esc(p.label || key) + '</span><span class="wd-auth-arrow" aria-hidden="true"><i class="fas fa-arrow-right"></i></span></button>';
    }).join('');
    root.className = 'wd-onboarding-stage';
    root.setAttribute('aria-busy','false');
    progress.style.width = '4%';
    root.innerHTML = '<div class="wd-auth-intro"><p class="wd-onboarding-step">YOUR WATCHDOG</p><h1>Save the homes you look up.</h1><p class="wd-onboarding-copy">Free account. Keep your properties in one place, watch their tax and property data, and see what changes.</p></div>' +
      '<div class="wd-auth-panel">' + buttons + '</div>' +
      '<div class="wd-auth-proof"><span><i class="fas fa-bookmark"></i> Save properties</span><span><i class="fas fa-bell"></i> Watch changes</span><span><i class="fas fa-sparkles"></i> Personalized intelligence</span></div>' +
      '<p class="wd-auth-reassurance"><strong>Free. No card required.</strong> Property search stays free without an account.</p>' +
      '<a class="wd-auth-return" href="/property/"><i class="fas fa-arrow-left"></i> Keep searching without an account</a>';
    root.querySelectorAll('[data-provider]').forEach(function (button) {
      button.addEventListener('click', function () {
        var provider = button.getAttribute('data-provider');
        button.disabled = true;
        if (auth && auth.signIn) auth.signIn(provider, nextPath()).catch(function(){ button.disabled = false; });
        else db.auth.signInWithOAuth({ provider:provider, options:{ redirectTo:location.href } }).catch(function(){ button.disabled = false; });
      });
    });
  }

  async function boot() {
    try {
      var sessionResult = await db.auth.getSession();
      var session = sessionResult && sessionResult.data && sessionResult.data.session;
      if (!session || !session.user) { providerScreen(); return; }
      if (!answers.contact_email && session.user.email) answers.contact_email = String(session.user.email).trim().toLowerCase();
      var stateResult = await db.rpc('get_my_watchdog_onboarding_state');
      if (stateResult.error) throw stateResult.error;
      var state = Array.isArray(stateResult.data) ? stateResult.data[0] : stateResult.data;
      if (state && state.completed) { location.replace(nextPath()); return; }
      render();
    } catch (error) {
      setMode('onboarding');
      root.className = 'wd-onboarding-stage';
      root.innerHTML = '<p class="wd-onboarding-step">WATCHDOG</p><h2>We couldn’t load setup.</h2><p class="wd-onboarding-copy">Refresh the page to try again.</p><div class="wd-onboarding-error is-visible">' + esc(error && error.message || 'Unknown setup error') + '</div>';
    }
  }

  boot();
})();
