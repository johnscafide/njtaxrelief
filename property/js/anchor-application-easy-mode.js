(function () {
  'use strict';
  /* Easy mode for the 2025 application: one question at a time, with a plain-language
     "why we ask" and "where to find it" for each question. It is a presentation layer
     only. Answers, validation, saving, and PDF generation stay in
     anchor-application-2025.js; Easy mode shows and hides the existing fields and
     hands off to the step's own Continue button at the end of each step. */
  var form = document.getElementById('wd-anchor-form');
  if (!form) return;

  var MODE_KEY = 'wd_anchor_2025_mode';
  var NUDGE_KEY = 'wd_anchor_2025_easy_nudge';
  var APP_KEY = 'wd_anchor_2025_application_id';
  var NUDGE_DELAY_MS = 75000;
  // Steps whose own buttons carry sign-in, vault, or PDF logic keep their native actions.
  var NATIVE_ACTIONS = { welcome: 1, account: 1, vault: 1, review: 1, complete: 1, 'not-eligible': 1 };
  var NO_MODE_BAR = { welcome: 1, complete: 1, 'not-eligible': 1 };

  function q(s, r) { return (r || document).querySelector(s); }
  function qa(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function read(store, key) { try { return window[store].getItem(key) || ''; } catch (_) { return ''; } }
  function write(store, key, value) { try { window[store].setItem(key, value); } catch (_) {} }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function hidden(n, step) {
    for (var c = n; c && c !== step; c = c.parentElement) {
      if (c.classList.contains('is-hidden') || c.hasAttribute('hidden')) return true;
    }
    return false;
  }
  function digits(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }
  function value(step, name) {
    var i = qa('[name="' + name + '"]', step).filter(function (x) { return !hidden(x, step); })[0];
    return i ? String(i.value || '').trim() : '';
  }
  function answered(step, path) {
    var g = q('[data-choice="' + path + '"]', step);
    return !!(g && q('.is-selected', g));
  }

  // Locators. Each returns the elements that make up one question.
  function choice(root, path, withFollowers) {
    var g = root && q('[data-choice="' + path + '"]', root);
    if (!g) return [];
    var out = [], prev = g.previousElementSibling;
    if (prev && prev.tagName === 'H3') out.push(prev);
    out.push(g);
    if (withFollowers !== false) {
      for (var n = g.nextElementSibling; n; n = n.nextElementSibling) {
        var cond = (n.dataset.showIf || n.dataset.showNot || '');
        if (cond.indexOf(path + '=') !== 0) break;
        out.push(n);
      }
    }
    return out;
  }
  function choiceBox(root, path) {
    var g = root && q('[data-choice="' + path + '"]', root);
    return g ? [g.parentElement] : [];
  }
  function field(root, name) {
    var input = root && q('[name="' + name + '"]', root);
    if (!input) return [];
    var box = input.closest('.wd-money-field, .wd-percent-field') || input, out = [box];
    for (var p = box.previousElementSibling; p; p = p.previousElementSibling) {
      if (p.matches('.wd-guidance-card')) { out.unshift(p); continue; }
      if (p.matches('label.wd-field-label')) out.unshift(p);
      break;
    }
    return out;
  }
  function closest(root, name, css) {
    var input = root && q('[name="' + name + '"]', root);
    var box = input && input.closest(css);
    return box ? [box] : [];
  }
  function all(root, css) { return root ? qa(css, root) : []; }
  function inline(step, form) { return q('[data-form-only-inline="' + form + '"]', step); }
  function taxHelp(step) { return all(step, '#wd-municipal-tax-evidence, .wd-tax-verification'); }

  // Checks. Each returns a message when the question still needs an answer.
  function need(names, msg) {
    return function (step) {
      return names.some(function (n) {
        var i = qa('[name="' + n + '"]', step).filter(function (x) { return !hidden(x, step); })[0];
        return i && !String(i.value || '').trim();
      }) ? (msg || 'Please fill this in before continuing.') : '';
    };
  }
  function pick(path, msg) {
    return function (step) {
      var g = q('[data-choice="' + path + '"]', step);
      return g && !hidden(g, step) && !answered(step, path) ? (msg || 'Please choose an answer to continue.') : '';
    };
  }
  function year(name, who) {
    return function (step) {
      var y = Number(value(step, name));
      return y >= 1900 && y <= 2025 ? '' : 'Enter ' + who + ' 4-digit birth year, like 1955.';
    };
  }
  function ssn(name, who) {
    return function (step) {
      return digits(value(step, name)).length === 9 ? '' : 'Enter ' + who + ' 9-digit Social Security number.';
    };
  }

  function yes(step, path) {
    var g = q('[data-choice="' + path + '"]', step);
    return !!(g && q('[data-value="yes"].is-selected', g));
  }
  function money(names, msg) {
    return function (step) {
      return names.every(function (n) { return /^\d+(?:\.\d{1,2})?$/.test(value(step, n).replace(/[$,\s]/g, '')); }) ? '' : msg;
    };
  }
  function ifYes(path, names, msg) {
    return function (step) {
      if (!yes(step, path)) return '';
      return names.every(function (n) { return !!value(step, n); }) ? '' : msg;
    };
  }
  function both() {
    var checks = Array.prototype.slice.call(arguments);
    return function (step) {
      for (var i = 0; i < checks.length; i++) { var m = checks[i](step); if (m) return m; }
      return '';
    };
  }

  var STEPS = {
    account: [{
      key: 'account',
      why: 'Your application is saved to a free Watchdog account so you can come back to it. There is no password to remember.',
      find: 'Type your email and tap the button. We will email you a 6-digit code. If it doesn\'t arrive in a few minutes, check your spam folder or ask for a new code.'
    }],
    vault: [{
      key: 'vault',
      why: 'This page creates a private key that locks your answers so only you can open them. Think of it like a spare house key: you only need it if you open your application on a different computer or phone.',
      find: 'Tap "Copy recovery key" and paste it somewhere safe, like a note on your phone, or write it down on paper. Then check the box to continue.'
    }],
    profile: [
      { key: 'filing', title: 'How did you file your 2025 New Jersey tax return?',
        why: 'Your filing status tells the State whether this application is for just you, or for you and a spouse or civil union partner.',
        find: 'It\'s marked near the top of your 2025 NJ-1040. If you didn\'t file one, choose the status you would have used. Married couples who filed one return together choose D.',
        els: function (s) { return all(s, 'label[for="filing-status"], #filing-status'); },
        check: need(['filing_status'], 'Choose your filing status to continue.') },
      { key: 'birth', title: 'What year were you born?',
        why: 'Your age decides which form you need. People 65 or older use the senior form (PAS-1), which covers more relief programs.',
        find: 'Just the 4-digit year, like 1955.',
        els: function (s) { return all(s, '.wd-year-grid > div:not([data-spouse-only])'); },
        check: year('applicant.birth_year', 'your') },
      { key: 'birth-spouse', title: 'What year was your spouse or partner born?',
        why: 'If either of you is 65 or older, the senior form (PAS-1) may apply.',
        find: 'Just the 4-digit year, like 1957.',
        els: function (s) { return all(s, '.wd-year-grid > [data-spouse-only]'); },
        check: year('spouse.birth_year', 'your spouse or partner\'s') }
    ],
    disability: [
      { key: 'ssd', title: 'During 2025, did you get Social Security Disability benefits?',
        why: 'People who got disability benefits can use the senior form (PAS-1) even if they are under 65.',
        find: 'This is a monthly disability payment from Social Security. Regular Social Security retirement checks don\'t count. If you only get retirement benefits, answer No.',
        els: function (s) { return choiceBox(s, 'applicant.ssd_2025'); },
        check: pick('applicant.ssd_2025', 'Choose Yes or No to continue.') },
      { key: 'rrd', title: 'During 2025, did you get Railroad Retirement disability benefits?',
        why: 'These count the same way as Social Security Disability.',
        find: 'Only people who worked for a railroad get these. Most people answer No.',
        els: function (s) { return choiceBox(s, 'applicant.railroad_disability_2025'); },
        check: pick('applicant.railroad_disability_2025', 'Choose Yes or No to continue.') },
      { key: 'ssd-spouse', title: 'During 2025, did your spouse or partner get Social Security Disability benefits?',
        why: 'If either of you got disability benefits, the senior form (PAS-1) may apply.',
        find: 'Regular Social Security retirement checks don\'t count. If they only get retirement benefits, answer No.',
        els: function (s) { return choiceBox(s, 'spouse.ssd_2025'); },
        check: pick('spouse.ssd_2025', 'Choose Yes or No to continue.') },
      { key: 'rrd-spouse', title: 'During 2025, did your spouse or partner get Railroad Retirement disability benefits?',
        why: 'These count the same way as Social Security Disability.',
        find: 'Only people who worked for a railroad get these. Most people answer No.',
        els: function (s) { return choiceBox(s, 'spouse.railroad_disability_2025'); },
        check: pick('spouse.railroad_disability_2025', 'Choose Yes or No to continue.') }
    ],
    route: [{
      key: 'route', keepOriginal: true,
      why: 'New Jersey has two versions of this application. ANC-1 is for most homeowners and renters. PAS-1 is for people 65 or older or on disability, and it also covers Senior Freeze and Stay NJ.',
      find: 'You don\'t need to choose. Watchdog picked the right one from your answers.'
    }],
    identity: [
      { key: 'name', title: 'What is your full name?',
        why: 'The State matches this application to your tax records, so use your name exactly as it appears on your tax return.',
        find: 'The middle initial is optional.',
        els: function (s) { return all(s, '.wd-field-grid.three:not([data-spouse-only])'); },
        check: need(['applicant.first', 'applicant.last'], 'Enter your first and last name to continue.') },
      { key: 'name-spouse', title: 'What is your spouse or partner\'s name?',
        why: 'Use their name exactly as it appears on your tax return.',
        find: 'Only fill in the last name if it\'s different from yours.',
        els: function (s) { return all(s, '.wd-field-grid.three[data-spouse-only]'); },
        check: need(['spouse.first'], 'Enter your spouse or partner\'s first name to continue.') }
    ],
    address: [
      { key: 'home', title: 'What is the address of your New Jersey home?',
        why: 'This is the home you\'re applying for relief on.',
        find: 'Enter the street, town, and ZIP code.',
        els: function (s) { return closest(s, 'mailing.address', 'div').concat(closest(s, 'mailing.city', '.wd-field-grid.three')); },
        check: need(['mailing.address', 'mailing.city', 'mailing.state', 'mailing.zip'], 'Enter your street, town, state, and ZIP code to continue.') },
      { key: 'town-code', title: 'What is your town\'s 4-digit code?',
        why: 'New Jersey gives every town a 4-digit code. The State uses it to know which town your home is in.',
        find: 'Tap "Find code from address" and Watchdog will look it up from the address you just entered. You can also find your town on the State\'s official code list.',
        els: function (s) { return closest(s, 'mailing.municipality_code', 'div'); },
        check: function (s) { return /^\d{4}$/.test(value(s, 'mailing.municipality_code')) ? '' : 'The town code is 4 numbers. Tap "Find code from address" if you\'re not sure.'; } },
      { key: 'oct1', title: 'On October 1, 2025, did you live at a different address than the one you entered?',
        why: 'Relief is based on where you lived on October 1, 2025.',
        find: 'Most people answer No. Answer Yes only if you lived at a different New Jersey address on that date.',
        els: function (s) { return choice(s, 'oct1.different'); },
        check: function (s) {
          if (!yes(s, 'oct1.different')) return '';
          return value(s, 'oct1.address') && /^\d{4}$/.test(value(s, 'oct1.municipality_code')) ? '' :
            'Enter the October 1 street address and that town\'s 4-digit code.';
        } }
    ],
    ssn: [
      { key: 'ssn', title: 'What is your Social Security number?',
        why: 'The official State form asks for it so the State can identify you and process your relief.',
        find: 'It\'s on your Social Security card or your tax return. Watchdog encrypts it on this device before saving it.',
        els: function (s) { var i = q('#ssn-self', s); return i ? [i.previousElementSibling, i] : []; },
        check: ssn('applicant.ssn', 'your') },
      { key: 'ssn-spouse', title: 'What is your spouse or partner\'s Social Security number?',
        why: 'The State needs it for both people on a joint application.',
        find: 'It\'s on their Social Security card or your joint tax return.',
        els: function (s) { return all(s, ':scope > [data-spouse-only]'); },
        check: ssn('spouse.ssn', 'your spouse or partner\'s') }
    ],
    residence: [{
      key: 'oct1-home', title: 'Was this New Jersey home your main home on October 1, 2025?',
      why: 'To qualify, the home must have been your main home on October 1, 2025.',
      find: 'Your main home is where you live most of the year. A vacation home doesn\'t count.',
      els: function (s) { return choice(s, 'resident_oct1'); },
      check: pick('resident_oct1', 'Choose Yes or No to continue.')
    }],
    housing: [{
      key: 'own-rent', title: 'On October 1, 2025, did you own or rent your home?',
      why: 'Homeowners and renters answer different questions and can get different amounts.',
      find: 'If you owned a mobile home and paid rent for the lot or site, choose Mobile home owner.',
      els: function (s) { return all(s, '[data-choice="residency_status"]'); },
      check: pick('residency_status', 'Choose the option that fits you to continue.')
    }],
    'anc-details': [
      { key: 'blind', title: 'On December 31, 2025, were you blind or disabled?',
        why: 'The official ANC-1 form asks this question.',
        find: 'Answer based on your situation on December 31, 2025.',
        els: function (s) { return choice(s, 'applicant.blind_or_disabled_1231'); } },
      { key: 'blind-spouse', title: 'On December 31, 2025, was your spouse or partner blind or disabled?',
        why: 'The official ANC-1 form asks this for both people.',
        find: 'Answer based on their situation on December 31, 2025.',
        els: function (s) { return all(s, ':scope > [data-spouse-only]'); } },
      { key: 'income', title: 'What was your 2025 New Jersey gross income?',
        why: 'ANCHOR has income limits, so the State needs your income to confirm you qualify.',
        find: 'It\'s line 29 on your 2025 NJ-1040. If your income was too low to have to file, enter 0.',
        els: function (s) { return field(s, 'nj_gross_income_2025'); },
        check: money(['nj_gross_income_2025'], 'Enter your 2025 NJ gross income as a number. If it was zero, enter 0.') },
      { key: 'same-home', title: 'Did you own and live in this same home for the previous ANCHOR year too?',
        why: 'The official form asks whether this is the same home you had for the previous benefit year.',
        find: 'If you have lived here since before last year, answer Yes.',
        els: function (s) { return all(s, '[data-status-only="homeowner"]'); } },
      { key: 'lease', title: 'A few questions about your lease',
        why: 'Renters answer these questions instead of property tax questions.',
        find: 'Your lease shows whose names are on it.',
        els: function (s) { return all(s, '[data-status-only="renter"]'); } },
      { key: 'site', title: 'Was your name on the lease or site agreement?',
        why: 'Mobile home owners answer this instead of some homeowner questions.',
        find: 'Your site agreement or lot lease shows whose names are on it.',
        els: function (s) { return all(s, '[data-status-only="mobile"]'); } }
    ],
    'pas-history': [
      { key: 'all-year', title: 'Did you own and live in the same New Jersey home for all of 2025?',
        why: 'Your home history helps the State decide which senior programs, like Senior Freeze and Stay NJ, apply to you.',
        find: 'Answer Yes if you didn\'t move at all during 2025.',
        els: function (s) { return choice(s, 'pas.owned_same_home_all_2025', false); } },
      { key: 'last-benefit', title: 'Is this also the home you had the last time you got property tax relief?',
        why: 'The State uses this to connect your application to past benefits.',
        find: 'If you have lived here for years and got ANCHOR or a senior benefit before, answer Yes.',
        els: function (s) { return choice(s, 'pas.same_home_last_year', false); } },
      { key: 'since-2022', title: 'Did you own and live in this home on December 31, 2022?',
        why: 'Some senior programs require that you have lived in your home for a few years.',
        find: 'Answer Yes if you already lived here at the end of 2022.',
        els: function (s) { return choice(s, 'pas.same_home_as_2022', false); } },
      { key: 'moved-2023', title: 'Did you move into this home during 2023?',
        why: 'The official form asks this to understand how long you have lived in the home.',
        find: 'Answer Yes only if your move-in date was in 2023.',
        els: function (s) { return choice(s, 'pas.moved_to_current_home_2023', false); } },
      { key: 'two-homes', title: 'Did you own and live in more than one New Jersey home during 2025?',
        why: 'If you moved between two homes you owned, the form asks about both.',
        find: 'Answer Yes if you sold one New Jersey home and moved into another one you owned during 2025.',
        els: function (s) { return choice(s, 'pas.moved_owned_homes_2025', false); } }
    ],
    property: [
      { key: 'block-lot', title: 'What are your home\'s Block and Lot numbers?',
        why: 'Block and Lot are the numbers your town uses to identify your property, like an ID number for the land.',
        find: 'Tap "Look up with Watchdog" to fill them in from your address, or copy them from your property tax bill. Leave the suffix and qualifier boxes empty unless your bill shows them. Qualifiers are mostly for condos.',
        els: function (s) { return all(s, '.wd-field-grid.five'); },
        also: function (s) { return all(s, '.wd-parcel-help'); },
        check: need(['property.block', 'property.lot'], 'Enter the Block and Lot numbers. Tap "Look up with Watchdog" if you\'re not sure.') },
      { key: 'shared', title: 'Did anyone other than your spouse or partner own part of this home?',
        why: 'If you shared ownership, the State counts only your share.',
        find: 'For example, a sibling or grown child on the deed. If only you (and your spouse or partner) own it, answer No.',
        els: function (s) { return choice(inline(s, 'anc-1'), 'property.shared_ownership'); },
        check: ifYes('property.shared_ownership', ['property.ownership_percent'], 'Enter your ownership percentage.') },
      { key: 'units', title: 'Is your home in a building with more than one unit, like a two-family house?',
        why: 'If part of the building isn\'t your home, only your share counts.',
        find: 'If you answer Yes, enter the share you live in. In a two-family house with two equal units, that\'s 50%.',
        els: function (s) { return choice(inline(s, 'anc-1'), 'property.multiple_units'); },
        check: ifYes('property.multiple_units', ['property.home_use_percent'], 'Enter the percentage of the building you live in.') },
      { key: 'tax', title: 'How much property tax was billed on your home for 2025?',
        why: 'The official form asks for your full-year property tax.',
        find: 'Add up all four quarterly bills for 2025, or check your town\'s tax collector website. Don\'t use a mortgage escrow statement unless it matches your town\'s total.',
        els: function (s) { return field(inline(s, 'anc-1'), 'property.tax_2025'); },
        also: taxHelp,
        check: money(['property.tax_2025'], 'Enter the 2025 property tax as a number. If it was zero, enter 0.') },
      { key: 'shared-pas', title: 'Did anyone other than your spouse or partner own part of this home in 2024 or 2025?',
        why: 'If you shared ownership, the State counts only your share.',
        find: 'For example, a sibling or grown child on the deed. If only you (and your spouse or partner) own it, answer No for both years.',
        els: function (s) { var p = inline(s, 'pas-1'); return choice(p, 'property.shared_ownership_2024').concat(choice(p, 'property.shared_ownership_2025')); },
        check: both(ifYes('property.shared_ownership_2024', ['property.ownership_percent_2024'], 'Enter your 2024 ownership percentage.'),
          ifYes('property.shared_ownership_2025', ['property.ownership_percent_2025'], 'Enter your 2025 ownership percentage.')) },
      { key: 'units-pas', title: 'Is your home in a building with more than one unit, like a two-family house?',
        why: 'If part of the building isn\'t your home, only your share counts.',
        find: 'Answer for both 2024 and 2025. If you answer Yes, enter the share you live in. In a two-family house with two equal units, that\'s 50%.',
        els: function (s) { var p = inline(s, 'pas-1'); return choice(p, 'property.multiple_units_2024').concat(choice(p, 'property.multiple_units_2025')); },
        check: both(ifYes('property.multiple_units_2024', ['property.home_use_percent_2024'], 'Enter the 2024 percentage of the building you lived in.'),
          ifYes('property.multiple_units_2025', ['property.home_use_percent_2025'], 'Enter the 2025 percentage of the building you lived in.')) },
      { key: 'lots-pas', title: 'Does your property include more than one lot?',
        why: 'The official form asks this so the State can match all of your property.',
        find: 'Most homes sit on one lot. Answer Yes only if your tax bill lists more than one lot for your home.',
        els: function (s) { return choice(inline(s, 'pas-1'), 'property.additional_lots'); } },
      { key: 'tax-pas', title: 'How much property tax was billed on your home in 2024 and in 2025?',
        why: 'Senior Freeze compares your property taxes from one year to the next, so the form asks for both years.',
        find: 'Add up all four quarterly bills for each year, or check your town\'s tax collector website. Don\'t use a mortgage escrow statement unless it matches your town\'s total.',
        els: function (s) { return all(inline(s, 'pas-1'), '.wd-field-grid.two'); },
        also: taxHelp,
        check: money(['property.tax_2024', 'property.tax_2025'], 'Enter both the 2024 and 2025 property tax as numbers. If one was zero, enter 0.') },
      { key: 'pilot', title: 'Did your home have a PILOT agreement in 2025?',
        why: 'A PILOT (Payment In Lieu Of Taxes) is a special arrangement where a payment replaces regular property taxes. It\'s uncommon.',
        find: 'Most homeowners answer No. If you had one, your town or your tax bill would say so.',
        els: function (s) { return choice(inline(s, 'pas-1'), 'property.pilot_agreement'); },
        check: function (s) { return yes(s, 'property.pilot_agreement') ? money(['property.pilot_amount_2025'], 'Enter the 2025 PILOT amount as a number.')(s) : ''; } },
      { key: 'facility', title: 'Do you live in a co-op or a continuing care retirement community?',
        why: 'The official form asks this because these homes are billed differently.',
        find: 'Most people choose No. A continuing care retirement community is a senior community that offers housing plus care.',
        els: function (s) { var sel = q('select[name="property.facility_type"]', s); return sel ? [sel.previousElementSibling, sel, sel.nextElementSibling] : []; },
        check: function (s) { var f = value(s, 'property.facility_type'); return f && f !== 'none' && !value(s, 'property.facility_name') ? 'Enter the name of the co-op or community.' : ''; } }
    ],
    'pas-income': [
      { key: 'total', title: 'What was your total income in 2024 and in 2025?',
        why: 'Senior Freeze and Stay NJ have income limits, so the State needs your total income for both years.',
        find: 'If you filed a NJ-1040, use line 27 (Total Income) for each year. If you didn\'t file, open the income calculator to add it up.',
        els: function (s) { return closest(s, 'income_2024.a', 'label').concat(closest(s, 'income_2025.a', 'label')); },
        also: function (s) { return all(s, '.wd-pas-calculator'); },
        check: money(['income_2024.a', 'income_2025.a'], 'Enter the total income for both 2024 and 2025. If it was zero, enter 0.') },
      { key: 'exempt', title: 'How much tax-exempt interest did you have?',
        why: 'The State adds this to your income. Most people don\'t have any.',
        find: 'This is interest from things like municipal bonds. It\'s shown in box 8 of a 1099-INT. If you had none, enter 0.',
        els: function (s) { return closest(s, 'income_2024.b', 'label').concat(closest(s, 'income_2025.b', 'label')); },
        check: money(['income_2024.b', 'income_2025.b'], 'Enter the tax-exempt interest for both 2024 and 2025. If it was zero, enter 0.') },
      { key: 'roth', title: 'Did you move money into a Roth IRA?',
        why: 'The State counts certain Roth IRA rollovers as income.',
        find: 'Most people enter 0. If you moved money from a regular IRA into a Roth IRA, your 1099-R will show it.',
        els: function (s) { return closest(s, 'income_2024.c', 'label').concat(closest(s, 'income_2025.c', 'label')); },
        check: money(['income_2024.c', 'income_2025.c'], 'Enter the Roth IRA amount for both 2024 and 2025. If it was zero, enter 0.') },
      { key: 'disability-pension', title: 'Did you get a disability pension?',
        why: 'The State adds certain disability pension payments to your income.',
        find: 'Most people enter 0. A disability pension isn\'t the same as Social Security. It would be on a 1099-R.',
        els: function (s) { return closest(s, 'income_2024.d', 'label').concat(closest(s, 'income_2025.d', 'label')); },
        check: money(['income_2024.d', 'income_2025.d'], 'Enter the disability pension for both 2024 and 2025. If it was zero, enter 0.') },
      { key: 'social-security', title: 'How much Social Security or Railroad Retirement did you get?',
        why: 'The State counts these benefits as income for the senior programs.',
        find: 'Use the total in box 5 of your SSA-1099 (or your RRB-1099) for each year. The totals below add everything up for you.',
        els: function (s) { return closest(s, 'income_2024.e', 'label').concat(closest(s, 'income_2025.e', 'label')); },
        also: function (s) { return all(s, '.wd-pas-total-card'); },
        check: money(['income_2024.e', 'income_2025.e'], 'Enter the Social Security or Railroad Retirement for both 2024 and 2025. If it was zero, enter 0.') }
    ],
    schedule: [
      { key: 'home-1', title: 'Tell us about the home you moved out of in 2025',
        why: 'Because you owned two New Jersey homes in 2025, the form asks about each one.',
        find: 'Your property tax bills for that home have the Block, Lot, and tax amounts.',
        els: function (s) { return all(s, '.wd-schedule-grid > fieldset:nth-child(1)'); },
        check: both(need(['pas.schedule1.home1.address', 'pas.schedule1.home1.block', 'pas.schedule1.home1.lot', 'pas.schedule1.home1.end_date', 'pas.schedule1.home1.tax_billed_period'],
            'Fill in the address, Block, Lot, move-out date, and taxes for this home.'),
          ifYes('pas.schedule1.home1.shared_ownership', ['pas.schedule1.home1.ownership_percent'], 'Enter your ownership percentage for this home.'),
          ifYes('pas.schedule1.home1.multiple_units', ['pas.schedule1.home1.home_use_percent'], 'Enter the percentage of the building you lived in.')) },
      { key: 'home-2', title: 'Tell us about the home you moved into in 2025',
        why: 'The form asks for the dates and taxes for the time you lived in each home.',
        find: 'Your property tax bills for this home have the Block, Lot, and tax amounts.',
        els: function (s) { return all(s, '.wd-schedule-grid > fieldset:nth-child(2)'); },
        check: both(need(['pas.schedule1.home2.address', 'pas.schedule1.home2.block', 'pas.schedule1.home2.lot', 'pas.schedule1.home2.start_date', 'pas.schedule1.home2.tax_billed_period'],
            'Fill in the address, Block, Lot, move-in date, and taxes for this home.'),
          ifYes('pas.schedule1.home2.shared_ownership', ['pas.schedule1.home2.ownership_percent'], 'Enter your ownership percentage for this home.'),
          ifYes('pas.schedule1.home2.multiple_units', ['pas.schedule1.home2.home_use_percent'], 'Enter the percentage of the building you lived in.')) }
    ],
    finish: [
      { key: 'contact', title: 'How can the State reach you if they have a question?',
        why: 'This is optional. The State only uses it if they need to ask about your application.',
        find: 'A daytime phone number is best.',
        els: function (s) { return field(s, 'contact'); } },
      { key: 'deceased', title: 'Is this application for someone who has passed away?',
        why: 'If an applicant died, the State asks for a copy of the death certificate to be mailed with the application.',
        find: 'Most people leave this box unchecked.',
        els: function (s) { var i = q('[name="death_certificate_enclosed"]', s); return i ? [i.closest('label')] : []; } },
      { key: 'preparer', title: 'Who is filling out this application?',
        why: 'The State asks whether someone was paid to prepare the form.',
        find: 'If you\'re doing it yourself, or a family member is helping for free, choose one of the first two options.',
        els: function (s) { var sel = q('select[name="preparer_role"]', s); return sel ? [sel.previousElementSibling, sel].concat(all(s, '[data-show-if="preparer_role=paid_preparer"]')) : []; },
        check: function (s) {
          if (value(s, 'preparer_role') !== 'paid_preparer') return '';
          var id = value(s, 'preparer.federal_id').toUpperCase().replace(/[\s-]/g, '');
          if (!(/^P\d{8}$/.test(id) || /^\d{9}$/.test(id))) return 'Enter a valid PTIN (P plus 8 digits) or the preparer\'s 9-digit SSN.';
          if (!value(s, 'preparer.firm_name')) return 'Enter the preparer\'s firm name.';
          return digits(value(s, 'preparer.firm_ein')).length === 9 ? '' : 'Enter the firm\'s 9-digit EIN.';
        } }
    ],
    review: [{
      key: 'review',
      why: 'This is your last look before Watchdog fills in the official State form.',
      find: 'If something is wrong, tap Back to change it. When it looks right, check the box and tap "Prepare my official PDF."'
    }]
  };
  var SECTIONS = {
    profile: 'About you', disability: 'Benefits', route: 'Your form', identity: 'Your name',
    address: 'Your home address', ssn: 'Social Security number', residence: 'October 1, 2025',
    housing: 'Your home', 'anc-details': 'A few more questions', 'pas-history': 'Your home history',
    property: 'Your property', 'pas-income': 'Your income', schedule: 'Your two homes', finish: 'Last details'
  };
  // Shared elements stay visible on every question of the step.
  var SHARED = { ssn: '.wd-check-row.compact, .wd-callout.privacy' };

  var easy = read('localStorage', MODE_KEY) === 'easy';
  var current = '';
  var unitKey = '';
  var enteringBack = false;
  var nudgeTimer = null;
  var recorded = {};
  var bar = null;

  function stepNode(id) { return q('.wd-step[data-step="' + id + '"]', form); }
  function activeId() { var a = q('.wd-step.is-active', form); return a ? a.dataset.step : ''; }

  // Every question on the step, shown or not, with its help cards and any "Why are we asking?"
  // button or field error another layer placed right after one of its fields.
  function allUnits(step) {
    var units = (STEPS[step.dataset.step] || []).map(function (u) {
      var primary = u.els ? u.els(step).filter(Boolean) : [];
      var extra = u.also ? u.also(step).filter(Boolean) : [];
      return { def: u, primary: primary, els: primary.concat(extra) };
    });
    qa('.wd-why-button, .wd-field-error', step).forEach(function (n) {
      var prev = n.previousElementSibling;
      while (prev && prev.matches('.wd-why-button, .wd-field-error')) prev = prev.previousElementSibling;
      if (!prev) return;
      for (var i = 0; i < units.length; i++) {
        if (units[i].els.some(function (e) { return e === prev || prev.contains(e) || e.contains(prev); })) {
          units[i].els.push(n);
          return;
        }
      }
    });
    return units;
  }
  function unitsFor(step) {
    return allUnits(step).filter(function (u) {
      if (!u.def.els) return true;
      return u.primary.length && u.primary.some(function (n) { return !hidden(n, step); });
    });
  }
  function takesOver(step) {
    var list = STEPS[step.dataset.step];
    return easy && !NATIVE_ACTIONS[step.dataset.step] && !!list && !list[0].keepOriginal;
  }

  function clear(step) {
    qa('.wd-easy-off', step).forEach(function (n) { n.classList.remove('wd-easy-off'); });
    qa('.wd-easy-head, .wd-easy-actions, .wd-easy-help, .wd-easy-note, .wd-easy-step-error', step).forEach(function (n) { n.remove(); });
    step.classList.remove('wd-easy-step');
  }

  function helpBlock(def) {
    var box = el('div', 'wd-easy-help');
    if (def.why) {
      var why = el('p', 'wd-easy-why');
      why.appendChild(el('strong', '', 'Why we ask'));
      why.appendChild(el('span', '', def.why));
      box.appendChild(why);
    }
    if (def.find) {
      var find = el('p', 'wd-easy-find');
      find.appendChild(el('strong', '', 'Where to find it'));
      find.appendChild(el('span', '', def.find));
      box.appendChild(find);
    }
    return box;
  }

  function render(focus, fromBack) {
    var step = stepNode(current);
    qa('.wd-step', form).forEach(function (s) { if (s !== step) clear(s); });
    if (!step) return;
    clear(step);
    syncBar();
    if (!easy || !STEPS[current]) return;
    var units = unitsFor(step);
    if (!units.length) return;
    step.classList.add('wd-easy-step');

    // Special steps keep all of their content and buttons; Easy mode adds plain-language help.
    if (!takesOver(step)) {
      var help = helpBlock(units[0].def);
      if (units[0].def.keepOriginal) step.insertBefore(help, q(':scope > .wd-step-actions', step));
      else {
        var copy = q(':scope > .wd-step-copy', step) || q(':scope > h2', step);
        step.insertBefore(help, copy ? copy.nextSibling : step.firstChild);
      }
      return;
    }

    var index = units.map(function (u) { return u.def.key; }).indexOf(unitKey);
    if (index < 0) index = fromBack ? units.length - 1 : 0;
    unitKey = units[index].def.key;
    var unit = units[index];

    // Every question on the step, including ones not showing yet, so a Yes/No that
    // opens a follow-up never drops the next question onto the current screen.
    var assigned = [];
    allUnits(step).forEach(function (u) { assigned = assigned.concat(u.els); });
    var shared = SHARED[current] ? qa(SHARED[current], step) : [];
    var last = index === units.length - 1;

    // Hide every other question, the original heading, and loose extras until the last question.
    assigned.forEach(function (n) { if (unit.els.indexOf(n) < 0) n.classList.add('wd-easy-off'); });
    Array.prototype.forEach.call(step.children, function (child) {
      if (child.matches('.wd-step-kicker, h2, .wd-step-copy, .wd-step-actions')) { child.classList.add('wd-easy-off'); return; }
      if (assigned.indexOf(child) >= 0 || shared.indexOf(child) >= 0) return;
      var holdsQuestion = assigned.some(function (n) { return child.contains(n); });
      var holdsCurrent = unit.els.some(function (n) { return child.contains(n); }) ||
        shared.some(function (n) { return child.contains(n); });
      if (holdsQuestion ? !holdsCurrent : !last) child.classList.add('wd-easy-off');
    });

    // A single Yes/No question's own sub-heading just repeats the Easy mode question.
    var groups = [];
    unit.els.forEach(function (n) { groups = groups.concat(n.matches('[data-choice]') ? [n] : qa('[data-choice]', n)); });
    if (groups.length === 1) unit.els.forEach(function (n) { if (n.tagName === 'H3') n.classList.add('wd-easy-off'); });

    var head = el('div', 'wd-easy-head');
    var meta = el('div', 'wd-easy-meta');
    meta.appendChild(el('span', 'wd-easy-section', SECTIONS[current] || step.dataset.title || 'Your application'));
    if (units.length > 1) meta.appendChild(el('span', 'wd-easy-count', 'Question ' + (index + 1) + ' of ' + units.length));
    head.appendChild(meta);
    if (units.length > 1) {
      var dots = el('div', 'wd-easy-dots');
      dots.setAttribute('aria-hidden', 'true');
      units.forEach(function (_, i) { dots.appendChild(el('span', i < index ? 'is-done' : i === index ? 'is-now' : '')); });
      head.appendChild(dots);
    }
    var title = el('h2', 'wd-easy-q', unit.def.title);
    title.tabIndex = -1;
    head.appendChild(title);
    head.appendChild(helpBlock(unit.def));
    step.insertBefore(head, step.firstChild);
    addActions(step, units, index);

    if (focus) {
      try { title.focus({ preventScroll: true }); } catch (_) { title.focus(); }
      var card = q('.wd-app-card');
      var top = (card ? card.getBoundingClientRect().top : 0) + window.pageYOffset - 12;
      window.scrollTo({ top: Math.max(0, top), behavior: reducedMotion() ? 'auto' : 'smooth' });
    }
  }

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function addActions(step, units, index) {
    var native = q('.wd-step-actions [data-next]', step);
    var row = el('div', 'wd-easy-actions');
    var back = el('button', 'wd-btn ghost wd-easy-back', 'Back');
    back.type = 'button';
    var next = el('button', 'wd-btn primary wd-easy-next', index < units.length - 1 ? 'Continue' : (native ? native.textContent.trim() : 'Continue'));
    next.type = 'button';
    var note = el('p', 'wd-easy-note');
    note.setAttribute('role', 'status');
    note.setAttribute('aria-live', 'polite');
    row.appendChild(back);
    row.appendChild(next);
    step.appendChild(note);
    step.appendChild(row);
    back.addEventListener('click', function () { goBack(step); });
    next.addEventListener('click', function () { goNext(step, note); });
  }

  function unanswered(step, els) {
    return els.some(function (n) {
      var groups = n.matches('[data-choice]') ? [n] : qa('[data-choice]', n);
      return groups.some(function (g) { return !hidden(g, step) && !q('.is-selected', g); });
    });
  }
  function moneyProblem(step, els) {
    return els.some(function (n) {
      var inputs = n.matches('input') ? [n] : qa('input[inputmode="decimal"]', n);
      return inputs.some(function (i) {
        if (hidden(i, step) || !i.value || !i.name) return false;
        return !/^\d+(?:\.\d{1,2})?$/.test(String(i.value).replace(/[$,\s]/g, ''));
      });
    }) ? 'Enter dollar amounts using numbers only, like 4250 or 4250.00.' : '';
  }

  function problemFor(step, unit) {
    if (unit.def.els && unanswered(step, unit.els)) return 'Please choose an answer to continue.';
    return (unit.def.check && unit.def.check(step)) || moneyProblem(step, unit.els) || '';
  }

  function goNext(step, note) {
    var units = unitsFor(step);
    var index = units.map(function (u) { return u.def.key; }).indexOf(unitKey);
    if (index < 0) index = 0;
    var unit = units[index];
    var problem = unit ? problemFor(step, unit) : '';
    if (problem) return say(note, problem, true);
    // Recompute after answering: a Yes/No can open or close follow-up questions.
    units = unitsFor(step);
    index = units.map(function (u) { return u.def.key; }).indexOf(unitKey);
    if (index >= 0 && index < units.length - 1) {
      unitKey = units[index + 1].def.key;
      return render(true);
    }
    // Last question: re-check every question on the step, then hand off to the step's own Continue.
    for (var i = 0; i < units.length; i++) {
      var u = units[i], msg = problemFor(step, u);
      if (msg) {
        unitKey = u.def.key;
        render(true);
        return say(q('.wd-easy-note', step), msg, true);
      }
    }
    var native = q('.wd-step-actions [data-next]', step);
    if (!native) return;
    if (native.disabled) return say(note, 'Something on this page still needs an answer. Tap Back to check your answers.', true);
    unitKey = '';
    native.click();
  }

  function goBack(step) {
    var units = unitsFor(step);
    var index = units.map(function (u) { return u.def.key; }).indexOf(unitKey);
    if (index > 0) {
      unitKey = units[index - 1].def.key;
      return render(true);
    }
    var native = q('.wd-step-actions [data-back]', step);
    if (!native) return;
    unitKey = '';
    enteringBack = true;
    native.click();
    setTimeout(function () { enteringBack = false; }, 0);
  }

  function say(note, text, error) {
    if (!note) return;
    note.textContent = text;
    note.classList.toggle('is-error', !!error);
    note.classList.add('is-visible');
  }

  // Mode switch shown above every question step.
  function buildBar() {
    var card = q('.wd-app-card');
    if (!card || bar) return;
    bar = el('div', 'wd-easy-bar');
    var label = el('span', 'wd-easy-bar-label', 'Easy mode');
    var hint = el('span', 'wd-easy-bar-hint', 'One question at a time');
    var sw = el('button', 'wd-easy-switch');
    sw.type = 'button';
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-label', 'Easy mode: one question at a time with plain-language help');
    sw.appendChild(el('span', 'wd-easy-switch-knob'));
    sw.addEventListener('click', function () { setMode(!easy, 'switch'); });
    var text = el('span', 'wd-easy-bar-text');
    text.appendChild(label);
    text.appendChild(hint);
    bar.appendChild(text);
    bar.appendChild(sw);
    var status = q('#wd-app-status', card);
    card.insertBefore(bar, status || form);
  }
  function syncBar() {
    if (!bar) return;
    bar.hidden = !!NO_MODE_BAR[current];
    var sw = q('.wd-easy-switch', bar);
    sw.setAttribute('aria-checked', easy ? 'true' : 'false');
    bar.classList.toggle('is-on', easy);
    document.body.classList.toggle('wd-easy-mode', easy);
  }

  function setMode(next, source) {
    easy = !!next;
    write('localStorage', MODE_KEY, easy ? 'easy' : 'standard');
    unitKey = '';
    removeNudge();
    syncChooser();
    render(source !== 'chooser');
    track(easy ? 'easy_mode_used' : 'standard_mode_used');
    armNudge();
  }

  // Welcome-step choice between Easy and Standard.
  function buildChooser() {
    var welcome = stepNode('welcome');
    if (!welcome || q('.wd-easy-chooser', welcome)) return;
    var box = el('fieldset', 'wd-easy-chooser');
    box.appendChild(el('legend', '', 'How would you like to fill it out?'));
    [
      ['easy', 'Easy mode', 'One question at a time, with a plain-English explanation of what each question means and where to find the answer. Good for a first time, or if forms feel overwhelming.'],
      ['standard', 'Standard', 'See each section\'s questions together. Faster if you have your paperwork ready.']
    ].forEach(function (o) {
      var label = el('label', 'wd-easy-option');
      var input = document.createElement('input');
      input.type = 'radio';
      input.name = 'wd-easy-mode-choice';
      input.value = o[0];
      input.addEventListener('change', function () { if (input.checked) setMode(o[0] === 'easy', 'chooser'); });
      var text = el('span', 'wd-easy-option-text');
      text.appendChild(el('strong', '', o[1]));
      text.appendChild(el('small', '', o[2]));
      label.appendChild(input);
      label.appendChild(text);
      box.appendChild(label);
    });
    var anchor = q(':scope > .wd-callout', welcome) || q(':scope > .wd-step-actions', welcome);
    welcome.insertBefore(box, anchor);
    syncChooser();
  }
  function syncChooser() {
    qa('input[name="wd-easy-mode-choice"]', form).forEach(function (i) {
      i.checked = (i.value === 'easy') === easy;
      i.closest('label').classList.toggle('is-checked', i.checked);
    });
  }

  // Standard mode: offer Easy mode to people who look stuck, and to PAS-1 (senior) applicants.
  function removeNudge() {
    clearTimeout(nudgeTimer);
    qa('.wd-easy-nudge', form).forEach(function (n) { n.remove(); });
  }
  function nudgeDone() { return !!read('sessionStorage', NUDGE_KEY); }
  function showNudge(text) {
    var step = stepNode(current);
    if (!step || easy || nudgeDone() || q('.wd-easy-nudge', step)) return;
    var card = el('div', 'wd-easy-nudge');
    card.setAttribute('role', 'region');
    card.setAttribute('aria-label', 'Easy mode suggestion');
    card.appendChild(el('p', '', text));
    var yes = el('button', 'wd-btn primary small', 'Switch to Easy mode');
    yes.type = 'button';
    var no = el('button', 'wd-btn ghost small', 'No thanks');
    no.type = 'button';
    var row = el('div', 'wd-easy-nudge-actions');
    row.appendChild(yes);
    row.appendChild(no);
    card.appendChild(row);
    yes.addEventListener('click', function () {
      write('sessionStorage', NUDGE_KEY, 'accepted');
      track('easy_mode_nudge_accepted');
      setMode(true, 'nudge');
    });
    no.addEventListener('click', function () {
      write('sessionStorage', NUDGE_KEY, 'dismissed');
      removeNudge();
    });
    var anchor = q(':scope > h2', step);
    step.insertBefore(card, anchor ? anchor.nextSibling : step.firstChild);
    track('easy_mode_nudge_shown');
  }
  function armNudge() {
    removeNudge();
    if (easy || nudgeDone() || NATIVE_ACTIONS[current] || !STEPS[current]) return;
    if (current === 'route') {
      var badge = q('#wd-route-badge');
      if (badge && /PAS-1/i.test(badge.textContent || '')) {
        showNudge('This form has a few more sections. Easy mode can walk you through it one question at a time, with help for each answer.');
      }
      return;
    }
    nudgeTimer = setTimeout(function () {
      showNudge('Taking your time? That\'s completely fine. Easy mode shows one question at a time, with help for each answer.');
    }, NUDGE_DELAY_MS);
  }

  // Funnel events. The server keeps one row per application and event, and ignores unknown names.
  var db = null;
  function appId() {
    var id = read('sessionStorage', APP_KEY);
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? id : '';
  }
  function track(name) {
    var id = appId();
    if (!id || recorded[id + ':' + name]) return;
    try {
      db = db || (window.NJPTRSupabaseRuntime && window.NJPTRSupabaseRuntime.createClient());
    } catch (_) { db = null; }
    if (!db || typeof db.rpc !== 'function') return;
    recorded[id + ':' + name] = true;
    Promise.resolve(db.rpc('record_my_anchor_funnel_event', { p_application_id: id, p_event_name: name })).catch(function () {});
  }

  function onStepChange() {
    var id = activeId();
    if (!id || id === current) return;
    current = id;
    unitKey = '';
    var fromBack = enteringBack;
    enteringBack = false;
    render(false, fromBack);
    armNudge();
    if (STEPS[id] || id === 'complete') {
      track('step_' + id.replace(/-/g, '_'));
      track(easy ? 'easy_mode_used' : 'standard_mode_used');
    }
  }

  // Other layers add help cards and follow-up fields after load; keep the current question in sync.
  var pending = null;
  function refresh() {
    if (pending) return;
    pending = setTimeout(function () {
      pending = null;
      if (!easy || !current || !STEPS[current]) return;
      var step = stepNode(current);
      if (!step || !takesOver(step)) return;
      var focusInside = step.contains(document.activeElement) && !document.activeElement.classList.contains('wd-easy-q');
      if (focusInside) return;
      render(false);
    }, 120);
  }

  // Validation messages appear at the top of the card, which is off screen on long steps
  // when someone presses Continue at the bottom. Repeat the message beside the buttons.
  function mirrorStatus() {
    var status = q('#wd-app-status');
    if (!status) return;
    new MutationObserver(function () {
      qa('.wd-easy-step-error', form).forEach(function (n) { n.remove(); });
      var text = String(status.textContent || '').trim();
      var step = stepNode(current);
      if (!step || !text || !status.classList.contains('error') || !status.classList.contains('is-visible')) return;
      if (takesOver(step)) return say(q('.wd-easy-note', step), text, true);
      var actions = q(':scope > .wd-step-actions', step);
      if (!actions) return;
      var copy = el('p', 'wd-easy-step-error', text);
      copy.setAttribute('aria-hidden', 'true');
      step.insertBefore(copy, actions);
    }).observe(status, { attributes: true, childList: true, characterData: true, subtree: true });
  }

  function init() {
    mirrorStatus();
    buildBar();
    buildChooser();
    current = activeId();
    render(false);
    armNudge();
    new MutationObserver(function (records) {
      var stepChanged = records.some(function (r) {
        return r.type === 'attributes' && r.target.classList && r.target.classList.contains('wd-step');
      });
      if (stepChanged) return onStepChange();
      var external = records.some(function (r) {
        if (r.type !== 'childList') return false;
        var nodes = Array.prototype.slice.call(r.addedNodes).concat(Array.prototype.slice.call(r.removedNodes));
        return nodes.some(function (n) {
          return n.nodeType === 1 && !/(^|\s)wd-easy-/.test(n.className || '');
        });
      });
      if (external) refresh();
    }).observe(form, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
