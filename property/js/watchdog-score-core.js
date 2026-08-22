/* Canonical Watchdog Score aggregation contract.
   One score. Six ROBUST dimensions. Missing evidence lowers coverage; it is never replaced by a fallback score. */
(function (root) {
  'use strict';
  if (root.WatchdogScoreCore) return;

  var VERSION = 'ROBUST-v1';
  var LEGACY_VERSIONS = Object.freeze(['peer-gap-v1']);
  var ORDER = Object.freeze(['recourse', 'fairness', 'burden', 'uniformity', 'stability', 'trajectory']);
  var DIMENSIONS = Object.freeze({
    recourse: Object.freeze({ key: 'recourse', publicKey: 'recourse', letter: 'R', name: 'Recourse', weight: 10, slug: 'recourse' }),
    fairness: Object.freeze({ key: 'fairness', publicKey: 'overassessment_position', letter: 'O', name: 'Overassessment Position', weight: 20, slug: 'overassessment-position' }),
    burden: Object.freeze({ key: 'burden', publicKey: 'burden', letter: 'B', name: 'Burden', weight: 30, slug: 'burden' }),
    uniformity: Object.freeze({ key: 'uniformity', publicKey: 'uniformity', letter: 'U', name: 'Uniformity', weight: 15, slug: 'uniformity' }),
    stability: Object.freeze({ key: 'stability', publicKey: 'stability', letter: 'S', name: 'Stability', weight: 15, slug: 'stability' }),
    trajectory: Object.freeze({ key: 'trajectory', publicKey: 'trajectory', letter: 'T', name: 'Trajectory', weight: 10, slug: 'trajectory' })
  });

  function clamp01(value) {
    value = Number(value);
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null;
  }

  function verdict(score) {
    if (score >= 80) return 'Strong tax position';
    if (score >= 65) return 'Favorable tax position';
    if (score >= 50) return 'Typical or mixed tax position';
    if (score >= 35) return 'Pressured tax position';
    return 'Highly pressured tax position';
  }

  function confidence(covered) {
    if (covered >= 0.85) return 'high';
    if (covered >= 0.60) return 'medium';
    return 'low';
  }

  function aggregate(detail) {
    detail = detail || {};
    var weighted = 0;
    var availableWeight = 0;

    ORDER.forEach(function (key) {
      var meta = DIMENSIONS[key];
      var row = detail[key];
      if (!row || row.score == null) return;
      var normalized = clamp01(Number(row.score) / 100);
      if (normalized == null) return;
      var weight = Number(row.weight);
      if (!Number.isFinite(weight) || weight <= 0) weight = meta.weight;
      weighted += normalized * weight;
      availableWeight += weight;
    });

    if (!availableWeight) return null;
    var score = Math.round((weighted / availableWeight) * 100);
    var covered = availableWeight / 100;
    return {
      score: score,
      grade: score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : score >= 35 ? 'D' : 'E',
      band: score >= 65 ? 'good' : score >= 45 ? 'mid' : 'bad',
      verdict: verdict(score),
      framework: 'ROBUST',
      frameworkVersion: VERSION,
      modelVersion: VERSION,
      detail: detail,
      covered: covered,
      confidence: confidence(covered)
    };
  }

  function isCanonicalVersion(value) {
    return String(value || '').trim().toLowerCase() === VERSION.toLowerCase();
  }

  function isLegacyVersion(value) {
    var normalized = String(value || '').trim().toLowerCase();
    return LEGACY_VERSIONS.some(function (version) { return version.toLowerCase() === normalized; });
  }

  function acceptCacheRow(row) {
    if (!row || !isCanonicalVersion(row.model_version || row.modelVersion)) return null;
    return row;
  }

  root.WatchdogScoreCore = Object.freeze({
    VERSION: VERSION,
    LEGACY_VERSIONS: LEGACY_VERSIONS,
    ORDER: ORDER,
    DIMENSIONS: DIMENSIONS,
    clamp01: clamp01,
    aggregate: aggregate,
    verdict: verdict,
    confidence: confidence,
    isCanonicalVersion: isCanonicalVersion,
    isLegacyVersion: isLegacyVersion,
    acceptCacheRow: acceptCacheRow
  });
})(typeof window !== 'undefined' ? window : globalThis);
