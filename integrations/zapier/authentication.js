const { api } = require('./common');

const test = async (z, bundle) => api(z, bundle, 'auth.test');

module.exports = {
  type: 'custom',
  fields: [
    {
      key: 'apiKey',
      label: 'Watchdog Zapier API Key',
      type: 'string',
      required: true,
      helpText: 'Create this key in Watchdog. Keys begin with wdg_zap_ and are only shown once.',
    },
  ],
  test,
};
