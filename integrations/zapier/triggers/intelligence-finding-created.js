const makeRestHook = require('./rest-hook');
module.exports = makeRestHook({
  key: 'intelligence_finding_created',
  noun: 'Intelligence Finding',
  name: 'Intelligence Finding Created',
  description: 'Triggers when Watchdog Intelligence creates a new governed finding.',
  eventType: 'intelligence.finding.created',
  sample: { id: 'sample-finding', event_type: 'intelligence.finding.created', occurred_at: '2026-08-19T15:45:00Z', data: { finding_id: '00000000-0000-0000-0000-000000000002', pams_pin: 'sample-pin', property_address: '100 Sample Ave, Sample, NJ', opportunity_type: 'assessment_review', score: 82, confidence: 88, evidence_coverage: 91 } },
});
