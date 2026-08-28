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
