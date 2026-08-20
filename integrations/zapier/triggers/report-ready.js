const makeRestHook = require('./rest-hook');

module.exports = makeRestHook({
  key: 'report_ready',
  noun: 'Report',
  name: 'Report Ready',
  description: 'Triggers when a new Watchdog professional report version is ready.',
  eventType: 'report.ready',
  sample: {
    id: 'sample-report',
    event_type: 'report.ready',
    event_key: 'report_version:sample-report',
    occurred_at: '2026-08-19T15:45:00Z',
    data: {
      report_id: '00000000-0000-0000-0000-000000000001',
      version_id: '00000000-0000-0000-0000-000000000004',
      version_number: 1,
      pams_pin: 'sample-pin',
      title: 'Sample Watchdog report',
      profession: 'real_estate_agent',
      preset: 'property_opportunity',
      status: 'ready',
      created_at: '2026-08-19T15:45:00Z',
    },
  },
  outputFields: [
    { key: 'data__report_id', label: 'Report ID' },
    { key: 'data__version_id', label: 'Report Version ID' },
    { key: 'data__version_number', label: 'Version Number', type: 'integer' },
    { key: 'data__pams_pin', label: 'PAMS PIN' },
    { key: 'data__title', label: 'Report Title' },
    { key: 'data__profession', label: 'Profession' },
    { key: 'data__preset', label: 'Report Preset' },
    { key: 'data__status', label: 'Report Status' },
    { key: 'data__created_at', label: 'Report Created At', type: 'datetime' },
  ],
});
