const makeRestHook = require('./rest-hook');
module.exports = makeRestHook({
  key: 'report_ready',
  noun: 'Report',
  name: 'Report Ready',
  description: 'Triggers when a new Watchdog professional report version is ready.',
  eventType: 'report.ready',
  sample: { id: 'sample-report', event_type: 'report.ready', occurred_at: '2026-08-19T15:45:00Z', data: { report_id: '00000000-0000-0000-0000-000000000001', version_number: 1, pams_pin: 'sample-pin', title: 'Sample Watchdog report', status: 'ready' } },
});
