const { api } = require('../common');
module.exports = {
  key: 'add_to_watchlist',
  noun: 'Watchlist Property',
  display: { label: 'Add Property to Watchlist', description: 'Adds a governed Watchdog property to the connected account Watchlist.' },
  operation: {
    inputFields: [
      { key: 'pams_pin', label: 'PAMS PIN', type: 'string', required: true },
      { key: 'nickname', label: 'Nickname', type: 'string', required: false },
      { key: 'notes', label: 'Notes', type: 'text', required: false },
    ],
    perform: async (z, bundle) => {
      const result = await api(z, bundle, 'watchlist.add', bundle.inputData);
      return result.item;
    },
    sample: { id: '00000000-0000-0000-0000-000000000003', pams_pin: 'sample-pin', address: '100 Sample Ave', kind: 'watch' },
  },
};
