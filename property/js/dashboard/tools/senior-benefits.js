/* Lazy dashboard module: senior-benefits. Generated from the original dashboard without calculation changes. */
(function () {
  'use strict';
  // NEW JERSEY BENEFIT RULES
  //
  // Kept in one place because they change with every state budget, and because
  // the whole point of these tools is being right about the thresholds. Each
  // figure below is dated so it is obvious when it went stale.
  //
  // Verified against the Division of Taxation, August 2026.
  // ══════════════════════════════════════════════
  var NJ = {
    asOf: 'August 2026',
    stayNJ: {
      // The FY2027 Appropriations Act, signed 30 June 2026, cut the income
      // limit from $500,000 to $200,000. A great many sites still quote the
      // old figure, which would tell a household earning $300,000 it qualifies
      // when it no longer does.
      incomeLimit: 200000,
      minAge: 65,
      share: 0.50,            // 50% of the property tax bill
      taxCap: 13000,          // applied to the first $13,000 of tax
      benefitCap: 6500,
      homeownersOnly: true
    },
    anchor: {
      // Homeowners, by age and NJ-1040 line 29 income.
      senior:  [[150000, 1750], [250000, 1250]],
      under65: [[150000, 1500], [250000, 1000]],
      renter:  [[150000, 700]],
      hardLimit: 250000
    },
    freeze: {
      incomeLimit: 172475,    // 2025 filing year
      minAge: 65,
      minYearsOwned: 10,
      minYearsResident: 10
    },
    deduction: {
      senior: 250,            // annual, age 65+ or permanently disabled
      seniorIncomeLimit: 10000,
      veteran: 250
    },
    deadline: 'November 2, 2026',
    form: 'PAS-1'
  };

  function anchorAmount(income, age65, renter) {
    if (income == null) return null;
    if (renter) return income <= 150000 ? NJ.anchor.renter[0][1] : 0;
    if (income > NJ.anchor.hardLimit) return 0;
    var table = age65 ? NJ.anchor.senior : NJ.anchor.under65;
    for (var i = 0; i < table.length; i++) if (income <= table[i][0]) return table[i][1];
    return 0;
  }

  // ══════════════════════════════════════════════
  // 14 · SENIOR BENEFIT MAXIMIZER
  //
  // The stacking is genuinely counterintuitive and it costs people money.
  //
  // Stay NJ is a TOP OFF, not an addition. The state works out ANCHOR and the
  // Senior Freeze first. If those two together already reach 50% of the tax
  // bill, Stay NJ pays nothing. If they fall short, Stay NJ pays the
  // difference up to the cap.
  //
  // The practical consequence, which nobody explains: claiming ANCHOR does not
  // increase a senior's total relief once Stay NJ is in play. It changes which
  // pot the money comes from. What DOES increase the total is the Senior
  // Freeze, because the freeze amount grows every year the base year holds,
  // and a large freeze plus Stay NJ can exceed 50% of the bill.
  //
  // Which makes the base year the single most valuable thing on this page.
  // ══════════════════════════════════════════════
  function seniorBenefits(tax, income, age, yearsOwned, freezeBase) {
    if (!tax) return null;
    var out = { tax: tax, income: income, age: age, notes: [], eligible: {} };

    var is65 = age != null && age >= 65;
    out.eligible.anchor = income != null && income <= NJ.anchor.hardLimit;
    out.eligible.stay = is65 && income != null && income <= NJ.stayNJ.incomeLimit;
    out.eligible.freeze = is65 && income != null && income <= NJ.freeze.incomeLimit &&
                          (yearsOwned == null || yearsOwned >= NJ.freeze.minYearsOwned);

    out.anchor = out.eligible.anchor ? anchorAmount(income, is65, false) : 0;

    // Senior Freeze reimburses the increase over the base year. Without a base
    // year on file we cannot invent one, and saying so is more useful than a
    // made up number.
    out.freeze = null;
    if (out.eligible.freeze) {
      out.freeze = (freezeBase && freezeBase > 0 && tax > freezeBase) ? (tax - freezeBase) : null;
      if (out.freeze == null) out.notes.push('freeze-nobase');
    }

    // Stay NJ tops the other two up to half the bill.
    var target = Math.min(tax, NJ.stayNJ.taxCap) * NJ.stayNJ.share;
    target = Math.min(target, NJ.stayNJ.benefitCap);
    var already = out.anchor + (out.freeze || 0);
    out.stayTarget = target;
    out.stay = out.eligible.stay ? Math.max(0, target - already) : 0;

    out.total = out.anchor + (out.freeze || 0) + out.stay;
    out.after = Math.max(0, tax - out.total);
    out.pct = tax ? out.total / tax : 0;

    // Where the money is actually left on the table.
    if (!is65 && age != null && age >= 60) out.notes.push('approaching65');
    if (out.eligible.freeze && out.freeze == null) out.notes.push('file-freeze');
    if (is65 && income != null && income > NJ.stayNJ.incomeLimit &&
        income <= 500000) out.notes.push('stay-limit-changed');
    if (out.eligible.stay && out.anchor && already >= target) out.notes.push('anchor-absorbed');
    return out;
  }

  function toolSeniorBenefits(r) {
    var tax = +r.last_year_tax || 0;
    if (!tax) return '';
    var income = profile.gross_income != null ? +profile.gross_income : null;
    var age = profile.birth_year ? (new Date().getFullYear() - +profile.birth_year) : null;
    var yrs = profile.years_in_home != null ? +profile.years_in_home : null;

    if (income == null || age == null) {
      return toolCard('Senior benefit stack', 'fa-layer-group',
        '<p class="tl-p">New Jersey runs three programs for homeowners aged 65 and over, and they interact in ' +
        'a way that surprises people: <b>Stay NJ is a top-off, not an addition</b>. The state works out ANCHOR ' +
        'and the Senior Freeze first, then Stay NJ pays whatever is needed to reach half the tax bill.</p>' +
        '<p class="tl-p">Working out where a specific household lands needs two figures, and they are both ' +
        'optional in your profile: <b>your birth year and your household income</b>. Every threshold in these ' +
        'programs is a hard cutoff, so a range cannot answer it.</p>' +
        '<a class="tl-btn" href="/property/dashboard#profile">Add them to your profile</a>');
    }

    var b = seniorBenefits(tax, income, age, yrs, profile.freeze_base ? +profile.freeze_base : null);
    if (!b) return '';
    var is65 = age >= 65;

    function line(label, amt, note, cls) {
      return '<div class="sb-l ' + (cls || '') + '">' +
        '<span>' + label + (note ? '<em>' + note + '</em>' : '') + '</span>' +
        '<b>' + (amt == null ? 'unknown' : (amt > 0 ? '-' + money(amt) : money(0))) + '</b></div>';
    }

    var notes = {
      'approaching65':
        ['fa-hourglass-half', 'At ' + age + ', you are ' + (65 - age) + ' year' + (65 - age === 1 ? '' : 's') +
         ' from the two largest programs. Stay NJ alone would be worth about ' +
         money(Math.min(tax * 0.5, NJ.stayNJ.benefitCap)) + ' a year at this bill.'],
      'file-freeze':
        ['fa-snowflake', 'You appear to qualify for the Senior Freeze but there is no base year on file. ' +
         'This is the one worth acting on: the freeze locks your tax at its current level and reimburses every ' +
         'increase after it, so the benefit compounds for as long as you stay. Filing late does not backdate it.'],
      'stay-limit-changed':
        ['fa-triangle-exclamation', 'The Stay NJ income limit was cut from $500,000 to <b>$200,000</b> by the ' +
         'budget signed in June 2026. A lot of guidance still quotes the old figure. At your income you would ' +
         'have qualified last year and do not now.'],
      'anchor-absorbed':
        ['fa-circle-info', 'Your ANCHOR benefit does not add to your total once Stay NJ is in play, because ' +
         'Stay NJ only pays the shortfall to 50%. It changes which pot the money comes from, not how much you ' +
         'get. Still file for it: the state calculates all three from the one form.']
    };

    return toolCard('Senior benefit stack', 'fa-layer-group',
      '<p class="tl-p">Three programs, one application, and an interaction almost nobody explains. ' +
      '<b>Stay NJ is a top-off</b>: the state calculates ANCHOR and the Senior Freeze first, then Stay NJ pays ' +
      'whatever is still needed to reach half your bill, capped at ' + money(NJ.stayNJ.benefitCap) + '.</p>' +

      '<div class="sb-stack">' +
        '<div class="sb-l head"><span>Your bill on ' + esc(r.address) + '</span><b>' + money(tax) + '</b></div>' +
        line('ANCHOR', b.eligible.anchor ? b.anchor : 0,
             b.eligible.anchor ? (is65 ? 'age 65+ rate' : 'under 65 rate')
                               : 'income above the $250,000 limit', b.anchor ? 'minus' : 'out') +
        line('Senior Freeze', b.eligible.freeze ? b.freeze : 0,
             !is65 ? 'requires age 65'
             : !b.eligible.freeze ? 'income or ownership requirement not met'
             : b.freeze == null ? 'needs your base year' : 'reimburses the increase since your base year',
             b.eligible.freeze ? (b.freeze ? 'minus' : 'unknown') : 'out') +
        line('Stay NJ', b.eligible.stay ? b.stay : 0,
             !is65 ? 'requires age 65'
             : income > NJ.stayNJ.incomeLimit ? 'income above the $200,000 limit'
             : 'tops the others up to half the bill', b.stay ? 'minus' : 'out') +
        '<div class="sb-l total"><span>What you would actually pay</span><b>' + money(b.after) + '</b></div>' +
      '</div>' +

      '<div class="sb-meter"><i style="width:' + Math.round(Math.min(1, b.pct) * 100) + '%"></i>' +
        '<span>' + Math.round(b.pct * 100) + '% of the bill covered</span></div>' +

      (b.notes.length
        ? '<ul class="sb-notes">' + b.notes.map(function (k) {
            var n = notes[k];
            return n ? '<li><i class="fas ' + n[0] + '"></i><span>' + n[1] + '</span></li>' : '';
          }).join('') + '</ul>'
        : '') +

      '<div class="sb-cta">' +
        '<a class="tl-btn" href="https://www.nj.gov/treasury/taxation/staynj/" target="_blank" rel="noopener">' +
          'File Form ' + NJ.form + '</a>' +
        '<span>Deadline <b>' + NJ.deadline + '</b>. One form covers all three.</span>' +
      '</div>' +

      '<div class="tl-fine">Thresholds current as of ' + NJ.asOf + ', from the NJ Division of Taxation. ' +
      'Benefit amounts depend on figures we do not hold, including your NJ-1040 line 29 income and your ' +
      'Senior Freeze base year, so treat these as estimates. Availability of every one of these programs is ' +
      'subject to annual state budget appropriations, and the Stay NJ limit has already been cut once. ' +
      'Not tax advice.</div>');
  }

  // ══════════════════════════════════════════════
  // 13 · FIRST TIME BUYER TRUE COST
  //
  // A listing shows the seller's tax bill. That is not what the buyer will pay,
  // for two reasons nobody mentions at the open house: the assessment may not
  // have caught up with what the house is now worth, and the rate moves every
  // year regardless.
  // ══════════════════════════════════════════════

  Object.assign(window, { anchorAmount, seniorBenefits, toolSeniorBenefits });
})();

export {};
