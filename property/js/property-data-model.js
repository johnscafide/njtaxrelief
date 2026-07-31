(function (global) {
  'use strict';

  const numberOrNull = value => {
    if (value === '' || value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  function createPropertyRecord(input = {}) {
    return {
      schemaVersion: '1.0.0',
      property: {
        address: String(input.address || '').trim(),
        municipalityId: String(input.municipalityId || '').trim(),
        municipality: String(input.municipality || '').trim(),
        county: String(input.county || '').trim(),
        assessedValue: numberOrNull(input.assessedValue),
        estimatedMarketValue: numberOrNull(input.estimatedMarketValue),
        comparableMedianRatio: numberOrNull(input.comparableMedianRatio),
        yearsSinceRevaluation: numberOrNull(input.yearsSinceRevaluation)
      },
      municipalityMetrics: {
        cod: numberOrNull(input.cod),
        codPercentile: numberOrNull(input.codPercentile),
        codYear: numberOrNull(input.codYear)
      },
      metadata: {
        createdAt: new Date().toISOString(),
        source: input.source || 'user-input-and-nj-cod'
      }
    };
  }

  function assessmentRatio(record) {
    const assessed = record?.property?.assessedValue;
    const market = record?.property?.estimatedMarketValue;
    if (!Number.isFinite(assessed) || !Number.isFinite(market) || market <= 0) return null;
    return assessed / market;
  }

  function validatePropertyRecord(record) {
    const errors = [];
    const assessed = record?.property?.assessedValue;
    const market = record?.property?.estimatedMarketValue;
    if (!Number.isFinite(assessed) || assessed <= 0) errors.push('Assessed value must be greater than zero.');
    if (!Number.isFinite(market) || market <= 0) errors.push('Estimated market value must be greater than zero.');
    if (Number.isFinite(record?.property?.yearsSinceRevaluation) && record.property.yearsSinceRevaluation < 0) {
      errors.push('Years since revaluation cannot be negative.');
    }
    return { valid: errors.length === 0, errors };
  }

  global.NJPropertyModel = { createPropertyRecord, assessmentRatio, validatePropertyRecord };
})(window);
