const { api } = require('../common');
module.exports = {
  key: 'get_property_snapshot',
  noun: 'Property Snapshot',
  display: { label: 'Find Governed Property Snapshot', description: 'Finds Watchdog-governed property facts and the latest Watchdog Score without owner/person data.' },
  operation: {
    inputFields: [{ key: 'pams_pin', label: 'PAMS PIN', type: 'string', required: true }],
    perform: async (z, bundle) => [await api(z, bundle, 'property.snapshot', bundle.inputData)],
    sample: { id: 'sample-pin', pams_pin: 'sample-pin', address: '100 Sample Ave', town: 'Sample', county: 'Sample', assessed_value: 325000, last_year_tax: 8900, watchdog_score: 76 },
    outputFields: [
      { key: 'pams_pin', label: 'PAMS PIN' }, { key: 'address', label: 'Address' }, { key: 'town', label: 'Municipality' }, { key: 'county', label: 'County' },
      { key: 'zip', label: 'ZIP' }, { key: 'block', label: 'Block' }, { key: 'lot', label: 'Lot' }, { key: 'prop_class', label: 'Property Class' },
      { key: 'year_built', label: 'Year Built', type: 'integer' }, { key: 'assessed_value', label: 'Assessed Value', type: 'number' },
      { key: 'last_year_tax', label: 'Annual Tax', type: 'number' }, { key: 'effective_rate', label: 'Effective Tax Rate', type: 'number' },
      { key: 'last_sale_price', label: 'Last Sale Price', type: 'number' }, { key: 'last_sale_year', label: 'Last Sale Year', type: 'integer' },
      { key: 'watchdog_score', label: 'Watchdog Score', type: 'number' }, { key: 'score_observed_at', label: 'Score Observed At', type: 'datetime' },
    ],
  },
};
