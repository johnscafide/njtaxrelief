export const COUNTY_LEVEL = 1;

function clean(value) {
  return String(value == null ? '' : value)
    .toUpperCase()
    .replace(/[.,]/g, ' ')
    .replace(/\bTOWNSHIP\b|\bTWNSHP\b/g, 'TWP')
    .replace(/\bBOROUGH\b/g, 'BORO')
    .replace(/\s+/g, ' ')
    .trim();
}

export function canonicalTown(value) {
  const parts = clean(value).split(' ').filter(Boolean);
  if (parts.length >= 2 && /^(CITY|TWP|BORO|TOWN|VILLAGE)$/.test(parts.at(-1)) && parts.at(-1) === parts.at(-2)) {
    parts.pop();
  }
  return parts.join(' ');
}

export function baseTown(value) {
  return canonicalTown(value).replace(/\s+(CITY|TWP|BORO|TOWN|VILLAGE)$/, '').trim();
}

function county(value) {
  return clean(value);
}

function newestYear(series) {
  const years = Object.keys(series || {}).filter((year) => /^\d{4}$/.test(year)).sort((a, b) => Number(b) - Number(a));
  return years[0] || null;
}

function addUnique(map, key, value) {
  if (!key) return;
  if (!map.has(key)) map.set(key, value);
  else map.set(key, null);
}

export function buildCertifiedIndex(equalization) {
  const exact = new Map();
  const base = new Map();
  for (const [key, history] of Object.entries(equalization?.ratios || {})) {
    const match = String(key).match(/^(.*) \(([^)]+)\)$/);
    if (!match) continue;
    const year = newestYear(history);
    const row = year ? history?.[year] : null;
    const ratio = Number(row?.ratio);
    const lower = Number(row?.lower);
    const upper = Number(row?.upper);
    if (!year || !Number.isFinite(ratio) || !Number.isFinite(lower) || !Number.isFinite(upper)) continue;
    const item = {
      key,
      year: Number(year),
      ratio,
      lower,
      upper,
      upper_applied: Math.min(100, upper),
      town: canonicalTown(match[1]),
      county: county(match[2]),
    };
    exact.set(`${item.town}|${item.county}`, item);
    addUnique(base, `${baseTown(item.town)}|${item.county}`, item);
  }
  return { exact, base };
}

export function findCertified(index, municipalityName, countyName) {
  const c = county(countyName);
  const exact = index?.exact?.get(`${canonicalTown(municipalityName)}|${c}`);
  if (exact) return exact;
  return index?.base?.get(`${baseTown(municipalityName)}|${c}`) || null;
}

export function buildTaxRateIndex(taxRates) {
  const exact = new Map();
  const base = new Map();
  for (const [key, history] of Object.entries(taxRates?.rates || {})) {
    const match = String(key).match(/^(.*) \(([^)]+)\)$/);
    if (!match) continue;
    const year = newestYear(history);
    const value = year ? Number(history?.[year]) : NaN;
    if (!year || !Number.isFinite(value) || value <= 0) continue;
    const item = {
      key,
      year: Number(year),
      general_rate: value,
      multiplier: value / 100,
      town: canonicalTown(match[1]),
      county: county(match[2]),
    };
    exact.set(`${item.town}|${item.county}`, item);
    addUnique(base, `${baseTown(item.town)}|${item.county}`, item);
  }
  return { exact, base };
}

export function findTaxRate(index, municipalityName, countyName) {
  const c = county(countyName);
  const exact = index?.exact?.get(`${canonicalTown(municipalityName)}|${c}`);
  if (exact) return exact;
  return index?.base?.get(`${baseTown(municipalityName)}|${c}`) || null;
}

export function chapter123Screen({ market, assessed, certified, taxRate }) {
  const trueValue = Number(market);
  const assessedValue = Number(assessed);
  const averageRatio = Number(certified?.ratio) / 100;
  const publishedUpper = Number(certified?.upper) / 100;
  const upperRatio = Math.min(COUNTY_LEVEL, publishedUpper);
  const rate = Number(taxRate?.multiplier);
  if (![trueValue, assessedValue, averageRatio, publishedUpper, upperRatio, rate].every(Number.isFinite)) return null;
  if (trueValue <= 0 || assessedValue <= 0 || averageRatio <= 0 || publishedUpper <= 0 || rate <= 0) return null;

  const subjectRatio = assessedValue / trueValue;
  if (subjectRatio <= upperRatio) return {
    above: false,
    subject_ratio: subjectRatio,
    upper_ratio: upperRatio,
    threshold_assessment: trueValue * upperRatio,
  };

  const reliefRatio = averageRatio > COUNTY_LEVEL && subjectRatio > COUNTY_LEVEL ? COUNTY_LEVEL : averageRatio;
  const supportedAssessment = trueValue * reliefRatio;
  const thresholdAssessment = trueValue * upperRatio;
  const over = assessedValue - thresholdAssessment;
  const reductionBasis = Math.max(0, assessedValue - supportedAssessment);
  const annualTaxAtStake = reductionBasis * rate;

  return {
    above: true,
    subject_ratio: subjectRatio,
    upper_ratio: upperRatio,
    average_ratio: averageRatio,
    relief_ratio: reliefRatio,
    threshold_assessment: thresholdAssessment,
    supported_assessment: supportedAssessment,
    over,
    reduction_basis: reductionBasis,
    annual_tax_at_stake: annualTaxAtStake,
  };
}

