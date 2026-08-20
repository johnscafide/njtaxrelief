const { api } = require('../common');

const baseOutputFields = [
  { key: 'id', label: 'Event ID' },
  { key: 'event_type', label: 'Event Type' },
  { key: 'event_key', label: 'Event Key' },
  { key: 'occurred_at', label: 'Occurred At', type: 'datetime' },
];

const makeRestHook = ({ key, noun, name, description, eventType, sample, outputFields = [] }) => ({
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
    outputFields: [...baseOutputFields, ...outputFields],
  },
});

module.exports = makeRestHook;
