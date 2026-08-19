const { api } = require('../common');
module.exports = {
  key: 'find_property',
  noun: 'Property',
  display: { label: 'Find Property', description: 'Find a New Jersey property in Watchdog by PAMS PIN or street address.' },
  operation: {
    inputFields: [
      { key: 'pams_pin', label: 'PAMS PIN', type: 'string', required: false },
      { key: 'query', label: 'Street Address', type: 'string', required: false },
      { key: 'town', label: 'Municipality', type: 'string', required: false },
    ],
    perform: async (z, bundle) => {
      const result = await api(z, bundle, 'property.find', bundle.inputData);
      return result.items || [];
    },
    sample: { pams_pin: 'sample-pin', address: '100 Sample Ave', town: 'Sample', county: 'Sample', zip: '08000', assessed_value: 325000, last_year_tax: 8900 },
    outputFields: [
      { key: 'pams_pin', label: 'PAMS PIN' }, { key: 'address', label: 'Address' }, { key: 'town', label: 'Municipality' },
      { key: 'county', label: 'County' }, { key: 'zip', label: 'ZIP' }, { key: 'block', label: 'Block' }, { key: 'lot', label: 'Lot' },
      { key: 'prop_class', label: 'Property Class' }, { key: 'assessed_value', label: 'Assessed Value', type: 'number' }, { key: 'last_year_tax', label: 'Annual Tax', type: 'number' },
    ],
  },
};