export function monthsBeforeValuationDate(saleYear, saleMonth, taxYear) {
  const sy = Number(saleYear);
  const sm = Number(saleMonth);
  const ty = Number(taxYear);
  if (!Number.isInteger(sy) || !Number.isInteger(sm) || sm < 1 || sm > 12 || !Number.isInteger(ty)) return null;
  const valuationYear = ty - 1;
  const months = (valuationYear - sy) * 12 + (10 - sm);
  // With month-only SR-1A data, exclude October entirely because a sale in that
  // month cannot be proven to have preceded the October 1 valuation date.
  return months > 0 ? months : null;
}

export function marketAtValuationDate(salePrice, monthsBefore, annualDrift) {
  const price = Number(salePrice);
  const months = Number(monthsBefore);
  const drift = Number(annualDrift);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(months) || months <= 0 || !Number.isFinite(drift) || drift <= -1) return null;
  return price * Math.pow(1 + drift, months / 12);
}

function dateFromMonthDay(taxYear, monthDay) {
  if (!/^\d{2}-\d{2}$/.test(String(monthDay || ''))) return null;
  return `${Number(taxYear)}-${monthDay}`;
}

export function appealDeadlineContext({ countyName, assessed, revaluationOrReassessment, taxYear, deadlineRules }) {
  const year = Number(taxYear);
  const assessment = Number(assessed);
  if (!Number.isInteger(year) || year < 2000 || !Number.isFinite(assessment) || assessment < 0 || !deadlineRules?.rules) return null;

  const countyNameNormalized = county(countyName);
  const alternate = (deadlineRules.alternate_calendar_counties || []).map(county).includes(countyNameNormalized);
  const rules = deadlineRules.rules;
  const countyBoardRule = alternate ? rules.alternate_county_board : rules.traditional_county_board;
  const traditionalReval = !alternate && revaluationOrReassessment === true;
  const countyBoardMonthDay = traditionalReval
    ? countyBoardRule?.municipal_wide_revaluation_or_reassessment_baseline_month_day
    : countyBoardRule?.baseline_month_day;
  const directRule = rules.direct_tax_court || {};
  const directEligible = assessment > Number(directRule.ordinary_assessment_must_exceed);
  const directMonthDay = alternate
    ? directRule.alternate_baseline_month_day
    : traditionalReval
      ? directRule.traditional_revaluation_or_reassessment_baseline_month_day
      : directRule.traditional_baseline_month_day;

  return {
    status: 'verify_current_notice',
    exact_deadline: null,
    tax_year: year,
    calendar: alternate ? 'alternate' : 'traditional',
    county: countyNameNormalized,
    revaluation_or_reassessment: revaluationOrReassessment === true,
    county_board: {
      statutory_baseline: dateFromMonthDay(year, countyBoardMonthDay),
      bulk_mailing_days: Number(countyBoardRule?.bulk_mailing_days) || null,
      choose_later_of_baseline_or_bulk_mailing: countyBoardRule?.choose_later_of_baseline_or_bulk_mailing === true,
      received_not_postmarked: countyBoardRule?.received_not_postmarked === true,
    },
    direct_tax_court: {
      ordinary_assessment_must_exceed: Number(directRule.ordinary_assessment_must_exceed) || null,
      eligible_by_assessment_amount: directEligible,
      statutory_baseline: directEligible ? dateFromMonthDay(year, directMonthDay) : null,
      bulk_mailing_days: directEligible ? Number(directRule.bulk_mailing_days) || null : null,
      choose_later_of_baseline_or_bulk_mailing: directEligible && directRule.choose_later_of_baseline_or_bulk_mailing === true,
    },
    change_of_assessment_notice_days: Number(rules.change_of_assessment_notice?.days_from_issuance) || null,
    weekend_or_legal_holiday_moves_to_next_business_day: rules.weekend_or_legal_holiday?.move_to_next_business_day === true,
    guidance: alternate && revaluationOrReassessment === true
      ? 'Alternate-calendar revaluation/reassessment: verify the current assessment notice and County Board instructions before presenting a final filing date.'
      : 'Verify the current assessment notice / certified bulk-mailing date before presenting a final filing date.',
  };
}
