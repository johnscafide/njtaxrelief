/* ============================================================
 * NJPropertyTaxRelief.com :: Program data and calculator logic
 *
 * This file is the single source of truth for every benefit
 * amount, income limit, and deadline on the site.
 *
 * WHEN NJ CHANGES THE NUMBERS: edit NJ_PROGRAM_DATA below,
 * run the tests (node --test tests/), and every page updates.
 * Pages read these values two ways:
 *   1. Calculators call the functions exported here.
 *   2. Static text marked with data-nj="path" is filled in by
 *      scripts.js from the same data (see applySiteFacts).
 * No benefit number should ever be hardcoded in a page again.
 *
 * Current figures reflect the FY2027 state budget (June 2026).
 * ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();          // Node (tests)
  } else {
    root.ReliefPrograms = factory();     // Browser
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var NJ_PROGRAM_DATA = {
    lastVerified: 'June 30, 2026',

    // PAS-1: combined application for seniors (ANCHOR + Stay NJ + Senior Freeze)
    pas1: {
      deadline: 'November 2, 2026',
      deadlineShort: 'Nov 2, 2026',
      url: 'https://propertytaxrelief.nj.gov'
    },

    hotline: '1-888-238-1233',

    anchor: {
      url: 'https://anchor.nj.gov',
      homeowner: {
        // Income at or below maxIncome earns the benefit. Ordered low to high.
        tiers: [
          { maxIncome: 150000, benefit: 1500 },
          { maxIncome: 250000, benefit: 1000 }
        ],
        incomeLimit: 250000,
        maxBenefit: 1500
      },
      renter: {
        incomeLimit: 150000,
        benefit: 450,
        seniorBenefit: 700
      }
    },

    stayNJ: {
      url: 'https://www.nj.gov/treasury/taxation/staynj/',
      minAge: 65,
      survivingSpouseMinAge: 55,
      share: 0.5, // credit is 50% of the annual property tax bill...
      // ...capped by household income tier. Income at or below maxIncome
      // uses that cap; above the last tier is not eligible (FY2027 budget).
      // NOTE: "about $200,000" per June 2026 reporting; exact thresholds
      // pending NJ Division of Taxation guidance. Update when official.
      tiers: [
        { maxIncome: 100000, cap: 6500 },
        { maxIncome: 150000, cap: 5000 },
        { maxIncome: 200000, cap: 4000 }
      ],
      incomeLimit: 200000,
      incomeLimitApproximate: true,
      maxCap: 6500
    },

    seniorFreeze: {
      url: 'https://www.nj.gov/treasury/taxation/ptr/',
      minAge: 65,
      njResidencyYears: 10,
      homeResidencyYears: 3,
      incomeLimits: { 2024: 168268, 2025: 172475 }
    }
  };

  // ── Helpers ─────────────────────────────────────────────────

  function toNumber(value) {
    if (typeof value === 'number') return isFinite(value) ? value : NaN;
    if (value === undefined || value === null || value === '') return NaN;
    var cleaned = String(value).replace(/[$,\s]/g, '');
    if (cleaned === '') return NaN;
    var n = parseFloat(cleaned);
    return isNaN(n) ? NaN : n;
  }

  function formatUSD(n) {
    return '$' + Math.round(n).toLocaleString('en-US');
  }

  // ── Stay NJ ─────────────────────────────────────────────────

  /**
   * Income-tier cap for Stay NJ. Returns 0 when income is over the limit.
   * Boundary rule: income exactly at a tier's maxIncome gets that tier's cap
   * (exactly $200,000 still qualifies, at the $4,000 cap).
   */
  function stayNJCap(income) {
    var n = toNumber(income);
    if (isNaN(n) || n < 0) return 0;
    var tiers = NJ_PROGRAM_DATA.stayNJ.tiers;
    for (var i = 0; i < tiers.length; i++) {
      if (n <= tiers[i].maxIncome) return tiers[i].cap;
    }
    return 0;
  }

  /**
   * Full Stay NJ estimate.
   * Returns { valid, eligible, credit, cap, quarterly, remaining }.
   * valid=false when inputs are missing/zero/negative (nothing to show yet).
   */
  function stayNJCredit(taxBill, income) {
    var tax = toNumber(taxBill);
    var inc = toNumber(income);
    if (isNaN(tax) || isNaN(inc) || tax <= 0 || inc < 0) {
      return { valid: false, eligible: false, credit: 0, cap: 0, quarterly: 0, remaining: 0 };
    }
    var cap = stayNJCap(inc);
    if (cap === 0) {
      return { valid: true, eligible: false, credit: 0, cap: 0, quarterly: 0, remaining: tax };
    }
    var credit = Math.min(tax * NJ_PROGRAM_DATA.stayNJ.share, cap);
    return {
      valid: true,
      eligible: true,
      credit: credit,
      cap: cap,
      quarterly: credit / 4,
      remaining: Math.max(tax - credit, 0)
    };
  }

  // ── ANCHOR ──────────────────────────────────────────────────

  /**
   * ANCHOR eligibility from the wizard's answers.
   * answers: {
   *   tenure:  'own' | 'rent'
   *   primary: 'yes' | 'no'    (primary NJ residence on Oct 1)
   *   income:  'low' | 'mid' | 'high'
   *            low  = at or under $150,000
   *            mid  = $150,001 to $250,000 (homeowners only)
   *            high = over $250,000
   *   age:     'yes' | 'no'    (65 or older in the benefit year)
   *   taxes:   'yes' | 'no'    (property taxes current / on a plan)
   * }
   * Returns { status: 'qualified'|'not_qualified'|'verify'|'incomplete',
   *           amount, reason }.
   */
  function anchorBenefit(answers) {
    var a = answers || {};
    if (!a.tenure || !a.primary || !a.income) {
      return { status: 'incomplete', amount: 0, reason: 'missing_answers' };
    }
    if (a.primary === 'no') {
      return { status: 'not_qualified', amount: 0, reason: 'not_primary_residence' };
    }
    if (a.income === 'high') {
      return { status: 'not_qualified', amount: 0, reason: 'income_over_limit' };
    }
    if (a.tenure === 'rent' && a.income === 'mid') {
      return { status: 'not_qualified', amount: 0, reason: 'renter_income_over_limit' };
    }
    if (a.tenure === 'own' && a.taxes === 'no') {
      return { status: 'verify', amount: 0, reason: 'possible_delinquency' };
    }
    var amount;
    if (a.tenure === 'own') {
      amount = a.income === 'low'
        ? NJ_PROGRAM_DATA.anchor.homeowner.tiers[0].benefit
        : NJ_PROGRAM_DATA.anchor.homeowner.tiers[1].benefit;
    } else {
      amount = a.age === 'yes'
        ? NJ_PROGRAM_DATA.anchor.renter.seniorBenefit
        : NJ_PROGRAM_DATA.anchor.renter.benefit;
    }
    return { status: 'qualified', amount: amount, reason: 'ok' };
  }

  // ── Site facts (for data-nj text injection) ─────────────────

  /**
   * Resolve a dot path like "stayNJ.maxCap" against the data,
   * pre-formatted for display. Returns null for unknown paths.
   */
  function fact(path) {
    var FACTS = {
      'lastVerified':            NJ_PROGRAM_DATA.lastVerified,
      'hotline':                 NJ_PROGRAM_DATA.hotline,
      'pas1.deadline':           NJ_PROGRAM_DATA.pas1.deadline,
      'pas1.deadlineShort':      NJ_PROGRAM_DATA.pas1.deadlineShort,
      'anchor.homeowner.max':    formatUSD(NJ_PROGRAM_DATA.anchor.homeowner.maxBenefit),
      'anchor.homeowner.mid':    formatUSD(NJ_PROGRAM_DATA.anchor.homeowner.tiers[1].benefit),
      'anchor.homeowner.tier1Income': formatUSD(NJ_PROGRAM_DATA.anchor.homeowner.tiers[0].maxIncome),
      'anchor.homeowner.incomeLimit': formatUSD(NJ_PROGRAM_DATA.anchor.homeowner.incomeLimit),
      'anchor.renter.benefit':   formatUSD(NJ_PROGRAM_DATA.anchor.renter.benefit),
      'anchor.renter.senior':    formatUSD(NJ_PROGRAM_DATA.anchor.renter.seniorBenefit),
      'anchor.renter.incomeLimit': formatUSD(NJ_PROGRAM_DATA.anchor.renter.incomeLimit),
      'stayNJ.maxCap':           formatUSD(NJ_PROGRAM_DATA.stayNJ.maxCap),
      'stayNJ.incomeLimit':      (NJ_PROGRAM_DATA.stayNJ.incomeLimitApproximate ? 'about ' : '') + formatUSD(NJ_PROGRAM_DATA.stayNJ.incomeLimit),
      'stayNJ.tier1Cap':         formatUSD(NJ_PROGRAM_DATA.stayNJ.tiers[0].cap),
      'stayNJ.tier2Cap':         formatUSD(NJ_PROGRAM_DATA.stayNJ.tiers[1].cap),
      'stayNJ.tier3Cap':         formatUSD(NJ_PROGRAM_DATA.stayNJ.tiers[2].cap),
      'stayNJ.tier1Income':      formatUSD(NJ_PROGRAM_DATA.stayNJ.tiers[0].maxIncome),
      'stayNJ.tier2Income':      formatUSD(NJ_PROGRAM_DATA.stayNJ.tiers[1].maxIncome),
      'stayNJ.tier3Income':      formatUSD(NJ_PROGRAM_DATA.stayNJ.tiers[2].maxIncome),
      'seniorFreeze.limit2024':  formatUSD(NJ_PROGRAM_DATA.seniorFreeze.incomeLimits[2024]),
      'seniorFreeze.limit2025':  formatUSD(NJ_PROGRAM_DATA.seniorFreeze.incomeLimits[2025])
    };
    return Object.prototype.hasOwnProperty.call(FACTS, path) ? FACTS[path] : null;
  }

  return {
    data: NJ_PROGRAM_DATA,
    stayNJCap: stayNJCap,
    stayNJCredit: stayNJCredit,
    anchorBenefit: anchorBenefit,
    fact: fact,
    formatUSD: formatUSD,
    toNumber: toNumber
  };
}));
