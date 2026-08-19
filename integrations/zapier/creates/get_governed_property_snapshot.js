const { request } = require('../lib/api');

const perform = async (z, bundle) => request(z, bundle, '/property-snapshot', {
  method: 'POST',
  body: { pams_pin: bundle.inputData.pams_pin },
});

module.exports = {
  key: 'get_governed_property_snapshot',
  noun: 'Property Snapshot',
  display: {
    label: 'Get Governed Property Snapshot',
    description: 'Returns Watchdog-governed property facts for a PAMS PIN without exposing raw owner/person data.',
  },
  operation: {
    perform,
    inputFields: [
      {
        key: 'pams_pin',
        label: 'PAMS PIN',
        type: 'string',
        required: true,
        helpText: 'The Watchdog/New Jersey property identifier to retrieve.',
      },
    ],
    sample: {
      id: 'sample-facts-hash',
      pams_pin: 'SAMPLE-PIN',
      address: '123 Sample Ave',
      municipality: 'Sample Township',
      county: 'Sample County',
      property_class: '2',
      facts_hash: 'sample-facts-hash',
      conflict_count: 0,
      facts: [
        {
          id: 'property.assessed_value',
          label: 'Assessed Value',
          value: 350000,
          state: 'available',
          source: 'Watchdog governed source',
          truth_class: 'resolved',
          authority_rank: 95,
          conflict_state: 'none',
        },
      ],
    },
    outputFields: [
      { key: 'pams_pin', label: 'PAMS PIN' },
      { key: 'address', label: 'Address' },
      { key: 'municipality', label: 'Municipality' },
      { key: 'county', label: 'County' },
      { key: 'property_class', label: 'Property Class' },
      { key: 'facts_hash', label: 'Facts Hash' },
      { key: 'conflict_count', label: 'Conflict Count', type: 'integer' },
      { key: 'facts[]id', label: 'Fact Marker ID' },
      { key: 'facts[]label', label: 'Fact Label' },
      { key: 'facts[]value', label: 'Fact Value' },
      { key: 'facts[]source', label: 'Fact Source' },
      { key: 'facts[]truth_class', label: 'Truth Class' },
      { key: 'facts[]authority_rank', label: 'Authority Rank', type: 'integer' },
      { key: 'facts[]conflict_state', label: 'Conflict State' },
    ],
  },
};
