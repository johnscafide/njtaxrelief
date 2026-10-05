const { api } = require('../common');

module.exports = {
  key: 'run_intelligence_analysis',
  noun: 'Intelligence Job',
  display: {
    label: 'Run Watchdog Intelligence for Property',
    description: 'Queues a governed Watchdog Intelligence analysis for one verified property, subject to plan quotas and deduplication.',
  },
  operation: {
    inputFields: [
      { key: 'pams_pin', label: 'PAMS PIN', type: 'string', required: true },
      {
        key: 'model_key',
        label: 'Intelligence Model',
        type: 'string',
        required: true,
        default: 'assessment_anomaly',
        choices: {
          assessment_anomaly: 'Assessment Anomaly',
          property_change_priority: 'Property Change Priority',
        },
      },
      {
        key: 'source_event_id',
        label: 'Source Event ID',
        type: 'string',
        required: false,
        helpText: 'Optional stable ID from the triggering app. Supplying it makes retries idempotent across the same source event.',
      },
    ],
    perform: async (z, bundle) => {
      const result = await api(z, bundle, 'intelligence.run', bundle.inputData);
      return result.job;
    },
    sample: {
      id: '00000000-0000-0000-0000-000000000004',
      status: 'queued',
      model_key: 'assessment_anomaly',
      model_version: 'v1',
      candidate_count: 1,
      pams_pin: 'sample-pin',
      property_address: '100 Sample Ave, Sample, NJ',
      deduplicated: false,
    },
  },
};
