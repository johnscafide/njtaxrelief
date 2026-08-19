const { request } = require('../lib/api');

const subscribeHook = async (z, bundle) => request(z, bundle, '/subscriptions', {
  method: 'POST',
  body: {
    event_type: 'property.signal.changed',
    target_url: bundle.targetUrl,
  },
});

const unsubscribeHook = async (z, bundle) => request(z, bundle, `/subscriptions/${bundle.subscribeData.id}`, {
  method: 'DELETE',
});

const perform = (z, bundle) => {
  const raw = bundle.cleanedRequest || {};
  return [{
    ...raw,
    id: raw.id || raw.event_id || raw.delivery_id,
  }];
};

const performList = async (z, bundle) => request(z, bundle, '/events/recent', {
  params: { event_type: 'property.signal.changed' },
});

module.exports = {
  key: 'property_signal_changed',
  noun: 'Property Signal',
  display: {
    label: 'Property Signal Changed',
    description: 'Triggers instantly when Watchdog records a subscribed governed property change.',
  },
  operation: {
    type: 'hook',
    performSubscribe: subscribeHook,
    performUnsubscribe: unsubscribeHook,
    perform,
    performList,
    sample: {
      id: 'sample-property-signal',
      event_id: 'sample-property-signal',
      event_type: 'property.signal.changed',
      event_key: 'sample',
      occurred_at: '2026-08-19T12:00:00Z',
      source: 'watchdog.sample',
      data: {
        pams_pin: 'SAMPLE-PIN',
        source_event_type: 'assessment_change',
        severity: 'watch',
        title: 'Assessment changed',
        summary: 'Sample Watchdog property signal for Zap setup.',
        marker_id: 'property.assessed_value',
        old_value: '325000',
        new_value: '350000',
        delta_numeric: 25000,
      },
    },
    outputFields: [
      { key: 'event_id', label: 'Event ID' },
      { key: 'event_type', label: 'Event Type' },
      { key: 'occurred_at', label: 'Occurred At' },
      { key: 'data__pams_pin', label: 'PAMS PIN' },
      { key: 'data__severity', label: 'Severity' },
      { key: 'data__title', label: 'Title' },
      { key: 'data__summary', label: 'Summary' },
      { key: 'data__marker_id', label: 'Marker ID' },
      { key: 'data__old_value', label: 'Old Value' },
      { key: 'data__new_value', label: 'New Value' },
      { key: 'data__delta_numeric', label: 'Numeric Change', type: 'number' },
    ],
  },
};
