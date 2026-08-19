const { api } = require('../common');

module.exports = {
  key: 'remove_from_watchlist',
  noun: 'Watchlist Property',
  display: {
    label: 'Remove Property from Watchlist',
    description: 'Removes a governed Watchdog property from the connected account Watchlist.',
  },
  operation: {
    inputFields: [
      { key: 'pams_pin', label: 'PAMS PIN', type: 'string', required: true },
    ],
    perform: async (z, bundle) => {
      const result = await api(z, bundle, 'watchlist.remove', bundle.inputData);
      return result.item;
    },
    sample: {
      id: 'sample-pin',
      pams_pin: 'sample-pin',
      removed: true,
      removed_at: '2026-08-19T20:00:00.000Z',
    },
  },
};
