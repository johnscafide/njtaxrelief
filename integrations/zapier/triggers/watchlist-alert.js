const makeRestHook = require('./rest-hook');
module.exports = makeRestHook({
  key: 'watchlist_alert',
  noun: 'Watchlist Alert',
  name: 'Watchlist Alert',
  description: 'Triggers when a watched property receives a new Watchdog change alert.',
  eventType: 'watchlist.alert',
  sample: { id: 'sample-watch', event_type: 'watchlist.alert', occurred_at: '2026-08-19T15:45:00Z', data: { pams_pin: 'sample-pin', title: 'Watchlist property changed', severity: 'medium', summary: 'A watched property changed.' } },
});
