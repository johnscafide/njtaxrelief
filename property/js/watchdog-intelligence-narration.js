(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WatchdogIntelligenceNarration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = 'watchdog-narration-vnext-1';
  const MAX_TEXT = 2400;
  const FORMAT_ORDER = ['quick', 'professional', 'evidence', 'changes'];
  const FORMATS = Object.freeze({
    quick: Object.freeze({ key: 'quick', label: 'Quick · ~30 sec', shortLabel: 'Quick', aria: 'Listen to a concise 30-second Watchdog property brief', maxChars: 900 }),
    professional: Object.freeze({ key: 'professional', label: 'Professional · ~60 sec', shortLabel: 'Professional', aria: 'Listen to a detailed 60-second professional Watchdog brief', maxChars: 1800 }),
    evidence: Object.freeze({ key: 'evidence', label: 'Evidence & sources', shortLabel: 'Evidence', aria: 'Listen to the evidence, source lineage, missing evidence, and caveats', maxChars: 2100 }),
    changes: Object.freeze({ key: 'changes', label: 'What changed', shortLabel: 'Changes', aria: 'Listen to a material-change Watchdog brief', maxChars: 1600 }),
  });

  function clean(value, max) {
    return String(value == null ? '' : value).replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || MAX_TEXT);
  }

  function list(value, maxItems, maxChars) {
    return (Array.isArray(value) ? value : [])
      .map((item) => clean(typeof item === 'string' ? item : (item && (item.label || item.title || item.text || item.url)) || '', maxChars || 420))
      .filter(Boolean)
      .slice(0, maxItems);
  }

  function normalizeBrief(input) {
    const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    return Object.freeze({
      conclusion: clean(value.conclusion, 1100),
      evidence: Object.freeze(list(value.evidence, 8, 420)),
      missingEvidence: Object.freeze(list(value.missing_evidence || value.missingEvidence, 6, 360)),
      caveats: Object.freeze(list(value.caveats, 5, 360)),
      sources: Object.freeze(list(value.sources, 6, 300)),
    });
  }

  function requireConclusion(brief) {
    if (!brief.conclusion) {
      const error = new Error('A governed Watchdog written response is required before narration.');
      error.code = 'WATCHDOG_NARRATION_NO_CONCLUSION';
      throw error;
    }
  }

  function pushList(parts, intro, items) {
    if (items.length) parts.push(`${intro} ${items.join(' ')}`);
  }

  function formatQuick(brief) {
    const parts = ['Watchdog Intelligence, 30-second brief.', brief.conclusion];
    pushList(parts, 'Key evidence.', brief.evidence.slice(0, 2));
    if (brief.caveats[0]) parts.push(`Important context. ${brief.caveats[0]}`);
    else if (brief.missingEvidence[0]) parts.push(`Evidence gap. ${brief.missingEvidence[0]}`);
    return parts;
  }

  function formatProfessional(brief) {
    const parts = ['Watchdog Intelligence, professional brief.', brief.conclusion];
    pushList(parts, 'Key evidence.', brief.evidence.slice(0, 4));
    pushList(parts, 'Missing evidence.', brief.missingEvidence.slice(0, 2));
    pushList(parts, 'Important context.', brief.caveats.slice(0, 2));
    return parts;
  }

  function formatEvidence(brief) {
    const parts = ['Watchdog Intelligence, evidence and source brief.', brief.conclusion];
    pushList(parts, 'Evidence on record.', brief.evidence.slice(0, 4));
    pushList(parts, 'Missing evidence.', brief.missingEvidence.slice(0, 3));
    pushList(parts, 'Source lineage shown in the written response.', brief.sources.slice(0, 4));
    pushList(parts, 'Caveats.', brief.caveats.slice(0, 2));
    return parts;
  }

  function formatChanges(brief) {
    const parts = ['Watchdog Intelligence, what changed brief.', brief.conclusion];
    pushList(parts, 'Material evidence.', brief.evidence.slice(0, 3));
    pushList(parts, 'Unresolved or missing evidence.', brief.missingEvidence.slice(0, 2));
    if (brief.caveats[0]) parts.push(`Important context. ${brief.caveats[0]}`);
    return parts;
  }

  function formatBrief(input, requestedFormat) {
    const brief = normalizeBrief(input);
    requireConclusion(brief);
    const format = FORMATS[requestedFormat] ? requestedFormat : 'quick';
    const parts = format === 'professional' ? formatProfessional(brief)
      : format === 'evidence' ? formatEvidence(brief)
        : format === 'changes' ? formatChanges(brief)
          : formatQuick(brief);
    return Object.freeze({
      version: VERSION,
      format,
      label: FORMATS[format].label,
      text: clean(parts.join(' '), Math.min(MAX_TEXT, FORMATS[format].maxChars)),
      source: 'rendered_governed_analyst_response',
    });
  }

  function availableFormats(context) {
    const value = context && typeof context === 'object' ? context : {};
    const tool = clean(value.tool, 80).toLowerCase();
    const prompt = clean(value.prompt, 500).toLowerCase();
    const surface = clean(value.surface, 100).toLowerCase();
    const keys = ['quick', 'professional'];
    if (tool === 'inspect_lineage' || /evidence|source|lineage|why was|why flagged/.test(prompt)) keys.push('evidence');
    if (/daily|watchlist/.test(surface) || /what changed|change|changed|latest|material/.test(prompt)) keys.push('changes');
    return FORMAT_ORDER.filter((key) => keys.includes(key));
  }

  function defaultFormat(context) {
    const keys = availableFormats(context);
    if (keys.includes('evidence') && clean(context && context.tool, 80).toLowerCase() === 'inspect_lineage') return 'evidence';
    if (keys.includes('changes') && /what changed|change|changed|latest|material/.test(clean(context && context.prompt, 500).toLowerCase())) return 'changes';
    return 'quick';
  }

  return Object.freeze({ VERSION, FORMATS, FORMAT_ORDER, clean, normalizeBrief, formatBrief, availableFormats, defaultFormat });
});
