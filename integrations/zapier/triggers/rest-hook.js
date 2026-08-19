const { api } = require('../common');

const outputFields = [
  { key: 'id', label: 'Event ID' },
  { key: 'event_type', label: 'Event Type' },
  { key: 'event_key', label: 'Event Key' },
  { key: 'occurred_at', label: 'Occurred At', type: 'datetime' },
  { key: 'data__pams_pin', label: 'PAMS PIN' },
  { key: 'data__property_address', label: 'Property Address' },
  { key: 'data__title', label: 'Title' },
  { key: 'data__summary', label: 'Summary' },
  { key: 'data__severity', label: 'Severity' },
  { key: 'data__score', label: 'Watchdog / Finding Score', type: 'number' },
  { key: 'data__confidence', label: 'Confidence', type: 'number' },
];

const makeRestHook = ({ key, noun, name, description, eventType, sample }) => ({
  key,
  noun,
  display: {
    label: name,
    description,
    important: true,
  },
  operation: {
    type: 'hook',
    performSubscribe: async (z, bundle) => api(z, bundle, 'trigger.subscribe', {
      event_type: eventType,
      target_url: bundle.targetUrl,
    }),
    performUnsubscribe: async (z, bundle) => api(z, bundle, 'trigger.unsubscribe', {
      subscription_id: bundle.subscribeData.id,
    }),
    perform: (z, bundle) => [bundle.cleanedRequest],
    performList: async (z, bundle) => {
      const result = await api(z, bundle, 'trigger.sample', { event_type: eventType });
      return result.items || [];
    },
    sample,
    outputFields,
  },
});

module.exports = makeRestHook;
