const makeRestHook = require('./rest-hook');
module.exports = makeRestHook({
  key: 'property_signal_changed',
  noun: 'Property Signal',
  name: 'Property Signal Changed',
  description: 'Triggers when a governed Watchdog property signal changes.',
  eventType: 'property.signal.changed',
  sample: { id: 'sample-signal', event_type: 'property.signal.changed', occurred_at: '2026-08-19T15:45:00Z', data: { pams_pin: 'sample-pin', title: 'Property signal changed', severity: 'medium', summary: 'A governed property signal changed.' } },
});
